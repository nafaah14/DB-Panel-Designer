'use strict';
/* =========================================================
   Room designer v1  (part of DB Panel Designer)
   ---------------------------------------------------------
   • Each wall (A–D) and the ceiling is edited as a flat 2D view (SVG, units = mm).
   • The 3D view is generated from the same data with Three.js r149 (vendor/three.min.js).
   • Shares globals with js/panel.js: S, settings, pushUndo, save, updUI, toast, openModal,
     closeModal, esc, txt, uid, clamp, dist, $, shareOrDownload, fname, setSheet, appMode.

   Coordinates (mm). Origin = floor corner where Wall D meets Wall A.
     x → along Wall A (room width W)   z → along Wall B (room length L)   y ↑ up (height H)
   Seen from inside the room, every wall runs left → right:
     A: (0,0,0)→(W,0,0)   B: (W,0,0)→(W,0,L)   C: (W,0,L)→(0,0,L)   D: (0,0,L)→(0,0,0)
   Room item  {id,type,surf,x,y,props}
     surf 'A'..'D' → x = centre from the wall's left end, y = centre height above floor
     surf 'ceil'   → x = from Wall D, y = from Wall A   (plan view, looking down)
   ========================================================= */

const RS=0.25;                                   // screen px per mm at zoom 1
const WALL_KEYS=['A','B','C','D'];
const SNAP_H=[300,450,1100,1200,1800,2100,2300]; // common mounting heights (centre, mm)
const HEIGHT_GUIDES=[[300,'Sockets'],[1200,'Switches'],[2100,'AC point']];
let surf='3d', rsel=null, rview={x:0,y:0,k:1}, lastWall='A', allDims=false;
const RM=()=>S.room;

/* ---------- room model ---------- */
function defaultRoom(){return {name:'Room 1',w:3600,l:3000,h:2700,t:150,walls:{A:'North',B:'East',C:'South',D:'West'},items:[],circuits:[]}}
function normRoom(r){const d=defaultRoom();const o=Object.assign(d,r||{});o.walls=Object.assign(defaultRoom().walls,(r&&r.walls)||{});
 ['w','l','h','t'].forEach(k=>o[k]=Math.max(k==='t'?50:1000,+o[k]||d[k]));
 o.items=(Array.isArray(o.items)?o.items:[]).filter(i=>i&&RDEFS[i.type]).map(i=>{const def=RDEFS[i.type];
  const sf=def.surf==='ceil'?'ceil':(WALL_KEYS.includes(i.surf)?i.surf:'A');
  return {id:String(i.id||uid()),type:i.type,surf:sf,x:+i.x||0,y:+i.y||0,props:Object.assign({},def.defaults,i.props||{})}});
 o.circuits=(Array.isArray(o.circuits)?o.circuits:[]).filter(c=>c&&c.name)
  .map(c=>({id:String(c.id||uid()),name:String(c.name).trim()||'Circuit',mcb:String(c.mcb||'').trim(),cable:+c.cable||1.5,breaker:String(c.breaker||'')}));
 /* props.circuit held free text before v2.1 (and still does in any older
    project or exported JSON). Anything that isn't a known circuit id is
    read as a circuit NAME: matched to an existing circuit, or promoted
    into a new one. That upgrades old projects into the circuits list
    instead of silently dropping what they had. */
 const ids=new Set(o.circuits.map(c=>c.id));
 for(const i of o.items){const v=i.props.circuit;if(!v||ids.has(v))continue;
  const nm=String(v).trim();if(!nm){i.props.circuit='';continue}
  let c=o.circuits.find(x=>x.name.toLowerCase()===nm.toLowerCase());
  if(!c){c={id:uid(),name:nm,mcb:guessMcb(nm),cable:guessCable(nm)};o.circuits.push(c);ids.add(c.id)}
  i.props.circuit=c.id}
 /* Switch links: fresh arrays sized to the current gang count, with any
    id whose load has since been deleted dropped. */
 const live=new Set(o.items.map(i=>i.id));
 for(const i of o.items){const def=RDEFS[i.type];if(!def.ways)continue;
  i.props.controls=normControls(i.props.controls,Math.max(1,def.ways(i.props))).map(row=>row.filter(id=>live.has(id)))}
 return o}
const wallLen=k=>(k==='A'||k==='C')?RM().w:RM().l;
const surfLen=k=>k==='ceil'?RM().w:wallLen(k);
const surfH=k=>k==='ceil'?RM().l:RM().h;
const leftOf=k=>WALL_KEYS[(WALL_KEYS.indexOf(k)+3)%4], rightOf=k=>WALL_KEYS[(WALL_KEYS.indexOf(k)+1)%4];
const surfName=k=>k==='ceil'?'Ceiling':`Wall ${k}${RM().walls[k]?' ('+RM().walls[k]+')':''}`;
function wallGeo(k){const W=RM().w,L=RM().l;return {A:{o:[0,0,0],d:[1,0,0],n:[0,0,1]},B:{o:[W,0,0],d:[0,0,1],n:[-1,0,0]},C:{o:[W,0,L],d:[-1,0,0],n:[0,0,-1]},D:{o:[0,0,L],d:[0,0,-1],n:[1,0,0]}}[k]}
const rfind=id=>RM().items.find(i=>i.id===id);
const rdef=it=>RDEFS[it.type];
const iw=it=>{const d=rdef(it);return typeof d.w==='function'?d.w(it.props):d.w};
const ih=it=>{const d=rdef(it);return typeof d.h==='function'?d.h(it.props):d.h};
const rname=it=>{const d=rdef(it);return typeof d.name==='function'?d.name(it.props):d.name};

/* ---------- circuits ----------
   A circuit is {id,name,mcb,cable}. Points reference one by id in
   props.circuit; '' means unassigned. Wiring (routing, cable lengths)
   is grouped by circuit, so this list is the spine of room wiring. */
const CABLE_SIZES=[1,1.5,2.5,4,6,10];
const circuits=()=>RM().circuits||[];
const circuitById=id=>circuits().find(c=>c.id===id)||null;
const circuitLabel=c=>{if(!c)return '—';const m=circuitMcb(c);
 return `${c.name}${m?' · '+m:''}${c.cable?' · '+c.cable+' mm²':''}`};
const circuitItems=id=>RM().items.filter(i=>i.props.circuit===id);
/* Sensible starting values when an old free-text name is promoted to a
   real circuit — a lighting circuit on 2.5 mm² would just be wrong. */
function guessCable(nm){const s=nm.toUpperCase();
 if(/\bA\/?C\b|AIRCON|HEATER|W\/?H|WATER/.test(s))return 4;
 if(/LIGHT|LAMP|FAN|LTG/.test(s))return 1.5;
 if(/SKT|SOCKET|POWER|PLUG/.test(s))return 2.5;
 return 1.5}
function guessMcb(nm){const c=guessCable(nm);return c>=4?'C20':c>=2.5?'B20':'B10'}

/* ---------- circuit → panel breaker (v3) ----------
   A circuit can point at a real device on the panel by id, so the room
   and the board stay in step. Lookups are tolerant: a breaker deleted
   from the panel just reads as unlinked, and migrate() clears the id on
   next load. */
const BREAKER_TYPES=new Set(['mcb','mcb1pn','rcbo','rcd']);
const panelBreakers=()=>(typeof S==='object'&&S&&Array.isArray(S.items)?S.items:[]).filter(i=>BREAKER_TYPES.has(i.type));
const breakerById=id=>id?panelBreakers().find(i=>i.id===id)||null:null;
function breakerText(it){const p=it.props||{};
 return it.type==='rcd'?`RCD ${p.rating}A ${p.ma}mA`:`${p.curve||''}${p.rating}`}
function breakerLabel(it){const d=DEFS[it.type],desc=d&&d.desc?d.desc(it.props):it.type;
 return (it.props&&it.props.label?it.props.label+' — ':'')+desc}
/** What a circuit's MCB reads as: the linked device if there is one,
 *  otherwise whatever was typed. */
const circuitMcb=c=>{const b=breakerById(c.breaker);return b?breakerText(b):(c.mcb||'')};
/* Indicative only. A rough ceiling per cable size for a quick "that
   looks wrong" flag — it is NOT a sizing calculation and ignores
   install method, grouping, ambient temperature and volt drop, so the
   UI says so wherever it fires. */
const CABLE_MAX_A={1:10,1.5:16,2.5:20,4:25,6:32,10:45};
function cableWarn(c){const b=breakerById(c.breaker);if(!b)return '';
 const a=+(b.props&&b.props.rating),max=CABLE_MAX_A[+c.cable];
 return a&&max&&a>max?`${c.cable} mm² on a ${a} A breaker looks undersized — check against the install method.`:''}

/* ---------- switch → load links ----------
   A switch stores props.controls: one array of item ids per gang/way.
   Kept out of RDEFS defaults on purpose — Object.assign copies an array
   by reference, so a shared default [] would have every switch in the
   room writing into the same one. normControls() always builds fresh
   arrays instead, and is applied wherever a switch is created or edited. */
const SWITCHABLE=new Set(['dl','ledp','fan','pend','wl','exh']);
const isLoad=it=>SWITCHABLE.has(it.type);
const waysOf=it=>{const d=rdef(it);return d.ways?Math.max(1,d.ways(it.props)):0};
const loadsIn=()=>RM().items.filter(isLoad);
/* Position is part of the name on purpose: a room with four identical
   "LED light · Ceiling" entries is unpickable without it. */
const loadName=it=>{const m=v=>(v/1000).toFixed(1);
 return `${it.props.label||rname(it)} · ${it.surf==='ceil'?`Ceiling ${m(it.x)}×${m(it.y)} m`:`Wall ${it.surf} ${m(it.x)} m`}`};
function normControls(v,n){const out=[];for(let i=0;i<n;i++)out.push((Array.isArray(v&&v[i])?v[i]:[]).filter(x=>typeof x==='string'));return out}
/** Every switch way that drives this load, as {sw, way}. */
function switchesFor(id){const out=[];for(const s of RM().items){const n=waysOf(s);if(!n)continue;
 const c=normControls(s.props.controls,n);c.forEach((row,i)=>{if(row.includes(id))out.push({sw:s,way:i})})}return out}

/* =========================================================
   Conduit routing (room wiring v2)
   ---------------------------------------------------------
   Cables are built as polylines of 3D room points (mm), then projected
   back onto whichever surface is being drawn. 3D rather than per-surface
   2D because a run from a ceiling downlight to a wall DB crosses
   surfaces, which a single-plane router can't express — so panel.js's
   grid A* doesn't port over here.

   No grid search either: conduit follows a handful of natural lines, so
   the path is constructed rather than searched — a drop to the run
   height, along the walls at that height (the shorter way round), and a
   drop to the board. That is both what gets installed and far cheaper
   than A* over a 3D surface graph.
   ========================================================= */
const RUN_DROP=150;                                   // run sits this far below the ceiling
const runH=()=>Math.max(100,RM().h-RUN_DROP);
const wallOff=k=>({A:0,B:RM().w,C:RM().w+RM().l,D:2*RM().w+RM().l})[k];
const perim=()=>2*(RM().w+RM().l);
/** Surface point on wall k -> 3D room point. */
function wallPt(k,x,y){const W=wallGeo(k);return [W.o[0]+W.d[0]*x,y,W.o[2]+W.d[2]*x]}
const ceilPt=(x,z)=>[x,RM().h,z];
/** Perimeter distance -> 3D point at height hh. */
function sToPt(s,hh){const P=perim(),sm=((s%P)+P)%P;
 for(const k of WALL_KEYS){const o=wallOff(k),len=wallLen(k);if(sm>=o-1e-6&&sm<=o+len+1e-6)return wallPt(k,clamp(sm-o,0,len),hh)}
 return wallPt('A',0,hh)}
/** Along the walls at height hh, from one wall position to another,
 *  going whichever way round is shorter and turning at each corner. */
function perimPath(k1,x1,k2,x2,hh){
 const P=perim(),s1=wallOff(k1)+x1,s2=wallOff(k2)+x2;
 const fwd=((s2-s1)%P+P)%P,back=P-fwd,dir=fwd<=back?1:-1,span=Math.min(fwd,back);
 const hits=[];
 for(const k of WALL_KEYS){const c=wallOff(k)+wallLen(k);
  const d=dir>0?((c-s1)%P+P)%P:((s1-c)%P+P)%P;
  if(d>1e-6&&d<span-1e-6)hits.push({d,s:c})}
 hits.sort((a,b)=>a.d-b.d);
 return [sToPt(s1,hh),...hits.map(h=>sToPt(h.s,hh)),sToPt(s2,hh)]}
const seg3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/** One point's run back to the board, as 3D points. */
function routeTo(it,db){
 const Rm=RM(),hh=runH(),out=[];
 const push=p=>{const l=out[out.length-1];if(!l||seg3(l,p)>1)out.push(p)};
 const dbTop=clamp(db.y+ih(db)/2,0,Rm.h);
 if(it.surf==='ceil'){
  const T=wallPt(db.surf,db.x,Rm.h);                 // ceiling edge above the board
  push(ceilPt(it.x,it.y));push(ceilPt(T[0],it.y));push(ceilPt(T[0],T[2]));
 }else{
  push(wallPt(it.surf,it.x,it.y));                   // the point itself
  push(wallPt(it.surf,it.x,hh));                     // up (or down) to the run
  perimPath(it.surf,it.x,db.surf,db.x,hh).forEach(push);
 }
 push(wallPt(db.surf,db.x,dbTop));                   // down into the board
 return out}
const routeLen=P=>{let L=0;for(let i=1;i<P.length;i++)L+=seg3(P[i-1],P[i]);return L};
/** Every cable in the room: one run per assigned point back to the DB.
 *  Radial (each point measured to the board) rather than looped-in —
 *  stated in the BOM, since it reads longer than a real loop-in install. */
function roomRuns(){const Rm=RM();if(!Rm)return [];
 const db=Rm.items.find(i=>i.type==='db'&&i.surf!=='ceil');if(!db)return [];
 const out=[];
 for(const c of circuits()){for(const it of circuitItems(c.id)){if(it.id===db.id)continue;
  const pts=routeTo(it,db);if(pts.length<2)continue;
  out.push({circuit:c,item:it,pts,len:routeLen(pts)})}}
 return out}
/* --- projecting a 3D run back onto the surface being drawn --- */
function onWall(k,P){const W=wallGeo(k);const dx=P[0]-W.o[0],dz=P[2]-W.o[2];
 const perp=dx*W.n[0]+dz*W.n[2],sx=dx*W.d[0]+dz*W.d[2];
 return Math.abs(perp)<2&&sx>=-2&&sx<=wallLen(k)+2?{x:sx,y:P[1]}:null}
const onCeil=P=>Math.abs(P[1]-RM().h)<2?{x:P[0],y:P[2]}:null;
/** Lift a run point just off its surface, into the room — drawn exactly
 *  on the plane it z-fights with the wall or ceiling it follows. */
function nudge(P){const Rm=RM();
 if(Math.abs(P[1]-Rm.h)<2)return [P[0],P[1]-8,P[2]];
 for(const k of WALL_KEYS){if(onWall(k,P)){const n=wallGeo(k).n;return [P[0]+n[0]*8,P[1],P[2]+n[2]*8]}}
 return P}
/** The parts of a run that lie on surface k, as surface-space polylines. */
function runOnSurf(pts,k){const f=k==='ceil'?onCeil:P=>onWall(k,P);const segs=[];let cur=[];
 for(const P of pts){const q=f(P);if(q)cur.push(q);else{if(cur.length>1)segs.push(cur);cur=[]}}
 if(cur.length>1)segs.push(cur);return segs}

/* ---------- symbols (SVG in mm, origin = item top-left, size w×h) ---------- */
const plate=(w,h,fill='#fbfbf8')=>`<rect x="1.5" y="1.5" width="${w-3}" height="${h-3}" rx="6" fill="${fill}" stroke="#8d969c" stroke-width="2.5"/>`;
const rocker=(cx,cy,rw,rh)=>`<rect x="${cx-rw/2}" y="${cy-rh/2}" width="${rw}" height="${rh}" rx="3" fill="#f3f3ef" stroke="#9aa1a6" stroke-width="1.6"/><rect x="${cx-rw/2+3}" y="${cy-rh/2+3}" width="${rw-6}" height="${rh/2-3}" rx="2" fill="#dfe1dd"/>`;
const bsSock=(cx,cy)=>`<rect x="${cx-3.5}" y="${cy-17}" width="7" height="13" rx="1" fill="#2b2f33"/><rect x="${cx-17}" y="${cy+4}" width="11" height="6.5" rx="1" fill="#2b2f33"/><rect x="${cx+6}" y="${cy+4}" width="11" height="6.5" rx="1" fill="#2b2f33"/>`;
const rpSock=(cx,cy,big)=>{const r=big?5.5:3.8,e=big?7.5:5.2;return `<circle cx="${cx}" cy="${cy-13}" r="${e}" fill="#2b2f33"/><circle cx="${cx-12}" cy="${cy+8}" r="${r}" fill="#2b2f33"/><circle cx="${cx+12}" cy="${cy+8}" r="${r}" fill="#2b2f33"/>`};
const neon=(x,y,c='#ff3b30')=>`<rect x="${x-4}" y="${y-2.5}" width="8" height="5" rx="1.5" fill="${c}"/>`;
const mt=(x,y,s,fs,fill='#2b2f33',w=700)=>txt(x,y,s,fs,fill,w);
function rockers(w,h,n){const rw=Math.min(30,(w-16)/n-6),out=[];for(let i=0;i<n;i++)out.push(rocker(w*(i+.5)/n,h/2,rw,52));return out.join('')}

/* ---------- item library ---------- */
const RP_LBL={k:'label',label:'Label (shown in 3D)',type:'text'};
const RP_CCT={k:'circuit',label:'Circuit',type:'circuit'};
const RW=o=>Object.assign({surf:'wall',depth:12,model:'box',props:[RP_LBL,RP_CCT],defaults:{label:'',circuit:''}},o);
const RC=o=>Object.assign({surf:'ceil',depth:30,model:'box',props:[RP_LBL,RP_CCT],defaults:{label:'',circuit:''}},o);
const withP=(extra,defs)=>({props:[...extra,RP_LBL,RP_CCT],defaults:Object.assign({label:'',circuit:''},defs)});
const RDEFS={
 sw:RW({name:p=>`Switch ${p.gang}-gang`,w:p=>p.gang>2?146:86,h:86,mount:1200,ways:p=>+p.gang,...withP([{k:'gang',label:'Gangs',type:'select',opts:[1,2,3,4]}],{gang:1}),
  draw:(p,w,h)=>plate(w,h)+rockers(w,h,p.gang),desc:p=>`Switch ${p.gang}-gang 1-way plate`}),
 swb:RW({name:p=>`Switch board ${p.mods}M`,ways:p=>+p.mods,w:p=>p.mods<=4?146:p.mods<=8?266:266,h:p=>p.mods<=8?86:146,mount:1200,...withP([{k:'mods',label:'Modules',type:'select',opts:[2,4,6,8,12]}],{mods:6}),
  draw:(p,w,h)=>{const rows=p.mods>8?2:1,per=Math.ceil(p.mods/rows),cw=(w-24)/per,ch=(h-16)/rows-6;let s=plate(w,h);
   for(let r=0;r<rows;r++)for(let i=0;i<per&&r*per+i<p.mods;i++){const x=12+i*cw,y=8+r*(ch+6)+3;s+=`<rect x="${x+1.5}" y="${y}" width="${cw-3}" height="${ch}" rx="2" fill="#f0f0ec" stroke="#a7adb2" stroke-width="1.2"/><rect x="${x+cw/2-5}" y="${y+ch*.2}" width="10" height="${ch*.45}" rx="2" fill="#d8dad6" stroke="#9aa1a6" stroke-width="1"/>`}
   return s},desc:p=>`Modular switch board ${p.mods}-module`}),
 fanreg:RW({name:'Fan regulator',w:86,h:86,mount:1200,ways:()=>1,draw:(p,w,h)=>plate(w,h)+`<circle cx="${w/2}" cy="${h/2}" r="22" fill="#e9eae6" stroke="#8d969c" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="15" fill="#d5d8d4"/><rect x="${w/2-2}" y="${h/2-21}" width="4" height="12" fill="#5b6166"/>`+mt(w/2,h-8,'FAN',8,'#6b7075'),desc:()=>'Fan regulator plate'}),
 sk13:RW({name:p=>(p.twin==='yes'?'Twin socket':'Socket')+' 13A',w:p=>p.twin==='yes'?146:86,h:86,mount:300,...withP([{k:'twin',label:'Twin',type:'select',opts:['no','yes']},{k:'sw',label:'Switched',type:'select',opts:['yes','no']}],{twin:'no',sw:'yes'}),
  draw:(p,w,h)=>{const n=p.twin==='yes'?2:1;let s=plate(w,h);for(let i=0;i<n;i++){const cx=w*(i+.5)/n-(p.sw==='yes'?8:0);s+=bsSock(cx,h/2+4);if(p.sw==='yes')s+=rocker(cx+30,h/2-14,12,22)}return s},
  desc:p=>`${p.twin==='yes'?'Twin':'Single'} socket 13A BS1363${p.sw==='yes'?' switched':''}`}),
 skr:RW({name:p=>`Socket ${p.amp}A round pin`,w:86,h:86,mount:300,...withP([{k:'amp',label:'Rating',type:'select',opts:[5,15]}],{amp:5}),
  draw:(p,w,h)=>plate(w,h)+rpSock(w/2-10,h/2+4,p.amp==15)+rocker(w-20,h/2-12,12,22)+mt(w/2-10,h-9,p.amp+'A',8,'#6b7075'),desc:p=>`Socket ${p.amp}A round pin (BS546) switched`}),
 ac:RW({name:'AC isolator 20A',w:86,h:86,mount:2100,draw:(p,w,h)=>plate(w,h)+rocker(w/2,h/2,34,52)+neon(w/2,15)+mt(w/2,h-7,'AC',8,'#6b7075'),desc:()=>'AC isolator 20A DP with neon'}),
 tv:RW({name:p=>p.kind+' point',w:86,h:86,mount:300,...withP([{k:'kind',label:'Type',type:'select',opts:['TV','Data','TV+Data']}],{kind:'TV'}),
  draw:(p,w,h)=>{let s=plate(w,h);if(p.kind!=='Data')s+=`<circle cx="${p.kind==='TV'?w/2:w/2-17}" cy="${h/2}" r="9" fill="#e4e5e2" stroke="#5b6166" stroke-width="2"/><circle cx="${p.kind==='TV'?w/2:w/2-17}" cy="${h/2}" r="2.5" fill="#2b2f33"/>`;
   if(p.kind!=='TV')s+=`<rect x="${p.kind==='Data'?w/2-9:w/2+8}" y="${h/2-8}" width="18" height="16" rx="2" fill="#2b2f33"/>`;return s+mt(w/2,h-8,p.kind,8,'#6b7075')},desc:p=>`${p.kind} outlet plate`}),
 wl:RW({name:'Wall light',w:120,h:220,depth:170,model:'walllight',mount:1800,draw:(p,w,h)=>`<rect x="${w/2-22}" y="${h-70}" width="44" height="64" rx="8" fill="#c9a24a" stroke="#8a6d2a" stroke-width="2"/><path d="M${w/2-16},${h-60} Q${w/2},${h-110} ${w/2},${h-150}" fill="none" stroke="#8a6d2a" stroke-width="6"/><path d="M${w*0.12},${h*0.42} L${w*0.88},${h*0.42} L${w*0.75},4 L${w*0.25},4 Z" fill="#fff4cf" stroke="#c9b37a" stroke-width="2"/>`,desc:()=>'Wall light bracket'}),
 db:RW({name:p=>`DB ${p.ways}-way`,w:p=>({4:200,8:260,12:330,18:440,24:540}[p.ways]||260),h:p=>p.ways>18?400:320,depth:110,mount:1700,...withP([{k:'ways',label:'Ways',type:'select',opts:[4,8,12,18,24]}],{ways:8,label:'DB-1'}),
  draw:(p,w,h)=>`<rect x="1.5" y="1.5" width="${w-3}" height="${h-3}" rx="8" fill="#eceef0" stroke="#7d868c" stroke-width="3"/><rect x="14" y="14" width="${w-28}" height="${h-28}" rx="5" fill="#f7f8f9" stroke="#a9b0b5" stroke-width="2"/><rect x="34" y="${h*0.3}" width="${w-68}" height="${h*0.22}" rx="3" fill="#cfe3f3" stroke="#8aa9c2" stroke-width="1.5"/>`+mt(w/2,h*0.75,'DB',Math.min(40,w/5),'#59626a')+`<rect x="${w-30}" y="${h/2-14}" width="8" height="28" rx="3" fill="#7d868c"/>`,desc:p=>`Distribution board ${p.ways}-way`}),
 jbw:RW({name:'Junction box',w:75,h:75,depth:40,mount:2500,draw:(p,w,h)=>plate(w,h,'#efefea')+`<circle cx="12" cy="12" r="3" fill="#9aa1a6"/><circle cx="${w-12}" cy="${h-12}" r="3" fill="#9aa1a6"/>`+mt(w/2,h/2+5,'JB',14,'#7d858a'),desc:()=>'Junction box (wall)'}),
 exh:RW({name:'Exhaust fan',w:250,h:250,depth:80,mount:2300,draw:(p,w,h)=>{let s=plate(w,h,'#f1f1ec');for(let i=0;i<7;i++){const y=30+i*(h-60)/6;s+=`<rect x="28" y="${y-5}" width="${w-56}" height="10" rx="4" fill="#d4d7d3"/>`}return s},desc:()=>'Exhaust fan'}),
 door:RW({name:'Door',opening:true,model:'door',depth:40,w:p=>+p.width,h:p=>+p.height,mount:1050,...withP([{k:'width',label:'Width (mm)',type:'select',opts:[700,800,900,1000,1200]},{k:'height',label:'Height (mm)',type:'select',opts:[2000,2100,2200,2400]},{k:'hinge',label:'Hinge side',type:'select',opts:['left','right']}],{width:900,height:2100,hinge:'left'}),
  draw:(p,w,h)=>{const hx=p.hinge==='left'?w-90:90;return `<rect x="0" y="0" width="${w}" height="${h}" fill="#e7dccb" stroke="#8b7355" stroke-width="6"/><rect x="40" y="40" width="${w-80}" height="${h*0.42}" rx="4" fill="none" stroke="#b8a283" stroke-width="5"/><rect x="40" y="${h*0.5}" width="${w-80}" height="${h*0.45}" rx="4" fill="none" stroke="#b8a283" stroke-width="5"/><rect x="${hx-12}" y="${h*0.47}" width="24" height="70" rx="10" fill="#8a8f94"/>`},desc:p=>`Door ${p.width}×${p.height}`}),
 win:RW({name:'Window',opening:true,model:'window',depth:40,w:p=>+p.width,h:p=>+p.height,mount:1500,...withP([{k:'width',label:'Width (mm)',type:'select',opts:[600,900,1200,1500,1800,2400]},{k:'height',label:'Height (mm)',type:'select',opts:[600,900,1200,1500]}],{width:1200,height:1200}),
  draw:(p,w,h)=>`<rect x="0" y="0" width="${w}" height="${h}" fill="#d7ecfa" stroke="#7e8a94" stroke-width="10"/><line x1="${w/2}" y1="0" x2="${w/2}" y2="${h}" stroke="#7e8a94" stroke-width="10"/><path d="M${w*0.1},${h*0.35} L${w*0.3},${h*0.15} M${w*0.6},${h*0.35} L${w*0.8},${h*0.15}" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity=".8"/>`,desc:p=>`Window ${p.width}×${p.height}`}),
 // ceiling
 dl:RC({name:p=>`Downlight Ø${p.dia}`,round:true,model:'downlight',depth:25,w:p=>+p.dia,h:p=>+p.dia,...withP([{k:'dia',label:'Diameter (mm)',type:'select',opts:[90,120,150,200]}],{dia:150}),
  draw:(p,w,h)=>`<circle cx="${w/2}" cy="${h/2}" r="${w/2-2}" fill="#e6e7e3" stroke="#8d969c" stroke-width="3"/><circle cx="${w/2}" cy="${h/2}" r="${w/2*0.72}" fill="#fff6c8" stroke="#e0c86a" stroke-width="2"/>`,desc:p=>`LED downlight Ø${p.dia}`}),
 ledp:RC({name:p=>`LED panel ${p.size}`,model:'panel',depth:15,w:p=>+p.size,h:p=>+p.size,...withP([{k:'size',label:'Size (mm)',type:'select',opts:[300,600]}],{size:600}),
  draw:(p,w,h)=>`<rect x="2" y="2" width="${w-4}" height="${h-4}" rx="6" fill="#fffbe5" stroke="#9aa1a6" stroke-width="5"/><rect x="${w*0.08}" y="${h*0.08}" width="${w*0.84}" height="${h*0.84}" rx="4" fill="#fff6c8"/>`,desc:p=>`LED panel ${p.size}×${p.size}`}),
 fan:RC({name:'Ceiling fan point',round:true,model:'fan',w:140,h:140,...withP([{k:'sweep',label:'Fan sweep (mm)',type:'select',opts:[900,1200,1400]},{k:'drop',label:'Down-rod (mm)',type:'select',opts:[150,300,450,600]}],{sweep:1200,drop:300}),
  draw:(p,w,h)=>{const c=w/2,r=p.sweep/2;let s=`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#9aa1a6" stroke-width="3" stroke-dasharray="20 14"/>`;
   for(let i=0;i<3;i++){const a=i*2*Math.PI/3-Math.PI/2;s+=`<line x1="${c}" y1="${c}" x2="${c+Math.cos(a)*(r-20)}" y2="${c+Math.sin(a)*(r-20)}" stroke="#b9bdb8" stroke-width="40" stroke-linecap="round"/>`}
   return s+`<circle cx="${c}" cy="${c}" r="${w/2-4}" fill="#f1f1ed" stroke="#7d868c" stroke-width="4"/><circle cx="${c}" cy="${c}" r="14" fill="#7d868c"/>`},desc:p=>`Ceiling fan point + hook (${p.sweep} mm fan)`}),
 pend:RC({name:'Pendant light',round:true,model:'pendant',w:220,h:220,...withP([{k:'drop',label:'Drop (mm)',type:'select',opts:[300,500,700,900]}],{drop:500}),
  draw:(p,w,h)=>`<circle cx="${w/2}" cy="${h/2}" r="${w/2-3}" fill="#fff4cf" stroke="#c9b37a" stroke-width="4"/><circle cx="${w/2}" cy="${h/2}" r="18" fill="#7d868c"/>`,desc:()=>'Pendant light point'}),
 jbc:RC({name:'Ceiling junction box',depth:45,w:85,h:85,draw:(p,w,h)=>plate(w,h,'#efefea')+mt(w/2,h/2+6,'JB',16,'#7d858a'),desc:()=>'Junction box (ceiling)'}),
 smoke:RC({name:'Smoke detector',round:true,model:'smoke',depth:45,w:110,h:110,draw:(p,w,h)=>`<circle cx="${w/2}" cy="${h/2}" r="${w/2-2}" fill="#f6f6f3" stroke="#8d969c" stroke-width="3"/><circle cx="${w/2}" cy="${h/2}" r="${w/4}" fill="none" stroke="#b5bab6" stroke-width="3"/><circle cx="${w/2+20}" cy="${h/2-20}" r="4" fill="#ff3b30"/>`,desc:()=>'Smoke detector'})
};
const ROOM_LIB=[
 {tab:'Switches',groups:[{g:'Switches & controls',items:[['sw',{gang:1},'Switch 1G'],['sw',{gang:2},'Switch 2G'],['sw',{gang:3},'Switch 3G'],['sw',{gang:4},'Switch 4G'],['swb',{mods:6},'Switch board 6M'],['swb',{mods:12},'Switch board 12M'],['fanreg',{},'Fan regulator'],['ac',{},'AC isolator']]}]},
 {tab:'Sockets',groups:[{g:'Socket outlets',items:[['sk13',{},'Socket 13A'],['sk13',{twin:'yes'},'Twin 13A'],['skr',{amp:5},'Socket 5A'],['skr',{amp:15},'Socket 15A'],['tv',{kind:'TV'},'TV point'],['tv',{kind:'Data'},'Data point']]}]},
 {tab:'Lights & fans',groups:[{g:'Ceiling',items:[['dl',{},'Downlight'],['ledp',{},'LED panel'],['fan',{},'Ceiling fan'],['pend',{},'Pendant'],['smoke',{},'Smoke detector'],['jbc',{},'Junction box']]},{g:'Wall',items:[['wl',{},'Wall light'],['exh',{},'Exhaust fan']]}]},
 {tab:'Openings',groups:[{g:'Doors & windows',items:[['door',{},'Door 900'],['door',{width:800},'Door 800'],['win',{},'Window 1200'],['win',{width:1800,height:1200},'Window 1800']]}]},
 {tab:'Boards & boxes',groups:[{g:'Distribution',items:[['db',{ways:8},'DB 8-way'],['db',{ways:12},'DB 12-way'],['jbw',{},'Junction box']]}]}
];
function roomThumb(type,props){const it={type,props:Object.assign({},RDEFS[type].defaults,props)};const w=iw(it),h=ih(it),pad=Math.max(w,h)*0.08;
 let ex=0;if(type==='fan')ex=it.props.sweep/2-w/2;
 return `<svg viewBox="${-pad-ex} ${-pad-ex} ${w+2*(pad+ex)} ${h+2*(pad+ex)}" preserveAspectRatio="xMidYMid meet">${RDEFS[type].draw(it.props,w,h)}</svg>`}

/* ---------- demo room (single bedroom) ---------- */
function demoRoom(){const it=(type,surf,x,y,props={})=>({id:uid(),type,surf,x,y,props:Object.assign({},RDEFS[type].defaults,props)});
 return normRoom({name:'Bedroom 1',w:3600,l:3000,h:2700,items:[
  it('door','D',650,1050,{width:900}),it('swb','D',1350,1200,{mods:6,label:'MSB',circuit:'LIGHT 1'}),it('fanreg','D',1520,1200,{label:'Fan reg'}),
  it('db','A',500,1750,{ways:8,label:'DB'}),it('sk13','A',1800,300,{twin:'yes',label:'5A/13A socket',circuit:'SKT 1'}),
  it('ac','B',2650,2250,{label:'AC point 16A',circuit:'A/C 1'}),it('wl','B',900,1800,{label:'Wall light'}),it('wl','B',2150,1800,{label:'Wall light'}),it('sk13','B',400,300,{label:'Bedside socket',circuit:'SKT 2'}),
  it('win','C',1800,1500,{width:1500,height:1200}),it('sk13','C',3100,1100,{twin:'yes',label:'Desk socket',circuit:'SKT 2'}),it('sk13','C',500,300,{label:'Socket',circuit:'SKT 1'}),
  it('fan','ceil',1800,1500,{label:'Ceiling fan',circuit:'LIGHT 2'}),it('dl','ceil',900,750,{label:'LED light',circuit:'LIGHT 1'}),it('dl','ceil',2700,750,{label:'LED light',circuit:'LIGHT 1'}),
  it('dl','ceil',900,2250,{label:'LED light',circuit:'LIGHT 1'}),it('dl','ceil',2700,2250,{label:'LED light',circuit:'LIGHT 1'}),it('jbc','ceil',1800,900,{label:'JB'})]})}

/* ---------- mode enter / leave / refresh ---------- */
function roomEnter(boot){if(!S.room)S.room=normRoom(null);if(!boot){roomRefresh(true)}}
function roomLeave(){rsel=null;stop3D()}
function roomReset(){rsel=null;texCache.clear()}
function setSurf(k,keepSel){surf=k;if(k!=='3d'&&k!=='ceil')lastWall=k;if(!keepSel)rsel=null;document.body.classList.toggle('r3d',k==='3d');roomRefresh(true);updUI()}
function roomRefresh(refit){if(appMode!=='room')return;if(!S.room)S.room=normRoom(null);document.body.classList.toggle('r3d',surf==='3d');
 if(surf==='3d'){draw2DClear();show3D(refit)}else{stop3D();if(refit)roomFit(true);else draw2D()}}
function roomCommit(){save();roomRefresh(false);updUI()}

/* ---------- top bar: surface tabs + selection ---------- */
function roomUpdUI(){const Rm=RM(),tabs=$('#roomTabs');
 const tb=(k,t,sub)=>`<button class="rtb ${surf===k?'on':''}" data-surf="${k}">${t}${sub?`<small>${esc(sub)}</small>`:''}</button>`;
 tabs.innerHTML=tb('3d','3D')+WALL_KEYS.map(k=>tb(k,'Wall '+k,Rm.walls[k])).join('')+tb('ceil','Ceiling')+
  (surf==='3d'?`<span class="rtsep"></span><button class="rtb" data-r3="reset">Reset view</button><button class="rtb ${settings.r3labels!==false?'on2':''}" data-r3="labels">Labels</button><button class="rtb ${settings.r3cut!==false?'on2':''}" data-r3="cut">Cutaway</button>`
   :`<span class="rtsep"></span><button class="rtb ${allDims?'on2':''}" data-r2="dims">All heights</button>`)+
  `<button class="rtb ${settings.rwire!==false?'on2':''}" data-r3="wire">Wiring</button>`+
  `<button class="rtb" data-r3="cct">⚡ Circuits</button><button class="rtb" data-r3="room">⚙ Room</button>`;
 const it=rsel&&rfind(rsel),sb=$('#selbar');
 if(it){const isW=it.surf!=='ceil',pos=isW?`${Math.round(it.x)} from left · h ${Math.round(it.y)}`:`${Math.round(it.x)} from ${Rm.walls.D?'W':'D'} · ${Math.round(it.y)} from ${Rm.walls.A?'N':'A'}`;
  sb.innerHTML=`<div class="ttl">${esc(rname(it))}${it.props.label?' · '+esc(it.props.label):''}<small>${esc(surfName(it.surf))} · ${pos}</small></div>${surf==='3d'?`<button class="bb pri" data-ra="goto">Open ${it.surf==='ceil'?'ceiling':'wall '+it.surf}</button>`:''}<button class="bb" data-ra="edit">Edit</button><button class="bb" data-ra="dup">Copy</button><button class="bb danger" data-ra="del">Delete</button><button class="bb" data-ra="close">✕</button>`;sb.classList.remove('hidden')}
 else{sb.classList.add('hidden');sb.innerHTML=''}
 $('#titleChip').classList.toggle('hidden',!!it);
 $('#titleChip').innerHTML=`${esc(Rm.name)}<small>${(Rm.w/1000).toFixed(2)} × ${(Rm.l/1000).toFixed(2)} × ${(Rm.h/1000).toFixed(2)} m · v${APP_VERSION}</small>`}
$('#roomTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.surf)return setSurf(b.dataset.surf);
 const a=b.dataset.r3||b.dataset.r2;
 if(a==='reset'){orbitReset();req3D()}
 else if(a==='labels'){settings.r3labels=settings.r3labels===false;saveSettings();updUI();req3D()}
 else if(a==='cut'){settings.r3cut=settings.r3cut===false;saveSettings();updUI();req3D()}
 else if(a==='dims'){allDims=!allDims;draw2D();updUI()}
 else if(a==='wire'){settings.rwire=settings.rwire===false;saveSettings();updUI();if(surf==='3d'){build3D();req3D()}else draw2D()}
 else if(a==='cct')openCircuits();
 else if(a==='room')openRoomSettings()});
$('#selbar').addEventListener('click',e=>{if(appMode!=='room')return;const b=e.target.closest('[data-ra]');if(!b)return;const a=b.dataset.ra,it=rfind(rsel);if(!it)return;
 if(a==='goto')setSurf(it.surf,true);else if(a==='edit')openRoomProps(it.id);else if(a==='dup')roomDup();else if(a==='del')roomDel();else if(a==='close'){rselect(null)}});
function rselect(id){rsel=id;if(surf==='3d')req3D(true);else draw2D();updUI()}

/* ---------- editing actions ---------- */
function clampItem(it){const w=iw(it),h=ih(it),len=surfLen(it.surf),H=surfH(it.surf);
 it.x=clamp(it.x,Math.min(w/2,len/2),Math.max(len-w/2,len/2));
 if(rdef(it).model==='door')it.y=h/2;else it.y=clamp(it.y,Math.min(h/2,H/2),Math.max(H-h/2,H/2))}
function roomAdd(type,props,title){const d=RDEFS[type];pushUndo();
 let sf=d.surf==='ceil'?'ceil':(surf!=='3d'&&surf!=='ceil'?surf:lastWall);
 const it={id:uid(),type,surf:sf,x:0,y:0,props:Object.assign({},d.defaults,props)};
 if(d.ways)it.props.controls=normControls(it.props.controls,Math.max(1,d.ways(it.props)));
 const len=surfLen(sf),H=surfH(sf);it.x=len/2;it.y=d.surf==='ceil'?H/2:(d.model==='door'?ih(it)/2:d.mount);
 // avoid landing exactly on another item
 for(let k=0;k<12;k++){const hit=RM().items.some(o=>o.surf===sf&&Math.abs(o.x-it.x)<(iw(o)+iw(it))/2&&Math.abs(o.y-it.y)<(ih(o)+ih(it))/2);if(!hit)break;it.x+=(k%2?-1:1)*(k+1)*Math.max(150,iw(it)+40)}
 clampItem(it);RM().items.push(it);rsel=it.id;
 const moved=surf!==sf;if(moved)setSurf(sf,true);else roomCommit();save();
 toast(`Added ${title} to ${surfName(sf)}${d.surf!=='ceil'?' — drag to place':''}`)}
function roomDel(){const it=rfind(rsel);if(!it)return;pushUndo();S.room.items=RM().items.filter(i=>i.id!==it.id);
 /* Drop it from any switch that was driving it — normRoom prunes this on
    load too, but not until the next load, and a stale id would route a
    cable to a point that no longer exists. */
 RM().items.forEach(s=>{if(rdef(s).ways&&Array.isArray(s.props.controls))s.props.controls=s.props.controls.map(r=>r.filter(id=>id!==it.id))});
 rsel=null;roomCommit()}
function roomDup(){const it=rfind(rsel);if(!it)return;pushUndo();const c=JSON.parse(JSON.stringify(it));c.id=uid();c.x+=iw(it)+40;clampItem(c);RM().items.push(c);rsel=c.id;roomCommit()}
function openRoomProps(id){const it=rfind(id);if(!it)return;const d=rdef(it),isW=it.surf!=='ceil';
 const fields=d.props.map(f=>{const v=it.props[f.k];
  if(f.type==='circuit'){const cs=circuits();
   return `<label>${f.label}<select name="p_${f.k}"><option value="">— unassigned —</option>${cs.map(c=>`<option value="${esc(c.id)}" ${c.id===v?'selected':''}>${esc(circuitLabel(c))}</option>`).join('')}</select></label>`+
    (cs.length?'':`<p class="muted">No circuits yet — make one with ⚡ Circuits.</p>`)}
  if(f.type==='select')return `<label>${f.label}<select name="p_${f.k}">${f.opts.map(o=>`<option value="${esc(o)}" ${String(o)===String(v)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label>${f.label}<input name="p_${f.k}" value="${esc(v)}" maxlength="40" autocomplete="off"></label>`}).join('');
 const surfSel=isW?`<label>Wall<select name="surf">${WALL_KEYS.map(k=>`<option value="${k}" ${k===it.surf?'selected':''}>${esc(surfName(k))}</option>`).join('')}</select></label>`:'';
 const pos=isW?`<label>Centre from left end of wall (mm)<input name="x" type="number" inputmode="numeric" value="${Math.round(it.x)}"></label>${d.model==='door'?'':`<label>${d.model==='window'?'Sill height (mm)':'Height to centre (mm)'}<input name="y" type="number" inputmode="numeric" value="${Math.round(d.model==='window'?it.y-ih(it)/2:it.y)}"></label>`}`
  :`<label>From ${esc(surfName('D'))} (mm)<input name="x" type="number" inputmode="numeric" value="${Math.round(it.x)}"></label><label>From ${esc(surfName('A'))} (mm)<input name="y" type="number" inputmode="numeric" value="${Math.round(it.y)}"></label>`;
 /* Switching: one checkbox list per gang, over every light/fan in the
    room. Rendered inside the same form so one Apply saves the lot. */
 const nWays=waysOf(it),loads=loadsIn();
 const ctl=nWays?normControls(it.props.controls,nWays):[];
 const switching=!nWays?'':`<div class="swx"><b>Switching</b>${!loads.length?'<p class="muted">No lights or fans in the room yet.</p>':
  ctl.map((row,i)=>`<div class="swx-w"><span class="swx-h">${nWays>1?'Gang '+(i+1):'Controls'}</span>${
   loads.map(L=>`<label class="swx-c"><input type="checkbox" name="sw_${i}" value="${esc(L.id)}" ${row.includes(L.id)?'checked':''}>${esc(loadName(L))}</label>`).join('')}</div>`).join('')}</div>`;
 openModal(`<h3>${esc(rname(it))}</h3><form id="rpf">${surfSel}${pos}${fields}${switching}<p class="muted">${esc(d.desc?d.desc(it.props):'')}</p><div class="mact"><button type="button" class="bb" data-close>Cancel</button><button class="bb pri">Apply</button></div></form>`,box=>{
  box.querySelector('#rpf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);pushUndo();
   for(const f of d.props){let v=fd.get('p_'+f.k);if(v==null)continue;if(f.type==='select'&&typeof f.opts[0]==='number')v=Number(v);it.props[f.k]=v}
   /* After the props loop, so a gang count changed in this same submit
      decides how many ways are kept. */
   if(d.ways){const n=Math.max(1,d.ways(it.props)),out=[];for(let i=0;i<n;i++)out.push(fd.getAll('sw_'+i).map(String));it.props.controls=out}
   if(isW&&fd.get('surf'))it.surf=fd.get('surf');
   const x=Number(fd.get('x')),y=Number(fd.get('y'));if(isFinite(x))it.x=x;if(fd.get('y')!=null&&isFinite(y))it.y=d.model==='window'?y+ih(it)/2:y;
   clampItem(it);closeModal();texCache.clear();if(surf!=='3d'&&surf!==it.surf)setSurf(it.surf,true);else roomCommit()}})}
/* Circuits manager: add, rename, re-rate and delete. Edits are applied
   together on Save so a half-finished rename never lands on the points
   referencing it. */
function openCircuits(){
 const draw=()=>{const cs=circuits();
  /* Stacked rows rather than a table: three 16 px inputs side by side
     overflow the modal well before a 412 px phone screen. */
  const brs=panelBreakers(),dupe=new Map();
  cs.forEach(c=>{if(c.breaker)dupe.set(c.breaker,(dupe.get(c.breaker)||0)+1)});
  const rows=cs.map(c=>{const n=circuitItems(c.id).length,b=breakerById(c.breaker),warn=cableWarn(c);
   return `<div class="cct">
    <div class="cct-l"><input name="n_${c.id}" value="${esc(c.name)}" maxlength="24" autocomplete="off" placeholder="Circuit name">
     <button type="button" class="bb danger" data-delc="${c.id}" title="Delete circuit">✕</button></div>
    <div class="cct-l">${b
      ?`<label class="cct-f">MCB<span class="cct-ro">${esc(breakerText(b))}</span></label>`
      :`<label class="cct-f">MCB<input name="m_${c.id}" value="${esc(c.mcb)}" maxlength="8" autocomplete="off" placeholder="B10"></label>`}
     <label class="cct-f">Cable mm²<select name="c_${c.id}">${CABLE_SIZES.map(s=>`<option value="${s}" ${+c.cable===s?'selected':''}>${s}</option>`).join('')}</select></label>
     <span class="cct-n">${n} point${n===1?'':'s'}</span></div>
    <label class="cct-f cct-br">Breaker on the panel<select name="b_${c.id}"><option value="">— not linked —</option>${
     brs.map(x=>`<option value="${esc(x.id)}" ${x.id===c.breaker?'selected':''}>${esc(breakerLabel(x))}</option>`).join('')}</select></label>
    ${c.breaker&&dupe.get(c.breaker)>1?`<p class="cct-warn">This breaker is also used by another circuit.</p>`:''}
    ${warn?`<p class="cct-warn">${esc(warn)}</p>`:''}</div>`}).join('');
  openModal(`<h3>Circuits</h3><form id="ccf">
   ${rows||'<p class="muted">No circuits yet — add the first one below.</p>'}
   <div class="mact" style="justify-content:flex-start;margin-top:10px"><button type="button" class="bb" id="cAdd">+ Add circuit</button>${
    brs.length?`<button type="button" class="bb" id="cAuto">Match by label</button>`:''}</div>
   <p class="muted">Points are assigned to a circuit from their own Edit form. Deleting a circuit leaves its points unassigned — it never deletes them.</p>
   <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button class="bb pri">Save</button></div></form>`,box=>{
   box.querySelector('#cAdd').onclick=()=>{pushUndo();RM().circuits.push({id:uid(),name:'Circuit '+(circuits().length+1),mcb:'B10',cable:1.5});save();draw()};
   /* Panels are usually labelled with the same circuit names, so one tap
      links the obvious ones. Only fills blanks — never moves a link the
      user set by hand — and won't give one breaker to two circuits. */
   const auto=box.querySelector('#cAuto');if(auto)auto.onclick=()=>{
    const taken=new Set(circuits().map(c=>c.breaker).filter(Boolean));let n=0;
    pushUndo();
    for(const c of circuits()){if(c.breaker)continue;
     const hit=panelBreakers().find(b=>!taken.has(b.id)&&String(b.props.label||'').trim().toLowerCase()===c.name.trim().toLowerCase());
     if(hit){c.breaker=hit.id;taken.add(hit.id);n++}}
    save();draw();toast(n?`Linked ${n} circuit${n===1?'':'s'} by label`:'No matching breaker labels')};
   box.querySelectorAll('[data-delc]').forEach(b=>b.onclick=()=>{const id=b.dataset.delc,c=circuitById(id),n=circuitItems(id).length;
    if(n&&!confirm(`Delete "${c.name}"? ${n} point${n===1?'':'s'} will be left unassigned.`))return;
    pushUndo();RM().circuits=circuits().filter(x=>x.id!==id);RM().items.forEach(i=>{if(i.props.circuit===id)i.props.circuit=''});save();draw()});
   /* Re-render on link change so the MCB column switches between the
      typed value and the linked breaker's own rating. */
   box.querySelectorAll('select[name^="b_"]').forEach(s=>s.onchange=()=>{
    const fd=new FormData(box.querySelector('#ccf'));pushUndo();
    for(const c of circuits()){const nm=String(fd.get('n_'+c.id)??c.name).trim();
     c.name=nm||c.name;if(fd.get('m_'+c.id)!=null)c.mcb=String(fd.get('m_'+c.id)).trim();
     c.cable=+fd.get('c_'+c.id)||c.cable;c.breaker=String(fd.get('b_'+c.id)||'')}
    save();draw()});
   box.querySelector('#ccf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);pushUndo();
    for(const c of circuits()){const nm=String(fd.get('n_'+c.id)??c.name).trim();
     c.name=nm||c.name;if(fd.get('m_'+c.id)!=null)c.mcb=String(fd.get('m_'+c.id)).trim();
     c.cable=+fd.get('c_'+c.id)||c.cable;c.breaker=String(fd.get('b_'+c.id)||'')}
    closeModal();roomCommit()}})};
 draw()}
function openRoomSettings(){const Rm=RM();
 openModal(`<h3>Room settings</h3><form id="rsf"><label>Room name<input name="name" value="${esc(Rm.name)}" maxlength="40"></label>
 <label>Width — Wall A / C length (mm)<input name="w" type="number" inputmode="numeric" value="${Rm.w}"></label>
 <label>Length — Wall B / D length (mm)<input name="l" type="number" inputmode="numeric" value="${Rm.l}"></label>
 <label>Ceiling height (mm)<input name="h" type="number" inputmode="numeric" value="${Rm.h}"></label>
 <label>Wall thickness (mm)<input name="t" type="number" inputmode="numeric" value="${Rm.t}"></label>
 ${WALL_KEYS.map(k=>`<label>Wall ${k} name<input name="w${k}" value="${esc(Rm.walls[k])}" maxlength="20"></label>`).join('')}
 <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button class="bb pri">Save</button></div></form>`,box=>{
 box.querySelector('#rsf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);pushUndo();
  Rm.name=String(fd.get('name')||'Room').trim()||'Room';Rm.w=clamp(+fd.get('w')||Rm.w,1000,30000);Rm.l=clamp(+fd.get('l')||Rm.l,1000,30000);Rm.h=clamp(+fd.get('h')||Rm.h,2000,8000);Rm.t=clamp(+fd.get('t')||Rm.t,50,500);
  WALL_KEYS.forEach(k=>Rm.walls[k]=String(fd.get('w'+k)||'').trim());Rm.items.forEach(clampItem);closeModal();roomRefresh(true);save();updUI()}})}
function roomKey(e,k,c){
 if(c&&k==='d'){e.preventDefault();roomDup();return true}
 if((k==='delete'||k==='backspace')&&rsel){e.preventDefault();roomDel();return true}
 if(k==='escape'){rselect(null);return true}
 if(k==='w'||k==='l')return true;
 if(!c&&k.length===1&&'012345'.includes(k)){setSurf(['3d','A','B','C','D','ceil'][+k]);return true}
 return false}
/** Conduit, counting a length of trunking shared by several circuits
 *  once. Runs out of the same wall share identical corner-to-corner
 *  segments, so exact de-duplication catches most of the sharing;
 *  partial overlaps still count twice. */
function conduitLen(){const seen=new Set();let L=0;
 for(const r of roomRuns())for(let i=1;i<r.pts.length;i++){
  const a=r.pts[i-1].map(Math.round),b=r.pts[i].map(Math.round);
  const k=[a.join(','),b.join(',')].sort().join('|');
  if(seen.has(k))continue;seen.add(k);L+=seg3(a,b)}
 return L}
function roomBOMRows(){const m=new Map();for(const it of (S.room?S.room.items:[])){const d=rdef(it);if(d.opening)continue;const k='Room: '+(d.desc?d.desc(it.props):rname(it));m.set(k,(m.get(k)||0)+1)}
 const rows=[...m].sort().map(([k,q])=>[k,q,'pcs']);
 const cm=new Map();
 for(const r of roomRuns()){const k=`Room cable: ${r.circuit.cable} mm² — ${r.circuit.name}`;cm.set(k,(cm.get(k)||0)+r.len)}
 rows.push(...[...cm].sort().map(([k,L])=>[k,(L/1000*1.1).toFixed(2),'m']));
 const cd=conduitLen();if(cd)rows.push(['Room: conduit / trunking (shared runs counted once)',(cd/1000*1.1).toFixed(2),'m']);
 return rows}

/* =========================================================
   2D editor (one wall or the ceiling)
   ========================================================= */
const r2=$('#r2d'),r2w=$('#r2w');
function draw2DClear(){r2w.innerHTML=''}
function r2Area(){const open=document.body.classList.contains('sheet-open'),wide=innerWidth>=900,top=$('#bars').getBoundingClientRect().bottom+8;
 let x=0,w=innerWidth-68,h=innerHeight-top;if(open){if(wide){x=$('#sheet').offsetWidth;w-=x}else h-=$('#sheet').offsetHeight}return {x,y:top,w,h:Math.max(120,h)}}
function roomFit(quiet){if(surf==='3d'){orbitReset();req3D();return}
 const a=r2Area(),len=surfLen(surf),H=surfH(surf),mx=320,my=surf==='ceil'?320:260;
 const k=clamp(Math.min(a.w/((len+2*mx)*RS),a.h/((H+my+330)*RS)),.08,8);rview.k=k;const s=k*RS;
 rview.x=a.x+(a.w-len*s)/2;rview.y=a.y+(a.h-(H+my+330)*s)/2+my*s;draw2D()}
const toSvgY=(it)=>it.surf==='ceil'?it.y:RM().h-it.y;
function dimLine(x1,y1,x2,y2,label,u,col='#0a84ff'){const hz=Math.abs(y1-y2)<1e-6,t=6*u;let s=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
 s+=hz?`<line x1="${x1}" y1="${y1-t}" x2="${x1}" y2="${y1+t}" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/><line x1="${x2}" y1="${y2-t}" x2="${x2}" y2="${y2+t}" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`
  :`<line x1="${x1-t}" y1="${y1}" x2="${x1+t}" y2="${y1}" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/><line x1="${x2-t}" y1="${y2}" x2="${x2+t}" y2="${y2}" stroke="${col}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
 const mx=(x1+x2)/2,my=(y1+y2)/2,fs=11*u;
 return s+(hz?halo(mx,my-4*u,label,fs,col):halo(mx+5*u,my+fs*.35,label,fs,col,'start'))}
const halo=(x,y,s,fs,fill,anchor='middle')=>`<text x="${x}" y="${y}" font-size="${fs}" font-weight="700" fill="${fill}" text-anchor="${anchor}" stroke="#fff" stroke-width="${fs*0.28}" paint-order="stroke" stroke-linejoin="round">${esc(s)}</text>`;
function draw2D(){if(appMode!=='room'||surf==='3d')return;const Rm=RM(),isC=surf==='ceil',len=surfLen(surf),H=surfH(surf),s=rview.k*RS,u=1/s;let o='';
 r2w.setAttribute('transform',`translate(${rview.x},${rview.y}) scale(${s})`);
 const ln=(x1,y1,x2,y2,c,w=1,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" vector-effect="non-scaling-stroke"${dash?` stroke-dasharray="${dash}"`:''}/>`;
 // surface + context
 if(isC){const T=Rm.t;o+=`<rect x="${-T}" y="${-T}" width="${len+2*T}" height="${H+2*T}" fill="#c9c3b6"/>`;
  [['A',len/2,-T-14*u,'middle'],['C',len/2,H+T+26*u,'middle']].forEach(([k,x,y])=>o+=halo(x,y,surfName(k),12*u,'#59626a'));
  o+=`<text x="${-T-14*u}" y="${H/2}" font-size="${12*u}" font-weight="700" fill="#59626a" text-anchor="middle" transform="rotate(-90 ${-T-14*u} ${H/2})">${esc(surfName('D'))}</text><text x="${len+T+14*u}" y="${H/2}" font-size="${12*u}" font-weight="700" fill="#59626a" text-anchor="middle" transform="rotate(90 ${len+T+14*u} ${H/2})">${esc(surfName('B'))}</text>`}
 else{o+=`<rect x="${-200}" y="${H}" width="${len+400}" height="${90}" fill="#d8d1c3"/>`+ln(-200,H,len+200,H,'#8d8577',2);
  o+=halo(-30*u,H/2,'◀ '+leftOf(surf),12*u,'#8a8f94','end')+halo(len+30*u,H/2,rightOf(surf)+' ▶',12*u,'#8a8f94','start')}
 o+=`<rect x="0" y="0" width="${len}" height="${H}" fill="${isC?'#fbfaf6':'#f6f3ec'}" stroke="#7d868c" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
 // grid
 const step=100*s>=7?100:500;for(let x=step;x<len;x+=step)o+=ln(x,0,x,H,x%500?'#ece7dc':'#ddd6c8');for(let y=step;y<H;y+=step){const yy=isC?y:H-y;o+=ln(0,yy,len,yy,y%500?'#ece7dc':'#ddd6c8')}
 if(isC){o+=ln(len/2,0,len/2,H,'#c8b9a0',1,'8 6')+ln(0,H/2,len,H/2,'#c8b9a0',1,'8 6')}
 else for(const [h,t] of HEIGHT_GUIDES){if(h>=H)continue;o+=ln(0,H-h,len,H-h,'#d9b98a',1,'10 7')+halo(-8*u,H-h+4*u,innerWidth<600?String(h):`${h} ${t}`,9.5*u,'#b08850','end')}
 // ruler
 const ry=isC?H+Rm.t+48*u:H+90+18*u;for(let x=0;x<=len+1;x+=500){o+=ln(x,ry-5*u,x,ry+5*u,'#8a8f94');o+=halo(x,ry+17*u,x%1000?'':(x/1000)+' m',9.5*u,'#8a8f94')}o+=ln(0,ry,len,ry,'#8a8f94');
 // conduit runs (under the items, so a point is never hidden by its own cable)
 if(settings.rwire!==false){const sel=rsel&&rfind(rsel);
  for(const r of roomRuns()){const lit=sel&&(r.item.id===sel.id||r.circuit.id===sel.props.circuit);
   for(const seg of runOnSurf(r.pts,surf)){
    const d=seg.map((p,i)=>`${i?'L':'M'}${p.x} ${isC?p.y:Rm.h-p.y}`).join(' ');
    o+=`<path d="${d}" fill="none" stroke="${lit?'#ff9500':'#7a6cff'}" stroke-width="${lit?3.2:2}" stroke-linecap="round" stroke-linejoin="round" opacity="${lit?1:.55}" vector-effect="non-scaling-stroke"/>`}}}
 // items (openings first)
 const items=Rm.items.filter(i=>i.surf===surf).sort((a,b)=>(rdef(b).opening?1:0)-(rdef(a).opening?1:0));
 for(const it of items){const w=iw(it),h=ih(it),cx=it.x,cy=toSvgY(it);o+=`<g data-ri="${it.id}" transform="translate(${cx-w/2},${cy-h/2})">${rdef(it).draw(it.props,w,h)}<rect x="0" y="0" width="${w}" height="${h}" fill="#000" fill-opacity="0"/></g>`;
  if(it.props.label&&settings.labels!==false)o+=halo(cx,cy-h/2-6*u,it.props.label,10*u,'#1f2933');
  if(allDims&&!isC&&it.id!==rsel)o+=halo(cx,cy+h/2+13*u,rdef(it).model==='window'?`sill ${Math.round(it.y-h/2)}`:`h ${Math.round(it.y)}`,9.5*u,'#0a84ff')}
 // selection + dimensions
 const sel=rsel&&rfind(rsel);
 if(sel&&sel.surf===surf){const w=iw(sel),h=ih(sel),cx=sel.x,cy=toSvgY(sel),d=rdef(sel);
  o+=`<rect x="${cx-w/2-6*u}" y="${cy-h/2-6*u}" width="${w+12*u}" height="${h+12*u}" rx="${4*u}" fill="none" stroke="#0a84ff" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
  if(isC){o+=dimLine(0,cy,cx,cy,Math.round(cx),u)+dimLine(cx,cy,len,cy,Math.round(len-cx),u)+dimLine(cx,0,cx,cy,Math.round(cy),u)+dimLine(cx,cy,cx,H,Math.round(H-cy),u)}
  else if(d.opening){const l=cx-w/2,r=cx+w/2,b=cy+h/2,tY=cy-h/2,dy=tY-22*u;o+=dimLine(0,dy,l,dy,Math.round(l),u)+dimLine(l,dy,r,dy,Math.round(w),u)+dimLine(r,dy,len,dy,Math.round(len-r),u);
   if(d.model==='window')o+=dimLine(r+20*u,H,r+20*u,b,'sill '+Math.round(H-b),u);o+=dimLine(r+20*u,b,r+20*u,tY,Math.round(h),u)}
  else{o+=dimLine(0,cy,cx-w/2,cy,Math.round(cx-w/2)+' edge',u,'#7a8a99')+dimLine(cx+w/2,cy,len,cy,Math.round(len-cx-w/2)+' edge',u,'#7a8a99');
   o+=dimLine(0,cy+h/2+18*u,cx,cy+h/2+18*u,Math.round(cx)+' to centre',u)+dimLine(cx+w/2+16*u,H,cx+w/2+16*u,cy,'h '+Math.round(H-cy),u)}}
 r2w.innerHTML=o}

/* --- 2D gestures: pan / pinch / drag item / tap --- */
const r2p=new Map();let r2g=null;
const r2World=(cx,cy)=>{const s=rview.k*RS;return {x:(cx-rview.x)/s,y:(cy-rview.y)/s}};
r2.addEventListener('pointerdown',e=>{if(e.isPrimary&&r2p.size){r2p.clear();r2g=null}try{r2.setPointerCapture(e.pointerId)}catch(_){}
 r2p.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(r2p.size===2){if(r2g&&r2g.moved&&r2g.type==='item')roomCommit();const [a,b]=[...r2p.values()];r2g={type:'pinch',d0:dist(a,b),m0:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},v0:{...rview},moved:true};return}
 const id=e.target.closest('[data-ri]')?.dataset.ri,wp=r2World(e.clientX,e.clientY);
 r2g={type:'pan',sx:e.clientX,sy:e.clientY,v0:{...rview},moved:false,id,slop:e.pointerType==='touch'?10:5};
 if(id){const it=rfind(id);r2g.type='item';r2g.off={x:wp.x-it.x,y:wp.y-toSvgY(it)}}});
r2.addEventListener('pointermove',e=>{if(!r2p.has(e.pointerId)||!r2g)return;r2p.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(r2g.type==='pinch'){if(r2p.size<2)return;const [a,b]=[...r2p.values()],v=r2g.v0,k=clamp(v.k*dist(a,b)/r2g.d0,.08,8),s0=v.k*RS,s=k*RS;const wx=(r2g.m0.x-v.x)/s0,wy=(r2g.m0.y-v.y)/s0,m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  rview.k=k;rview.x=m.x-wx*s;rview.y=m.y-wy*s;r2Soon();return}
 const dx=e.clientX-r2g.sx,dy=e.clientY-r2g.sy;
 if(!r2g.moved){if(Math.hypot(dx,dy)<r2g.slop)return;r2g.moved=true;if(r2g.type==='item'){pushUndo();rsel=r2g.id;updUI()}}
 if(r2g.type==='pan'){rview.x=r2g.v0.x+dx;rview.y=r2g.v0.y+dy;r2Soon()}
 else if(r2g.type==='item'){const it=rfind(r2g.id);if(!it)return;const wp=r2World(e.clientX,e.clientY);let x=wp.x-r2g.off.x,sy=wp.y-r2g.off.y;
  let y=it.surf==='ceil'?sy:RM().h-sy;const sn=snapPos(it,x,y);it.x=sn.x;it.y=sn.y;clampItem(it);r2Soon();updUI()}});
function r2End(e,cancel){if(!r2p.has(e.pointerId))return;r2p.delete(e.pointerId);if(!r2g)return;const g=r2g;
 if(g.type==='pinch'){r2g=r2p.size?{type:'none',moved:true}:null;return}if(g.type==='none'){if(!r2p.size)r2g=null;return}r2g=null;
 try{if(!g.moved&&!cancel){if(g.id){if(rsel===g.id)openRoomProps(g.id);else rselect(g.id)}else rselect(null)}else if(g.moved&&g.type==='item')roomCommit()}catch(err){reportError(err)}}
r2.addEventListener('pointerup',e=>r2End(e,false));r2.addEventListener('pointercancel',e=>r2End(e,true));
r2.addEventListener('lostpointercapture',e=>{if(r2p.has(e.pointerId))r2End(e,true)});
r2.addEventListener('wheel',e=>{e.preventDefault();const f=Math.exp(-e.deltaY*.0015),k=clamp(rview.k*f,.08,8),s0=rview.k*RS,s=k*RS,wx=(e.clientX-rview.x)/s0,wy=(e.clientY-rview.y)/s0;rview.k=k;rview.x=e.clientX-wx*s;rview.y=e.clientY-wy*s;r2Soon()},{passive:false});
let r2q=0;function r2Soon(){if(r2q)return;r2q=requestAnimationFrame(()=>{r2q=0;draw2D()})}
/** Snap a position: 50 mm grid, standard heights, centre lines, and alignment with other items on the same surface. */
function snapPos(it,x,y){if(!settings.snap)return {x:Math.round(x),y:Math.round(y)};const others=RM().items.filter(o=>o.surf===it.surf&&o.id!==it.id),len=surfLen(it.surf),H=surfH(it.surf);
 const pick=(v,cands,tol,step)=>{let best=null,bd=tol;for(const c of cands){const d=Math.abs(v-c);if(d<bd){bd=d;best=c}}return best!=null?best:Math.round(v/step)*step};
 const xs=[len/2,...others.map(o=>o.x)],ys=it.surf==='ceil'?[H/2,...others.map(o=>o.y)]:[...SNAP_H,...others.map(o=>o.y)];
 return {x:pick(x,xs,60,50),y:rdef(it).model==='window'?Math.round((y-ih(it)/2)/50)*50+ih(it)/2:pick(y,ys,70,50)}}

/* =========================================================
   3D view (Three.js)
   ========================================================= */
let T3=null,orb={theta:0.72,phi:0.98,r:9000,tx:0,ty:0,tz:0},r3need=false;
const texCache=new Map();
function orbitReset(){const Rm=RM();orb.theta=0.72;orb.phi=0.98;const a=r2Area();orb.r=Math.hypot(Rm.w,Rm.l,Rm.h)*0.8/(Math.tan(19*Math.PI/180)*Math.min(1.15,a.w/a.h));orb.tx=Rm.w/2;orb.ty=Rm.h*0.38;orb.tz=Rm.l/2}
function init3D(){if(T3)return T3;const host=$('#r3d'),msg=$('#r3dMsg');
 if(typeof THREE==='undefined'){msg.textContent='3D engine not loaded. Keep vendor/three.min.js next to index.html (or use the standalone file).';msg.classList.remove('hidden');return null}
 let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch(err){msg.textContent='3D is not available on this device (WebGL is off).';msg.classList.remove('hidden');return null}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0xeef0f2,1);host.insertBefore(renderer.domElement,host.firstChild);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,20,200000);
 scene.add(new THREE.HemisphereLight(0xffffff,0xb9b2a6,0.85));const sun=new THREE.DirectionalLight(0xffffff,0.55);sun.position.set(-0.5,1,0.35);scene.add(sun);
 const root=new THREE.Group();scene.add(root);T3={renderer,scene,camera,root,walls:{},wallItems:{},labels:[],pick:[],selBox:null};
 bind3DGestures(renderer.domElement);addEventListener('resize',()=>{if(surf==='3d'&&appMode==='room')req3D()});orbitReset();return T3}
function show3D(refit){const t=init3D();if(!t)return;build3D();if(refit&&!t.didFit){orbitReset();t.didFit=true}req3D()}
function stop3D(){$('#r3dLbl').innerHTML='';if(T3)T3.labels=[]}
function req3D(){if(r3need)return;r3need=true;requestAnimationFrame(()=>{r3need=false;render3D()})}
const V=(a)=>new THREE.Vector3(a[0],a[1],a[2]);
function mat(c,o={}){return new THREE.MeshLambertMaterial(Object.assign({color:c},o))}
function itemTexture(it){const w=iw(it),h=ih(it),key=it.type+JSON.stringify(it.props);const hit=texCache.get(key);if(hit)return hit;
 const sc=Math.min(4,1024/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(8,Math.round(w*sc));c.height=Math.max(8,Math.round(h*sc));
 const g=c.getContext('2d');g.fillStyle='#f4f4f0';g.fillRect(0,0,c.width,c.height);const tex=new THREE.CanvasTexture(c);
 const img=new Image();img.onload=()=>{g.clearRect(0,0,c.width,c.height);g.fillStyle='#f4f4f0';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);tex.needsUpdate=true;req3D()};
 img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${w} ${h}">${rdef(it).draw(it.props,w,h)}</svg>`);
 texCache.set(key,tex);return tex}
/** Build one item as a Three object in its own local frame: +x = along surface, +y = surface "up", +z = out of the surface into the room. */
function itemObject(it){const d=rdef(it),w=iw(it),h=ih(it),dep=d.depth,g=new THREE.Group(),T=RM().t;
 const box=(bw,bh,bd,m)=>new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),m);
 if(d.model==='door'){const fr=mat(0x8b7355);const t=T+30;
  [[-w/2+20,0,40,h],[w/2-20,0,40,h],[0,h/2-20,w,40]].forEach(([x,y,bw,bh])=>{const m=box(bw,bh,t,fr);m.position.set(x,y,-T/2);g.add(m)});
  const leaf=box(w-40,h-20,40,[mat(0xe7dccb),mat(0xe7dccb),mat(0xe7dccb),mat(0xe7dccb),mat(0xffffff,{map:itemTexture(it)}),mat(0xe7dccb)]);leaf.position.set(0,-10,-T/2);g.add(leaf)}
 else if(d.model==='window'){const fr=mat(0x9aa3aa);const t=T+20;
  [[-w/2+25,0,50,h],[w/2-25,0,50,h],[0,h/2-25,w,50],[0,-h/2+25,w,50],[0,0,40,h]].forEach(([x,y,bw,bh])=>{const m=box(bw,bh,t,fr);m.position.set(x,y,-T/2);g.add(m)});
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(w-60,h-60),new THREE.MeshLambertMaterial({color:0x9fd3ff,transparent:true,opacity:.35,side:THREE.DoubleSide}));gl.position.set(0,0,-T/2);g.add(gl);
  const sill=box(w+80,30,120,mat(0xd9d4ca));sill.position.set(0,-h/2-15,40);g.add(sill)}
 else if(d.model==='walllight'){const base=box(70,110,30,mat(0xc9a24a));base.position.set(0,-40,15);g.add(base);
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(6,6,90,8),mat(0x8a6d2a));arm.rotation.x=Math.PI/2;arm.position.set(0,-20,70);g.add(arm);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(48,62,120,24,1,true),new THREE.MeshLambertMaterial({color:0xfff4cf,emissive:0xffe9a8,emissiveIntensity:.55,side:THREE.DoubleSide}));shade.position.set(0,40,110);g.add(shade)}
 else if(d.model==='downlight'){const c=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,dep,28),[mat(0xe6e7e3),new THREE.MeshBasicMaterial({color:0xfff6d0}),mat(0xe6e7e3)]);c.rotation.x=Math.PI/2;c.position.z=dep/2;g.add(c)}
 else if(d.model==='panel'){const p=box(w,h,dep,[mat(0xdddddd),mat(0xdddddd),mat(0xdddddd),mat(0xdddddd),new THREE.MeshBasicMaterial({color:0xfffbe5}),mat(0xdddddd)]);p.position.z=dep/2;g.add(p)}
 else if(d.model==='fan'){const m=mat(0xf1f1ed),dk=mat(0x8a8f94),drop=+it.props.drop,r=+it.props.sweep/2;
  const canopy=new THREE.Mesh(new THREE.CylinderGeometry(55,70,60,20),m);canopy.rotation.x=Math.PI/2;canopy.position.z=30;g.add(canopy);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(12,12,drop,10),dk);rod.rotation.x=Math.PI/2;rod.position.z=60+drop/2;g.add(rod);
  const motor=new THREE.Mesh(new THREE.CylinderGeometry(120,105,90,28),m);motor.rotation.x=Math.PI/2;motor.position.z=60+drop+45;g.add(motor);
  for(let i=0;i<3;i++){const b=box(r-90,120,8,m);const a=i*2*Math.PI/3;b.position.set(Math.cos(a)*(r/2+45),Math.sin(a)*(r/2+45),60+drop+70);b.rotation.z=a;g.add(b)}}
 else if(d.model==='pendant'){const drop=+it.props.drop;const cord=new THREE.Mesh(new THREE.CylinderGeometry(3,3,drop,6),mat(0x333333));cord.rotation.x=Math.PI/2;cord.position.z=drop/2;g.add(cord);
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(40,40,25,16),mat(0xeeeeee));cup.rotation.x=Math.PI/2;cup.position.z=12;g.add(cup);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(110,140,28,1,true),new THREE.MeshLambertMaterial({color:0xfff4cf,emissive:0xffe9a8,emissiveIntensity:.5,side:THREE.DoubleSide}));shade.rotation.x=-Math.PI/2;shade.position.z=drop+40;g.add(shade);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(40,16,12),new THREE.MeshBasicMaterial({color:0xfff1b8}));bulb.position.z=drop+90;g.add(bulb)}
 else if(d.model==='smoke'){const c=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2-8,dep,24),[mat(0xf6f6f3),mat(0xf6f6f3,{map:itemTexture(it)}),mat(0xf6f6f3)]);c.rotation.x=Math.PI/2;c.position.z=dep/2;g.add(c)}
 else{const side=mat(0xe6e6e1);const b=box(w,h,dep,[side,side,side,side,mat(0xffffff,{map:itemTexture(it)}),side]);b.position.z=dep/2;g.add(b)}
 g.traverse(o=>{o.userData.rid=it.id});return g}
function placeObject(obj,it){const Rm=RM();
 if(it.surf==='ceil'){const m=new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,-1,0));obj.quaternion.setFromRotationMatrix(m);obj.position.set(it.x,Rm.h,it.y);return}
 const W=wallGeo(it.surf),d=V(W.d),n=V(W.n),up=new THREE.Vector3(0,1,0);obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d,up,n));
 obj.position.copy(V(W.o)).addScaledVector(d,it.x).addScaledVector(up,it.y)}
function build3D(){const t=T3;if(!t)return;const Rm=RM(),T=Rm.t;
 t.root.traverse(o=>{if(o.geometry)o.geometry.dispose()});t.root.clear();t.walls={};t.wallItems={};t.pick=[];
 // floor
 const floor=new THREE.Mesh(new THREE.BoxGeometry(Rm.w+2*T,40,Rm.l+2*T),mat(0xd8d2c6));floor.position.set(Rm.w/2,-20,Rm.l/2);t.root.add(floor);
 const tiles=new THREE.GridHelper(Math.max(Rm.w,Rm.l),Math.round(Math.max(Rm.w,Rm.l)/600),0xc7bfb0,0xc7bfb0);tiles.position.set(Rm.w/2,1,Rm.l/2);tiles.scale.set(Rm.w/Math.max(Rm.w,Rm.l),1,Rm.l/Math.max(Rm.w,Rm.l));t.root.add(tiles);
 // walls with openings cut out
 for(const k of WALL_KEYS){const W=wallGeo(k),len=wallLen(k),sh=new THREE.Shape();sh.moveTo(-T,0);sh.lineTo(len,0);sh.lineTo(len,Rm.h);sh.lineTo(-T,Rm.h);sh.lineTo(-T,0);
  for(const it of Rm.items){if(it.surf!==k||!rdef(it).opening)continue;const w=iw(it),h=ih(it),x1=clamp(it.x-w/2,1,len-1),x2=clamp(it.x+w/2,1,len-1),y1=Math.max(1,it.y-h/2),y2=Math.min(Rm.h-1,it.y+h/2);
   const hole=new THREE.Path();hole.moveTo(x1,y1);hole.lineTo(x1,y2);hole.lineTo(x2,y2);hole.lineTo(x2,y1);hole.lineTo(x1,y1);sh.holes.push(hole)}
  const geo=new THREE.ExtrudeGeometry(sh,{depth:T,bevelEnabled:false});const mesh=new THREE.Mesh(geo,[mat(0xf3f0ea,{side:THREE.DoubleSide}),mat(0xd9d2c4,{side:THREE.DoubleSide})]);
  const d=V(W.d),n=V(W.n),up=new THREE.Vector3(0,1,0);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d,up,n));mesh.position.copy(V(W.o)).addScaledVector(n,-T);
  mesh.userData.wall=k;const grp=new THREE.Group();grp.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,30),new THREE.LineBasicMaterial({color:0xb5ad9f}));edges.quaternion.copy(mesh.quaternion);edges.position.copy(mesh.position);grp.add(edges);
  const ghost=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(W.o),V(W.o).addScaledVector(d,len)]),new THREE.LineBasicMaterial({color:0x9a9284}));ghost.position.y=2;ghost.visible=false;
  t.root.add(grp);t.root.add(ghost);t.walls[k]={grp,ghost,W};t.pick.push(mesh);
  const items=new THREE.Group();t.root.add(items);t.wallItems[k]=items}
 const ceilItems=new THREE.Group();t.root.add(ceilItems);t.wallItems.ceil=ceilItems;
 const cl=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,Rm.h,0),new THREE.Vector3(Rm.w,Rm.h,0),new THREE.Vector3(Rm.w,Rm.h,Rm.l),new THREE.Vector3(0,Rm.h,Rm.l)]),new THREE.LineBasicMaterial({color:0xc4bcae}));t.root.add(cl);
 // items + labels
 const lbl=$('#r3dLbl');lbl.innerHTML='';t.labels=[];
 for(const it of Rm.items){const obj=itemObject(it);placeObject(obj,it);t.wallItems[it.surf].add(obj);obj.traverse(o=>{if(o.isMesh)t.pick.push(o)});
  const text=it.props.label||(rdef(it).opening?'':rname(it));if(text){const el=document.createElement('div');el.className='lbl';el.textContent=text;el.dataset.rid=it.id;lbl.appendChild(el);
   const a=new THREE.Vector3();if(it.surf==='ceil')a.set(it.x,Rm.h-(rdef(it).model==='fan'?+it.props.drop+160:rdef(it).model==='pendant'?+it.props.drop+140:40),it.y);else{const W=wallGeo(it.surf);a.copy(V(W.o)).addScaledVector(V(W.d),it.x).add(new THREE.Vector3(0,it.y+ih(it)/2+40,0)).addScaledVector(V(W.n),rdef(it).depth+10)}
   t.labels.push({el,pos:a,surf:it.surf,id:it.id})}}
 // conduit runs, nudged off the surface so they don't z-fight with it
 if(settings.rwire!==false){const sel=rsel&&rfind(rsel),wires=new THREE.Group();
  for(const r of roomRuns()){const lit=sel&&(r.item.id===sel.id||r.circuit.id===sel.props.circuit);
   const v=r.pts.map(nudge).map(p=>new THREE.Vector3(p[0],p[1],p[2]));
   const g=new THREE.BufferGeometry().setFromPoints(v);
   wires.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:lit?0xff9500:0x7a6cff,transparent:true,opacity:lit?1:.7})))}
  t.root.add(wires);t.wires=wires}
 const s=rsel&&rfind(rsel);if(s){const o=t.wallItems[s.surf].children.find(c=>c.userData.rid===s.id);if(o){t.selBox=new THREE.BoxHelper(o,0x0a84ff);t.root.add(t.selBox)}}}
function wallFacesCamera(W,cam){const n=V(W.n),o=V(W.o);return n.dot(cam.clone().sub(o))>0}
function render3D(){const t=T3;if(!t||surf!=='3d'||appMode!=='room')return;const host=$('#r3d'),w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
 t.renderer.setSize(w,h,false);t.renderer.domElement.style.width=w+'px';t.renderer.domElement.style.height=h+'px';t.camera.aspect=w/h;
 const a=r2Area();t.camera.setViewOffset(w,h,Math.round(w/2-(a.x+a.w/2)),Math.round(h/2-(a.y+a.h/2)),w,h);
 orb.phi=clamp(orb.phi,0.08,Math.PI/2+0.35);const sp=Math.sin(orb.phi);
 t.camera.position.set(orb.tx+orb.r*sp*Math.sin(orb.theta),orb.ty+orb.r*Math.cos(orb.phi),orb.tz+orb.r*sp*Math.cos(orb.theta));t.camera.lookAt(orb.tx,orb.ty,orb.tz);t.camera.updateProjectionMatrix();
 const cut=settings.r3cut!==false,vis={ceil:true};
 for(const k of WALL_KEYS){const wl=t.walls[k];if(!wl)continue;const show=!cut||wallFacesCamera(wl.W,t.camera.position);wl.grp.visible=show;wl.ghost.visible=!show;t.wallItems[k].visible=show;vis[k]=show}
 t.renderer.render(t.scene,t.camera);
 const showL=settings.r3labels!==false,v=new THREE.Vector3();
 for(const L of t.labels){if(!showL||!vis[L.surf]){L.el.style.display='none';continue}v.copy(L.pos).project(t.camera);
  if(v.z>1||v.z<-1){L.el.style.display='none';continue}L.el.style.display='';L.el.style.left=((v.x+1)/2*w)+'px';L.el.style.top=((1-v.y)/2*h)+'px';L.el.classList.toggle('sel',L.id===rsel)}}
/* tapping a yellow label selects that point; tapping it again opens its wall */
$('#r3dLbl').addEventListener('click',e=>{const el=e.target.closest('.lbl');if(!el)return;const it=rfind(el.dataset.rid);if(!it)return;
 if(rsel===it.id)setSurf(it.surf,true);else{rsel=it.id;build3D();req3D();updUI()}});
/* --- 3D gestures: 1 finger rotate · 2 fingers pinch-zoom + pan · wheel zoom · right/shift-drag pan · tap = pick --- */
function bind3DGestures(el){const P=new Map();let g=null;
 el.style.touchAction='none';el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('pointerdown',e=>{if(e.isPrimary&&P.size){P.clear();g=null}try{el.setPointerCapture(e.pointerId)}catch(_){}P.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(P.size===2){const [a,b]=[...P.values()];g={type:'two',d0:dist(a,b),m0:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},o0:{...orb},moved:true};return}
  g={type:(e.button===2||e.shiftKey)?'pan':'rot',sx:e.clientX,sy:e.clientY,o0:{...orb},moved:false,slop:e.pointerType==='touch'?10:5}});
 el.addEventListener('pointermove',e=>{if(!P.has(e.pointerId)||!g)return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(g.type==='two'){if(P.size<2)return;const [a,b]=[...P.values()],m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};orb.r=clamp(g.o0.r*g.d0/Math.max(10,dist(a,b)),800,80000);panBy(m.x-g.m0.x,m.y-g.m0.y,g.o0);req3D();return}
  const dx=e.clientX-g.sx,dy=e.clientY-g.sy;if(!g.moved){if(Math.hypot(dx,dy)<g.slop)return;g.moved=true}
  if(g.type==='rot'){orb.theta=g.o0.theta-dx*0.008;orb.phi=g.o0.phi-dy*0.006}else panBy(dx,dy,g.o0);req3D()});
 const end=(e,cancel)=>{if(!P.has(e.pointerId))return;P.delete(e.pointerId);if(!g)return;const gg=g;if(gg.type==='two'){g=P.size?{type:'none',moved:true}:null;return}if(gg.type==='none'){if(!P.size)g=null;return}g=null;
  if(!gg.moved&&!cancel){try{pick3D(e.clientX,e.clientY)}catch(err){reportError(err)}}};
 el.addEventListener('pointerup',e=>end(e,false));el.addEventListener('pointercancel',e=>end(e,true));el.addEventListener('lostpointercapture',e=>{if(P.has(e.pointerId))end(e,true)});
 el.addEventListener('wheel',e=>{e.preventDefault();orb.r=clamp(orb.r*Math.exp(e.deltaY*0.0012),800,80000);req3D()},{passive:false})}
function panBy(dx,dy,o0){const t=T3,c=t.camera,s=o0.r*0.0016;const right=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,1);
 orb.tx=o0.tx-right.x*dx*s+up.x*dy*s;orb.ty=clamp(o0.ty-right.y*dx*s+up.y*dy*s,-2000,RM().h+3000);orb.tz=o0.tz-right.z*dx*s+up.z*dy*s}
function pick3D(cx,cy){const t=T3,r=t.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1),t.camera);
 const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true};
 const hit=ray.intersectObjects(t.pick,false).find(h=>shown(h.object));
 if(!hit){rselect(null);return}
 if(hit.object.userData.rid){const id=hit.object.userData.rid;if(rsel===id){const it=rfind(id);setSurf(it.surf,true)}else{rsel=id;build3D();req3D();updUI()}return}
 if(hit.object.userData.wall){setSurf(hit.object.userData.wall);toast(`Editing ${surfName(hit.object.userData.wall)}`)}}

/* ---------- elevations sheet: every surface on one page ----------
   Each surface is captured by pointing draw2D() at it and taking the
   SVG it writes, which is why this swaps `surf`/`rview` and puts them
   back — the drawing code has no "render surface k offscreen" mode and
   giving it one would duplicate all of draw2D. */
function surfBlock(k){const keep={surf,allDims,rsel,rview:{...rview}};
 surf=k;allDims=true;rsel=null;rview={x:0,y:0,k:0.5/RS};
 let inner='';try{draw2D();inner=r2w.innerHTML}finally{
  surf=keep.surf;allDims=keep.allDims;rsel=keep.rsel;rview=keep.rview;draw2D()}
 return inner}
function roomSheet(asSvg){
 if(appMode!=='room')return toast('Switch to the room designer first');
 const Rm=RM(),PAD=300,TOP=190,BOT=430,GAP=420,COLS=2;
 const cells=[...WALL_KEYS.map(k=>({k,len:wallLen(k),H:Rm.h})),{k:'ceil',len:Rm.w,H:Rm.l}];
 cells.forEach(c=>{c.bw=c.len+2*PAD;c.bh=c.H+TOP+BOT;c.svg=surfBlock(c.k)});
 const colW=Math.max(...cells.map(c=>c.bw));
 const rows=[];for(let i=0;i<cells.length;i+=COLS)rows.push(cells.slice(i,i+COLS));
 const rowH=rows.map(r=>Math.max(...r.map(c=>c.bh)));
 const HEAD=520,body=rows.reduce((a,_,i)=>a+rowH[i]+GAP,0);
 // legend
 const runs=roomRuns(),perC=new Map();runs.forEach(r=>perC.set(r.circuit.id,(perC.get(r.circuit.id)||0)+r.len));
 const cs=circuits(),LEGH=cs.length?170+cs.length*105:0;
 const W=COLS*colW+(COLS+1)*GAP,H=HEAD+body+LEGH+GAP;
 let o=`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
 o+=txt(GAP,250,`${Rm.name} — electrical elevations`,110,'#1c1c1e',700,'start');
 o+=txt(GAP,370,`${(Rm.w/1000).toFixed(2)} × ${(Rm.l/1000).toFixed(2)} × ${(Rm.h/1000).toFixed(2)} m · all dimensions mm · DB Panel Designer v${APP_VERSION}`,62,'#6b7075',500,'start');
 let y=HEAD;
 rows.forEach((row,ri)=>{row.forEach((c,ci)=>{const x=GAP+ci*(colW+GAP);
  o+=txt(x,y-40,c.k==='ceil'?'Ceiling (plan, looking down)':`${surfName(c.k)} (elevation, from inside)`,70,'#1c1c1e',700,'start');
  o+=`<g transform="translate(${x+PAD},${y+TOP})" font-family="Arial,Helvetica,sans-serif">${c.svg}</g>`});
  y+=rowH[ri]+GAP});
 if(cs.length){o+=txt(GAP,y-40,'Circuits',70,'#1c1c1e',700,'start');
  const cw=[760,420,420,360,460];let cx=GAP;
  ['Circuit','MCB','Cable','Points','Cable length'].forEach((h,i)=>{o+=txt(cx,y+70,h,58,'#6b7075',700,'start');cx+=cw[i]});
  o+=`<line x1="${GAP}" y1="${y+100}" x2="${GAP+cw.reduce((a,b)=>a+b,0)}" y2="${y+100}" stroke="#c9c3b6" stroke-width="4"/>`;
  cs.forEach((c,i)=>{const ry=y+180+i*105;let x2=GAP;
   const L=(perC.get(c.id)||0)/1000*1.1;
   [c.name,circuitMcb(c)||'—',c.cable+' mm²',String(circuitItems(c.id).length),L?L.toFixed(2)+' m':'—']
    .forEach((v,j)=>{o+=txt(x2,ry,v,62,'#1c1c1e',j?500:700,'start');x2+=cw[j]})})}
 const nm=`${fname()}-${(Rm.name||'room').replace(/[^\w\- ]+/g,'').replace(/\s+/g,'-')}-elevations`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W/4)}" height="${Math.round(H/4)}" viewBox="0 0 ${W} ${H}"><g font-family="Arial,Helvetica,sans-serif">${o}</g></svg>`;
 if(asSvg)return shareOrDownload(new Blob([svg],{type:'image/svg+xml'}),nm+'.svg');
 const img=new Image();
 img.onload=()=>{const sc=Math.min(2,6000/(W/4)),c=document.createElement('canvas');c.width=Math.round(W/4*sc);c.height=Math.round(H/4*sc);
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
  c.toBlob(b=>b?shareOrDownload(b,nm+'.png'):toast('Export failed'),'image/png')};
 img.onerror=()=>toast('Sheet export failed');
 img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}

/* ---------- export: current wall / ceiling drawing, or the 3D view ---------- */
function roomExport(asSvg){const nm=`${fname()}-${(RM().name||'room').replace(/[^\w\- ]+/g,'').replace(/\s+/g,'-')}`;
 if(surf==='3d'){if(!T3)return toast('3D view not ready');render3D();const src=T3.renderer.domElement,c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');g.drawImage(src,0,0);
  const k=src.width/src.clientWidth;g.font=`800 ${11*k}px Arial`;g.textBaseline='middle';
  for(const L of T3.labels){if(L.el.style.display==='none')continue;const x=parseFloat(L.el.style.left)*k,y=parseFloat(L.el.style.top)*k,tw=g.measureText(L.el.textContent).width+12*k,th=18*k;g.fillStyle='#ffe14d';g.strokeStyle='#1c1c1e';g.lineWidth=1.5*k;g.beginPath();g.rect(x-tw/2,y-th,tw,th);g.fill();g.stroke();g.fillStyle='#1c1c1e';g.textAlign='center';g.fillText(L.el.textContent,x,y-th/2)}
  return c.toBlob(b=>b&&shareOrDownload(b,nm+'-3D.png'),'image/png')}
 const keepDims=allDims,keep={...rview},keepSel=rsel;allDims=true;rsel=null;rview={x:0,y:0,k:0.5/RS};draw2D();const inner=r2w.innerHTML;allDims=keepDims;rsel=keepSel;rview=keep;draw2D();
 const len=surfLen(surf),H=surfH(surf),pad=surf==='ceil'?420:300,x=-pad,y=-pad*0.6,w=len+2*pad,h=H+pad*0.6+(surf==='ceil'?pad+140:420);
 const title=`${RM().name} — ${surfName(surf)}${surf==='ceil'?' (plan, looking down)':' (elevation, from inside)'}`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w/2}" height="${h/2}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><g font-family="Arial,Helvetica,sans-serif">${inner}</g>${txt(x+30,y+h-30,title+'  ·  DB Panel Designer v'+APP_VERSION,26,'#59626a',700,'start')}</svg>`;
 if(asSvg)return shareOrDownload(new Blob([svg],{type:'image/svg+xml'}),`${nm}-${surf}.svg`);
 const img=new Image();img.onload=()=>{const c=document.createElement('canvas'),sc=Math.min(2,4000/w*2);c.width=w/2*sc;c.height=h/2*sc;const g=c.getContext('2d');g.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b&&shareOrDownload(b,`${nm}-${surf}.png`),'image/png')};
 img.onerror=()=>toast('Export failed');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
