'use strict';
/* =========================================================
   Cloud account — session, API calls and change tracking.
   localStorage stays the working store: the app never waits on the
   network, so a guest (or someone offline) loses nothing. The reconcile
   engine is cloud-sync.js; the screens are cloud-ui.js.
   ========================================================= */
const LS_CL_SES='pdes.cloud.session',LS_CL_META='pdes.cloud.meta',LS_CL_WEL='pdes.cloud.welcome',LS_CL_SEED='pdes.cloud.seed';
const CLOUD_POLL=2*60e3;
const CLOUD_NAME=/^[a-z0-9][a-z0-9._@+-]{2,39}$/;

const cloud=(()=>{let s={};try{s=JSON.parse(lsGet(LS_CL_SES)||'null')||{}}catch(e){}
 const token=typeof s.token==='string'?s.token:'',user=typeof s.user==='string'?s.user:'';
 return {avail:false,checked:false,why:'',invite:false,user:token?user:'',token,
  state:'idle',            // idle | syncing | offline | error | lost
  err:'',note:'',last:0,lastTry:0,retry:0,defer:0,busy:false,again:false,edits:0,mute:false,
  pending:!!token,         // edits (or a first sync) not yet confirmed by the cloud
  problem:0,blocked:0,prog:null,touched:0,bad:{}}})();
const cloudOn=()=>!!(cloud.token&&cloud.user);
const cloudDel=k=>{try{localStorage.removeItem(k)}catch(e){}};
const cloudObj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};

/* What this device last agreed with the cloud: per project the revision and
   a hash of the content then; plus deletes not yet sent. */
function cloudMetaLoad(){let m=null;try{m=JSON.parse(lsGet(LS_CL_META)||'null')}catch(e){}
 m=cloudObj(m);return {user:String(m.user||''),projects:cloudObj(m.projects),tombstones:cloudObj(m.tombstones)}}
/** Read-modify-write in one synchronous step, so a delete made during a sync is never overwritten. */
function cloudMeta(fn){const m=cloudMetaLoad(),r=fn(m);lsSet(LS_CL_META,JSON.stringify(m));return r}
const cloudWrite=P=>lsSet(LS_P,JSON.stringify(P));

/* Key order and the `updated` stamp must not look like an edit, so the
   hash covers name + data only, with sorted keys. */
function cloudCanon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(cloudCanon).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+cloudCanon(v[k])).join(',')+'}'}
function cloudHash(s){let a=0xdeadbeef,b=0x41c6ce57;
 for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677)}
 a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);
 b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);
 return (4294967296*(2097151&b)+(a>>>0)).toString(36)}
/* The server trims names and cuts them at 120, so do the same before hashing. */
const cloudName=n=>String(n==null?'':n).trim().slice(0,120)||'Untitled';
/* With an id the result is remembered per (id, saved-at, name): every edit
   re-stamps `updated`, so a stale entry can't survive one. Saves repeated
   hashing of big projects on every sync pass. */
const cloudMemo=new Map();
function cloudSigOf(rec,id){
 const k=id?id+'|'+rec.updated+'|'+cloudName(rec.name):'';
 if(k&&cloudMemo.has(k))return cloudMemo.get(k);
 const h=cloudHash(cloudCanon({n:cloudName(rec.name),d:rec.data}));
 if(k){if(cloudMemo.size>500)cloudMemo.clear();cloudMemo.set(k,h)}
 return h}
/* The sample project made on a first visit is not uploaded until it is
   changed — every device makes its own, so syncing them only piles up copies. */
const cloudMarkSeed=id=>{const rec=loadProjects()[id];if(rec)lsSet(LS_CL_SEED,JSON.stringify({id,h:cloudSigOf(rec,id)}))};
function cloudIsSeed(id,rec){let s=null;try{s=JSON.parse(lsGet(LS_CL_SEED)||'null')}catch(e){}
 return !!(s&&rec&&s.id===id&&s.h===cloudSigOf(rec,id))}
/** A project saved by a newer major.minor may hold fields this version would drop. */
const cloudNewer=app=>{if(!app)return false;const p=s=>String(s).split('.').slice(0,2).map(n=>parseInt(n,10)||0),a=p(app),b=p(APP_VERSION);
 return a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1])};

/** Never throws; network trouble comes back as {net:true}. A 401 on a signed-in call ends the session. */
async function cloudApi(method,path,body,o={}){
 const ac=new AbortController(),t=setTimeout(()=>ac.abort(),o.timeout||25000),h={},tok=o.token||(o.anon?'':cloud.token);
 if(body!==undefined)h['content-type']='application/json';
 if(tok)h.authorization='Bearer '+tok;
 try{
  const res=await fetch('/api'+path,{method,headers:h,cache:'no-store',signal:ac.signal,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  let j={};try{j=cloudObj(await res.json())}catch(e){}
  if(res.status===401&&tok&&tok===cloud.token)cloudLost();
  return {ok:res.ok,status:res.status,json:j}
 }catch(e){return {ok:false,status:0,net:true,json:{error:e&&e.name==='AbortError'?'The cloud took too long to answer.':'Could not reach the cloud.'}}}
 finally{clearTimeout(t)}}

/** Is there a cloud behind this page? Needs http(s) for the API and a secure context for WebCrypto. */
async function cloudPing(){
 cloud.checked=true;
 if(!/^https?:$/.test(location.protocol)){cloud.avail=false;cloud.why='protocol';return false}
 if(!(window.crypto&&crypto.subtle)){cloud.avail=false;cloud.why='crypto';return false}
 const r=await cloudApi('GET','/ping',undefined,{anon:true,timeout:8000});
 cloud.avail=!!(r.ok&&r.json.app==='pdes'&&r.json.cloud===true);
 cloud.invite=cloud.avail&&!!r.json.invite;
 cloud.why=cloud.avail?'':r.net?'offline':'noserver';
 return cloud.avail}

/* The password never leaves the device: it is stretched here into a key and
   only that key is sent. The username is the salt, so the same password
   gives a different key on every account. */
async function cloudAuthKey(user,pw){
 const enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',enc.encode(String(pw).normalize('NFKC')),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode('pdes/v1/'+user),iterations:300000},k,256);
 let s='';new Uint8Array(bits).forEach(b=>s+=String.fromCharCode(b));
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
/** kind: 'register' | 'login'. Resolves {user,token} or {error}. */
async function cloudAuth(kind,user,pw,invite){
 user=String(user||'').trim().toLowerCase();
 if(!CLOUD_NAME.test(user))return {error:'Use 3–40 characters for the username: letters, numbers and . _ @ + -'};
 if(!pw)return {error:'Enter your password.'};
 if(kind==='register'&&String(pw).length<8)return {error:'Use at least 8 characters for the password.'};
 const auth=await cloudAuthKey(user,pw);
 const r=await cloudApi('POST','/'+kind,{user,auth,invite:invite||undefined},{anon:true});
 return r.ok?{user:r.json.user,token:r.json.token}:{error:r.json.error||'Something went wrong. Try again.'}}
async function cloudChangePw(oldPw,newPw){
 if(String(newPw).length<8)return {error:'Use at least 8 characters for the new password.'};
 const [a,b]=await Promise.all([cloudAuthKey(cloud.user,oldPw),cloudAuthKey(cloud.user,newPw)]);
 const r=await cloudApi('POST','/password',{auth:a,next:b});
 return r.ok?{ok:true}:{error:r.json.error||'Could not change the password.'}}
async function cloudDeleteAccount(pw){
 const r=await cloudApi('POST','/account/delete',{auth:await cloudAuthKey(cloud.user,pw)});
 if(!r.ok)return {error:r.json.error||'Could not delete the account.'};
 cloudEndSession();cloudDel(LS_CL_META);cloudPaint();return {ok:true}}

function cloudSaveSession(){cloudOn()?lsSet(LS_CL_SES,JSON.stringify({user:cloud.user,token:cloud.token})):cloudDel(LS_CL_SES)}
function cloudLost(){if(!cloud.token)return;cloud.token='';cloud.state='lost';cloud.err='Your sign-in has expired.';cloudSaveSession();cloudPaint();toast('Signed out of the cloud — open Account in the menu to sign in again')}
function cloudEndSession(){cloud.token='';cloud.user='';cloud.state='idle';cloud.err='';cloud.pending=false;cloud.problem=0;cloud.blocked=0;cloud.bad={};cloud.retry=0;
 clearTimeout(cloudT);clearTimeout(cloudRT);cloudT0=0;cloudDel(LS_CL_SES)}
async function cloudSignOut(clear){
 if(cloudOn())await cloudApi('POST','/logout',undefined,{timeout:4000});
 cloudEndSession();
 if(clear){[LS_P,LS_C,LS_CL_META,LS_CL_WEL,LS_CL_SEED].forEach(cloudDel);location.reload();return}
 cloudPaint()}

/* ---------- when to sync ---------- */
let cloudT=0,cloudT0=0,cloudRT=0;
/** After edits: wait for a quiet moment, but never more than 30 s in all. */
function cloudDebounce(ms){if(!cloudOn())return;const now=Date.now();if(!cloudT0)cloudT0=now;
 clearTimeout(cloudT);cloudT=setTimeout(()=>{cloudT0=0;cloudSync('edit')},Math.max(0,Math.min(ms,cloudT0+30e3-now)))}
function cloudLater(ms){clearTimeout(cloudRT);cloudRT=setTimeout(()=>cloudSync('retry'),ms)}
/** Called by saveProjects() after every write of the project store (not for writes the sync itself makes). */
function cloudChanged(){if(!cloudOn()||cloud.mute)return;cloud.edits++;cloud.pending=true;cloudPaint();cloudDebounce(4000)}
const cloudKick=gap=>{if(cloudOn()&&!cloud.busy&&Date.now()-cloud.lastTry>gap)cloudSync('wake')};

/* ---------- the dot on the project title ---------- */
function cloudDot(){
 if(cloud.state==='lost')return 'err';
 if(!cloudOn())return '';
 if(cloud.state==='error'||cloud.problem)return 'err';
 return cloud.busy||cloud.pending||cloud.state==='offline'?'pend':'ok'}
function cloudPaint(){
 const c=$('#titleChip'),k=cloudDot();
 if(c){c.classList.remove('cs-ok','cs-pend','cs-err');if(k)c.classList.add('cs-'+k);
  c.title=({ok:'Saved to the cloud',pend:'Waiting to sync',err:'Not syncing — open Account in the menu'})[k]||''}
 if(typeof cloudUiChanged==='function')cloudUiChanged()}

(function cloudStart(){
 const t=()=>{cloud.touched=Date.now()};
 ['pointerdown','pointerup','keydown','wheel'].forEach(ev=>window.addEventListener(ev,t,true));
 window.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')t()},true);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')cloudKick(15e3);
  else if(cloud.pending&&cloudOn())cloudSync('hide')});
 window.addEventListener('focus',()=>cloudKick(30e3));
 window.addEventListener('online',()=>cloudPing().then(()=>{cloudPaint();cloudKick(0)}));
 setInterval(()=>{if(document.visibilityState==='visible')cloudKick(CLOUD_POLL-5e3)},CLOUD_POLL);
 setTimeout(async()=>{await cloudPing();cloudPaint();
  if(cloudOn())cloudSync('boot');else if(typeof cloudMaybeWelcome==='function')cloudMaybeWelcome()},1200);
 cloudPaint()})();
