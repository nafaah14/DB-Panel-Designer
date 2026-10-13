'use strict';
/* =========================================================
   Floor plan — step 1 of Plan → Wiring → Panel  (part of DB Panel Designer)
   ---------------------------------------------------------
   Draws every room of the project from above: walls, doors, windows and
   (optionally) the points and conduit that the wiring step adds.

   **Each room keeps its own four walls (A–D).** Room items, the 2D wall
   views, the conduit routing and the 3D view are all built on that, so
   the plan adds nothing but a position and a rotation per room:
       room.plan = {x, z, rot}      mm, rot ∈ {0,90,180,270}
   x/z place the room's local origin — the corner where Wall D meets
   Wall A — on the plan; local x runs along Wall A, local z along Wall B.
   Dragging snaps the gap between two facing inner faces to exactly one
   wall thickness, so the two rooms' wall strips land on top of each
   other and a shared partition draws as ONE wall instead of two. That is
   also why the whole floor is drawn in layers (all floors, then all wall
   strips, then all openings) rather than room by room: an opening in a
   shared wall has to show from both sides, whoever owns it.

   Shares globals with panel.js / room.js: S, settings, appMode, pushUndo,
   save, updUI, toast, openModal, esc, txt, halo, dimLine, uid, clamp,
   dist, $, shareOrDownload, fname, reportError, RDEFS, WALL_KEYS, iw, ih,
   rdef, rname, RM, withRoom, normRoom, ensureRooms, cloneRoom, clampItem,
   switchRoom, openRooms, openRoomProps, openRoomSettings, roomRuns,
   RUN_COLOR, r2Area, setAppMode.
   ========================================================= */

const PLS=0.25;                                   // screen px per mm at zoom 1 (as the room views)
const PLGAP=1200;                                 // space left beside rooms that have no position yet
const PLQ=[[1,0],[0,1],[-1,0],[0,-1]];            // [cos,sin] per quarter turn
const PLC={paper:'#fffdf8',wall:'#39404a',thin:'#6c7480',grid:'#e7e3d9',grid5:'#d2ccbd',sel:'#0a84ff',muted:'#8a9099'};
const PLDOT={sw:'#0a84ff',swb:'#0a84ff',fanreg:'#0a84ff',ac:'#0a84ff',sk13:'#2f9e44',skr:'#2f9e44',isk:'#2f9e44',skwp:'#2f9e44',tv:'#8a9099',jbw:'#8a9099',jbc:'#8a9099'};
const pl2=$('#pl2d'),plw=$('#plw');
let pview={x:0,y:0,k:1},psel=null;

/* ---------- geometry ----------
   Rotations are whole quarter turns, so the sine and cosine are exact
   integers: two rooms snapped together coincide to the millimetre
   instead of to a rounding error, which is what lets the shared wall
   draw as one strip. */
const plQt=r=>((Math.round(((r&&r.plan&&r.plan.rot)||0)/90)%4)+4)%4;
const roomById=id=>(S.rooms||[]).find(r=>r.id===id)||null;
/** local (lx,lz) → plan (x,z) */
function planPt(r,lx,lz){const q=plQt(r),c=PLQ[q][0],s=PLQ[q][1],p=r.plan||{x:0,z:0};
 return [p.x+lx*c-lz*s,p.z+lx*s+lz*c]}
/** Wall k in local coords: origin, along-direction, inward normal — the
 *  2D shadow of wallGeo() in room.js, which the walls must agree with or
 *  doors would swing out of the room. */
function wallLocal(r,k){const W=r.w,L=r.l;
 return {A:{o:[0,0],d:[1,0],n:[0,1]},B:{o:[W,0],d:[0,1],n:[-1,0]},C:{o:[W,L],d:[-1,0],n:[0,-1]},D:{o:[0,L],d:[0,-1],n:[1,0]}}[k]}
const plWallLen=(r,k)=>(k==='A'||k==='C')?r.w:r.l;
const planCentre=r=>planPt(r,r.w/2,r.l/2);
/** A room's inner rectangle in plan space. Axis-aligned, because every
 *  rotation is a quarter turn — which is what keeps snapping to simple
 *  coordinate comparisons. */
function planInner(r){const a=planPt(r,0,0),b=planPt(r,r.w,r.l);
 return {x1:Math.min(a[0],b[0]),x2:Math.max(a[0],b[0]),z1:Math.min(a[1],b[1]),z2:Math.max(a[1],b[1])}}
const planOuter=r=>{const i=planInner(r);return {x1:i.x1-r.t,x2:i.x2+r.t,z1:i.z1-r.t,z2:i.z2+r.t}};
/** Wall strip (or part of one) as a plan polygon. `s0`–`s1` run along the
 *  wall, `a0`–`a1` across it: 0 = inner face, r.t = outer face. */
function wallPoly(r,k,s0,s1,a0,a1){const g=wallLocal(r,k),A0=a0==null?0:a0,A1=a1==null?r.t:a1;
 const P=(s,a)=>planPt(r,g.o[0]+g.d[0]*s-g.n[0]*a,g.o[1]+g.d[1]*s-g.n[1]*a);
 return [P(s0,A0),P(s1,A0),P(s1,A1),P(s0,A1)]}
const plPoly=pts=>pts.map(p=>p[0]+','+p[1]).join(' ');
const outerPts=r=>[[-r.t,-r.t],[r.w+r.t,-r.t],[r.w+r.t,r.l+r.t],[-r.t,r.l+r.t]].map(p=>planPt(r,p[0],p[1]));
/** Where a point sits on the plan: wall items on their wall, nudged into
 *  the room so the marker clears the wall; ceiling items are already in
 *  local x/z (x from Wall D, y from Wall A). */
function planItemPt(r,it,inset){if(it.surf==='ceil')return planPt(r,it.x,it.y);
 const g=wallLocal(r,it.surf),off=inset==null?Math.min(110,r.t+60):inset;
 return planPt(r,g.o[0]+g.d[0]*it.x+g.n[0]*off,g.o[1]+g.d[1]*it.x+g.n[1]*off)}
function planBBox(list){const rs=(list||S.rooms||[]).filter(r=>r&&r.plan);
 let x1=Infinity,z1=Infinity,x2=-Infinity,z2=-Infinity;
 for(const r of rs){const o=planOuter(r);x1=Math.min(x1,o.x1);z1=Math.min(z1,o.z1);x2=Math.max(x2,o.x2);z2=Math.max(z2,o.z2)}
 if(!isFinite(x1))return {x:0,z:0,w:6000,h:5000};
 return {x:x1,z:z1,w:x2-x1,h:z2-z1}}
function planTotals(){const rs=(S.rooms||[]);const b=planBBox();
 return {n:rs.length,area:rs.reduce((a,r)=>a+r.w*r.l/1e6,0),w:b.w,h:b.h}}
const plOverlaps=(r,plan)=>{const was=r.plan;r.plan=plan;const a=planOuter(r);r.plan=was;
 return (S.rooms||[]).some(o=>{if(o===r||!o.plan)return false;const b=planOuter(o);
  return a.x1<b.x2-1&&b.x1<a.x2-1&&a.z1<b.z2-1&&b.z1<a.z2-1})};
/** A spot for a room that has none: beside the room it came from if that
 *  is free (the usual "next room along" case), else clear of everything. */
function planSpotFor(r,near){
 if(near&&near.plan){const i=planInner(near),T=Math.max(near.t,r.t);
  const cand={x:i.x2+T,z:i.z1,rot:0};
  /* planInner is plan space; the origin only equals it at rot 0, which
     is what a fresh room has. */
  if(!plOverlaps(r,cand))return cand}
 const placed=(S.rooms||[]).filter(o=>o!==r&&o.plan);
 if(!placed.length)return {x:0,z:0,rot:0};
 const b=planBBox(placed);return {x:b.x+b.w+PLGAP+r.t,z:b.z+r.t,rot:0}}
/** Give every room a position. Older projects (and any room added from
 *  the wiring step) arrive without one. Returns true if it wrote. */
function planEnsure(){const rs=S.rooms;if(!Array.isArray(rs)||!rs.length)return false;let did=false;
 for(const r of rs){const p=r.plan;
  if(p&&isFinite(p.x)&&isFinite(p.z)){const q=plQt(r);if(p.rot!==q*90){p.rot=q*90;did=true}continue}
  r.plan=planSpotFor(r);did=true}
 return did}

/* ---------- drawing ---------- */
function plOpening(r,it){const k=it.surf,g=wallLocal(r,k),t=r.t,w=iw(it),s0=it.x-w/2,s1=it.x+w/2;
 const P=(s,a)=>planPt(r,g.o[0]+g.d[0]*s-g.n[0]*a,g.o[1]+g.d[1]*s-g.n[1]*a);
 const line=(a,b,col,wd)=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${col}" stroke-width="${wd}" vector-effect="non-scaling-stroke"/>`;
 let o=line(P(s0,0),P(s0,t),PLC.wall,1.2)+line(P(s1,0),P(s1,t),PLC.wall,1.2);
 if(rdef(it).model==='window')return o+line(P(s0,t/2),P(s1,t/2),PLC.wall,1.7);
 /* Door: the leaf stands at the hinge jamb and the arc closes onto the
    other one, both swinging into the room along the inward normal. */
 const hs=String(it.props.hinge||'left')==='left'?s0:s1,js=hs===s0?s1:s0;
 const hl=[g.o[0]+g.d[0]*hs,g.o[1]+g.d[1]*hs];
 const h=planPt(r,hl[0],hl[1]),j=P(js,0),tip=planPt(r,hl[0]+g.n[0]*w,hl[1]+g.n[1]*w);
 /* Sweep flag from the turn direction: positive cross product is
    clockwise on screen, y running down. */
 const cr=(tip[0]-h[0])*(j[1]-h[1])-(tip[1]-h[1])*(j[0]-h[0]);
 o+=line(h,tip,PLC.wall,2.4);
 return o+`<path d="M${tip[0]} ${tip[1]}A${w} ${w} 0 0 ${cr>0?1:0} ${j[0]} ${j[1]}" fill="none" stroke="${PLC.thin}" stroke-width="1.1" vector-effect="non-scaling-stroke"/>`}
function plPoint(r,it,u){const d=rdef(it);
 /* The board is drawn as a box rather than a dot, so it has to sit clear
    of the wall it is on — hence the bigger inset. */
 const p=planItemPt(r,it,it.type==='db'&&it.surf!=='ceil'?270:null);
 if(it.type==='db'){const s=170;
  return `<rect x="${p[0]-s}" y="${p[1]-s*0.75}" width="${s*2}" height="${s*1.5}" rx="${s*0.2}" fill="#1c1c1e"/>`+
   `<text x="${p[0]}" y="${p[1]+s*0.34}" font-size="${s*0.9}" font-weight="800" fill="#ffd60a" text-anchor="middle">DB</text>`}
 const col=PLDOT[it.type]||(d.surf==='ceil'?'#e9a200':'#c05621'),rr=Math.max(45,9*u);
 return `<circle cx="${p[0]}" cy="${p[1]}" r="${rr}" fill="${col}" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`}
function drawPlan(){if(appMode!=='plan')return;planEnsure();planPrune();
 const rs=(S.rooms||[]).filter(r=>r.plan),s=pview.k*PLS,u=1/s,dims=settings.plDims!==false;
 plw.setAttribute('transform',`translate(${pview.x},${pview.y}) scale(${s})`);
 const b=planBBox();let dec='',hit='',hnd='';
 const ln=(x1,y1,x2,y2,c,w=1,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" vector-effect="non-scaling-stroke"${dash?` stroke-dasharray="${dash}"`:''}/>`;
 const fill=(pts,c)=>`<polygon points="${plPoly(pts)}" fill="${c}"/>`;
 // grid: metre lines over the whole floor, 100 mm once they can be told apart
 const step=100*s>=6?100:1000,pad=2000;
 const gx0=Math.floor((b.x-pad)/1000)*1000,gx1=Math.ceil((b.x+b.w+pad)/1000)*1000;
 const gz0=Math.floor((b.z-pad)/1000)*1000,gz1=Math.ceil((b.z+b.h+pad)/1000)*1000;
 for(let x=gx0;x<=gx1;x+=step)dec+=ln(x,gz0,x,gz1,x%1000?PLC.grid:PLC.grid5);
 for(let z=gz0;z<=gz1;z+=step)dec+=ln(gx0,z,gx1,z,z%1000?PLC.grid:PLC.grid5);
 // floors, then every wall as one dark layer, then the openings cut out of it
 for(const r of rs)dec+=fill([[0,0],[r.w,0],[r.w,r.l],[0,r.l]].map(p=>planPt(r,p[0],p[1])),PLC.paper);
 for(const r of rs)for(const k of WALL_KEYS)dec+=fill(wallPoly(r,k,-r.t,plWallLen(r,k)+r.t),PLC.wall);
 const opens=[];
 for(const r of rs)for(const it of r.items){if(!rdef(it).opening||it.surf==='ceil')continue;opens.push([r,it]);
  dec+=fill(wallPoly(r,it.surf,it.x-iw(it)/2,it.x+iw(it)/2),PLC.paper)}
 for(const [r,it] of opens)dec+=plOpening(r,it);
 // the wiring, projected down — off by default; a plan is about the rooms
 if(settings.plRuns===true)for(const r of rs){let runs=[];try{runs=withRoom(r,()=>roomRuns())}catch(e){}
  for(const g of runs){const d=g.pts.map((p,i)=>{const q=planPt(r,p[0],p[2]);return `${i?'L':'M'}${q[0]} ${q[1]}`}).join(' ');
   dec+=`<path d="${d}" fill="none" stroke="${RUN_COLOR[g.kind]}" stroke-width="1.7" stroke-linejoin="round" opacity=".55" vector-effect="non-scaling-stroke"/>`}}
 if(settings.plPts!==false)for(const r of rs)for(const it of r.items){if(rdef(it).opening)continue;dec+=plPoint(r,it,u)}
 // names and sizes
 for(const r of rs){const c=planCentre(r),fs=13*u,pts=r.items.filter(i=>!rdef(i).opening).length;
  dec+=halo(c[0],c[1]-3*u,r.name,fs,'#1f2933');
  dec+=halo(c[0],c[1]+fs,`${(r.w/1000).toFixed(2)} × ${(r.l/1000).toFixed(2)} m · ${(r.w*r.l/1e6).toFixed(1)} m²`,11*u,'#6b7075');
  if(pts)dec+=halo(c[0],c[1]+fs+13*u,`${pts} point${pts===1?'':'s'}`,10*u,PLC.muted)}
 // overall extent
 if(dims&&rs.length){dec+=dimLine(b.x,b.z+b.h+56*u,b.x+b.w,b.z+b.h+56*u,(b.w/1000).toFixed(2)+' m',u,PLC.muted)
  +dimLine(b.x-56*u,b.z,b.x-56*u,b.z+b.h,(b.h/1000).toFixed(2)+' m',u,PLC.muted)}
 // selection
 const selR=psel&&psel.k==='room'?roomById(psel.id):null;
 const selI=psel&&psel.k==='item'?(roomById(psel.room)||{items:[]}).items.find(i=>i.id===psel.id):null;
 if(selR){const m=selR.t+60;
  dec+=`<polygon points="${plPoly([[-m,-m],[selR.w+m,-m],[selR.w+m,selR.l+m],[-m,selR.l+m]].map(p=>planPt(selR,p[0],p[1])))}" fill="none" stroke="${PLC.sel}" stroke-width="2" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/>`;
  /* Both dimensions run just INSIDE walls A and D. Outside them is where
     a neighbouring room is once two rooms share a wall, and a dimension
     drawn in someone else's room reads as that room's. */
  if(dims){const gA=wallLocal(selR,'A'),gD=wallLocal(selR,'D'),off=56*u;
   const P=(g,s)=>planPt(selR,g.o[0]+g.d[0]*s+g.n[0]*off,g.o[1]+g.d[1]*s+g.n[1]*off);
   const a0=P(gA,0),a1=P(gA,selR.w),d0=P(gD,0),d1=P(gD,selR.l);
   dec+=dimLine(a0[0],a0[1],a1[0],a1[1],String(Math.round(selR.w)),u)+dimLine(d0[0],d0[1],d1[0],d1[1],String(Math.round(selR.l)),u)}
  /* Handles go in their own layer, added after the room and opening hit
     shapes: in SVG the last element painted is the one a tap lands on,
     and a handle sits over its room. */
  for(const k of WALL_KEYS){const p=plHandlePt(selR,k),hs=13*u,big=21*u;
   hnd+=`<rect data-ph="${k}" x="${p[0]-big}" y="${p[1]-big}" width="${big*2}" height="${big*2}" fill="#000" fill-opacity="0"/>`
    +`<rect data-ph="${k}" x="${p[0]-hs}" y="${p[1]-hs}" width="${hs*2}" height="${hs*2}" rx="${hs*0.4}" fill="#fff" stroke="${PLC.sel}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`}}
 if(selI){const r=roomById(psel.room),w=iw(selI),g=wallLocal(r,selI.surf),len=plWallLen(r,selI.surf),off=r.t+26*u;
  dec+=`<polygon points="${plPoly(wallPoly(r,selI.surf,selI.x-w/2,selI.x+w/2,-8*u,r.t+8*u))}" fill="none" stroke="${PLC.sel}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`;
  if(dims){const P=s2=>planPt(r,g.o[0]+g.d[0]*s2-g.n[0]*off,g.o[1]+g.d[1]*s2-g.n[1]*off);
   const e0=P(0),l0=P(selI.x-w/2),l1=P(selI.x+w/2),e1=P(len);
   dec+=dimLine(e0[0],e0[1],l0[0],l0[1],String(Math.round(selI.x-w/2)),u)+dimLine(l0[0],l0[1],l1[0],l1[1],String(Math.round(w)),u)
    +dimLine(l1[0],l1[1],e1[0],e1[1],String(Math.round(len-selI.x-w/2)),u)}}
 // hit targets: rooms first, openings over them, handles last
 for(const r of rs)hit+=`<polygon data-pr="${esc(r.id)}" points="${plPoly(outerPts(r))}" fill="#000" fill-opacity="0"/>`;
 for(const [r,it] of opens)hit+=`<polygon data-pi="${esc(it.id)}" data-pir="${esc(r.id)}" points="${plPoly(wallPoly(r,it.surf,it.x-iw(it)/2-10*u,it.x+iw(it)/2+10*u,-14*u,r.t+14*u))}" fill="#000" fill-opacity="0"/>`;
 plw.innerHTML=`<g pointer-events="none">${dec}</g>${hit}${hnd}`}
function plHandlePt(r,k){const g=wallLocal(r,k),len=plWallLen(r,k),off=r.t+220;
 return planPt(r,g.o[0]+g.d[0]*len/2-g.n[0]*off,g.o[1]+g.d[1]*len/2-g.n[1]*off)}

/* ---------- enter / leave / refresh ---------- */
function planEnter(boot){ensureRooms();if(planEnsure())save();psel=null;if(!boot)planFit()}
function planLeave(){psel=null}
function planReset(){psel=null}
function planPrune(){if(!psel)return;
 if(psel.k==='room'&&!roomById(psel.id))psel=null;
 else if(psel.k==='item'){const r=roomById(psel.room);if(!r||!r.items.some(i=>i.id===psel.id))psel=null}}
function planRefresh(refit){if(appMode!=='plan')return;ensureRooms();planEnsure();if(refit)planFit();else drawPlan()}
function planCommit(){save();drawPlan();updUI()}
function planFit(){const a=r2Area(),b=planBBox(),m=Math.max(900,Math.max(b.w,b.h)*0.08);
 const k=clamp(Math.min(a.w/((b.w+2*m)*PLS),a.h/((b.h+2*m)*PLS)),.015,6);pview.k=k;const s=k*PLS;
 pview.x=a.x+(a.w-b.w*s)/2-b.x*s;pview.y=a.y+(a.h-b.h*s)/2-b.z*s;drawPlan()}
function planSelect(p){psel=p||null;if(p&&p.k==='room'&&S.roomId!==p.id)switchRoom(p.id);
 else if(p&&p.k==='item'&&S.roomId!==p.room)switchRoom(p.room);
 drawPlan();updUI()}

/* ---------- actions ---------- */
function planAddRoom(props,quiet){ensureRooms();pushUndo();
 const near=psel&&psel.k==='room'?roomById(psel.id):RM();
 const r=normRoom(Object.assign({name:'Room '+((S.rooms||[]).length+1)},props||{}));
 r.plan=planSpotFor(r,near);S.rooms.push(r);S.roomId=r.id;rsel=null;psel={k:'room',id:r.id};
 if(appMode==='plan')planCommit();else{save();updUI()}
 if(!quiet)toast(`Added ${r.name} — drag it into place`);return r}
function planDupRoom(id){const src=roomById(id);if(!src)return;pushUndo();
 const c=cloneRoom(src);c.plan=planSpotFor(c,src);S.rooms.push(c);S.roomId=c.id;rsel=null;psel={k:'room',id:c.id};
 if(appMode==='plan')planCommit();else{save();updUI()}
 toast(`Copied to ${c.name}`)}
function planDelRoom(id){const r=roomById(id);if(!r)return;
 if((S.rooms||[]).length<2)return toast('A project keeps at least one room');
 if(!confirm(`Delete "${r.name}" and everything in it?`))return;
 pushUndo();S.rooms=S.rooms.filter(x=>x.id!==r.id);
 if(S.roomId===r.id){S.roomId=S.rooms[0].id;rsel=null}
 psel=null;if(appMode==='plan')planCommit();else{save();updUI()}}
/** Turn a room a quarter turn about its own centre, so it stays where it
 *  looks like it is instead of swinging off across the plan. */
function planRotate(id,dir){const r=roomById(id);if(!r||!r.plan)return;pushUndo();
 const c0=planCentre(r);r.plan.rot=(((plQt(r)+(dir||1))%4)+4)%4*90;
 const c1=planCentre(r);r.plan.x=Math.round(r.plan.x+c0[0]-c1[0]);r.plan.z=Math.round(r.plan.z+c0[1]-c1[1]);
 planCommit()}
function planFlipDoor(){const r=psel&&roomById(psel.room),it=r&&r.items.find(i=>i.id===psel.id);if(!it)return;
 pushUndo();it.props.hinge=String(it.props.hinge||'left')==='left'?'right':'left';planCommit()}
function planDelOpening(){const r=psel&&roomById(psel.room);if(!r)return;const id=psel.id;
 pushUndo();r.items=r.items.filter(i=>i.id!==id);psel=null;planCommit()}
function planGoWiring(){const r=psel&&psel.k==='room'?roomById(psel.id):RM();if(!r)return;
 if(S.roomId!==r.id)switchRoom(r.id);setAppMode('wiring');toast('Wiring '+r.name)}
const plPick=(v,cands,tol,step)=>{let best=null,bd=tol;
 for(const c of cands){const d=Math.abs(v-c);if(d<bd){bd=d;best=c}}
 return best!=null?best:Math.round(v/step)*step};
/** Move a room, snapping so a wall it is pushed against is SHARED: the
 *  gap between the two inner faces becomes one wall thickness, which
 *  puts both wall strips in the same place. Also snaps faces flush, for
 *  rooms in a row. */
function planMoveTo(r,x,z){const s=pview.k*PLS,tol=14/s,step=settings.snap?50:1;
 const i0=planInner(r),dx=i0.x1-r.plan.x,dz=i0.z1-r.plan.z,w=i0.x2-i0.x1,h=i0.z2-i0.z1;
 /* Where it already is counts as a candidate, so a neighbour's wall that
    happens to be within the snap distance can't drag the room off its
    spot before the finger has really moved. */
 const xs=[i0.x1],zs=[i0.z1];
 for(const o of S.rooms){if(o===r||!o.plan)continue;const q=planInner(o),T=Math.max(o.t,r.t);
  xs.push(q.x2+T,q.x1-T-w,q.x1,q.x2-w);zs.push(q.z2+T,q.z1-T-h,q.z1,q.z2-h)}
 r.plan.x=Math.round(plPick(x+dx,xs,tol,step)-dx);
 r.plan.z=Math.round(plPick(z+dz,zs,tol,step)-dz)}
/** Inner-face coordinates of the other rooms, expressed on this room's
 *  local x or z axis, so a wall being dragged can snap to a neighbour. */
function plEdgeCands(r,ax,g){const q=plQt(r),c=PLQ[q][0],sn=PLQ[q][1];
 const dir=ax==='x'?[c,sn]:[-sn,c],horiz=Math.abs(dir[0])>0.5;
 const o=horiz?g.x0:g.z0,sg=horiz?dir[0]:dir[1],out=[];
 for(const p of S.rooms){if(p===r||!p.plan)continue;const i=planInner(p),T=Math.max(p.t,r.t);
  for(const v of (horiz?[i.x1,i.x2,i.x1-T,i.x2+T]:[i.z1,i.z2,i.z1-T,i.z2+T]))out.push((v-o)*sg)}
 return out}
/** Pointer → local coords about a given plan origin and rotation. */
function planLocalAt(r,x,z,x0,z0){const q=plQt(r),c=PLQ[q][0],sn=PLQ[q][1];
 const ox=x-(x0==null?r.plan.x:x0),oz=z-(z0==null?r.plan.z:z0);
 return [ox*c+oz*sn,-ox*sn+oz*c]}
/** Drag one wall. A and D also move the origin, so everything is measured
 *  from where the gesture started rather than from the live values. The
 *  handle sits clear of the wall, so the grab offset is taken out — the
 *  wall follows the finger instead of jumping to it. */
function planResize(r,g,pt){const q=plQt(r),c=PLQ[q][0],sn=PLQ[q][1];
 const L=planLocalAt(r,pt.x,pt.z,g.x0,g.z0),lx=L[0]-g.ox,lz=L[1]-g.oz;
 const s=pview.k*PLS,tol=14/s,step=settings.snap?50:10;
 let w=g.w0,l=g.l0,ax=0,az=0;
 /* The wall's own position leads the candidates for the same reason as
    in planMoveTo: no jump until the finger has moved. */
 const cx=cur=>[cur].concat(plEdgeCands(r,'x',g)),cz=cur=>[cur].concat(plEdgeCands(r,'z',g));
 if(g.wall==='B')w=clamp(plPick(lx,cx(g.w0),tol,step),1000,30000);
 else if(g.wall==='C')l=clamp(plPick(lz,cz(g.l0),tol,step),1000,30000);
 else if(g.wall==='D'){const v=clamp(plPick(lx,cx(0),tol,step),g.w0-30000,g.w0-1000);w=g.w0-v;ax=v}
 else if(g.wall==='A'){const v=clamp(plPick(lz,cz(0),tol,step),g.l0-30000,g.l0-1000);l=g.l0-v;az=v}
 r.w=Math.round(w);r.l=Math.round(l);
 r.plan.x=Math.round(g.x0+ax*c-az*sn);r.plan.z=Math.round(g.z0+ax*sn+az*c);
 withRoom(r,()=>r.items.forEach(clampItem))}
/** Pointer → the nearest wall of a room and how far along it, which is
 *  all a door or window needs: dragging one across a corner simply
 *  re-homes it on the other wall. */
function planNearestWall(r,x,z){let best=null;
 for(const k of WALL_KEYS){const g=wallLocal(r,k),len=plWallLen(r,k);
  const o=planPt(r,g.o[0],g.o[1]),e=planPt(r,g.o[0]+g.d[0]*len,g.o[1]+g.d[1]*len);
  const ux=(e[0]-o[0])/len,uz=(e[1]-o[1])/len;
  const t=clamp((x-o[0])*ux+(z-o[1])*uz,0,len),px=o[0]+ux*t,pz=o[1]+uz*t;
  const d=Math.hypot(x-px,z-pz);if(!best||d<best.d)best={k,t,d}}
 return best}

/* ---------- top bar ---------- */
function planUpdUI(){ensureRooms();planEnsure();planPrune();
 const rs=S.rooms||[],T=planTotals(),tabs=$('#roomTabs');
 const tg=(k,t,on)=>`<button class="rtb ${on?'on2':''}" data-pt="${k}">${t}</button>`;
 tabs.innerHTML=`<button class="rtb on" data-pt="add">+ Room</button><span class="rtsep"></span>`+
  tg('dims','Dimensions',settings.plDims!==false)+tg('pts','Points',settings.plPts!==false)+tg('runs','Cables',settings.plRuns===true)+
  `<button class="rtb" data-pt="rooms">🏠 Rooms${rs.length>1?` <small>${rs.length}</small>`:''}</button>`;
 const sb=$('#selbar');let html='';
 const r=psel&&psel.k==='room'?roomById(psel.id):null;
 const ro=psel&&psel.k==='item'?roomById(psel.room):null,it=ro&&ro.items.find(i=>i.id===psel.id);
 if(r){const pts=r.items.filter(i=>!rdef(i).opening).length;
  html=`<div class="ttl">${esc(r.name)}<small>${(r.w/1000).toFixed(2)} × ${(r.l/1000).toFixed(2)} m · ${(r.w*r.l/1e6).toFixed(1)} m² · ${pts} point${pts===1?'':'s'}</small></div>`+
   `<button class="bb pri" data-pa="wire">Wire this room →</button><button class="bb" data-pa="edit">Edit</button><button class="bb" data-pa="rot">Rotate</button>`+
   `<button class="bb" data-pa="dup">Copy</button><button class="bb danger" data-pa="del">Delete</button><button class="bb" data-pa="close">✕</button>`}
 else if(it){const w=iw(it);
  html=`<div class="ttl">${esc(rname(it))}<small>${esc(ro.name)} · ${esc(surfNameOf(ro,it.surf))} · ${Math.round(it.x)} from the left end · ${Math.round(w)} wide</small></div>`+
   `<button class="bb" data-pa="iedit">Edit</button>${rdef(it).model==='door'?'<button class="bb" data-pa="flip">Flip</button>':''}`+
   `<button class="bb danger" data-pa="idel">Delete</button><button class="bb" data-pa="close">✕</button>`}
 sb.innerHTML=html;sb.classList.toggle('hidden',!html);
 $('#titleChip').classList.toggle('hidden',!!html);
 $('#titleChip').innerHTML=`Floor plan<small>${T.n} room${T.n===1?'':'s'} · ${T.area.toFixed(1)} m² · ${(T.w/1000).toFixed(1)} × ${(T.h/1000).toFixed(1)} m · v${APP_VERSION}</small>`}
/** surfName() in room.js reads the current room; the plan talks about
 *  rooms it is not editing. */
const surfNameOf=(r,k)=>k==='ceil'?'Ceiling':`Wall ${k}${r.walls&&r.walls[k]?' ('+r.walls[k]+')':''}`;
$('#roomTabs').addEventListener('click',e=>{if(appMode!=='plan')return;const b=e.target.closest('[data-pt]');if(!b)return;
 const a=b.dataset.pt,fl=k=>{settings[k]=settings[k]===false;saveSettings();planRefresh();updUI()};
 if(a==='add')planAddRoom();
 else if(a==='dims')fl('plDims');
 else if(a==='pts')fl('plPts');
 else if(a==='runs'){settings.plRuns=settings.plRuns!==true;saveSettings();planRefresh();updUI()}
 else if(a==='rooms')openRooms()});
$('#selbar').addEventListener('click',e=>{if(appMode!=='plan')return;const b=e.target.closest('[data-pa]');if(!b)return;
 const a=b.dataset.pa;
 if(a==='wire')return planGoWiring();
 if(a==='edit')return openRoomSettings();
 if(a==='rot')return planRotate(psel.id,1);
 if(a==='dup')return planDupRoom(psel.id);
 if(a==='del')return planDelRoom(psel.id);
 if(a==='iedit')return openRoomProps(psel.id);
 if(a==='flip')return planFlipDoor();
 if(a==='idel')return planDelOpening();
 if(a==='close')return planSelect(null)});

/* ---------- gestures: pan / pinch / move room / resize wall / slide opening ---------- */
const plp=new Map();let plg=null,plq=0;
const plWorld=(cx,cy)=>{const s=pview.k*PLS;return {x:(cx-pview.x)/s,z:(cy-pview.y)/s}};
function plSoon(){if(plq)return;plq=requestAnimationFrame(()=>{plq=0;drawPlan()})}
pl2.addEventListener('pointerdown',e=>{if(e.isPrimary&&plp.size){plp.clear();plg=null}
 try{pl2.setPointerCapture(e.pointerId)}catch(_){}
 plp.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(plp.size===2){if(plg&&plg.moved&&plg.type!=='pan')planCommit();const [a,b]=[...plp.values()];
  plg={type:'pinch',d0:dist(a,b),m0:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},v0:{...pview},moved:true};return}
 const t=e.target.closest('[data-ph],[data-pi],[data-pr]'),w=plWorld(e.clientX,e.clientY);
 plg={type:'pan',sx:e.clientX,sy:e.clientY,v0:{...pview},moved:false,slop:e.pointerType==='touch'?10:5};
 if(!t)return;const d=t.dataset;
 if(d.ph&&psel&&psel.k==='room'){const r=roomById(psel.id);
  if(r&&r.plan){const L=planLocalAt(r,w.x,w.z);
   /* Grab offset: how far the finger is from the wall it is dragging,
      measured on the axis that wall moves along. */
   Object.assign(plg,{type:'size',id:r.id,wall:d.ph,w0:r.w,l0:r.l,x0:r.plan.x,z0:r.plan.z,
    ox:L[0]-(d.ph==='B'?r.w:0),oz:L[1]-(d.ph==='C'?r.l:0)})}}
 else if(d.pi){const r=roomById(d.pir),it=r&&r.items.find(i=>i.id===d.pi);
  const n=r&&it?planNearestWall(r,w.x,w.z):null;
  Object.assign(plg,{type:'open',id:d.pi,room:d.pir,surf0:it?it.surf:'',along:n&&n.k===(it&&it.surf)?n.t-it.x:0})}
 else if(d.pr){const r=roomById(d.pr);if(r&&r.plan)Object.assign(plg,{type:'move',id:r.id,off:{x:w.x-r.plan.x,z:w.z-r.plan.z}})}});
pl2.addEventListener('pointermove',e=>{if(!plp.has(e.pointerId)||!plg)return;plp.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(plg.type==='pinch'){if(plp.size<2)return;const [a,b]=[...plp.values()],v=plg.v0;
  const k=clamp(v.k*dist(a,b)/plg.d0,.015,6),s0=v.k*PLS,s=k*PLS;
  const wx=(plg.m0.x-v.x)/s0,wy=(plg.m0.y-v.y)/s0,m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  pview.k=k;pview.x=m.x-wx*s;pview.y=m.y-wy*s;plSoon();return}
 const dx=e.clientX-plg.sx,dy=e.clientY-plg.sy;
 if(!plg.moved){if(Math.hypot(dx,dy)<plg.slop)return;plg.moved=true;
  if(plg.type!=='pan'){pushUndo();planSelect(plg.type==='open'?{k:'item',id:plg.id,room:plg.room}:{k:'room',id:plg.id})}}
 if(plg.type==='pan'){pview.x=plg.v0.x+dx;pview.y=plg.v0.y+dy;plSoon();return}
 const w=plWorld(e.clientX,e.clientY);
 if(plg.type==='move'){const r=roomById(plg.id);if(!r||!r.plan)return;planMoveTo(r,w.x-plg.off.x,w.z-plg.off.z);plSoon();updUI()}
 else if(plg.type==='size'){const r=roomById(plg.id);if(!r||!r.plan)return;planResize(r,plg,w);plSoon();updUI()}
 else if(plg.type==='open'){const r=roomById(plg.room),it=r&&r.items.find(i=>i.id===plg.id);if(!it)return;
  const n=planNearestWall(r,w.x,w.z);
  /* The grab offset only means anything while it is the same wall; round
     a corner and the opening simply centres on the finger. */
  const along=n.k===plg.surf0?n.t-plg.along:n.t;
  /* Same idea as the wiring step: how fine the step is follows the zoom,
     so a door can be placed to the millimetre when you are in close. */
  const st=pview.k*PLS>=0.45?10:50;
  it.surf=n.k;it.x=settings.snap?Math.round(along/st)*st:Math.round(along);
  withRoom(r,()=>clampItem(it));plSoon();updUI()}});
function plEnd(e,cancel){if(!plp.has(e.pointerId))return;plp.delete(e.pointerId);if(!plg)return;const g=plg;
 if(g.type==='pinch'){plg=plp.size?{type:'none',moved:true}:null;return}
 if(g.type==='none'){if(!plp.size)plg=null;return}
 plg=null;
 try{
  if(!g.moved&&!cancel){
   if(g.type==='open'){const again=psel&&psel.k==='item'&&psel.id===g.id;planSelect({k:'item',id:g.id,room:g.room});if(again)openRoomProps(g.id)}
   else if(g.type==='move'){const again=psel&&psel.k==='room'&&psel.id===g.id;planSelect({k:'room',id:g.id});if(again)openRoomSettings()}
   else if(g.type==='pan')planSelect(null)}
  else if(g.moved&&g.type!=='pan')planCommit()}catch(err){reportError(err)}}
pl2.addEventListener('pointerup',e=>plEnd(e,false));
pl2.addEventListener('pointercancel',e=>plEnd(e,true));
pl2.addEventListener('lostpointercapture',e=>{if(plp.has(e.pointerId))plEnd(e,true)});
pl2.addEventListener('wheel',e=>{e.preventDefault();const f=Math.exp(-e.deltaY*.0015),k=clamp(pview.k*f,.015,6);
 const s0=pview.k*PLS,s=k*PLS,wx=(e.clientX-pview.x)/s0,wy=(e.clientY-pview.y)/s0;
 pview.k=k;pview.x=e.clientX-wx*s;pview.y=e.clientY-wy*s;plSoon()},{passive:false});
function planKey(e,k,c){
 if(k==='escape'){planSelect(null);return true}
 if(c&&k==='d'&&psel&&psel.k==='room'){e.preventDefault();planDupRoom(psel.id);return true}
 if((k==='delete'||k==='backspace')&&psel){e.preventDefault();psel.k==='room'?planDelRoom(psel.id):planDelOpening();return true}
 if(k==='r'&&!c&&psel&&psel.k==='room'){planRotate(psel.id,e.shiftKey?-1:1);return true}
 if(k.startsWith('arrow')&&psel&&psel.k==='room'){const r=roomById(psel.id);if(!r||!r.plan)return false;
  e.preventDefault();const d=e.shiftKey?10:50;
  pushUndo();r.plan.x+=(k==='arrowleft'?-d:k==='arrowright'?d:0);r.plan.z+=(k==='arrowup'?-d:k==='arrowdown'?d:0);
  planCommit();return true}
 return false}

/* ---------- library (the bottom sheet in plan mode) ---------- */
const PLAN_LIB=[
 {tab:'Rooms',groups:[{g:'Add a room',items:[
  ['room',{w:3000,l:3000},'3.0 × 3.0 m'],['room',{w:3600,l:3000},'3.6 × 3.0 m'],['room',{w:4200,l:3600},'4.2 × 3.6 m'],
  ['room',{w:5000,l:4000},'5.0 × 4.0 m'],['room',{w:2400,l:1800},'Bathroom'],['room',{w:1200,l:4800},'Corridor'],
  ['room',{w:6000,l:5000,h:3000},'Hall 6 × 5'],['room',{w:9000,l:7000,h:4500,t:200},'Workshop']]}]},
 {tab:'Doors & windows',groups:[
  {g:'Doors',items:[['door',{width:700},'Door 700'],['door',{width:800},'Door 800'],['door',{},'Door 900'],
   ['door',{width:1000},'Door 1000'],['door',{width:1200,hinge:'right'},'Door 1200']]},
  {g:'Windows',items:[['win',{width:600,height:600},'Window 600'],['win',{width:900},'Window 900'],['win',{},'Window 1200'],
   ['win',{width:1500},'Window 1500'],['win',{width:1800},'Window 1800'],['win',{width:2400,height:1500},'Window 2400']]}]}
];
function planThumb(type,props){
 if(type==='room'){const w=+props.w||3600,l=+props.l||3000;
  /* Thickness scaled to the room, or a narrow corridor comes out as a
     dark bar with a sliver of floor in it. */
  const t=clamp(Math.min(w,l)*0.05,80,200),m=t+Math.max(w,l)*0.04;
  return `<svg viewBox="${-m} ${-m} ${w+2*m} ${l+2*m}" preserveAspectRatio="xMidYMid meet">`+
   `<rect x="${-t}" y="${-t}" width="${w+2*t}" height="${l+2*t}" fill="${PLC.wall}"/><rect x="0" y="0" width="${w}" height="${l}" fill="${PLC.paper}"/></svg>`}
 const d=RDEFS[type],w=+(props.width||d.defaults.width),t=150,L=w*1.9,x0=(L-w)/2,x1=x0+w,dp=type==='door'?w:0;
 let g=`<rect x="0" y="0" width="${L}" height="${t}" fill="${PLC.wall}"/><rect x="${x0}" y="0" width="${w}" height="${t}" fill="${PLC.paper}"/>`;
 g+=type==='door'
  ?`<path d="M${x0} ${t}L${x0} ${t+w}" stroke="${PLC.wall}" stroke-width="${t*0.45}" stroke-linecap="round"/>`+
   `<path d="M${x0} ${t+w}A${w} ${w} 0 0 0 ${x1} ${t}" fill="none" stroke="${PLC.thin}" stroke-width="${t*0.26}"/>`
  :`<line x1="${x0}" y1="${t/2}" x2="${x1}" y2="${t/2}" stroke="${PLC.wall}" stroke-width="${t*0.34}"/>`;
 return `<svg viewBox="${-40} ${-40} ${L+80} ${t+dp+80}" preserveAspectRatio="xMidYMid meet">${g}</svg>`}
/** The library's add button. Rooms land beside the selected one; a door
 *  or window goes on the selected room and is then dragged onto the wall
 *  it belongs to — the drag re-homes it, corners included. */
function planAdd(type,props,title){
 if(type==='room')return planAddRoom(props);
 const r=psel&&psel.k==='room'?roomById(psel.id):RM();if(!r)return toast('Add a room first');
 if(S.roomId!==r.id)switchRoom(r.id);
 pushUndo();const d=RDEFS[type];
 const it={id:uid(),type,surf:'A',x:r.w/2,y:0,props:Object.assign({},d.defaults,props)};
 it.y=d.model==='door'?ih(it)/2:d.mount;
 withRoom(r,()=>clampItem(it));r.items.push(it);
 psel={k:'item',id:it.id,room:r.id};rsel=it.id;planCommit();
 toast(`Added ${title} to ${r.name} — drag it onto a wall`)}

/* ---------- export ---------- */
function planExport(asSvg){const rs=(S.rooms||[]).filter(r=>r.plan);if(!rs.length)return toast('Nothing to export');
 const keepV={...pview},keepS=psel,keepD=settings.plDims;
 psel=null;settings.plDims=true;
 const b=planBBox(),ext=Math.max(b.w,b.h,4000);
 /* Text is sized in screen units, so the export scale decides how big
    the labels come out — tie it to the floor's size, not to the zoom the
    user happens to be at. */
 pview={x:0,y:0,k:clamp(12000/ext,.02,6)};drawPlan();
 /* The drawing only: the layers after it are invisible tap targets. */
 const inner=plw.firstElementChild?plw.firstElementChild.innerHTML:plw.innerHTML;
 pview=keepV;psel=keepS;settings.plDims=keepD;drawPlan();
 const T=planTotals(),pad=Math.max(900,ext*0.1);
 const x=b.x-pad,y=b.z-pad,w=b.w+pad*2,h=b.h+pad*2.6;
 const sc=clamp(3000/w,.03,.8),nm=`${fname()}-floor-plan`;
 const foot=`${S.name} — floor plan · ${T.n} room${T.n===1?'':'s'} · ${T.area.toFixed(1)} m² · DB Panel Designer v${APP_VERSION}`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w*sc)}" height="${Math.round(h*sc)}" viewBox="${x} ${y} ${w} ${h}">`+
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><g font-family="Arial,Helvetica,sans-serif">${inner}</g>`+
  `${txt(x+pad*0.3,y+h-pad*0.4,foot,ext*0.013,'#59626a',700,'start')}</svg>`;
 if(asSvg)return shareOrDownload(new Blob([svg],{type:'image/svg+xml'}),nm+'.svg');
 const img=new Image();
 img.onload=()=>{const c=document.createElement('canvas'),k=clamp(4000/(w*sc),1,3);
  c.width=Math.round(w*sc*k);c.height=Math.round(h*sc*k);
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
  c.toBlob(bl=>bl?shareOrDownload(bl,nm+'.png'):toast('Export failed'),'image/png')};
 img.onerror=()=>toast('Export failed');
 img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
