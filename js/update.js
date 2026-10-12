'use strict';
/* =========================================================
   Update check
   Asks the server for version.json and compares it with the running
   APP_VERSION. There is deliberately no service worker: the site is served
   with must-revalidate, so a plain reload fetches the new files, and a
   worker registered on localhost would outlive this project and answer for
   every other app that dev server ever hosts.
   ========================================================= */
const LS_UPD='pdes.upd';
const UPD_AFTER=45*60e3;          // re-check when the tab comes back after this long
const UPD_POLL=2*60*60e3;         // ...and this often while it stays open

/* What the last successful check saw — kept, so the orange dot is there the
   moment the app opens, not 3 seconds later. `last` is this session only. */
const upd=(()=>{
 let o={};try{o=JSON.parse(lsGet(LS_UPD)||'null')||{}}catch(e){}
 return {latest:String(o.latest||''),date:String(o.date||''),notes:Array.isArray(o.notes)?o.notes.map(String):[],
  checked:+o.checked||0,dismissed:String(o.dismissed||''),busy:false,last:''}})();

function verCmp(a,b){const p=s=>String(s).split('.').map(n=>parseInt(n,10)||0),x=p(a),y=p(b);
 for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1}return 0}
const updAvailable=()=>!!upd.latest&&verCmp(upd.latest,APP_VERSION)>0;
const updSave=()=>lsSet(LS_UPD,JSON.stringify({latest:upd.latest,date:upd.date,notes:upd.notes,checked:upd.checked,dismissed:upd.dismissed}));

/** Resolves to 'ok' | 'offline' | 'unsupported' | 'error' — never throws. */
async function updCheck(){
 if(upd.busy)return upd.last;
 if(!/^https?:$/.test(location.protocol)){upd.last='unsupported';updRender();return upd.last}
 if(navigator.onLine===false){upd.last='offline';updRender();return upd.last}
 upd.busy=true;upd.last='checking';updRender();
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),10000);
 try{
  const r=await fetch('version.json',{cache:'no-store',signal:ac.signal});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const j=await r.json();
  if(!j||!/^\d+\.\d+\.\d+$/.test(j.version||''))throw new Error('unreadable version.json');
  upd.latest=j.version;upd.date=String(j.date||'').slice(0,10);
  upd.notes=(Array.isArray(j.notes)?j.notes:[]).slice(0,12).map(s=>String(s).slice(0,200));
  upd.checked=Date.now();upd.last='ok';updSave();
 }catch(e){upd.last=navigator.onLine===false?'offline':'error'}
 finally{clearTimeout(timer);upd.busy=false}
 updRender();return upd.last}

/* The menu dot and the banner follow the same facts; Settings, if it is
   open, redraws itself through settingsUpdated(). */
function updRender(){
 const has=updAvailable(),bar=$('#updbar');
 $('#bMenu').classList.toggle('dot',has);
 const show=has&&upd.dismissed!==upd.latest;
 bar.classList.toggle('hidden',!show);
 if(show)bar.querySelector('b').textContent='Update available — v'+upd.latest;
 if(typeof settingsUpdated==='function')settingsUpdated()}

function updReload(){location.reload()}

$('#updbar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.act==='reload')updReload();
 else{upd.dismissed=upd.latest;updSave();updRender()}});

(function updSchedule(){
 const auto=()=>settings.autoUpdate!==false&&/^https?:$/.test(location.protocol);
 setTimeout(()=>{if(auto())updCheck()},2500);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&auto()&&Date.now()-upd.checked>UPD_AFTER)updCheck()});
 window.addEventListener('online',()=>{if(auto()&&Date.now()-upd.checked>UPD_AFTER)updCheck()});
 setInterval(()=>{if(document.visibilityState==='visible'&&auto())updCheck()},UPD_POLL);
 if(!/^https?:$/.test(location.protocol))upd.last='unsupported';
 updRender()})();
