'use strict';
/* =========================================================
   Settings — preferences, what is stored on this device, and the app
   version with its update check. Changes apply as they are made, so there
   is no Save button to forget.
   ========================================================= */
const fmtAgo=ts=>{if(!ts)return 'never';const s=Math.max(0,(Date.now()-ts)/1000);
 if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';
 if(s<86400)return Math.round(s/3600)+' h ago';return Math.round(s/86400)+' days ago'};
const fmtSize=n=>n<1e3?n+' B':n<1e6?Math.round(n/1e3)+' KB':(n/1e6).toFixed(1)+' MB';
/* Characters, not bytes: browsers meter localStorage by characters (~5M). */
function storageUse(){let n=0;
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('pdes.'))n+=k.length+(localStorage.getItem(k)||'').length}}catch(e){}
 return n}

/* ---------- preferences ---------- */
const prefsHTML=()=>`<section class="sec"><h4>Preferences</h4>
 <label>Wire colour scheme (Auto)<select id="pScheme">${Object.entries(SCHEMES).map(([k,v])=>`<option value="${k}" ${k===settings.scheme?'selected':''}>${v.name}</option>`).join('')}</select></label>
 <label class="row"><input type="checkbox" id="pSnap" ${settings.snap?'checked':''}>Snap free items to grid</label>
 <label class="row"><input type="checkbox" id="pLabels" ${settings.labels?'checked':''}>Show circuit labels</label></section>`;
function bindPrefs(box){
 const apply=()=>{settings.scheme=box.querySelector('#pScheme').value;settings.snap=box.querySelector('#pSnap').checked;
  settings.labels=box.querySelector('#pLabels').checked;saveSettings();
  if(appMode==='room')roomRefresh();else render();renderTabs();updUI()};
 box.querySelectorAll('#pScheme,#pSnap,#pLabels').forEach(el=>el.onchange=apply)}

/* ---------- storage, backup ---------- */
function backupAll(){save();
 const list=Object.entries(loadProjects()).map(([id,r])=>({id,name:r.name,updated:r.updated,appVersion:r.appVersion,data:r.data}));
 if(!list.length)return toast('Nothing to back up yet');
 const o={app:'db-panel-designer',kind:'backup',schema:1,appVersion:APP_VERSION,exported:new Date().toISOString(),projects:list};
 shareOrDownload(new Blob([JSON.stringify(o)],{type:'application/json'}),`panel-designer-backup-${new Date().toISOString().slice(0,10)}.json`)}
/** Same test the single-project import applies: new `panels` shape or the old flat one. */
const validDoc=d=>!!d&&typeof d==='object'&&(Array.isArray(d.panels)?d.panels.length>0:Array.isArray(d.items)&&Array.isArray(d.wires));
/** Adds every project in a backup as a new project; nothing existing is replaced. */
function importBackup(o){
 const P=loadProjects();let n=0;
 for(const r of o.projects){
  if(!r||typeof r.name!=='string'||!validDoc(r.data))continue;
  P[uid()]={name:r.name.slice(0,80),updated:+r.updated||Date.now(),appVersion:String(r.appVersion||APP_VERSION),data:r.data};n++}
 if(!n)return toast('That backup has no projects in it');
 if(!lsSet(LS_P,JSON.stringify(P)))return toast('Not enough room on this device for that backup');
 cloudChanged();
 toast(`Added ${n} project${n===1?'':'s'} from the backup`);openProjects()}

async function persistCheck(box){
 const msg=box.querySelector('#sPers'),btn=box.querySelector('#sProt');
 if(!(navigator.storage&&navigator.storage.persisted))return;
 let on=false;try{on=await navigator.storage.persisted()}catch(e){}
 if(!msg.isConnected)return;
 msg.textContent=on?'Protected — the browser will not clear these on its own.':'Not protected — the browser may clear saved designs if this device runs low on space.';
 btn.hidden=on||!navigator.storage.persist;
 btn.onclick=async()=>{let ok=false;try{ok=await navigator.storage.persist()}catch(e){}
  toast(ok?'Saved designs are now protected':'The browser declined — keep a backup file');
  if(msg.isConnected)persistCheck(box)}}
function renderStore(box){
 const n=Object.keys(loadProjects()).length,use=storageUse();
 box.querySelector('#sStore').innerHTML=`<h4>Storage</h4>
  <p class="sline"><b>${n} project${n===1?'':'s'}</b> saved on this device · ${fmtSize(use)} of about 5&nbsp;MB</p>
  ${use>3.5e6?'<p class="cct-warn">Storage for this app is getting full. Back up, then delete projects you no longer need.</p>':''}
  <p class="muted" id="sPers"></p>
  <div class="pbtns"><button type="button" class="bb" id="sProt" hidden>Protect from clearing</button><button type="button" class="bb" id="sBack">Back up everything</button><button type="button" class="bb" id="sImp">Import a file</button></div>`;
 box.querySelector('#sBack').onclick=backupAll;
 box.querySelector('#sImp').onclick=()=>{closeModal();$('#fileIn').click()};
 persistCheck(box)}

/* ---------- this app: version + updates ---------- */
function renderApp(box){
 const has=updAvailable(),st=upd.busy?'checking':upd.last;
 let line='Not checked yet.',cls='';
 if(st==='checking')line='Checking for updates…';
 else if(st==='offline'){line='You are offline, so it could not check.';cls='bad'}
 else if(st==='unsupported')line='Open the app from its web address to check for updates.';
 else if(st==='error'){line='Could not reach the update server. Try again later.';cls='bad'}
 else if(has){line=`Update available — v${upd.latest}${upd.date?' · '+upd.date:''}`;cls='up'}
 else if(upd.checked&&upd.latest){line='You have the latest version.';cls='ok'}
 const notes=upd.notes.length&&verCmp(upd.latest,APP_VERSION)>=0;
 box.querySelector('#sAlert').innerHTML=has?`<div class="scard warn"><div class="srow"><b>Update available</b><span class="ver">v${esc(upd.latest)}</span></div><p class="muted">Your designs are saved — reloading keeps them.</p><div class="pbtns"><button type="button" class="bb pri" id="uGo">Reload to update</button></div></div>`:'';
 box.querySelector('#sApp').innerHTML=`<h4>This app</h4>
  <div class="srow"><b>DB Panel Designer</b><span class="ver">v${esc(APP_VERSION)}</span></div>
  <p class="sstat ${cls}">${esc(line)}</p>
  ${upd.checked?`<p class="muted">Last checked ${fmtAgo(upd.checked)}</p>`:''}
  <div class="pbtns"><button type="button" class="bb" id="uChk" ${upd.busy?'disabled':''}>Check for updates</button></div>
  <label class="row" style="margin-top:10px"><input type="checkbox" id="uAuto" ${settings.autoUpdate!==false?'checked':''}>Check for updates automatically</label>
  ${notes?`<details><summary>${has?'What’s new in v'+esc(upd.latest):'What’s new in this version'}</summary><ul>${upd.notes.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`:''}`;
 const go=box.querySelector('#uGo');if(go)go.onclick=updReload;
 box.querySelector('#uChk').onclick=()=>updCheck();
 box.querySelector('#uAuto').onchange=e=>{settings.autoUpdate=e.target.checked;saveSettings()}}
/** Called by the update checker whenever its state changes. */
function settingsUpdated(){const a=mbox.querySelector('#sApp');if(a&&a.isConnected&&!modal.classList.contains('hidden'))renderApp(mbox)}

function openSettings(){
 openModal(`<h3>Settings</h3><div id="sAlert"></div><section class="sec first"><h4>Account</h4><div data-acct></div></section>${prefsHTML()}<section class="sec" id="sStore"></section><section class="sec" id="sApp"></section><div class="mact"><button class="bb pri" data-close>Done</button></div>`,box=>{
  cloudRenderAcct(box.querySelector('[data-acct]'));bindPrefs(box);renderStore(box);renderApp(box)})}
