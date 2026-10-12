'use strict';
/* =========================================================
   Cloud sync engine.
   Every project is reconciled on its own from three facts: what the cloud
   holds (rev), what this device last agreed with (meta: rev + content hash)
   and what is stored here now. When both sides changed, nothing is
   overwritten — the cloud's version is kept beside yours as "(cloud copy)".
   ========================================================= */
class CloudAbort extends Error{}
const cloudFail=r=>{const e=new CloudAbort((r.json&&r.json.error)||'The cloud had a problem.');e.net=!!r.net;e.lost=r.status===401;return e};

/** Nobody is mid-edit, so the open project may be swapped underneath them. */
function cloudIdle(){
 if(!$('#modal').classList.contains('hidden'))return true;
 const a=document.activeElement;
 if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return false;
 return Date.now()-cloud.touched>1500&&!(typeof ptrs!=='undefined'&&ptrs.size)}

/** rec: local project (sig = its content hash) · m: what this device last agreed · r: the cloud's list row · tomb: a delete not yet sent */
function cloudDecide(rec,m,r,tomb,sig){
 if(tomb)return !r||r.deleted?'forget':tomb.rev<0||tomb.rev===r.rev?'delete':'restore';
 if(!rec)return !r||r.deleted?'forget':'pull-new';
 if(!r)return 'push-new';
 const dirty=!m||sig!==m.h;
 if(r.deleted)return m&&!dirty?'drop':'push-over';
 if(!m)return 'adopt';
 if(m.rev===r.rev)return dirty?'push':'same';
 return m.rev<r.rev&&!dirty?'pull':'conflict'}

function cloudSetLocal(id,remote){
 const P=loadProjects();P[id]={name:remote.name,updated:remote.updated,appVersion:remote.app,data:remote.data};
 if(!cloudWrite(P))return false;
 cloudMeta(x=>{x.projects[id]={rev:remote.rev,h:cloudSigOf(P[id])}});return true}

function cloudBody(rec,baseRev,snap){
 if(!rec.data||typeof rec.data!=='object'||Array.isArray(rec.data))return '';
 const b=JSON.stringify({name:cloudName(rec.name),updated:+rec.updated||Date.now(),app:rec.appVersion||APP_VERSION,baseRev,data:rec.data,snapshot:snap||undefined});
 return b.length>1.9e6?'':b}
/** → {ok,rev} · {conflict} · {bad:why}; trouble reaching the cloud throws CloudAbort. */
async function cloudPut(id,rec,baseRev,snap){
 const body=cloudBody(rec,baseRev,snap);
 if(!body)return {bad:'Too large to sync (the limit is about 1.5 MB) — it stays on this device.'};
 const r=await cloudApi('PUT','/projects/'+id,body);
 if(r.ok)return {ok:true,rev:r.json.rev};
 if(r.status===409&&r.json.conflict)return {conflict:true};
 if(r.net||r.status===401||r.status===429||r.status>=500)throw cloudFail(r);
 return {bad:r.json.error||'The cloud refused this project.'}}
function cloudBad(id,sig,msg,rep){cloud.bad[id]={h:sig,msg};rep.problem++;rep.note=rep.note||msg}

/** Save the cloud's version as a local project of its own (once). Returns its name, '' if the browser is full. */
function cloudKeepCopy(remote){
 const P=loadProjects(),dh=cloudHash(cloudCanon(remote.data));
 const dup=Object.keys(P).find(k=>/ \(cloud copy( \d+)?\)$/.test(P[k].name||'')&&cloudHash(cloudCanon(P[k].data))===dh);
 if(dup)return P[dup].name;
 const used=new Set(Object.keys(P).map(k=>P[k].name));let name=remote.name+' (cloud copy)',n=2;
 while(used.has(name))name=remote.name+' (cloud copy '+(n++)+')';
 P[uid()]={name,updated:remote.updated,appVersion:remote.app,data:remote.data};
 return cloudWrite(P)?name:''}

/** Both sides changed (or this device never synced the project): keep the cloud's as a copy, then send ours on top. */
async function cloudKeepBoth(id,rep){
 const g=await cloudApi('GET','/projects/'+id);
 if(!g.ok){if(g.status===404){rep.again=true;return}throw cloudFail(g)}
 const remote=g.json,rec=loadProjects()[id];
 if(!rec||cloudMetaLoad().tombstones[id]){rep.again=true;return}
 const sig=cloudSigOf(rec);
 if(sig===cloudSigOf(remote)){cloudMeta(x=>{x.projects[id]={rev:remote.rev,h:sig}});return}
 if(!cloudBody(rec,0,true))return cloudBad(id,sig,'Too large to sync (the limit is about 1.5 MB) — it stays on this device.',rep);
 const copy=cloudKeepCopy(remote);
 if(!copy){rep.problem++;rep.note=rep.note||'This device is out of storage.';return}
 const res=await cloudPut(id,rec,remote.rev,true);
 if(res.ok){cloudMeta(x=>{x.projects[id]={rev:res.rev,h:sig}});rep.kept++;rep.pushed++;rep.again=true;toast(`Changed on two devices — both kept. The other one is "${copy}".`)}
 else if(res.conflict)rep.again=true;
 else cloudBad(id,sig,res.bad,rep)}

/** act: 'pull' (we hold an older clean copy) or 'pull-new' (we have none). */
async function cloudPull(id,act,rep){
 if(rep.full){rep.problem++;return}
 if(id===curId&&!cloudIdle()){rep.deferred++;return}
 const g=await cloudApi('GET','/projects/'+id);
 if(!g.ok){if(g.status===404||g.status===400){rep.again=true;return}throw cloudFail(g)}
 const remote=g.json,rec=loadProjects()[id],m=cloudMetaLoad();
 const clean=act==='pull'?!!(rec&&m.projects[id]&&cloudSigOf(rec)===m.projects[id].h):!rec;
 if(!clean||m.tombstones[id]){rep.again=true;return}
 if(id===curId){
  if(!cloudIdle()){rep.deferred++;return}
  cloud.mute=true;
  try{pushUndo();S.name=remote.name;restore(JSON.stringify(remote.data))}
  catch(e){console.error('[cloud]',e);loadDoc(id);rep.problem++;rep.note=rep.note||'A cloud project could not be opened.';return}
  finally{cloud.mute=false}
  const now=loadProjects()[id]||{name:remote.name,data:remote.data};
  cloudMeta(x=>{x.projects[id]={rev:remote.rev,h:cloudSigOf(now)}});toast('Updated from the cloud');
 }else if(!cloudSetLocal(id,remote)){rep.full=true;rep.problem++;rep.note=rep.note||'This device is out of storage.';return}
 rep.pulled++}

/** Deleted on another device while this copy is unchanged here: follow the delete. */
function cloudDrop(id,rep,quiet){
 if(id===curId&&!cloudIdle()){rep.deferred++;return}
 const P=loadProjects(),rec=P[id];if(!rec)return;
 const name=rec.name;delete P[id];
 if(!cloudWrite(P))return;
 cloudMeta(x=>{delete x.projects[id]});
 if(id===curId){const rest=Object.keys(P).sort((a,c)=>(P[c].updated||0)-(P[a].updated||0));curId=null;rest.length?loadDoc(rest[0]):newProject(blankDoc())}
 if(!quiet)toast(`"${name}" was deleted on another device`)}
/** Once the cloud holds projects of the user's own, this device's untouched sample project is only clutter. */
function cloudDropSeed(rows,rep){
 if(!Object.values(rows).some(p=>!p.deleted))return;
 const P=loadProjects(),m=cloudMetaLoad().projects,id=Object.keys(P).find(k=>!m[k]&&cloudIsSeed(k,P[k]));
 if(id)cloudDrop(id,rep,true)}

async function cloudSendDelete(id,r,tomb,rep){
 const q=await cloudApi('DELETE','/projects/'+id+'?base='+(tomb.rev<0?r.rev:tomb.rev));
 if(q.ok||(q.status>=400&&q.status<500&&q.status!==401&&q.status!==429)){
  cloudMeta(x=>{delete x.tombstones[id]});
  if(q.status===409)rep.again=true;else if(q.ok)rep.pushed++}
 else throw cloudFail(q)}

/** peek: this project as read once at the start of the pass — enough to see that nothing needs doing; anything else is re-read. */
async function cloudAct(id,r,rep,peek){
 const m0=cloudMetaLoad(),m=m0.projects[id];let tomb=m0.tombstones[id];
 if(!tomb&&peek&&m&&r&&!r.deleted&&m.rev===r.rev&&cloudSigOf(peek,id)===m.h)return;
 const rec=loadProjects()[id];
 if(tomb&&rec){cloudMeta(x=>{delete x.tombstones[id]});tomb=null}
 const sig=rec?cloudSigOf(rec,id):'',act=cloudDecide(rec,m,r,tomb,sig);
 if(act==='push-new'&&cloudIsSeed(id,rec))return;
 if(cloud.bad[id]&&cloud.bad[id].h!==sig)delete cloud.bad[id];
 if(r&&cloudNewer(r.app)&&['pull','pull-new','restore','push','conflict','adopt'].includes(act)){rep.blocked++;return}
 if(cloud.bad[id]&&/^(push|conflict|adopt)/.test(act)){rep.problem++;rep.note=rep.note||cloud.bad[id].msg;return}
 switch(act){
  case 'forget':cloudMeta(x=>{delete x.projects[id];delete x.tombstones[id]});return;
  case 'delete':return cloudSendDelete(id,r,tomb,rep);
  case 'restore':cloudMeta(x=>{delete x.tombstones[id]});return cloudPull(id,'pull-new',rep);
  case 'pull':case 'pull-new':return cloudPull(id,act,rep);
  case 'drop':return cloudDrop(id,rep);
  case 'adopt':case 'conflict':return cloudKeepBoth(id,rep);
  case 'push-new':case 'push':case 'push-over':{
   const res=await cloudPut(id,rec,act==='push-new'?0:act==='push'?m.rev:r.rev,false);
   if(res.ok){cloudMeta(x=>{x.projects[id]={rev:res.rev,h:sig}});rep.pushed++}
   else if(res.conflict){if(act==='push-over')rep.again=true;else await cloudKeepBoth(id,rep)}
   else cloudBad(id,sig,res.bad,rep)}}}

async function cloudCycle(rep,tok){
 const lr=await cloudApi('GET','/projects');
 if(!lr.ok)throw cloudFail(lr);
 const rows={};(lr.json.projects||[]).forEach(p=>{rows[p.id]=p});
 const m=cloudMetaLoad(),P0=loadProjects(),ids=new Set([...Object.keys(rows),...Object.keys(P0),...Object.keys(m.projects),...Object.keys(m.tombstones)]);
 const order=[...ids].sort((a,b)=>!!m.tombstones[b]-!!m.tombstones[a]);
 cloud.prog={done:0,total:order.length};
 for(const id of order){
  if(cloud.token!==tok){const q=new CloudAbort('Account changed.');q.quiet=true;throw q}
  await cloudAct(id,rows[id],rep,P0[id]);cloud.prog.done++;
  if(cloud.prog.done%5===0)cloudPaint()}
 if(!rep.full)cloudDropSeed(rows,rep)}

let cloudChain=0;
/** Reconcile with the cloud. Resolves to a report ({pulled,pushed,kept,…}), or null when it did not run. */
async function cloudSync(why){
 if(!cloudOn())return null;
 if(cloud.busy){cloud.again=true;return null}
 if(navigator.onLine===false){cloud.state='offline';cloud.err='You are offline.';cloudPaint();return null}
 const e0=cloud.edits,tok=cloud.token,rep={pulled:0,pushed:0,kept:0,blocked:0,problem:0,deferred:0,again:false,full:false,note:'',ran:false,why};
 cloud.busy=true;cloud.again=false;cloud.lastTry=Date.now();cloud.state='syncing';cloudPaint();
 try{
  const go=async()=>{rep.ran=true;await cloudCycle(rep,tok)};
  if(navigator.locks)await navigator.locks.request('pdes-cloud-sync',{ifAvailable:true},lock=>lock?go():null);else await go();
  if(rep.ran){
   cloud.problem=rep.problem;cloud.blocked=rep.blocked;cloud.note=rep.note;cloud.last=Date.now();cloud.retry=0;cloud.err='';
   cloud.pending=cloud.edits!==e0||rep.deferred>0||rep.again;
   cloud.defer=rep.deferred?Math.min(60e3,(cloud.defer||3e3)*2):0;if(cloud.defer)cloudLater(cloud.defer)}
  if(cloud.state!=='lost')cloud.state='idle';
 }catch(e){
  if(!(e instanceof CloudAbort))console.error('[cloud]',e);
  if(!e.quiet&&cloudOn()&&cloud.state!=='lost'){
   cloud.state=e.net||navigator.onLine===false?'offline':'error';
   cloud.err=e instanceof CloudAbort?e.message:'Sync hit an unexpected problem.';
   cloud.retry=Math.min(600e3,cloud.retry?cloud.retry*2:20e3);cloudLater(cloud.retry)}
 }finally{cloud.busy=false;cloud.prog=null}
 cloudPaint();
 if(!rep.ran&&cloud.pending&&cloudOn()&&cloud.state==='idle')cloudLater(15e3);
 const redo=cloud.again||rep.again;cloud.again=false;
 if(redo&&cloud.state==='idle')cloudChain++<4?setTimeout(()=>cloudSync('again'),rep.again?1200:300):cloudLater(30e3);
 else cloudChain=0;
 return rep}

/** panel.js calls this right after it removes a project, so the delete reaches the cloud and not only this device. */
function cloudDeleted(id){
 const e=cloudMetaLoad().projects[id];
 if(!cloudOn()&&!e)return;
 delete cloud.bad[id];
 cloudMeta(x=>{delete x.projects[id];x.tombstones[id]={rev:e?e.rev:-1}});
 if(cloudOn()){cloud.edits++;cloud.pending=true;cloudPaint();cloudDebounce(1500)}}
