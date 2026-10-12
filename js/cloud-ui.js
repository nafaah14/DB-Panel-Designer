'use strict';
/* =========================================================
   Cloud account screens — welcome, sign in / create account, the account
   card (shared by the Account menu row and Settings), sign out, password
   and account deletion. Version history is in cloud-hist.js.
   ========================================================= */
const cloudSleep=ms=>new Promise(r=>setTimeout(r,ms));
const cloudUnsynced=()=>{const P=loadProjects(),m=cloudMetaLoad().projects;return Object.keys(P).filter(id=>m[id]?cloudSigOf(P[id],id)!==m[id].h:!cloudIsSeed(id,P[id])).length};
const cloudMenuHint=()=>cloudOn()?cloud.user:cloud.state==='lost'?'signed out':!cloud.checked?'':cloud.avail?'guest':'unavailable';
const CLOUD_WHY={protocol:'Cloud accounts work when the app is opened from its web address (https), not from a saved file.',
 crypto:'This page is not on a secure (https) connection, so cloud accounts are switched off.',
 offline:'You are offline, so the cloud is out of reach right now.',noserver:'This copy of the app has no cloud behind it.'};
const cloudS=(n,one,many)=>n+' '+(n===1?one:many);

/** How the cloud is doing, as [text, css class]. */
function cloudStatus(){
 const c=cloud;
 if(c.state==='lost')return ['Signed out — sign in again to resume syncing.','bad'];
 if(c.state==='syncing')return ['Syncing…'+(c.prog&&c.prog.total>1?` (${c.prog.done} of ${c.prog.total})`:''),''];
 if(c.state==='offline')return ['Offline — your changes sync when you are back online.','up'];
 if(c.state==='error')return ['Sync problem: '+(c.err||'will retry shortly'),'bad'];
 if(c.problem)return [cloudS(c.problem,'project','projects')+' can’t sync'+(c.note?' — '+c.note:''),'bad'];
 if(c.blocked)return [cloudS(c.blocked,'project was','projects were')+' saved by a newer version of the app. Update to open '+(c.blocked===1?'it':'them')+'.','up'];
 if(c.pending)return ['Waiting to sync…','up'];
 return ['All changes are saved to the cloud.','ok']}

function cloudAcctHTML(){
 if(cloudOn()){
  const [txt,cls]=cloudStatus(),n=Object.keys(cloudMetaLoad().projects).length;
  return `<div class="scard"><div class="srow"><b>${esc(cloud.user)}</b><span class="cb ${cls==='ok'?'ok':cls==='bad'?'bad':'pend'}">${cls==='ok'?'synced':cls==='bad'?'problem':'syncing'}</span></div>
   <p class="sstat ${cls}">${esc(txt)}</p>
   <p class="muted">${cloudS(n,'project','projects')} in the cloud${cloud.last?' · last synced '+fmtAgo(cloud.last):''}</p>
   <div class="pbtns"><button type="button" class="bb pri" data-ca="sync" ${cloud.busy?'disabled':''}>Sync now</button><button type="button" class="bb" data-ca="out">Sign out</button></div>
   <details><summary>More</summary><div class="pbtns"><button type="button" class="bb" data-ca="del">Recently deleted</button><button type="button" class="bb" data-ca="pw">Change password</button><button type="button" class="bb danger" data-ca="kill">Delete account</button></div></details></div>`}
 if(cloud.state==='lost')return `<div class="scard warn"><div class="srow"><b>${esc(cloudMetaLoad().user||'Account')}</b><span class="cb bad">signed out</span></div><p>Your sign-in expired. Projects on this device are safe — sign in again to resume syncing.</p><div class="pbtns"><button type="button" class="bb pri" data-ca="in">Sign in again</button></div></div>`;
 if(!cloud.checked)return '<p class="muted">Checking for the cloud…</p>';
 if(!cloud.avail)return `<div class="scard"><div class="srow"><b>Guest</b><span class="cb">this device only</span></div><p class="muted">${esc(CLOUD_WHY[cloud.why]||'')} Your projects are saved on this device.</p></div>`;
 return `<div class="scard"><div class="srow"><b>Guest</b><span class="cb">this device only</span></div><p class="muted">Your projects are saved on this device. Sign in to keep a copy in the cloud and open it on your other devices.</p><div class="pbtns"><button type="button" class="bb pri" data-ca="in">Sign in</button><button type="button" class="bb" data-ca="new">Create an account</button></div></div>`}

function cloudRenderAcct(el){
 const was=!!(el.querySelector('details')||{}).open;
 el.innerHTML=cloudAcctHTML();
 const d=el.querySelector('details');if(d&&was)d.open=true;
 el.onclick=e=>{const b=e.target.closest('[data-ca]');if(!b)return;
  ({sync:cloudSyncNow,out:cloudSignOutUI,del:cloudDeletedList,pw:cloudPwUI,kill:cloudKillUI,in:()=>cloudAuthUI('in'),new:()=>cloudAuthUI('new')})[b.dataset.ca]()}}
/** The sync engine calls this whenever its state changes. */
function cloudUiChanged(){
 if(modal.classList.contains('hidden'))return;
 const el=mbox.querySelector('[data-acct]');if(el&&el.isConnected)cloudRenderAcct(el);
 const tags=mbox.querySelectorAll('[data-cb]');
 if(tags.length){const P=loadProjects();
  tags.forEach(t=>{const id=t.dataset.cb;if(P[id])t.innerHTML=cloudRowBadge(id,P[id])});
  mbox.querySelectorAll('[data-cbh]').forEach(t=>{t.innerHTML=cloudRowButtons(t.dataset.cbh)})}}
function openAccount(){openModal('<h3>Account</h3><div data-acct></div><div class="mact"><button class="bb pri" data-close>Done</button></div>',box=>cloudRenderAcct(box.querySelector('[data-acct]')))}
async function cloudSyncNow(){
 if(cloud.busy)return;
 const rep=await cloudSync('manual');
 if(rep&&rep.ran&&cloud.state==='idle'&&!cloud.problem)toast(rep.pulled||rep.pushed?`Synced — ${rep.pulled} downloaded, ${rep.pushed} uploaded`:'Everything is up to date')}

/** Submit handler with a shared error line: fn(FormData) returns an error text, or nothing on success. */
function cloudForm(box,sel,fn){
 const f=box.querySelector(sel),err=box.querySelector('#cErr'),go=f.querySelector('[type=submit]'),txt=go.textContent;
 f.onsubmit=async e=>{e.preventDefault();err.hidden=true;go.disabled=true;go.textContent='Please wait…';
  let m='';try{m=await fn(new FormData(f))}catch(x){console.error('[cloud]',x);m='Something went wrong. Please try again.'}
  if(m){err.textContent=m;err.hidden=false;go.disabled=false;go.textContent=txt}}}

function cloudMaybeWelcome(){
 if(!cloud.avail||cloudOn()||cloud.state==='lost'||lsGet(LS_CL_WEL)||!modal.classList.contains('hidden'))return;
 lsSet(LS_CL_WEL,'shown');
 openModal(`<h3>Save your designs in the cloud?</h3>
  <p>Create a free account to keep your projects online and open them on your phone, tablet and computer. Or carry on as a guest — everything is still saved on this device.</p>
  <div class="mact stack"><button type="button" class="bb pri" data-w="new">Create an account</button><button type="button" class="bb" data-w="in">Sign in</button><button type="button" class="bb" data-close>Continue as guest</button></div>
  <p class="muted">You can change this any time in the menu under Account.</p>`,box=>{
  box.querySelector('.mact').onclick=e=>{const b=e.target.closest('[data-w]');if(b)cloudAuthUI(b.dataset.w)}})}

function cloudAuthUI(mode,prefill){
 const reg=mode==='new',last=cloudMetaLoad().user||'';
 openModal(`<h3>${reg?'Create an account':'Sign in'}</h3>
  <form id="cAuth" autocomplete="on" novalidate>
   <label>Username<input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" value="${esc(prefill||last)}"></label>
   <label>Password<input name="password" type="password" autocomplete="${reg?'new-password':'current-password'}"></label>
   ${reg?'<label>Repeat password<input name="password2" type="password" autocomplete="new-password"></label>':''}
   ${reg&&cloud.invite?'<label>Invite code<input name="invite" autocomplete="off" autocapitalize="none" spellcheck="false"></label>':''}
   <label class="row"><input type="checkbox" id="cShow">Show password</label>
   <p class="cerr" id="cErr" hidden></p>
   ${reg?'<p class="muted">Use at least 8 characters. There is no “forgot password” — your password is never kept anywhere we can read it. Every device keeps its own copy of your projects, so a lost password never costs you your designs.</p>':''}
   <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button type="submit" class="bb pri">${reg?'Create account':'Sign in'}</button></div>
  </form>
  <p class="muted" style="text-align:center;margin-top:12px">${reg?'Already have an account?':'New here?'} <button type="button" class="lnk" id="cSw">${reg?'Sign in':'Create an account'}</button></p>`,box=>{
  const f=box.querySelector('#cAuth');
  box.querySelector('#cShow').onchange=e=>f.querySelectorAll('[name^=password]').forEach(i=>{i.type=e.target.checked?'text':'password'});
  box.querySelector('#cSw').onclick=()=>cloudAuthUI(reg?'in':'new',f.username.value);
  cloudForm(box,'#cAuth',async fd=>{
   const pw=fd.get('password');
   if(reg&&pw!==fd.get('password2'))return 'The two passwords do not match.';
   const res=await cloudAuth(reg?'register':'login',fd.get('username'),pw,fd.get('invite'));
   if(res.error)return res.error;
   cloudSignedIn(res)});
  setTimeout(()=>{try{(f.username.value?f.password:f.username).focus()}catch(e){}},50)})}

/** Projects already on this device from a different account are only added to the new one on request. */
function cloudSignedIn(res){
 const m=cloudMetaLoad(),n=Object.keys(loadProjects()).length;
 if(!(m.user&&m.user!==res.user&&n))return cloudFinishSignIn(res,m);
 const one=n===1;
 openModal(`<h3>Add this device’s projects?</h3><p>${one?'The project':'The '+n+' projects'} on this device ${one?'was':'were'} saved while signed in as <b>${esc(m.user)}</b>. Add ${one?'it':'them'} to <b>${esc(res.user)}</b>’s account too?</p>
  <div class="mact stack"><button type="button" class="bb pri" data-y>Add ${one?'it':'them'} to ${esc(res.user)}</button><button type="button" class="bb" data-n>Cancel sign-in</button></div>`,box=>{
  box.querySelector('[data-y]').onclick=()=>cloudFinishSignIn(res,m);
  box.querySelector('[data-n]').onclick=()=>{cloudApi('POST','/logout',undefined,{token:res.token,timeout:4000});closeModal()}})}
async function cloudFinishSignIn(res,m){
 for(let i=0;i<30&&cloud.busy;i++)await cloudSleep(100);
 if(m.user!==res.user)cloudMeta(x=>{x.user=res.user;x.projects={};x.tombstones={}});
 Object.assign(cloud,{user:res.user,token:res.token,state:'idle',err:'',note:'',pending:true,problem:0,blocked:0,bad:{},retry:0,last:0});
 cloudSaveSession();lsSet(LS_CL_WEL,'user');
 openAccount();toast('Signed in as '+res.user);
 const rep=await cloudSync('login');
 if(rep&&rep.ran&&(rep.pulled||rep.pushed))toast(`Synced — ${rep.pulled} downloaded, ${rep.pushed} uploaded`)}

function cloudSignOutUI(){
 const n=cloudUnsynced();
 openModal(`<h3>Sign out</h3><p>Your projects stay safe in the cloud. What should happen to the copies on this device?</p>
  ${n?`<p class="cct-warn">${cloudS(n,'project hasn’t','projects haven’t')} reached the cloud yet.</p>`:''}
  <div class="mact stack"><button type="button" class="bb pri" id="oKeep">Sign out, keep them here</button><button type="button" class="bb danger" id="oClear">Sign out and clear this device</button><button type="button" class="bb" data-close>Cancel</button></div>
  <p class="muted">“Clear this device” is for a shared or borrowed computer. Sign in again any time to download your projects.</p>`,box=>{
  box.querySelector('#oKeep').onclick=async()=>{await cloudSignOut(false);openAccount();toast('Signed out')};
  const clr=box.querySelector('#oClear');let armed=false;
  clr.onclick=async()=>{
   if(!armed){clr.disabled=true;clr.textContent='Syncing first…';await cloudSync('signout');clr.disabled=false;
    const left=cloudUnsynced();
    if(left){armed=true;clr.textContent=`Clear anyway (${left} not in the cloud)`;return}}
   await cloudSignOut(true)}})}

function cloudPwUI(){
 openModal(`<h3>Change password</h3><form id="cPw" novalidate>
  <label>Current password<input name="old" type="password" autocomplete="current-password"></label>
  <label>New password<input name="n1" type="password" autocomplete="new-password"></label>
  <label>Repeat new password<input name="n2" type="password" autocomplete="new-password"></label>
  <p class="cerr" id="cErr" hidden></p><p class="muted">Your other devices will be signed out and need the new password.</p>
  <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button type="submit" class="bb pri">Change password</button></div></form>`,box=>{
  cloudForm(box,'#cPw',async fd=>{
   if(fd.get('n1')!==fd.get('n2'))return 'The two new passwords do not match.';
   const r=await cloudChangePw(fd.get('old'),fd.get('n1'));
   if(r.error)return r.error;
   openAccount();toast('Password changed')})})}

function cloudKillUI(){
 openModal(`<h3>Delete account</h3><p>This permanently deletes <b>${esc(cloud.user)}</b> and every project stored in the cloud. Projects on this device are kept. It cannot be undone.</p>
  <form id="cKill" novalidate><label>Enter your password to confirm<input name="pw" type="password" autocomplete="current-password"></label>
  <p class="cerr" id="cErr" hidden></p>
  <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button type="submit" class="bb danger">Delete account</button></div></form>`,box=>{
  cloudForm(box,'#cKill',async fd=>{
   const r=await cloudDeleteAccount(fd.get('pw'));
   if(r.error)return r.error;
   openAccount();toast('Account deleted')})})}
