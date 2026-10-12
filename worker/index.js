import { UserStore } from './user-store.js';
export { UserStore };

/* Cloud sync API for DB Panel Designer. Static files are served by the
   assets layer; only /api/* reaches this Worker (see run_worker_first in
   wrangler.jsonc). Each account is one Durable Object, so every request for
   a user is serialised in one place — that is what makes the revision
   check in PUT a real conflict check rather than a best guess.

   Optional env var INVITE_CODE: when set, creating an account needs it. */

const NAME_RE = /^[a-z0-9][a-z0-9._@+-]{2,39}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BEARER_RE = /^Bearer ([a-z0-9][a-z0-9._@+-]{2,39})~([A-Za-z0-9_-]{43})$/;
const MAX_BODY = 2000000;

const HEAD = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEAD });
const fail = (status, error, extra) => reply({ error, ...extra }, status);

/* The Durable Object returns {ok,status,error,…}; pass failures through. */
function out(r, shape) {
  if (!r.ok) {
    const { ok, status, error, ...rest } = r;
    return fail(status || 500, error || 'Server error', rest);
  }
  return shape ? shape(r) : reply(r);
}

/* Project data can be large, so it travels as the raw stored string and is
   spliced into the response rather than parsed and re-serialised. */
function withData(head, raw) {
  const s = JSON.stringify({ ok: true, ...head });
  return new Response(s.slice(0, -1) + ',"data":' + raw + '}', { headers: HEAD });
}

function sameStr(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function bodyText(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
  const t = await request.text();
  return t.length > MAX_BODY ? null : t;
}
async function bodyJson(request) {
  const t = await bodyText(request);
  if (t == null) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

const stubFor = (env, name) => env.USER.get(env.USER.idFromName(name));
const cleanName = u => String(u ?? '').trim().toLowerCase();

async function route(request, env, url) {
  const seg = url.pathname.split('/').filter(Boolean);
  const m = request.method;
  const a = seg[1];

  if (a === 'ping' && m === 'GET') {
    return reply({ app: 'pdes', cloud: true, invite: !!env.INVITE_CODE, now: Date.now() });
  }

  /* ----- sign up / sign in (no session yet) ----- */
  if ((a === 'register' || a === 'login') && m === 'POST') {
    const b = await bodyJson(request);
    const name = b && cleanName(b.user);
    if (!b || !NAME_RE.test(name) || typeof b.auth !== 'string') {
      return fail(400, 'Usernames are 3–40 characters: letters, numbers and . _ @ + -');
    }
    const stub = stubFor(env, name);
    if (a === 'register') {
      if (env.INVITE_CODE && !sameStr(String(b.invite ?? ''), String(env.INVITE_CODE))) {
        return fail(403, 'That invite code is not right.');
      }
      return out(await stub.register(name, b.auth), r => reply({ user: name, token: `${name}~${r.secret}`, expires: r.expires }));
    }
    return out(await stub.login(b.auth), r => reply({ user: name, token: `${name}~${r.secret}`, expires: r.expires }));
  }

  /* ----- everything below needs a session ----- */
  const t = BEARER_RE.exec(request.headers.get('authorization') || '');
  if (!t) return fail(401, 'Please sign in.');
  const [, name, secret] = t;
  const stub = stubFor(env, name);

  if (a === 'logout' && m === 'POST') return out(await stub.logout(secret));
  if (a === 'me' && m === 'GET') return out(await stub.me(secret));

  if (a === 'password' && m === 'POST') {
    const b = await bodyJson(request);
    if (!b || typeof b.auth !== 'string' || typeof b.next !== 'string') return fail(400, 'Bad request.');
    return out(await stub.changePassword(secret, b.auth, b.next));
  }
  if (a === 'account' && seg[2] === 'delete' && m === 'POST') {
    const b = await bodyJson(request);
    if (!b || typeof b.auth !== 'string') return fail(400, 'Bad request.');
    return out(await stub.deleteAccount(secret, b.auth));
  }

  if (a === 'projects') {
    const id = seg[2];
    if (!id) return m === 'GET' ? out(await stub.list(secret)) : fail(405, 'Method not allowed.');
    if (!ID_RE.test(id)) return fail(400, 'Bad project id.');

    if (seg[3] === 'history' && m === 'GET') {
      if (seg[4] == null) return out(await stub.history(secret, id));
      const rev = Number(seg[4]);
      if (!Number.isInteger(rev) || rev < 0) return fail(400, 'Bad version.');
      return out(await stub.version(secret, id, rev), r => withData(r.head, r.raw));
    }
    if (seg[3]) return fail(404, 'Not found.');

    if (m === 'GET') return out(await stub.get(secret, id), r => withData(r.head, r.raw));
    if (m === 'PUT') {
      const text = await bodyText(request);
      if (text == null) return fail(413, 'This project is too large to sync (limit about 1.5 MB).');
      return out(await stub.put(secret, id, text));
    }
    if (m === 'DELETE') {
      const base = Number(url.searchParams.get('base'));
      if (!Number.isInteger(base) || base < 0) return fail(400, 'Bad request.');
      return out(await stub.remove(secret, id, base));
    }
  }
  return fail(404, 'Not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (e) {
      console.error('api error', e && e.stack || e);
      return fail(500, 'The cloud had a problem. Try again in a moment.');
    }
  },
};
