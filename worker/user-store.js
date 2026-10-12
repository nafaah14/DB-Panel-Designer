import { DurableObject } from 'cloudflare:workers';

/* One Durable Object per account (addressed by username). Everything the
   account owns lives in this object's SQLite database: the login, its
   sessions, its projects and a rolling history of earlier versions.

   Methods return {ok:true,…} or {ok:false,status,error,…} rather than
   throwing, so the Worker can pass the status straight through. */

const DAY = 86400000;
const SESSION_MS = 120 * DAY;
const MAX_SESSIONS = 20;
const MAX_PROJECTS = 300;
const MAX_DATA = 1500000;
const KEEP_HISTORY = 40;
const SNAP_EVERY = 10 * 60 * 1000;
const TOMB_MS = 90 * DAY;
const LOCK_AFTER = 6;
const WRONG = 'Wrong username or password.';
const AUTH_RE = /^[A-Za-z0-9_-]{40,64}$/;

const enc = new TextEncoder();
const bad = (status, error, extra) => ({ ok: false, status, error, ...extra });
const good = extra => ({ ok: true, ...extra });

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function newSecret() {
  const u = new Uint8Array(32);
  crypto.getRandomValues(u);
  return btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS account(
     id INTEGER PRIMARY KEY CHECK (id=1), name TEXT NOT NULL, pw TEXT NOT NULL,
     created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions(
     h TEXT PRIMARY KEY, created INTEGER NOT NULL, seen INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects(
     id TEXT PRIMARY KEY, name TEXT NOT NULL, updated INTEGER NOT NULL, rev INTEGER NOT NULL,
     saved INTEGER NOT NULL, app TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0,
     size INTEGER NOT NULL DEFAULT 0, data TEXT)`,
  `CREATE TABLE IF NOT EXISTS history(
     id TEXT NOT NULL, rev INTEGER NOT NULL, name TEXT, updated INTEGER, saved INTEGER NOT NULL,
     app TEXT, size INTEGER, data TEXT NOT NULL, PRIMARY KEY(id, rev))`,
];

export class UserStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.live = false;
  }

  /* A probe for a username that was never registered must not leave
     anything behind, so the schema is only created by register(). */
  #exists() {
    if (this.live) return true;
    const r = this.sql.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account'").toArray();
    return (this.live = r.length > 0);
  }

  #addSession(h, now) {
    this.sql.exec('INSERT INTO sessions(h,created,seen,expires) VALUES(?,?,?,?)', h, now, now, now + SESSION_MS);
    this.sql.exec('DELETE FROM sessions WHERE expires<?', now);
    this.sql.exec(
      'DELETE FROM sessions WHERE h IN (SELECT h FROM sessions ORDER BY seen DESC LIMIT -1 OFFSET ?)', MAX_SESSIONS);
  }

  /* Returns the session hash, or null when the secret is unknown/expired. */
  async #who(secret) {
    if (typeof secret !== 'string' || !this.#exists()) return null;
    const h = await sha256(secret);
    const now = Date.now();
    const s = this.sql.exec('SELECT seen,expires FROM sessions WHERE h=?', h).toArray()[0];
    if (!s || s.expires < now) return null;
    if (now - s.seen > 12 * 3600000) this.sql.exec('UPDATE sessions SET seen=?,expires=? WHERE h=?', now, now + SESSION_MS, h);
    return h;
  }

  /* Hash first, then read → compare → write with no await in between, so
     guesses fired in parallel cannot all read the same failure count and
     slip past the lockout. Returns null when the password is right,
     otherwise the response to send back. */
  async #verify(auth) {
    if (!AUTH_RE.test(auth || '')) return bad(400, 'Bad request.');
    const pw = await sha256('pdes-pw1:' + auth);
    const a = this.sql.exec('SELECT pw,fails,locked FROM account WHERE id=1').toArray()[0];
    if (!a) return bad(401, WRONG);
    const now = Date.now();
    if (a.locked > now) {
      return bad(429, 'Too many attempts. Try again in a few minutes.', { retryAfter: Math.ceil((a.locked - now) / 1000) });
    }
    if (same(a.pw, pw)) return null;
    const fails = a.fails + 1;
    const lock = fails >= LOCK_AFTER ? now + Math.min(15 * 60000, 30000 * 2 ** (fails - LOCK_AFTER)) : 0;
    this.sql.exec('UPDATE account SET fails=?,locked=? WHERE id=1', fails, lock);
    return bad(401, WRONG);
  }

  /* ---------- account ---------- */

  async register(name, auth) {
    if (!AUTH_RE.test(auth || '')) return bad(400, 'Bad request.');
    if (this.#exists()) return bad(409, 'That username is already taken.');
    const secret = newSecret();
    const [pw, h] = await Promise.all([sha256('pdes-pw1:' + auth), sha256(secret)]);
    if (this.#exists()) return bad(409, 'That username is already taken.');
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      SCHEMA.forEach(q => this.sql.exec(q));
      this.sql.exec('INSERT INTO account(id,name,pw,created) VALUES(1,?,?,?)', name, pw, now);
      this.#addSession(h, now);
    });
    this.live = true;
    return good({ secret, expires: now + SESSION_MS });
  }

  async login(auth) {
    if (!AUTH_RE.test(auth || '')) return bad(400, 'Bad request.');
    if (!this.#exists()) return bad(401, WRONG);
    const secret = newSecret();
    const h = await sha256(secret);
    const refused = await this.#verify(auth);
    if (refused) return refused;
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('UPDATE account SET fails=0,locked=0 WHERE id=1');
      this.#addSession(h, now);
    });
    return good({ secret, expires: now + SESSION_MS });
  }

  async logout(secret) {
    const h = await this.#who(secret);
    if (h) this.sql.exec('DELETE FROM sessions WHERE h=?', h);
    return good();
  }

  async me(secret) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const a = this.sql.exec('SELECT name,created FROM account WHERE id=1').toArray()[0];
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM projects WHERE deleted=0').toArray()[0].n;
    return good({ name: a.name, created: a.created, projects: n });
  }

  async changePassword(secret, oldAuth, newAuth) {
    const h = await this.#who(secret);
    if (!h) return bad(401, 'Please sign in again.');
    if (!AUTH_RE.test(newAuth || '')) return bad(400, 'Bad request.');
    const refused = await this.#verify(oldAuth);
    if (refused) return refused.status === 401 ? bad(403, 'Your current password is wrong.') : refused;
    const pw = await sha256('pdes-pw1:' + newAuth);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('UPDATE account SET pw=?,fails=0,locked=0 WHERE id=1', pw);
      this.sql.exec('DELETE FROM sessions WHERE h<>?', h);
    });
    return good();
  }

  async deleteAccount(secret, auth) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const refused = await this.#verify(auth);
    if (refused) return refused.status === 401 ? bad(403, 'Your password is wrong.') : refused;
    await this.ctx.storage.deleteAll();
    this.live = false;
    return good();
  }

  /* ---------- projects ---------- */

  async list(secret) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const cut = Date.now() - TOMB_MS;
    this.sql.exec('DELETE FROM history WHERE id IN (SELECT id FROM projects WHERE deleted=1 AND saved<?)', cut);
    this.sql.exec('DELETE FROM projects WHERE deleted=1 AND saved<?', cut);
    const rows = this.sql.exec('SELECT id,name,updated,rev,saved,app,deleted,size FROM projects').toArray();
    return good({ projects: rows.map(r => ({ ...r, deleted: !!r.deleted })), now: Date.now() });
  }

  async get(secret, id) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const r = this.sql.exec('SELECT id,name,updated,rev,saved,app,deleted,data FROM projects WHERE id=?', id).toArray()[0];
    if (!r) return bad(404, 'No such project.');
    if (r.deleted) return bad(404, 'That project was deleted.', { deleted: true, rev: r.rev });
    return good({ head: { id: r.id, name: r.name, updated: r.updated, rev: r.rev, saved: r.saved, app: r.app }, raw: r.data });
  }

  /* Copies the current row into history — at most one snapshot per
     SNAP_EVERY while someone is actively editing, so the 40 kept versions
     span hours/days rather than the last minute. force=true always copies. */
  #snapshot(r, now, force) {
    if (!r || r.deleted || !r.data) return;
    if (!force) {
      const recent = this.sql.exec('SELECT 1 FROM history WHERE id=? AND saved>=? LIMIT 1', r.id, now - SNAP_EVERY).toArray();
      if (recent.length) return;
    }
    this.sql.exec(
      'INSERT OR REPLACE INTO history(id,rev,name,updated,saved,app,size,data) VALUES(?,?,?,?,?,?,?,?)',
      r.id, r.rev, r.name, r.updated, r.saved, r.app, r.size, r.data);
    this.sql.exec(
      'DELETE FROM history WHERE id=? AND rev NOT IN (SELECT rev FROM history WHERE id=? ORDER BY rev DESC LIMIT ?)',
      r.id, r.id, KEEP_HISTORY);
  }

  async put(secret, id, body) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    let o;
    try { o = JSON.parse(body); } catch { return bad(400, 'Bad request.'); }
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
    const updated = Number(o.updated);
    const baseRev = Number.isInteger(o.baseRev) && o.baseRev >= 0 ? o.baseRev : -1;
    if (!name || !Number.isFinite(updated) || baseRev < 0 || !o.data || typeof o.data !== 'object' || Array.isArray(o.data)) {
      return bad(400, 'Bad request.');
    }
    const data = JSON.stringify(o.data);
    if (data.length > MAX_DATA) return bad(413, 'This project is too large to sync (limit about 1.5 MB).');
    const app = typeof o.app === 'string' ? o.app.slice(0, 20) : '';
    const now = Date.now();
    const cur = this.sql.exec('SELECT * FROM projects WHERE id=?', id).toArray()[0];
    if (!cur) {
      const n = this.sql.exec('SELECT COUNT(*) AS n FROM projects WHERE deleted=0').toArray()[0].n;
      if (n >= MAX_PROJECTS) return bad(409, `An account can hold up to ${MAX_PROJECTS} projects.`);
      this.sql.exec('INSERT INTO projects(id,name,updated,rev,saved,app,deleted,size,data) VALUES(?,?,?,?,?,?,0,?,?)',
        id, name, updated, 1, now, app, data.length, data);
      return good({ rev: 1, saved: now });
    }
    if (cur.rev !== baseRev) {
      return bad(409, 'Changed elsewhere.', { conflict: true, rev: cur.rev, updated: cur.updated, deleted: !!cur.deleted, app: cur.app });
    }
    const rev = cur.rev + 1;
    this.ctx.storage.transactionSync(() => {
      this.#snapshot(cur, now, !!o.snapshot);
      this.sql.exec('UPDATE projects SET name=?,updated=?,rev=?,saved=?,app=?,deleted=0,size=?,data=? WHERE id=?',
        name, updated, rev, now, app, data.length, data, id);
    });
    return good({ rev, saved: now });
  }

  async remove(secret, id, baseRev) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const cur = this.sql.exec('SELECT * FROM projects WHERE id=?', id).toArray()[0];
    if (!cur || cur.deleted) return good({ rev: cur ? cur.rev : 0 });
    if (cur.rev !== baseRev) {
      return bad(409, 'Changed elsewhere.', { conflict: true, rev: cur.rev, updated: cur.updated, deleted: false, app: cur.app });
    }
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.#snapshot(cur, now, true);
      this.sql.exec('UPDATE projects SET deleted=1,rev=?,saved=?,size=0,data=NULL WHERE id=?', cur.rev + 1, now, id);
    });
    return good({ rev: cur.rev + 1 });
  }

  async history(secret, id) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const rows = this.sql.exec('SELECT rev,name,updated,saved,app,size FROM history WHERE id=? ORDER BY rev DESC', id).toArray();
    return good({ versions: rows });
  }

  async version(secret, id, rev) {
    if (!(await this.#who(secret))) return bad(401, 'Please sign in again.');
    const r = this.sql.exec('SELECT rev,name,updated,saved,app,data FROM history WHERE id=? AND rev=?', id, rev).toArray()[0];
    if (!r) return bad(404, 'No such version.');
    const { data, ...head } = r;
    return good({ head, raw: data });
  }
}
