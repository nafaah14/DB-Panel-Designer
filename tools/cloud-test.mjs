// End-to-end check of the cloud API.
//   npx wrangler dev --port 8787        (in another terminal)
//   node tools/cloud-test.mjs [baseUrl]  (default http://127.0.0.1:8787)
// Uses throwaway usernames, so it can be pointed at a local dev server freely.
// Don't aim it at the live site: it creates and deletes accounts.

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
let passed = 0, failed = 0;
const ok = (cond, label, extra) => {
  if (cond) { passed++; console.log('  ok    ' + label); }
  else { failed++; console.log('  FAIL  ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

async function call(method, path, { token, body, text } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined || text !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: text ?? (body === undefined ? undefined : JSON.stringify(body)) });
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

const rnd = n => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('base64url');
const key = () => rnd(32);
const newUser = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const doc = (name, extra = {}) => ({ name, updated: Date.now(), app: '2.13.0', baseRev: 0, data: { panels: [], rooms: [], note: name }, ...extra });
const putP = (token, id, body) => call('PUT', `/api/projects/${id}`, { token, body });

async function signUp(user = newUser()) {
  const pw = key();
  const r = await call('POST', '/api/register', { body: { user, auth: pw } });
  if (r.status !== 200) throw new Error('could not register ' + user + ': ' + JSON.stringify(r));
  return { user, pw, token: r.json.token };
}

console.log('ping');
let r = await call('GET', '/api/ping');
ok(r.status === 200 && r.json.cloud === true, 'answers', r);

console.log('register and login');
const A = { user: newUser(), pw: key() };
r = await call('POST', '/api/register', { body: { user: 'a', auth: A.pw } });
ok(r.status === 400, 'short username refused', r);
r = await call('POST', '/api/register', { body: { user: A.user, auth: 'short' } });
ok(r.status === 400, 'malformed auth key refused', r);
r = await call('POST', '/api/register', { body: { user: A.user, auth: A.pw } });
ok(r.status === 200 && r.json.token?.startsWith(A.user + '~'), 'registers', r);
A.tok1 = r.json.token;
r = await call('POST', '/api/register', { body: { user: A.user, auth: key() } });
ok(r.status === 409, 'same name refused', r);
r = await call('POST', '/api/register', { body: { user: A.user.toUpperCase(), auth: key() } });
ok(r.status === 409, 'usernames are case-insensitive', r);
r = await call('GET', '/api/me', { token: A.tok1 });
ok(r.status === 200 && r.json.name === A.user && r.json.projects === 0, 'me', r);
const wrongPw = await call('POST', '/api/login', { body: { user: A.user, auth: key() } });
ok(wrongPw.status === 401, 'wrong password → 401', wrongPw);
r = await call('POST', '/api/login', { body: { user: 'nobody-' + A.user, auth: key() } });
ok(r.status === 401 && r.json.error === wrongPw.json.error, 'unknown user is indistinguishable from a wrong password', r);
r = await call('POST', '/api/login', { body: { user: A.user.toUpperCase(), auth: A.pw } });
ok(r.status === 200 && r.json.token, 'logs in (name case ignored)', r);
A.tok2 = r.json.token;
ok((await call('GET', '/api/me')).status === 401, 'no token → 401');
ok((await call('GET', '/api/me', { token: A.user + '~' + rnd(32) })).status === 401, 'unknown token → 401');
ok((await call('GET', '/api/me', { token: 'garbage' })).status === 401, 'malformed token → 401');

console.log('projects');
const id = 'p' + rnd(6);
r = await putP(A.tok1, id, doc('Workshop DB'));
ok(r.status === 200 && r.json.rev === 1, 'creates at rev 1', r);
r = await putP(A.tok1, id, doc('Workshop DB v2', { baseRev: 1 }));
ok(r.status === 200 && r.json.rev === 2, 'update at the right base → rev 2', r);
r = await putP(A.tok2, id, doc('Stale write', { baseRev: 1 }));
ok(r.status === 409 && r.json.conflict === true && r.json.rev === 2, 'stale base → 409 with current rev', r);
r = await call('GET', `/api/projects/${id}`, { token: A.tok2 });
ok(r.status === 200 && r.json.name === 'Workshop DB v2' && r.json.rev === 2 && r.json.data?.note === 'Workshop DB v2', 'get returns head and data', r);
r = await call('GET', '/api/projects', { token: A.tok2 });
const row = r.json.projects?.[0];
ok(r.json.projects?.length === 1 && row.rev === 2 && row.deleted === false && !('data' in row), 'list: one row, no data', r);
ok((await putP(A.tok1, id, { name: 'x' })).status === 400, 'incomplete body refused');
ok((await putP(A.tok1, id, doc('arr', { data: [] }))).status === 400, 'array data refused');
ok((await putP(A.tok1, 'bad id!', doc('x'))).status === 400, 'bad id refused');
ok((await call('PUT', `/api/projects/${id}`, { token: A.tok1, text: '{nope' })).status === 400, 'invalid JSON refused');
r = await putP(A.tok1, id, doc('big', { baseRev: 2, data: { blob: 'x'.repeat(1600000) } }));
ok(r.status === 413, 'project over 1.5 MB refused', r.status);
r = await putP(A.tok1, id, doc('huge', { baseRev: 2, data: { blob: 'x'.repeat(2100000) } }));
ok(r.status === 413, 'request over 2 MB refused', r.status);
r = await call('GET', '/api/projects/' + id, { token: A.tok1 });
ok(r.json.rev === 2 && r.json.name === 'Workshop DB v2', 'refused writes changed nothing', r);

console.log('history');
r = await call('GET', `/api/projects/${id}/history`, { token: A.tok1 });
ok(r.json.versions?.length === 1 && r.json.versions[0].rev === 1, 'first overwrite was snapshotted', r);
await putP(A.tok1, id, doc('Workshop DB v3', { baseRev: 2 }));
r = await call('GET', `/api/projects/${id}/history`, { token: A.tok1 });
ok(r.json.versions?.length === 1, 'a second save inside 10 minutes is not', r);
await putP(A.tok1, id, doc('Workshop DB v4', { baseRev: 3, snapshot: true }));
r = await call('GET', `/api/projects/${id}/history`, { token: A.tok1 });
ok(r.json.versions?.length === 2 && r.json.versions[0].rev === 3, 'snapshot:true always snapshots', r);
r = await call('GET', `/api/projects/${id}/history/1`, { token: A.tok1 });
ok(r.status === 200 && r.json.name === 'Workshop DB' && r.json.data?.note === 'Workshop DB', 'an old version can be fetched', r);
ok((await call('GET', `/api/projects/${id}/history/99`, { token: A.tok1 })).status === 404, 'unknown version → 404');

console.log('delete and tombstones');
r = await call('DELETE', `/api/projects/${id}?base=1`, { token: A.tok1 });
ok(r.status === 409 && r.json.conflict, 'delete with a stale base → 409', r);
r = await call('DELETE', `/api/projects/${id}?base=4`, { token: A.tok1 });
ok(r.status === 200 && r.json.rev === 5, 'delete at the right base', r);
r = await call('GET', `/api/projects/${id}`, { token: A.tok1 });
ok(r.status === 404 && r.json.deleted === true && r.json.rev === 5, 'get reports it deleted', r);
r = await call('GET', '/api/projects', { token: A.tok1 });
ok(r.json.projects?.length === 1 && r.json.projects[0].deleted === true && r.json.projects[0].rev === 5, 'list keeps the tombstone', r);
r = await call('GET', '/api/me', { token: A.tok1 });
ok(r.json.projects === 0, 'tombstone is not counted', r);
r = await call('GET', `/api/projects/${id}/history`, { token: A.tok1 });
ok(r.json.versions?.[0]?.rev === 4, 'deleted project is still recoverable from history', r);
ok((await call('DELETE', `/api/projects/${id}?base=5`, { token: A.tok1 })).status === 200, 'deleting twice is fine');
r = await putP(A.tok1, id, doc('Back again', { baseRev: 5 }));
ok(r.status === 200 && r.json.rev === 6, 'a project can be re-created over its tombstone', r);
ok((await call('GET', `/api/projects/${id}`, { token: A.tok1 })).status === 200, 'and is readable again');

console.log('isolation');
const B = await signUp();
r = await call('GET', `/api/projects/${id}`, { token: B.token });
ok(r.status === 404, "another account can't see it", r);
r = await call('GET', '/api/projects', { token: B.token });
ok(r.json.projects?.length === 0, 'and its list is empty', r);
ok((await call('GET', '/api/me', { token: B.user + '~' + A.tok1.split('~')[1] })).status === 401, "A's secret doesn't work on B's account");

console.log('lockout');
const L = await signUp();
for (let i = 1; i <= 5; i++) await call('POST', '/api/login', { body: { user: L.user, auth: key() } });
r = await call('POST', '/api/login', { body: { user: L.user, auth: L.pw } });
ok(r.status === 200, 'five wrong guesses do not lock a correct login', r);
for (let i = 1; i <= 6; i++) await call('POST', '/api/login', { body: { user: L.user, auth: key() } });
r = await call('POST', '/api/login', { body: { user: L.user, auth: L.pw } });
ok(r.status === 429 && r.json.retryAfter > 0, 'six in a row lock it, even for the right password', r);
const P = await signUp();
await Promise.all(Array.from({ length: 12 }, () => call('POST', '/api/login', { body: { user: P.user, auth: key() } })));
r = await call('POST', '/api/login', { body: { user: P.user, auth: P.pw } });
ok(r.status === 429, 'twelve guesses fired in parallel still trip the lock', r);
const Q = await signUp();
await Promise.all(Array.from({ length: 8 }, () => call('POST', '/api/password', { token: Q.token, body: { auth: key(), next: key() } })));
r = await call('POST', '/api/password', { token: Q.token, body: { auth: Q.pw, next: key() } });
ok(r.status === 429, 'guessing the old password via change-password locks too', r);

console.log('sessions');
const S = await signUp();
const toks = [S.token];
for (let i = 0; i < 22; i++) toks.push((await call('POST', '/api/login', { body: { user: S.user, auth: S.pw } })).json.token);
let alive = 0;
for (const t of toks) if ((await call('GET', '/api/me', { token: t })).status === 200) alive++;
ok(alive === 20, 'at most 20 sessions are kept', alive);
ok((await call('GET', '/api/me', { token: toks[toks.length - 1] })).status === 200, 'the newest one is among them');
r = await call('POST', '/api/logout', { token: toks[toks.length - 1] });
ok(r.status === 200 && (await call('GET', '/api/me', { token: toks[toks.length - 1] })).status === 401, 'logout ends that session');

console.log('change password');
const C = await signUp();
const second = (await call('POST', '/api/login', { body: { user: C.user, auth: C.pw } })).json.token;
const npw = key();
r = await call('POST', '/api/password', { token: C.token, body: { auth: key(), next: npw } });
ok(r.status === 403, 'wrong current password → 403', r);
r = await call('POST', '/api/password', { token: C.token, body: { auth: C.pw, next: 'short' } });
ok(r.status === 400, 'malformed new key refused', r);
r = await call('POST', '/api/password', { token: C.token, body: { auth: C.pw, next: npw } });
ok(r.status === 200, 'changes', r);
ok((await call('GET', '/api/me', { token: C.token })).status === 200, 'this session stays signed in');
ok((await call('GET', '/api/me', { token: second })).status === 401, 'other sessions are signed out');
ok((await call('POST', '/api/login', { body: { user: C.user, auth: C.pw } })).status === 401, 'old password no longer works');
ok((await call('POST', '/api/login', { body: { user: C.user, auth: npw } })).status === 200, 'new password works');

console.log('delete account');
const D = await signUp();
await putP(D.token, 'keep', doc('Mine'));
r = await call('POST', '/api/account/delete', { token: D.token, body: { auth: key() } });
ok(r.status === 403, 'wrong password → 403', r);
ok((await call('GET', '/api/projects/keep', { token: D.token })).status === 200, 'nothing was deleted by that');
r = await call('POST', '/api/account/delete', { token: D.token, body: { auth: D.pw } });
ok(r.status === 200, 'deletes', r);
ok((await call('GET', '/api/me', { token: D.token })).status === 401, 'its session is gone');
ok((await call('POST', '/api/login', { body: { user: D.user, auth: D.pw } })).status === 401, "it can't sign in");
r = await call('POST', '/api/register', { body: { user: D.user, auth: key() } });
ok(r.status === 200, 'the name can be taken again', r);
r = await call('GET', '/api/projects', { token: r.json.token });
ok(r.json.projects?.length === 0, 'with none of the old data', r);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
