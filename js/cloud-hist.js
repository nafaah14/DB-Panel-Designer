'use strict';
/* =========================================================
   Cloud extras — what the project list says about the cloud, earlier
   versions of a project, and projects deleted in the last 90 days.
   ========================================================= */
const cloudDate=ts=>{const d=new Date(ts);return isNaN(d)?'':d.toLocaleString()};

/** The small tag after a project's date in the Projects list. */
function cloudRowBadge(id,rec){
 if(!cloudOn())return '';
 const m=cloudMetaLoad().projects[id],sig=cloudSigOf(rec,id),bad=cloud.bad[id];
 if(bad&&bad.h===sig)return ` · <span class="cb bad" title="${esc(bad.msg)}">can’t sync</span>`;
 if(m&&m.h===sig)return ' · <span class="cb ok">in the cloud</span>';
 if(!m&&cloudIsSeed(id,rec))return ' · <span class="cb" title="The sample project is uploaded once you change it">this device only</span>';
 return ` · <span class="cb pend">${m?'waiting to sync':'not uploaded yet'}</span>`}
const cloudRowButtons=id=>cloudOn()&&cloudMetaLoad().projects[id]?`<button type="button" class="bb" data-hist="${esc(id)}">History</button>`:'';

/** Fills the [data-list] box of the open modal from the cloud, or says why it can't. */
async function cloudFill(box,path,render,empty){
 const el=box.querySelector('[data-list]'),r=await cloudApi('GET',path);
 if(!el.isConnected)return;
 if(!r.ok){el.innerHTML=`<p class="cerr">${esc(r.json.error||'Could not reach the cloud.')}</p>`;return}
 const rows=render(r.json);
 el.innerHTML=rows||`<p class="muted">${empty}</p>`}

/* ---------- earlier versions of one project ---------- */
function cloudHistory(id){
 const rec=loadProjects()[id];if(!rec||!cloudOn())return;
 openModal(`<h3>History</h3><p><b>${esc(rec.name)}</b></p>
  <p class="muted">While you work, the cloud keeps earlier versions of this project. Restoring adds an old version as a new project — nothing is overwritten.</p>
  <div data-list><p class="muted">Loading…</p></div>
  <div class="mact"><button type="button" class="bb" data-back>Back to projects</button><button type="button" class="bb pri" data-close>Done</button></div>`,box=>{
  box.querySelector('[data-back]').onclick=openProjects;
  cloudFill(box,'/projects/'+id+'/history',j=>(Array.isArray(j.versions)?j.versions:[]).map(x=>
   `<div class="prow"><b>${esc(cloudDate(x.saved||x.updated))}</b><small>${esc(cloudName(x.name))} · ${fmtSize(+x.size||0)}${x.app?' · v'+esc(x.app):''}</small><div class="pbtns"><button type="button" class="bb" data-rev="${+x.rev}">Restore as a copy</button></div></div>`).join(''),
   'No earlier versions yet — they build up as you keep editing.');
  box.querySelector('[data-list]').onclick=e=>{const b=e.target.closest('[data-rev]');if(b)cloudRestoreCopy(id,+b.dataset.rev,b)}})}

/** True when a version fetched from the cloud can be used; otherwise says why not. */
function cloudVersionOk(r){
 if(!r.ok||!validDoc(r.json.data)){toast(r.json.error||'Could not open that version.');return false}
 if(cloudNewer(r.json.app)){toast('That was saved by a newer version of the app — update first.');return false}
 return true}

async function cloudRestoreCopy(id,rev,btn){
 btn.disabled=true;
 const r=await cloudApi('GET','/projects/'+id+'/history/'+rev);
 btn.disabled=false;
 if(!cloudVersionOk(r))return;
 const v=r.json,P=loadProjects();
 P[uid()]={name:cloudName(v.name).slice(0,80)+' (from '+cloudDate(v.saved||v.updated)+')',updated:Date.now(),appVersion:v.app||APP_VERSION,data:v.data};
 if(!cloudWrite(P))return toast('Not enough room on this device for that version');
 cloudChanged();toast('Added as a new project');openProjects()}

/* ---------- deleted in the last 90 days ---------- */
function cloudDeletedList(){
 if(!cloudOn())return;
 openModal(`<h3>Recently deleted</h3>
  <p class="muted">Projects deleted in the last 90 days. Restoring brings back the last version that reached the cloud.</p>
  <div data-list><p class="muted">Loading…</p></div>
  <div class="mact"><button type="button" class="bb" data-back>Back</button><button type="button" class="bb pri" data-close>Done</button></div>`,box=>{
  box.querySelector('[data-back]').onclick=openAccount;
  cloudFill(box,'/projects',j=>(Array.isArray(j.projects)?j.projects:[]).filter(p=>p.deleted).sort((a,b)=>(b.saved||0)-(a.saved||0)).map(p=>
   `<div class="prow"><b>${esc(cloudName(p.name))}</b><small>Deleted ${esc(cloudDate(p.saved))}</small><div class="pbtns"><button type="button" class="bb pri" data-id="${esc(p.id)}">Restore</button></div></div>`).join(''),
   'Nothing has been deleted recently.');
  box.querySelector('[data-list]').onclick=e=>{const b=e.target.closest('[data-id]');if(b)cloudRestoreDeleted(b.dataset.id,b)}})}

/* The project comes back under its old id; the next sync sees a local copy of a deleted project and writes it over the delete. */
async function cloudRestoreDeleted(id,btn){
 btn.disabled=true;
 const h=await cloudApi('GET','/projects/'+id+'/history'),top=h.ok?(h.json.versions||[])[0]:null;
 if(!top){btn.disabled=false;return toast(h.ok?'No saved copy of that project is left.':h.json.error||'Could not reach the cloud.')}
 const r=await cloudApi('GET','/projects/'+id+'/history/'+top.rev);
 btn.disabled=false;
 if(!cloudVersionOk(r))return;
 const v=r.json,P=loadProjects();
 if(P[id])return toast('That project is already back.');
 P[id]={name:cloudName(v.name),updated:Date.now(),appVersion:v.app||APP_VERSION,data:v.data};
 if(!cloudWrite(P))return toast('Not enough room on this device for that project');
 cloudMeta(x=>{delete x.projects[id];delete x.tombstones[id]});
 cloudChanged();toast('Restored');openProjects()}
