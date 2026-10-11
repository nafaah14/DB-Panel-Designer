'use strict';
/* =========================================================
   DB Panel Designer  v1.0.0
   Single-file vanilla JS · localStorage · no dependencies
   Scale: 2 px = 1 mm  (1 DIN module = 18 mm = 36 px)
   ========================================================= */
const APP_VERSION='2.3.0';
const U=18, M=36, RP=14, RAIL_H=70, DH=180, STUB=22;
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,10);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/* ---------- storage ---------- */
const LS_P='pdes.projects.v1', LS_C='pdes.current', LS_SET='pdes.settings';
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
function loadProjects(){try{return JSON.parse(lsGet(LS_P))||{}}catch(e){return {}}}
function saveProjects(P){if(!lsSet(LS_P,JSON.stringify(P)))toast('Could not save — storage unavailable or full')}
let settings=Object.assign({mode:'panel',scheme:'redblue',snap:true,labels:true,wireColor:'auto',wireSize:2.5},(()=>{try{return JSON.parse(lsGet(LS_SET))||{}}catch(e){return {}}})());
function saveSettings(){lsSet(LS_SET,JSON.stringify(settings))}

/* ---------- colours ---------- */
const SCHEMES={
 redblue:{name:'Red L / Blue N',L:'#d62828',L1:'#d62828',L2:'#e9b800',L3:'#1d1d1f',N:'#1f5fd6',PE:'gy'},
 iec:{name:'IEC 60445 (Brown / Black / Grey, Blue N)',L:'#8a4b1f',L1:'#8a4b1f',L2:'#1d1d1f',L3:'#8c8c8c',N:'#1f5fd6',PE:'gy'},
 legacy:{name:'Legacy (Red / Yellow / Blue, Black N)',L:'#d62828',L1:'#d62828',L2:'#e9b800',L3:'#1f5fd6',N:'#1d1d1f',PE:'gy'}
};
const WIRE_COLORS=[['auto','Auto'],['#d62828','Red'],['#8a4b1f','Brown'],['#1d1d1f','Black'],['#8c8c8c','Grey'],['#e9b800','Yellow'],['#1f5fd6','Blue'],['gy','Green/Yellow'],['#f4f4f4','White'],['#ff8a00','Orange']];
const COLOR_NAME=Object.fromEntries(WIRE_COLORS);
const WIRE_SIZES=[1,1.5,2.5,4,6,10,16,25,35];
const wireW=s=>({1:3,1.5:3.5,2.5:4.5,4:5.5,6:6.5,10:7.5,16:8.5,25:9.5,35:10.5}[s]||4.5);
function col(ph){const sc=SCHEMES[settings.scheme]||SCHEMES.redblue;return sc[ph]||(ph==='C'?'#ff8a00':'#d62828')}

/* ---------- svg helpers ---------- */
const txt=(x,y,s,size=11,fill='#2b2f33',w=700,anchor='middle',fam='Arial,Helvetica,sans-serif')=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" font-family="${fam}">${esc(s)}</text>`;
function screw(x,y,r=8){const q=r*.45;return `<circle cx="${x}" cy="${y}" r="${r}" fill="#d3d8dc" stroke="#727a80" stroke-width="1.4"/><path d="M${x-q},${y-q}L${x+q},${y+q}M${x+q},${y-q}L${x-q},${y+q}" stroke="#4f565c" stroke-width="1.6" stroke-linecap="round"/>`}
function body(w,h,fill='#fbfbf9'){return `<rect x="1" y="1" width="${w-2}" height="${h-2}" rx="4" fill="${fill}" stroke="#8d969c" stroke-width="1.5"/><rect x="4" y="4" width="${w-8}" height="30" rx="2" fill="#eceef0"/><rect x="4" y="${h-34}" width="${w-8}" height="30" rx="2" fill="#eceef0"/>`}
function dividers(w,h,n){let s='';for(let i=1;i<n;i++){const x=w*i/n;s+=`<line x1="${x}" y1="2" x2="${x}" y2="${h-2}" stroke="#c4cacf" stroke-width="1"/>`}return s}
function stroke(d,c,sw){if(c==='gy')return `<path d="${d}" fill="none" stroke="#2e9e3e" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#f2d21b" stroke-width="${sw}" stroke-dasharray="9 9" stroke-linejoin="round"/>`;return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`}
const spread=(n,w)=>Array.from({length:n},(_,i)=>w*(i+.5)/n);
const polePh=n=>n===1?['L']:n===2?['L','N']:n===3?['L1','L2','L3']:['L1','L2','L3','N'];
function poleTerms(phases,w,h,inset=18){const xs=spread(phases.length,w),T=[];phases.forEach((ph,i)=>{T.push({id:'t'+i,x:xs[i],y:inset,dir:-1,ph,lab:String(2*i+1)});T.push({id:'b'+i,x:xs[i],y:h-inset,dir:1,ph,lab:String(2*i+2)})});return T}
function toggle(cx,col1='#34383c',col2='#62686e',wd=22){return `<rect x="${cx-wd/2}" y="70" width="${wd}" height="42" rx="3" fill="${col1}"/><rect x="${cx-wd/2+2}" y="72" width="${wd-4}" height="18" rx="2" fill="${col2}"/>`}
function mcbFront(w,h,n,rt){let s=`<rect x="3" y="40" width="${w-6}" height="7" fill="#e02424"/>`;const mw=w/n;
 for(let i=0;i<n;i++){const cx=mw*i+mw/2;s+=toggle(cx)+`<rect x="${cx-7}" y="120" width="14" height="5" rx="1" fill="#2fa84f"/>`}
 if(n>1)s+=`<rect x="${mw/2}" y="86" width="${w-mw}" height="4" fill="#2a2d30"/>`;
 return s+txt(w/2,148,rt,n===1?10:12)}
function rcdFront(w,h,p){return `<rect x="6" y="42" width="${w-12}" height="20" rx="3" fill="#e2e5e8"/><circle cx="17" cy="52" r="6.5" fill="#fff" stroke="#7b8287"/>${txt(17,55.5,'T',8,'#555')}<rect x="${w-24}" y="50" width="12" height="5" rx="1" fill="#2fa84f"/>${toggle(w/2,'#1658c4','#4d8ff2',30)}${txt(w/2,134,p.rating+'A',10)}${txt(w/2,148,p.ma+'mA',10,'#1658c4')}${txt(w/2,161,'Type '+p.cls,8,'#666',600)}`}

/* ---------- component definitions ---------- */
const P_LABEL={k:'label',label:'Circuit label',type:'text'};
const P_RATING={k:'rating',label:'Rating (A)',type:'select',opts:[0.5,1,2,4,6,10,13,16,20,25,32,40,50,63]};
const P_CURVE={k:'curve',label:'Trip curve',type:'select',opts:['B','C','D']};
const P_MA={k:'ma',label:'Sensitivity IΔn (mA)',type:'select',opts:[10,30,100,300]};
const LAMP={red:'#ff3b30',green:'#34c759',yellow:'#ffcc00',blue:'#2f7cf6',white:'#f6f6f6'};
const LCOL={black:'#1f2933',red:'#d62828',blue:'#1f5fd6',green:'#2e7d32'};
const SUPPH=p=>+p.ph===1?['L','N','PE']:['L1','L2','L3','N','PE'];
const OUTPH={2:['L','N'],3:['L','N','PE'],4:['L1','L2','L3','PE'],5:['L1','L2','L3','N','PE']};
const RD=o=>Object.assign({rail:true,occupy:true,z:3,screw:8,props:[],defaults:{}},o);
const FR=o=>Object.assign({rail:false,z:2,screw:0,props:[],defaults:{},terms:()=>[]},o);
const parseEncl=s=>{const m=String(s).split(/[x×]/).map(Number);return {w:(m[0]||600)*2,h:(m[1]||800)*2}};

const DEFS={
 mcb:RD({name:p=>`MCB ${p.poles}P`,defaults:{poles:1,rating:16,curve:'C',label:''},
  props:[{k:'poles',label:'Poles',type:'select',opts:[1,2,3,4]},P_RATING,P_CURVE,P_LABEL],
  units:p=>p.poles*2,size:p=>({w:p.poles*M,h:DH}),terms:(p,w,h)=>poleTerms(polePh(p.poles),w,h),
  draw:(p,w,h)=>body(w,h)+dividers(w,h,p.poles)+mcbFront(w,h,p.poles,p.curve+p.rating),
  desc:p=>`MCB ${p.poles}P ${p.curve}${p.rating}A`}),
 mcb1pn:RD({name:()=>'MCB 1P+N',screw:6.5,defaults:{rating:16,curve:'C',label:''},props:[P_RATING,P_CURVE,P_LABEL],
  units:()=>2,size:()=>({w:M,h:DH}),terms:(p,w,h)=>poleTerms(['L','N'],w,h),
  draw:(p,w,h)=>body(w,h)+mcbFront(w,h,1,p.curve+p.rating)+txt(w/2,162,'1P+N',7,'#666',600),
  desc:p=>`MCB 1P+N ${p.curve}${p.rating}A`}),
 rcd:RD({name:p=>`RCD ${p.poles}P`,defaults:{poles:2,rating:40,ma:30,cls:'A',label:''},
  props:[{k:'poles',label:'Poles',type:'select',opts:[2,4]},{k:'rating',label:'Rating (A)',type:'select',opts:[25,40,63,80,100]},P_MA,{k:'cls',label:'Type',type:'select',opts:['AC','A','F','B']},P_LABEL],
  units:p=>p.poles===2?4:8,size:p=>({w:(p.poles===2?4:8)*U,h:DH}),terms:(p,w,h)=>poleTerms(polePh(p.poles),w,h),
  draw:(p,w,h)=>body(w,h)+rcdFront(w,h,p),desc:p=>`RCCB ${p.poles}P ${p.rating}A ${p.ma}mA Type ${p.cls}`}),
 rcbo:RD({name:()=>'RCBO 1P+N',defaults:{rating:16,curve:'C',ma:30,mods:2,label:''},props:[P_RATING,P_CURVE,P_MA,{k:'mods',label:'Width (modules)',type:'select',opts:[1,2]},P_LABEL],
  units:p=>2*p.mods,size:p=>({w:p.mods*M,h:DH}),terms:(p,w,h)=>poleTerms(['L','N'],w,h),
  draw:(p,w,h)=>w<50?body(w,h)+mcbFront(w,h,1,p.curve+p.rating)+`<circle cx="${w/2}" cy="58" r="5.5" fill="#fff" stroke="#7b8287"/>`+txt(w/2,61,'T',7,'#555')+txt(w/2,162,p.ma+'mA',8,'#1658c4'):body(w,h)+dividers(w,h,2)+`<rect x="3" y="40" width="${w-6}" height="7" fill="#e02424"/>`+toggle(w/4)+`<circle cx="${w*.75}" cy="80" r="7" fill="#fff" stroke="#7b8287"/>${txt(w*.75,83.5,'T',8,'#555')}<rect x="${w*.75-7}" y="100" width="14" height="5" rx="1" fill="#2fa84f"/>`+txt(w/2,140,p.curve+p.rating,11)+txt(w/2,154,p.ma+'mA',9,'#1658c4'),
  desc:p=>`RCBO 1P+N ${p.curve}${p.rating}A ${p.ma}mA`}),
 isol:RD({name:p=>`Main switch ${p.poles}P`,defaults:{poles:2,rating:63,label:''},
  props:[{k:'poles',label:'Poles',type:'select',opts:[1,2,3,4]},{k:'rating',label:'Rating (A)',type:'select',opts:[32,40,63,80,100,125]},P_LABEL],
  units:p=>p.poles*2,size:p=>({w:p.poles*M,h:DH}),terms:(p,w,h)=>poleTerms(polePh(p.poles),w,h),
  draw:(p,w,h)=>body(w,h,'#f4f4f2')+dividers(w,h,p.poles)+txt(w/2,58,'I – O',9,'#444')+`<rect x="${w/2-w*.36}" y="66" width="${w*.72}" height="50" rx="4" fill="#c62828"/><rect x="${w/2-w*.36+3}" y="69" width="${w*.72-6}" height="20" rx="3" fill="#e85454"/>`+txt(w/2,140,p.rating+'A',11)+txt(w/2,154,'MAIN SW',8,'#666',600),
  desc:p=>`Switch-disconnector ${p.poles}P ${p.rating}A`}),
 spd:RD({name:p=>`SPD ${p.poles}P`,defaults:{poles:2,type:'T2',label:''},
  props:[{k:'poles',label:'Poles',type:'select',opts:[1,2,3,4]},{k:'type',label:'Type',type:'select',opts:['T1+T2','T2','T3']},P_LABEL],
  units:p=>p.poles*2,size:p=>({w:p.poles*M,h:DH}),
  terms:(p,w,h)=>{const ph=polePh(p.poles),xs=spread(ph.length,w);return ph.map((c,i)=>({id:'t'+i,x:xs[i],y:18,dir:-1,ph:c})).concat([{id:'pe',x:w/2,y:h-18,dir:1,ph:'PE'}])},
  draw:(p,w,h)=>{let s=body(w,h);const mw=w/p.poles;for(let i=0;i<p.poles;i++){const x=mw*i;s+=`<rect x="${x+4}" y="40" width="${mw-8}" height="96" rx="3" fill="#d8dce0" stroke="#9aa1a6"/><rect x="${x+mw/2-7}" y="56" width="14" height="10" rx="2" fill="#2fa84f"/>`+txt(x+mw/2,118,'SPD',8,'#555')}return s+txt(w/2,155,p.type,9)},
  desc:p=>`Surge protective device ${p.type} ${p.poles}P`}),
 vrelay:RD({name:()=>'Voltage relay',defaults:{rating:40,umin:170,umax:270,disp:'230',mods:2,label:''},
  props:[{k:'rating',label:'Rating (A)',type:'select',opts:[32,40,50,63]},{k:'umin',label:'Under-voltage (V)',type:'number'},{k:'umax',label:'Over-voltage (V)',type:'number'},{k:'disp',label:'Display text',type:'text'},{k:'mods',label:'Width (modules)',type:'select',opts:[1,2,3]},P_LABEL],
  units:p=>2*p.mods,size:p=>({w:p.mods*M,h:DH}),terms:(p,w,h)=>poleTerms(['L','N'],w,h),
  draw:(p,w,h)=>body(w,h)+`<rect x="7" y="42" width="${w-14}" height="42" rx="3" fill="#111"/>`+txt(w/2,73,String(p.disp).slice(0,4),w<50?12:24,'#ff2b2b',700,'middle','Courier New,monospace')+txt(w/2,98,'Voltage relay',7,'#444',600)+`<rect x="12" y="106" width="12" height="8" rx="2" fill="#c9ced3"/><rect x="${w/2-6}" y="106" width="12" height="8" rx="2" fill="#c9ced3"/><rect x="${w-24}" y="106" width="12" height="8" rx="2" fill="#c9ced3"/>`+txt(w/2,138,p.rating+'A',10)+txt(w/2,151,`${p.umin}–${p.umax}V`,8,'#666',600),
  desc:p=>`Voltage protection relay ${p.rating}A (${p.umin}–${p.umax} V)`}),
 meter:RD({name:p=>`kWh meter ${p.ph}φ`,defaults:{ph:1,mods:2,label:''},props:[{k:'ph',label:'Phases',type:'select',opts:[1,3]},{k:'mods',label:'Width (modules)',type:'select',opts:[1,2,3,4,7]},P_LABEL],
  units:p=>2*p.mods,size:p=>({w:p.mods*M,h:DH}),terms:(p,w,h)=>poleTerms(+p.ph===1?['L','N']:['L1','L2','L3','N'],w,h),
  draw:(p,w,h)=>body(w,h)+`<rect x="7" y="44" width="${w-14}" height="30" rx="3" fill="#a9c99a" stroke="#6d8a5f"/>`+txt(w/2,65,w<50?'0123':'000123.4',w>100?18:w>50?12:9,'#1e2a1a',700,'middle','Courier New,monospace')+txt(w/2,90,'kWh',9)+`<circle cx="${w-15}" cy="104" r="3.5" fill="#ff3b30"/>`+txt(w/2,122,+p.ph===1?'1φ 230V':'3φ 400V',9,'#555',600)+txt(w/2,150,'10(60)A',8,'#666',600),
  desc:p=>`Energy meter ${p.ph}-phase, DIN ${p.mods} mod`}),
 cont:RD({name:p=>`Contactor ${p.poles}P`,screw:7,defaults:{poles:2,rating:25,coil:'230V AC',label:''},
  props:[{k:'poles',label:'Poles',type:'select',opts:[2,4]},{k:'rating',label:'Rating (A)',type:'select',opts:[16,20,25,40,63]},{k:'coil',label:'Coil',type:'select',opts:['230V AC','24V AC','24V DC']},P_LABEL],
  units:p=>p.poles===2?4:6,size:p=>({w:(p.poles===2?4:6)*U,h:DH}),
  terms:(p,w,h)=>{const ph=polePh(p.poles);const top=[{id:'a1',ph:'C'}].concat(ph.map((c,i)=>({id:'t'+i,ph:c})));const bot=[{id:'a2',ph:'C'}].concat(ph.map((c,i)=>({id:'b'+i,ph:c})));const xs=spread(top.length,w);return top.map((t,i)=>({...t,x:xs[i],y:18,dir:-1})).concat(bot.map((t,i)=>({...t,x:xs[i],y:h-18,dir:1})))},
  draw:(p,w,h)=>body(w,h,'#eceeef')+`<rect x="8" y="48" width="${w-16}" height="74" rx="4" fill="#d4d8dc" stroke="#a3aab0"/><rect x="${w/2-10}" y="60" width="20" height="14" rx="2" fill="#2b2f33"/>`+txt(w/2,98,'KM',11)+txt(w/2,112,p.rating+'A',9,'#555')+txt(w/2,150,p.coil,8,'#666',600)+txt(10,46,'A1',7,'#666',600,'start'),
  desc:p=>`Modular contactor ${p.poles}P ${p.rating}A, coil ${p.coil}`}),
 lamp:RD({name:()=>'Indicator lamp',defaults:{color:'red',ph:'L',label:''},
  props:[{k:'color',label:'Lens colour',type:'select',opts:['red','green','yellow','blue','white']},{k:'ph',label:'Phase',type:'select',opts:['L','L1','L2','L3']},P_LABEL],
  units:()=>2,size:()=>({w:M,h:DH}),terms:(p,w,h)=>[{id:'t0',x:w/2,y:18,dir:-1,ph:p.ph},{id:'b0',x:w/2,y:h-18,dir:1,ph:'N'}],
  draw:(p,w,h)=>body(w,h)+`<circle cx="${w/2}" cy="88" r="14" fill="${LAMP[p.color]||'#ff3b30'}" stroke="#555" stroke-width="1.5"/><circle cx="${w/2-4}" cy="83" r="4" fill="#fff" opacity=".6"/>`+txt(w/2,130,p.ph,9),
  desc:p=>`Indicator lamp ${p.color}`}),
 tblock:RD({name:p=>`Terminal ${p.kind}`,z:2,screw:6,showLabel:false,defaults:{kind:'L',size:'4',label:''},
  props:[{k:'kind',label:'Type',type:'select',opts:['L','N','PE']},{k:'size',label:'Size (mm²)',type:'select',opts:['2.5','4','6','10','16','35']},{k:'label',label:'Marker',type:'text'}],
  units:()=>1,size:()=>({w:U,h:120}),terms:(p,w,h)=>[{id:'t0',x:w/2,y:14,dir:-1,ph:p.kind},{id:'b0',x:w/2,y:h-14,dir:1,ph:p.kind}],
  draw:(p,w,h)=>{const c=p.kind==='N'?'#3b78e7':p.kind==='PE'?'#2e9e3e':'#b4bac0';return `<rect x="1" y="0" width="${w-2}" height="${h}" rx="3" fill="${c}" stroke="#5f676d"/>`+(p.kind==='PE'?`<rect x="${w/2-3}" y="28" width="6" height="${h-56}" fill="#f2d21b"/>`:'')+`<rect x="2.5" y="${h/2-11}" width="${w-5}" height="22" rx="2" fill="#fff" stroke="#888"/>`+txt(w/2,h/2+3.5,String(p.label||p.kind).slice(0,3),8,'#222')},
  desc:p=>`Terminal block ${p.size} mm² ${p.kind==='PE'?'earth':p.kind==='N'?'blue':'grey'}`}),
 comb:RD({name:p=>`Comb busbar ${p.poles}P`,z:4,occupy:false,screw:0,showLabel:false,defaults:{poles:1,mod:6,rating:63},
  props:[{k:'poles',label:'Poles',type:'select',opts:[1,3]},{k:'mod',label:'Length (modules)',type:'select',opts:[2,3,4,6,8,10,12,18,24]},{k:'rating',label:'Rating (A)',type:'select',opts:[63,80,100]}],
  units:p=>p.mod*2,size:p=>({w:p.mod*M,h:26}),
  terms:p=>p.poles===3?[0,1,2].map(i=>({id:'f'+i,x:-30+i*11,y:6,dir:-1,ph:'L'+(i+1),hr:6})):[{id:'f',x:-8,y:6,dir:-1,ph:'L'}],
  draw:(p,w,h)=>{let s='';for(let i=0;i<p.mod;i++){const cx=M*i+M/2;s+=`<rect x="${cx-3}" y="8" width="6" height="18" fill="#c87533"/>`}
   const lx=p.poles===3?-36:-14;s+=`<rect x="${lx}" y="0" width="${w-lx}" height="12" rx="3" fill="#7d8489" stroke="#555c61"/>`;
   const lugs=p.poles===3?[-30,-19,-8]:[-8];lugs.forEach((x,i)=>{s+=`<circle cx="${x}" cy="6" r="4" fill="#c87533" stroke="#7a4a1c"/>`});
   if(p.poles===3)for(let i=0;i<p.mod;i++)s+=`<circle cx="${M*i+M/2}" cy="6" r="2.5" fill="${col(['L1','L2','L3'][i%3])==='gy'?'#2e9e3e':col(['L1','L2','L3'][i%3])}"/>`;
   return s+txt(w/2,9.5,`COMB ${p.poles}P ${p.rating}A`,7,'#fff')},
  desc:p=>`Comb busbar ${p.poles}P, ${p.mod} modules, ${p.rating}A`}),
 rail:FR({name:p=>`DIN rail ${p.mod} mod`,z:1,showLabel:false,needSel:true,defaults:{mod:12,label:''},
  props:[{k:'mod',label:'Length (modules)',type:'number'},{k:'label',label:'Row label',type:'text'}],
  size:p=>({w:p.mod*M+2*RP,h:RAIL_H}),
  draw:(p,w,h)=>{let s=`<rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="#9aa1a6" stroke="#6e767c"/><rect x="0" y="0" width="${w}" height="9" fill="#c3c8cc"/><rect x="0" y="${h-9}" width="${w}" height="9" fill="#c3c8cc"/><rect x="0" y="12" width="${w}" height="${h-24}" fill="#b0b6bb"/>`;
   const n=Math.max(1,Math.floor((w-24)/68)),gap=(w-n*46)/(n+1);for(let i=0;i<n;i++)s+=`<rect x="${gap+i*(46+gap)}" y="${h/2-7}" width="46" height="14" rx="7" fill="#f3f1ea" stroke="#7d858a"/>`;
   if(p.label)s+=txt(6,7.5,p.label,8,'#3a4046',700,'start');return s},
  desc:p=>`DIN rail TS35, ${p.mod} modules (${p.mod*18+14} mm)`}),
 encl:FR({name:p=>`Enclosure ${p.size}`,z:0,showLabel:false,needSel:true,defaults:{size:'600×800',label:'DB-1'},
  props:[{k:'size',label:'Size W×H (mm)',type:'select',opts:['300×400','400×500','400×600','500×700','600×800','800×1000','800×1200']},{k:'label',label:'Panel name',type:'text'}],
  size:p=>parseEncl(p.size),
  draw:(p,w,h)=>`<rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="#e4e7ea" stroke="#9aa3aa" stroke-width="3" style="pointer-events:none"/><rect x="26" y="26" width="${w-52}" height="${h-52}" rx="6" fill="#f7f6f1" stroke="#c4cacf" stroke-width="2" style="pointer-events:none"/><rect x="13" y="13" width="${w-26}" height="${h-26}" rx="12" fill="none" stroke="#000" stroke-opacity="0" stroke-width="26" style="pointer-events:stroke"/>`+txt(w/2,18,`${p.label||''}  ·  ${p.size} mm`,11,'#59626a'),
  desc:p=>`Enclosure ${p.size} mm${p.label?' ('+p.label+')':''}`}),
 busbar:FR({name:p=>`${p.kind==='PE'?'Earth':'Neutral'} bar ${p.holes}`,screw:7,defaults:{kind:'N',holes:8,face:'up',label:''},
  props:[{k:'kind',label:'Type',type:'select',opts:['N','PE']},{k:'holes',label:'Ways',type:'select',opts:[4,6,8,10,12,16,20]},{k:'face',label:'Wire entry',type:'select',opts:['up','down']},P_LABEL],
  size:p=>({w:p.holes*22+32,h:30}),terms:(p,w,h)=>Array.from({length:p.holes},(_,i)=>({id:'h'+i,x:27+i*22,y:15,dir:p.face==='down'?1:-1,ph:p.kind})),
  draw:(p,w,h)=>{const pe=p.kind==='PE',base=pe?'#f0cf1a':'#2563d6',dk=pe?'#a88e00':'#163f8f';return `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="${base}" stroke="${dk}" stroke-width="1.5"/><rect x="16" y="5" width="${w-32}" height="${h-10}" rx="2" fill="#dfe3e7" stroke="#8a9299"/><rect x="3.5" y="${h/2-5}" width="9" height="10" rx="2" fill="#fff" stroke="${dk}"/><rect x="${w-12.5}" y="${h/2-5}" width="9" height="10" rx="2" fill="#fff" stroke="${dk}"/>`},
  desc:p=>`${p.kind==='PE'?'Earth':'Neutral'} terminal bar, ${p.holes}-way`}),
 supply:FR({name:p=>`Incoming supply ${p.ph}φ`,showLabel:false,defaults:{ph:1,label:''},
  props:[{k:'ph',label:'Phases',type:'select',opts:[1,3]},{k:'label',label:'Label',type:'text'}],
  size:p=>({w:SUPPH(p).length*26+10,h:100}),terms:(p,w,h)=>{const ph=SUPPH(p),xs=spread(ph.length,w);return ph.map((c,i)=>({id:c,x:xs[i],y:h-4,dir:1,ph:c}))},
  draw:(p,w,h)=>{const ph=SUPPH(p),xs=spread(ph.length,w),cx=w/2;let s='';ph.forEach((c,i)=>{const ox=cx+(i-(ph.length-1)/2)*5;s+=stroke(`M${ox},30 C${ox},${h*.6} ${xs[i]},${h*.45} ${xs[i]},${h-16}`,col(c),6)+`<rect x="${xs[i]-3.5}" y="${h-16}" width="7" height="12" rx="1.5" fill="#c87533"/>`});
   return s+`<rect x="${cx-16}" y="0" width="32" height="34" rx="8" fill="#3a3f44"/>`+txt(cx,-8,p.label||(+p.ph===3?'SUPPLY 400V 3φ':'SUPPLY 230V'),11)}}),
 outgoing:FR({name:p=>`Outgoing ${p.cores}-core`,showLabel:false,defaults:{cores:3,label:'CIRCUIT'},
  props:[{k:'cores',label:'Cores',type:'select',opts:[2,3,4,5]},{k:'label',label:'Destination',type:'text'}],
  size:p=>({w:OUTPH[p.cores].length*26+10,h:100}),terms:(p,w,h)=>{const ph=OUTPH[p.cores],xs=spread(ph.length,w);return ph.map((c,i)=>({id:c,x:xs[i],y:4,dir:-1,ph:c}))},
  draw:(p,w,h)=>{const ph=OUTPH[p.cores],xs=spread(ph.length,w),cx=w/2;let s='';ph.forEach((c,i)=>{const ox=cx+(i-(ph.length-1)/2)*5;s+=stroke(`M${xs[i]},16 C${xs[i]},${h*.55} ${ox},${h*.4} ${ox},${h-30}`,col(c),6)+`<rect x="${xs[i]-3.5}" y="4" width="7" height="12" rx="1.5" fill="#c87533"/>`});
   return s+`<rect x="${cx-16}" y="${h-34}" width="32" height="34" rx="8" fill="#3a3f44"/>`+txt(cx,h+14,p.label,11)}}),
 label:FR({name:()=>'Text label',z:6,showLabel:false,defaults:{text:'LABEL',size:16,color:'black',box:'yes'},
  props:[{k:'text',label:'Text',type:'text'},{k:'size',label:'Font size',type:'select',opts:[10,12,14,16,20,24,32]},{k:'color',label:'Colour',type:'select',opts:['black','red','blue','green']},{k:'box',label:'Border',type:'select',opts:['yes','no']}],
  size:p=>({w:Math.max(24,Math.round(String(p.text).length*p.size*.62)+(p.box==='yes'?18:6)),h:+p.size+14}),
  draw:(p,w,h)=>{const c=LCOL[p.color]||'#1f2933';return `<rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#fff" fill-opacity="${p.box==='yes'?1:0}" stroke="${p.box==='yes'?c:'none'}" stroke-width="1.5"/>`+txt(w/2,h/2+p.size*.36,p.text,p.size,c)}}),
 earthsym:FR({name:()=>'Earth symbol',z:6,size:()=>({w:44,h:44}),
  draw:()=>`<rect x="1" y="1" width="42" height="42" rx="9" fill="#f2d21b" stroke="#222" stroke-width="2"/><path d="M22,8V22M10,22H34M14,29H30M18,36H26" stroke="#222" stroke-width="3" stroke-linecap="round"/>`}),
 warn:FR({name:()=>'Danger sign',z:6,size:()=>({w:52,h:46}),
  draw:()=>`<path d="M26,3 L50,43 L2,43 Z" fill="#f2d21b" stroke="#222" stroke-width="3" stroke-linejoin="round"/><path d="M29,14 L19,29 H26 L22,39 L33,23 H26 Z" fill="#222"/>`})
};

const PANEL_LIB=[
 {tab:'Devices',groups:[
  {g:'Circuit breakers',items:[['mcb',{poles:1},'MCB 1P'],['mcb',{poles:2},'MCB 2P'],['mcb',{poles:3},'MCB 3P'],['mcb',{poles:4},'MCB 4P'],['mcb1pn',{},'MCB 1P + N']]},
  {g:'Residual current devices',items:[['rcd',{poles:2},'RCD 2P'],['rcd',{poles:4},'RCD 4P'],['rcbo',{},'RCBO 1P + N']]},
  {g:'Switching & protection',items:[['isol',{poles:2},'Main switch 2P'],['isol',{poles:4},'Main switch 4P'],['spd',{poles:2},'SPD 1P + N'],['spd',{poles:4},'SPD 3P + N'],['cont',{poles:2},'Contactor 2P'],['cont',{poles:4},'Contactor 4P']]},
  {g:'Monitoring & signalling',items:[['vrelay',{},'Voltage relay'],['meter',{ph:1},'kWh meter 1φ'],['meter',{ph:3,mods:4},'kWh meter 3φ'],['lamp',{color:'red'},'Indicator lamp']]}]},
 {tab:'DIN rails',groups:[
  {g:'35 mm DIN rail',items:[['rail',{mod:6},'6 modules'],['rail',{mod:12},'12 modules'],['rail',{mod:18},'18 modules'],['rail',{mod:24},'24 modules'],['rail',{mod:36},'36 modules']]},
  {g:'Enclosure',items:[['encl',{size:'400×600'},'400 × 600'],['encl',{size:'600×800'},'600 × 800'],['encl',{size:'800×1000'},'800 × 1000']]}]},
 {tab:'Busbars',groups:[
  {g:'Earth & neutral bars',items:[['busbar',{kind:'PE',holes:8},'Earth bar 8'],['busbar',{kind:'PE',holes:12},'Earth bar 12'],['busbar',{kind:'N',holes:8},'Neutral bar 8'],['busbar',{kind:'N',holes:12},'Neutral bar 12']]},
  {g:'Comb busbars',items:[['comb',{poles:1,mod:6},'Comb 1P · 6'],['comb',{poles:1,mod:12},'Comb 1P · 12'],['comb',{poles:3,mod:12},'Comb 3P · 12']]}]},
 {tab:'Terminals',groups:[
  {g:'Terminal blocks',items:[['tblock',{kind:'L'},'Terminal L'],['tblock',{kind:'N'},'Terminal N'],['tblock',{kind:'PE'},'Terminal PE']]},
  {g:'Cables',items:[['supply',{ph:1},'Supply 1φ'],['supply',{ph:3},'Supply 3φ'],['outgoing',{cores:3},'Outgoing 3-core'],['outgoing',{cores:5},'Outgoing 5-core']]}]},
 {tab:'Marking',groups:[{g:'Labels & symbols',items:[['label',{},'Text label'],['earthsym',{},'Earth symbol'],['warn',{},'Danger sign']]}]}
];

/* ---------- document state ---------- */
let S={name:'Untitled panel',items:[],wires:[],layers:defaultLayers(),defs:{items:'base',wires:'wires'},room:null}, curId=null;
/** Which designer is showing: 'panel' (DB board) or 'room' (walls / ceiling / 3D). Room code lives in js/room.js */
let appMode=settings.mode==='room'?'room':'panel';
let sel=[], mode='select', pending=null, view={x:0,y:0,k:1};
let undoS=[], redoS=[];
const D=it=>DEFS[it.type];
const find=id=>S.items.find(i=>i.id===id);
const size=it=>D(it).size(it.props);
const getRail=id=>S.items.find(r=>r.id===id&&r.type==='rail');
function railYFor(it,r){return it.type==='comb'?r.y+RAIL_H/2-DH/2-6:r.y+RAIL_H/2-size(it).h/2}
function pos(it){if(it.rail){const r=getRail(it.rail);if(r)return {x:r.x+RP+it.slot*U,y:railYFor(it,r)}}return {x:it.x,y:it.y}}
function termsOf(it){const s=size(it);return D(it).terms?D(it).terms(it.props,s.w,s.h):[]}
function termPos(ref){const i=ref.indexOf(':');const it=find(ref.slice(0,i));if(!it||!D(it))return null;const t=termsOf(it).find(t=>t.id===ref.slice(i+1));if(!t)return null;const p=pos(it),s=size(it);return {x:p.x+t.x,y:p.y+t.y,dir:t.dir,ph:t.ph,type:it.type,by1:p.y,by2:p.y+s.h}}
function normalize(it){const d=DEFS[it.type];if(!d)return null;it.props=Object.assign({},d.defaults,it.props||{});it.x=+it.x||0;it.y=+it.y||0;it.slot=+it.slot||0;it.rail=it.rail||null;if(it.layer!=null)it.layer=String(it.layer);return it}

/* rail slot logic */
const railTotal=r=>r.props.mod*2;
function isFree(r,slot,u,excl){if(slot<0||slot+u>railTotal(r))return false;return !S.items.some(o=>o.id!==excl&&o.rail===r.id&&D(o).occupy&&o.slot<slot+u&&slot<o.slot+D(o).units(o.props))}
function firstFree(r,u,excl,from=0){const T=railTotal(r);for(let k=0;k<=T;k++){const s=(from+k)%(T+1);if(isFree(r,s,u,excl))return s}return null}
function detach(it){const p=pos(it);it.rail=null;it.x=p.x;it.y=p.y}
function findSnap(it,nx,ny){const d=D(it),u=d.units(it.props),s=size(it);let best=null;
 for(const r of S.items){if(r.type!=='rail')continue;const rs=size(r);const ey=railYFor(it,r);
  if(Math.abs(ny-ey)>55||nx+s.w/2<r.x-10||nx+s.w/2>r.x+rs.w+10)continue;
  const want=(nx-r.x-RP)/U,T=railTotal(r),dy=Math.abs(ny-ey);
  if(!d.occupy){if(u<=T){const slot=clamp(Math.round(want/2)*2,0,T-u);if(!best||dy<best.dy)best={rail:r.id,slot,dy}}continue}
  const edges=new Set([0,T]);for(const o of S.items)if(o.rail===r.id&&o.id!==it.id&&D(o).occupy){edges.add(o.slot);edges.add(o.slot+D(o).units(o.props))}
  let bs=null,bsc=Infinity;
  for(let c=0;c<=T-u;c++){if(!isFree(r,c,u,it.id))continue;const flush=edges.has(c)||edges.has(c+u);const sc=Math.abs(c-want)+(flush?-1.2:0)+(c%2&&!flush?1.5:0);if(sc<bsc){bsc=sc;bs=c}}
  if(bs!=null&&(!best||dy<best.dy))best={rail:r.id,slot:bs,dy}}
 return best}
const g9=v=>settings.snap?Math.round(v/9)*9:Math.round(v);

/* ---------- layers ---------- */
function defaultLayers(){return [{id:'base',name:'Components',visible:true,locked:false},{id:'wires',name:'Wires',visible:true,locked:false}]}
function migrate(doc){
 const L=Array.isArray(doc.layers)&&doc.layers.length?doc.layers.map(l=>({id:String(l.id),name:String(l.name||'Layer'),visible:l.visible!==false,locked:!!l.locked})):defaultLayers();
 const ids=new Set(L.map(l=>l.id));
 const defs=Object.assign({items:L[0].id,wires:(L.find(l=>l.id==='wires')||L[L.length-1]).id},doc.defs||{});
 if(!ids.has(defs.items))defs.items=L[0].id;if(!ids.has(defs.wires))defs.wires=L[L.length-1].id;
 const items=(doc.items||[]).map(normalize).filter(Boolean);items.forEach(i=>{if(!ids.has(i.layer))i.layer=defs.items});
 const wires=(doc.wires||[]).filter(w=>w&&w.a&&w.b).map(w=>{delete w.by;if(!ids.has(w.layer))w.layer=defs.wires;if(!Array.isArray(w.path)||!w.path.length)delete w.path;return w});
 return {name:doc.name||'Untitled panel',items,wires,layers:L,defs,room:normRoom(doc.room)}}
const layerOf=id=>S.layers.find(l=>l.id===id)||S.layers[0];
const isVis=o=>layerOf(o.layer).visible;
const isLocked=o=>layerOf(o.layer).locked;
const objOf=s=>s.kind==='item'?find(s.id):S.wires.find(w=>w.id===s.id);

/* ---------- persistence & undo ---------- */
const docData=()=>({items:S.items,wires:S.wires,layers:S.layers,defs:S.defs,room:S.room});
function save(){if(!curId)return;const P=loadProjects();P[curId]={name:S.name,updated:Date.now(),appVersion:APP_VERSION,data:docData()};saveProjects(P);lsSet(LS_C,curId)}
const snap=()=>JSON.stringify(docData());
function pushUndo(){undoS.push(snap());if(undoS.length>80)undoS.shift();redoS=[];updButtons()}
function restore(js){const o=JSON.parse(js),keep=new Map(S.layers.map(l=>[l.id,{visible:l.visible,locked:l.locked}]));
 S.items=o.items;S.wires=o.wires;S.layers=o.layers;S.defs=o.defs;S.room=normRoom(o.room);S.layers.forEach(l=>{const k=keep.get(l.id);if(k)Object.assign(l,k)});sel=[];pending=null;commit()}
function doUndo(){if(!undoS.length)return;redoS.push(snap());restore(undoS.pop())}
function doRedo(){if(!redoS.length)return;undoS.push(snap());restore(redoS.pop())}
function commit(){invalidate();save();if(appMode==='room')roomRefresh();else render();updUI();renderLayers()}
function pruneWires(){S.wires=S.wires.filter(w=>termPos(w.a)&&termPos(w.b))}

/* ---------- wire routing (obstacle-avoiding orthogonal A*) ---------- */
const GRID=9,OB_PAD=5,BEND=34,OVERLAP=7,BK=6;
const NOOBS=new Set(['rail','encl','comb','label','earthsym','warn']);
let routes=new Map(),routesValid=false,dragReroute=null;
function invalidate(){routesValid=false}
function wireColor(w){if(w.color&&w.color!=='auto')return w.color;const A=termPos(w.a),B=termPos(w.b);let ph=A&&A.ph;if((!ph||ph==='C')&&B&&B.ph&&B.ph!=='C')ph=B.ph;return col(ph||'L')}
function obstacles(){const ob=[];for(const it of S.items){if(!D(it)||NOOBS.has(it.type))continue;const p=pos(it),s=size(it);ob.push({x1:p.x-OB_PAD,y1:p.y-OB_PAD,x2:p.x+s.w+OB_PAD,y2:p.y+s.h+OB_PAD})}return ob}
function exitPt(T){return NOOBS.has(T.type)?{x:T.x,y:T.y+T.dir*12}:{x:T.x,y:T.dir<0?T.by1-OB_PAD-6:T.by2+OB_PAD+6}}
const near=(a,b)=>Math.abs(a-b)<.5;
function simplify(P){const o=[];for(const p of P){const l=o[o.length-1];if(l&&near(l.x,p.x)&&near(l.y,p.y))continue;o.push({x:p.x,y:p.y})}
 for(let i=o.length-2;i>=1;i--){const a=o[i-1],b=o[i],c=o[i+1];if((near(a.x,b.x)&&near(b.x,c.x))||(near(a.y,b.y)&&near(b.y,c.y)))o.splice(i,1)}return o}
function newOcc(){return {h:new Map(),v:new Map()}}
function addOcc(occ,P){for(let i=1;i<P.length;i++){const a=P[i-1],b=P[i];let m,c,lo,hi;
 if(near(a.y,b.y)&&!near(a.x,b.x)){m=occ.h;c=a.y;lo=Math.min(a.x,b.x);hi=Math.max(a.x,b.x)}else if(near(a.x,b.x)&&!near(a.y,b.y)){m=occ.v;c=a.x;lo=Math.min(a.y,b.y);hi=Math.max(a.y,b.y)}else continue;
 const k=Math.floor(c/BK);let L=m.get(k);if(!L)m.set(k,L=[]);L.push([c,lo,hi])}}
function occCost(occ,horiz,c,a,b){const m=horiz?occ.h:occ.v,k=Math.floor(c/BK);let cost=0;
 for(let kk=k-1;kk<=k+1;kk++){const L=m.get(kk);if(!L)continue;for(const [cc,i1,i2] of L){const d=Math.abs(cc-c);if(d>=7)continue;const ov=Math.min(b,i2)-Math.max(a,i1);if(ov>0)cost+=ov*(d<2?OVERLAP:OVERLAP*.6)}}return cost}
function uniqSorted(a){return [...new Set(a.map(v=>Math.round(v*2)/2))].sort((p,q)=>p-q)}
function astar(A,B,s0,e0,ob,occ,m){
 const bx1=Math.min(s0.x,e0.x)-m,bx2=Math.max(s0.x,e0.x)+m,by1=Math.min(s0.y,e0.y)-m,by2=Math.max(s0.y,e0.y)+m,xs=[s0.x,e0.x],ys=[s0.y,e0.y];
 for(let x=Math.ceil(bx1/GRID)*GRID;x<=bx2;x+=GRID)xs.push(x);for(let y=Math.ceil(by1/GRID)*GRID;y<=by2;y+=GRID)ys.push(y);
 const X=uniqSorted(xs),Y=uniqSorted(ys),NX=X.length,NY=Y.length,N=NX*NY,blk=new Uint8Array(N);
 for(const o of ob){if(o.x2<bx1||o.x1>bx2||o.y2<by1||o.y1>by2)continue;
  for(let yi=0;yi<NY;yi++){const y=Y[yi];if(y<=o.y1||y>=o.y2)continue;for(let xi=0;xi<NX;xi++){const x=X[xi];if(x>o.x1&&x<o.x2)blk[yi*NX+xi]=1}}}
 const si=Y.indexOf(Math.round(s0.y*2)/2)*NX+X.indexOf(Math.round(s0.x*2)/2),gi=Y.indexOf(Math.round(e0.y*2)/2)*NX+X.indexOf(Math.round(e0.x*2)/2);
 if(si<0||gi<0)return null;blk[si]=0;blk[gi]=0;
 const g=new Float64Array(N*4).fill(Infinity),prev=new Int32Array(N*4).fill(-1),done=new Uint8Array(N*4);
 const hf=[],hs=[];const hpush=(f,s)=>{let i=hf.length;hf.push(f);hs.push(s);while(i>0){const p=(i-1)>>1;if(hf[p]<=f)break;hf[i]=hf[p];hs[i]=hs[p];i=p}hf[i]=f;hs[i]=s};
 const hpop=()=>{const s=hs[0],lf=hf.pop(),ls=hs.pop();if(hf.length){let i=0;for(;;){let c=2*i+1;if(c>=hf.length)break;if(c+1<hf.length&&hf[c+1]<hf[c])c++;if(hf[c]>=lf)break;hf[i]=hf[c];hs[i]=hs[c];i=c}hf[i]=lf;hs[i]=ls}return s};
 const gx=X[gi%NX],gy=Y[(gi/NX)|0],H=n=>Math.abs(X[n%NX]-gx)+Math.abs(Y[(n/NX)|0]-gy);
 const d0=A.dir<0?3:2,finalD=B.dir<0?2:3,OPP=[1,0,3,2];
 g[si*4+d0]=0;hpush(H(si),si*4+d0);let pops=0,found=-1;
 while(hf.length){const st=hpop();if(done[st])continue;done[st]=1;const n=st>>2,d=st&3;if(n===gi){found=st;break}if(++pops>90000)break;
  const xi=n%NX,yi=(n/NX)|0;
  for(let nd=0;nd<4;nd++){if(nd===OPP[d])continue;let nx=xi,ny=yi;if(nd===0)nx++;else if(nd===1)nx--;else if(nd===2)ny++;else ny--;
   if(nx<0||ny<0||nx>=NX||ny>=NY)continue;const nn=ny*NX+nx;if(blk[nn])continue;
   const hz=nd<2,len=hz?Math.abs(X[nx]-X[xi]):Math.abs(Y[ny]-Y[yi]);
   let c=g[st]+len+(nd!==d?BEND:0)+(hz?occCost(occ,true,Y[yi],Math.min(X[xi],X[nx]),Math.max(X[xi],X[nx])):occCost(occ,false,X[xi],Math.min(Y[yi],Y[ny]),Math.max(Y[yi],Y[ny])));
   if(nn===gi&&nd!==finalD)c+=BEND;const ns=nn*4+nd;if(c<g[ns]){g[ns]=c;prev[ns]=st;hpush(c+H(nn),ns)}}}
 if(found<0)return null;const path=[];for(let s=found;s>=0;s=prev[s]){const n=s>>2;path.push({x:X[n%NX],y:Y[(n/NX)|0]})}return path.reverse()}
function fallback(A,B){const s0=exitPt(A),e0=exitPt(B);const my=A.dir<0&&B.dir<0?Math.min(s0.y,e0.y):A.dir>0&&B.dir>0?Math.max(s0.y,e0.y):(s0.y+e0.y)/2;
 return simplify([A,s0,{x:s0.x,y:my},{x:e0.x,y:my},e0,B])}
function autoRoute(A,B,ob,occ){const s0=exitPt(A),e0=exitPt(B);for(const m of [120,360,900]){const r=astar(A,B,s0,e0,ob,occ,m);if(r)return simplify([A,...r,B])}return fallback(A,B)}
function alignEnd(P,start){const n=P.length;if(n<3)return;const E=start?P[0]:P[n-1],p=start?P[1]:P[n-2];
 if(near(p.x,E.x)||near(p.y,E.y))return;
 if(n>3){const q=start?P[2]:P[n-3];if(near(q.y,p.y))p.x=E.x;else p.y=E.y}
 else{const el=start?{x:E.x,y:p.y}:{x:p.x,y:E.y};if(start)P.splice(1,0,el);else P.splice(n-1,0,el)}}
function manualPts(A,B,path){const P=[{x:A.x,y:A.y},...path.map(p=>({x:+p.x,y:+p.y})),{x:B.x,y:B.y}];alignEnd(P,true);alignEnd(P,false);return P}
function wirePoints(w,ob,occ){const A=termPos(w.a),B=termPos(w.b);if(!A||!B)return null;return w.path&&w.path.length?manualPts(A,B,w.path):autoRoute(A,B,ob,occ)}
function computeRoutes(only){const ob=obstacles(),occ=newOcc(),redo=only?new Set(only):null;
 const order=[...S.wires].sort((a,b)=>(b.path?1:0)-(a.path?1:0));
 if(redo)for(const w of order)if(!redo.has(w.id)){const r=routes.get(w.id);if(r)addOcc(occ,r)}
 for(const w of order){if(redo&&!redo.has(w.id))continue;const P=wirePoints(w,ob,occ);if(P){routes.set(w.id,P);addOcc(occ,P)}else routes.delete(w.id)}
 if(!redo){const ids=new Set(S.wires.map(w=>w.id));for(const k of [...routes.keys()])if(!ids.has(k))routes.delete(k)}}
function ensureRoutes(){if(!routesValid){computeRoutes();routesValid=true}}
function getPts(w){ensureRoutes();return routes.get(w.id)||null}
function rPath(p,r=7){let d=`M${p[0].x},${p[0].y}`;for(let i=1;i<p.length-1;i++){const a=p[i-1],b=p[i],c=p[i+1],l1=dist(a,b),l2=dist(b,c),rr=Math.min(r,l1/2,l2/2);if(rr<.5){d+=` L${b.x},${b.y}`;continue}
  d+=` L${b.x+(a.x-b.x)/l1*rr},${b.y+(a.y-b.y)/l1*rr} Q${b.x},${b.y} ${b.x+(c.x-b.x)/l2*rr},${b.y+(c.y-b.y)/l2*rr}`}
 const z=p[p.length-1];return d+` L${z.x},${z.y}`}
function wireLen(w){const P=getPts(w);if(!P)return null;let L=0;for(let i=1;i<P.length;i++)L+=dist(P[i-1],P[i]);return L}

/* ---------- rendering ---------- */
const world=$('#world'), cv=$('#cv');
function itemSVG(it,clean){const d=D(it),s=size(it),p=pos(it);let g=d.draw(it.props,s.w,s.h);
 if(d.screw)for(const t of termsOf(it))g+=screw(t.x,t.y,d.screw);
 return `<g${clean||isLocked(it)?'':` data-id="${it.id}"`} transform="translate(${p.x},${p.y})">${g}</g>`}
function labelSVG(it){const d=D(it);if(!settings.labels||!it.props.label||d.showLabel===false)return '';const s=size(it),p=pos(it),L=String(it.props.label),fs=clamp(Math.floor((s.w-2)/(L.length*.62)),6,11);
 return `<text x="${p.x+s.w/2}" y="${p.y-14}" font-size="${fs}" font-weight="700" fill="#1f2933" text-anchor="middle" stroke="#f7f6f1" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke" style="pointer-events:none">${esc(L)}</text>`}
function wireSVG(w,clean){const P=getPts(w);if(!P)return '';const d=rPath(P),c=wireColor(w),sw=wireW(w.size),hl=!clean&&isSel('wire',w.id);let s='';
 if(hl)s+=`<path d="${d}" fill="none" stroke="#0a84ff" stroke-opacity=".35" stroke-width="${sw+10}" stroke-linejoin="round" stroke-linecap="round"/>`;
 s+=`<path d="${d}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${sw+2.2}" stroke-linejoin="round" stroke-linecap="round"/>`+stroke(d,c,sw);
 for(const e of [P[0],P[P.length-1]])s+=`<circle cx="${e.x}" cy="${e.y}" r="${sw/2+1.6}" fill="#b8bec3" stroke="#5f666c" stroke-width="1"/>`;
 if(!clean&&!isLocked(w))s+=`<path d="${d}" data-wire="${w.id}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="22" style="pointer-events:stroke"/>`;
 return s}
function buildScene(clean){ensureRoutes();let out='';
 for(const L of S.layers){if(!L.visible)continue;
  const its=S.items.filter(i=>layerOf(i.layer).id===L.id).sort((a,b)=>D(a).z-D(b).z);
  for(const it of its)if(D(it).z<5)out+=itemSVG(it,clean);
  for(const w of S.wires)if(layerOf(w.layer).id===L.id)out+=wireSVG(w,clean);
  for(const it of its)if(D(it).z>=5)out+=itemSVG(it,clean)}
 for(const it of S.items)if(isVis(it))out+=labelSVG(it);
 if(clean)return out;
 let over='';const hs=clamp(1/view.k,1,3);
 for(const s of sel)if(s.kind==='item'){const it=find(s.id);if(it&&isVis(it)){const p=pos(it),z=size(it);over+=`<rect x="${p.x-5}" y="${p.y-5}" width="${z.w+10}" height="${z.h+10}" rx="6" fill="none" stroke="#0a84ff" stroke-width="2" stroke-dasharray="6 4" style="pointer-events:none"/>`}}
 const o=one();
 if(mode==='select'&&o&&o.kind==='wire'){const w=S.wires.find(x=>x.id===o.id),P=w&&getPts(w);
  if(P&&isVis(w)&&!isLocked(w))for(let i=0;i<P.length-1;i++){if(P.length>3&&(i===0||i===P.length-2))continue;const a=P[i],b=P[i+1],len=dist(a,b);if(len<14)continue;
   const hz=near(a.y,b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,lw=(hz?22:9)*hs,lh=(hz?9:22)*hs;
   over+=`<g data-seg="${w.id}:${i}" style="cursor:${hz?'ns-resize':'ew-resize'}"><rect x="${mx-16*hs}" y="${my-16*hs}" width="${32*hs}" height="${32*hs}" fill="#000" fill-opacity="0"/><rect x="${mx-lw/2}" y="${my-lh/2}" width="${lw}" height="${lh}" rx="${4.5*hs}" fill="#fff" stroke="#0a84ff" stroke-width="${2.5*hs}"/></g>`}}
 if(mode==='wire')for(const it of S.items){if(!isVis(it))continue;const p=pos(it);for(const t of termsOf(it)){const ref=it.id+':'+t.id,on=ref===pending,r=t.hr||13;
  over+=`<circle data-term="${ref}" cx="${p.x+t.x}" cy="${p.y+t.y}" r="${r}" fill="${on?'rgba(255,149,0,.45)':'rgba(10,132,255,.13)'}" stroke="${on?'#ff9500':'#0a84ff'}" stroke-width="${on?3:1.5}"/>`}}
 return out+over}
let rq=0;
function render(){world.innerHTML=buildScene(false)}
function renderSoon(){if(rq)return;rq=requestAnimationFrame(()=>{rq=0;if(dragReroute){computeRoutes(dragReroute);dragReroute=null}render()})}
function applyView(){world.setAttribute('transform',`translate(${view.x},${view.y}) scale(${view.k})`);
 const g=18*view.k,G=g*5,bp=`${view.x}px ${view.y}px`;cv.style.backgroundSize=`${G}px ${G}px,${G}px ${G}px,${g}px ${g}px,${g}px ${g}px`;cv.style.backgroundPosition=[bp,bp,bp,bp].join(',');
 cv.style.backgroundImage=g<7?'linear-gradient(#dcd8cc 1px,transparent 1px),linear-gradient(90deg,#dcd8cc 1px,transparent 1px)':''}
function contentBBox(){let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;const add=(x,y)=>{x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y)};
 for(const it of S.items){if(!isVis(it))continue;const p=pos(it),s=size(it);add(p.x-(it.type==='comb'?40:0),p.y-20);add(p.x+s.w,p.y+s.h+20)}
 for(const w of S.wires){if(!isVis(w))continue;const P=getPts(w);if(P)P.forEach(q=>{add(q.x-6,q.y-6);add(q.x+6,q.y+6)})}
 if(!isFinite(x1))return {x:0,y:0,w:600,h:400};return {x:x1,y:y1,w:x2-x1,h:y2-y1}}
const isWide=()=>innerWidth>=900;
function viewArea(){const r=cv.getBoundingClientRect(),open=document.body.classList.contains('sheet-open');let x=0,y=0,w=r.width-68,h=r.height;
 if(open){if(isWide()){x=$('#sheet').offsetWidth;w-=x}else h-=$('#sheet').offsetHeight}return {x,y,w,h}}
function fit(){const a=viewArea(),b=contentBBox(),pad=30;const k=clamp(Math.min((a.w-pad*2)/b.w,(a.h-pad*2-50)/b.h),.12,2.2);
 view.k=k;view.x=a.x+(a.w-b.w*k)/2-b.x*k;view.y=a.y+50+(a.h-50-b.h*k)/2-b.y*k;applyView();render()}
function viewCenterWorld(){const a=viewArea();return {x:(a.x+a.w/2-view.x)/view.k,y:(a.y+a.h/2-view.y)/view.k}}
function ensureVisible(it){const p=pos(it),s=size(it),a=viewArea();const sx=p.x*view.k+view.x,sy=p.y*view.k+view.y,ex=sx+s.w*view.k,ey=sy+s.h*view.k;
 if(sx<a.x||ex>a.x+a.w||sy<a.y+50||ey>a.y+a.h){view.x+=a.x+a.w/2-(sx+ex)/2;view.y+=a.y+a.h/2-(sy+ey)/2;applyView()}}

/* ---------- selection ---------- */
let multi=false;
const isSel=(k,id)=>sel.some(s=>s.kind===k&&s.id===id);
const one=()=>sel.length===1?sel[0]:null;
function select(kind,id,add){if(!kind){sel=[];multi=false}else if(add){sel=isSel(kind,id)?sel.filter(s=>!(s.kind===kind&&s.id===id)):sel.concat([{kind,id}])}else sel=[{kind,id}];render();updUI()}
function pruneSel(){sel=sel.filter(s=>{const o=objOf(s);return o&&isVis(o)&&!isLocked(o)})}

/* ---------- pointer interaction ---------- */
const ptrs=new Map();let gst=null;
function toWorld(cx,cy){const r=cv.getBoundingClientRect();return {x:(cx-r.left-view.x)/view.k,y:(cy-r.top-view.y)/view.k}}
const attachedWires=ids=>S.wires.filter(w=>ids.has(w.a.split(':')[0])||ids.has(w.b.split(':')[0])).map(w=>w.id);
cv.addEventListener('pointerdown',e=>{
 if(e.isPrimary&&ptrs.size){ptrs.clear();gst=null}
 try{cv.setPointerCapture(e.pointerId)}catch(_){}
 ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(ptrs.size===2){const [a,b]=[...ptrs.values()];if(gst&&gst.moved&&(gst.type==='item'||gst.type==='seg'))finishDrag();gst={type:'pinch',d0:dist(a,b),m0:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},v0:{...view},moved:true};return}
 if(ptrs.size>2)return;
 const t=e.target,wp=toWorld(e.clientX,e.clientY),tg={term:t.closest('[data-term]')?.dataset.term,seg:t.closest('[data-seg]')?.dataset.seg,wire:t.closest('[data-wire]')?.dataset.wire,item:t.closest('[data-id]')?.dataset.id,pt:wp};
 if(mode==='select'&&tg.wire&&!tg.seg){const it=itemAt(wp),w=S.wires.find(x=>x.id===tg.wire);if(it&&w&&distToWire(w,wp)>wireW(w.size)/2+3/view.k){tg.wire=undefined;tg.item=it.id}}
 gst={type:'pan',sx:e.clientX,sy:e.clientY,v0:{...view},moved:false,tg,add:e.shiftKey||e.ctrlKey||e.metaKey,slop:e.pointerType==='touch'?10:5};
 if(tg.seg&&mode==='select'){const k=tg.seg.lastIndexOf(':');gst.type='seg';gst.id=tg.seg.slice(0,k);gst.i=+tg.seg.slice(k+1)}
 else if(mode==='select'&&tg.item&&!tg.wire){const it=find(tg.item);if(it&&(!D(it).needSel||isSel('item',it.id))){const p=pos(it);gst.type='item';gst.id=it.id;gst.off={x:wp.x-p.x,y:wp.y-p.y}}}
});
function itemAt(pt){const order=[];S.layers.forEach((L,li)=>{if(!L.visible||L.locked)return;S.items.forEach(it=>{if(layerOf(it.layer).id===L.id&&!NOOBS.has(it.type))order.push({it,k:li*10+D(it).z})})});
 order.sort((a,b)=>b.k-a.k);for(const {it} of order){const p=pos(it),s=size(it);if(pt.x>=p.x&&pt.x<=p.x+s.w&&pt.y>=p.y&&pt.y<=p.y+s.h)return it}return null}
function distToWire(w,pt){const P=getPts(w);if(!P)return Infinity;let best=Infinity;for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L2=(b.x-a.x)**2+(b.y-a.y)**2;const t=L2?clamp(((pt.x-a.x)*(b.x-a.x)+(pt.y-a.y)*(b.y-a.y))/L2,0,1):0;best=Math.min(best,dist(pt,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}))}return best}
function startSeg(){const w=S.wires.find(x=>x.id===gst.id),P0=w&&getPts(w);if(!P0){gst.type='none';return}
 pushUndo();const P=P0.map(p=>({x:p.x,y:p.y}));let i=gst.i;const hz=near(P[i].y,P[i+1].y);
 if(i===0){P.splice(1,0,{...P[0]});i=1}if(i+1===P.length-1)P.splice(P.length-1,0,{...P[P.length-1]});
 gst.P=P;gst.i=i;gst.hz=hz}
cv.addEventListener('pointermove',e=>{
 if(!ptrs.has(e.pointerId)||!gst)return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(gst.type==='pinch'){if(ptrs.size<2)return;const [a,b]=[...ptrs.values()],r=cv.getBoundingClientRect(),v=gst.v0;const k=clamp(v.k*dist(a,b)/gst.d0,.12,4);
  const wx=(gst.m0.x-r.left-v.x)/v.k,wy=(gst.m0.y-r.top-v.y)/v.k,m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};view.k=k;view.x=m.x-r.left-wx*k;view.y=m.y-r.top-wy*k;applyView();return}
 if(gst.type==='none')return;
 const dx=e.clientX-gst.sx,dy=e.clientY-gst.sy;
 if(!gst.moved){if(Math.hypot(dx,dy)<gst.slop)return;gst.moved=true;
  if(gst.type==='item'){pushUndo();if(!isSel('item',gst.id)){sel=[{kind:'item',id:gst.id}];updUI()}ensureRoutes();
   const it=find(gst.id),ids=new Set([gst.id]);if(it.type==='rail')S.items.forEach(c=>{if(c.rail===it.id)ids.add(c.id)});gst.wires=attachedWires(ids)}
  if(gst.type==='seg')startSeg()}
 const wp=toWorld(e.clientX,e.clientY);
 if(gst.type==='pan'){view.x=gst.v0.x+dx;view.y=gst.v0.y+dy;applyView()}
 else if(gst.type==='item'){const it=find(gst.id);if(!it)return;const nx=wp.x-gst.off.x,ny=wp.y-gst.off.y;dragReroute=gst.wires;
  if(D(it).rail){const sn=findSnap(it,nx,ny);if(sn){it.rail=sn.rail;it.slot=sn.slot;renderSoon();return}}
  it.rail=null;it.x=g9(nx);it.y=g9(ny);if(it.type==='rail'){const t=railJoinTarget(it);if(t){it.y=t.o.y;it.x=t.side==='right'?t.o.x+size(t.o).w:t.o.x-size(it).w}}renderSoon()}
 else if(gst.type==='seg'&&gst.P){const v=gst.hz?wp.y:wp.x,sv=settings.snap?Math.round(v/4.5)*4.5:Math.round(v),P=gst.P,i=gst.i;
  if(gst.hz){P[i].y=sv;P[i+1].y=sv}else{P[i].x=sv;P[i+1].x=sv}routes.set(gst.id,P.map(p=>({...p})));renderSoon()}
});
function railJoinTarget(r){const rw=size(r).w;let best=null;
 for(const o of S.items){if(o.type!=='rail'||o.id===r.id||layerOf(o.layer).locked)continue;if(Math.abs(o.y-r.y)>30)continue;const ow=size(o).w;
  const gR=r.x-(o.x+ow),gL=o.x-(r.x+rw);const overlap=r.x<o.x+ow&&r.x+rw>o.x;
  if(overlap||Math.abs(gR)<=40||Math.abs(gL)<=40){const side=(r.x+rw/2)>=(o.x+ow/2)?'right':'left';const d=Math.min(Math.abs(gR),Math.abs(gL));if(!best||d<best.d)best={o,side,d}}}
 return best}
function joinRails(r,t){const o=t.o,oT=railTotal(o),rT=railTotal(r);
 if(t.side==='right'){S.items.forEach(c=>{if(c.rail===r.id){c.rail=o.id;c.slot+=oT}})}
 else{S.items.forEach(c=>{if(c.rail===o.id)c.slot+=rT;else if(c.rail===r.id)c.rail=o.id});o.x=r.x}
 o.props.mod+=r.props.mod;S.items=S.items.filter(i=>i.id!==r.id);sel=[{kind:'item',id:o.id}];
 toast(`Rails joined → one ${o.props.mod}-module rail (Undo to separate)`)}
function packRail(r){const kids=S.items.filter(c=>c.rail===r.id&&D(c).occupy).sort((a,b)=>a.slot-b.slot);let at=0,moved=0;
 for(const c of kids){if(c.slot!==at)moved++;c.slot=at;at+=D(c).units(c.props)}
 S.items.filter(c=>c.rail===r.id&&!D(c).occupy).forEach(c=>{const u=D(c).units(c.props);if(c.slot+u>railTotal(r))c.slot=Math.max(0,railTotal(r)-u)});return moved}
function finishDrag(){if(gst.type==='item'){const it=find(gst.id);if(it&&it.type==='rail'){const t=railJoinTarget(it);if(t)joinRails(it,t)}}if(gst.type==='seg'){const w=S.wires.find(x=>x.id===gst.id);if(w&&gst.P){const Q=simplify(gst.P);w.path=Q.slice(1,-1);if(!w.path.length)delete w.path}}commit()}
function endPtr(e,cancel){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);if(!gst)return;
 if(gst.type==='pinch'){if(ptrs.size===0)gst=null;else gst={type:'none',moved:true};render();return}
 if(gst.type==='none'){if(ptrs.size===0)gst=null;return}
 const g=gst;gst=null;
 try{if(!g.moved&&!cancel)onTap(g.tg,g.add);else if(g.moved&&(g.type==='item'||g.type==='seg')){gst=g;finishDrag();gst=null}}catch(err){gst=null;reportError(err)}}
cv.addEventListener('pointerup',e=>endPtr(e,false));
cv.addEventListener('pointercancel',e=>endPtr(e,true));
cv.addEventListener('lostpointercapture',e=>{if(ptrs.has(e.pointerId))endPtr(e,true)});
let wheelT=0;
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*.0015));clearTimeout(wheelT);wheelT=setTimeout(render,150)},{passive:false});
function zoomAt(mx,my,f){const k=clamp(view.k*f,.12,4),wx=(mx-view.x)/view.k,wy=(my-view.y)/view.k;view.k=k;view.x=mx-wx*k;view.y=my-wy*k;applyView()}
function onTap(tg,add){
 if(mode==='wire'){if(tg.term)return termTap(tg.term);if(tg.wire)return select('wire',tg.wire);if(pending){pending=null;render();updUI();return}if(sel.length)select(null);return}
 if(tg.seg)return;add=add||multi;const o=one();
 if(tg.wire){if(!add&&o&&o.kind==='wire'&&o.id===tg.wire)return splitAt(tg.wire,tg.pt);return select('wire',tg.wire,add)}
 if(tg.item){if(!add&&o&&o.kind==='item'&&o.id===tg.item)return openProps(tg.item);return select('item',tg.item,add)}
 if(!multi)select(null)}
function splitAt(id,pt){const w=S.wires.find(x=>x.id===id),P0=w&&getPts(w);if(!P0)return;let bi=-1,bd=Infinity,bp=null;
 for(let i=0;i<P0.length-1;i++){const a=P0[i],b=P0[i+1],L2=(b.x-a.x)**2+(b.y-a.y)**2;if(L2<1)continue;const t=clamp(((pt.x-a.x)*(b.x-a.x)+(pt.y-a.y)*(b.y-a.y))/L2,0,1),q={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)},d=dist(q,pt);if(d<bd){bd=d;bi=i;bp=q}}
 if(bi<0)return;const a=P0[bi],b=P0[bi+1];if(dist(a,bp)<10||dist(b,bp)<10)return toast('Tap further from a corner to add a bend');
 pushUndo();const P=P0.map(p=>({...p})),X={x:Math.round(bp.x*2)/2,y:Math.round(bp.y*2)/2};P.splice(bi+1,0,{...X},{...X});w.path=P.slice(1,-1);commit();toast('Bend added — drag a handle to shape it')}
function termTap(ref){if(!pending){pending=ref;render();updUI();return}
 if(pending===ref){pending=null;render();updUI();return}
 if(S.wires.some(w=>(w.a===pending&&w.b===ref)||(w.a===ref&&w.b===pending))){toast('These terminals are already connected');pending=null;render();updUI();return}
 pushUndo();const L=layerOf(S.defs.wires);if(!L.visible){L.visible=true;toast(`Layer "${L.name}" turned on`)}
 S.wires.push({id:uid(),a:pending,b:ref,color:settings.wireColor,size:settings.wireSize,layer:L.id});pending=null;commit()}

/* ---------- editing actions ---------- */
function addFromLib(type,props,title){const d=DEFS[type];pushUndo();
 const L=layerOf(S.defs.items);if(L.locked){L.locked=false}if(!L.visible){L.visible=true;toast(`Layer "${L.name}" turned on`)}
 const it=normalize({id:uid(),type,props:{...d.defaults,...props},x:0,y:0,rail:null,slot:0,layer:L.id});const s=size(it);let placed=false;
 if(d.rail){const rails=S.items.filter(r=>r.type==='rail').sort((a,b)=>a.y-b.y||a.x-b.x);const u=d.units(it.props);
  for(const r of rails){const sl=d.occupy?firstFree(r,u,it.id):(u<=railTotal(r)?0:null);if(sl!=null){it.rail=r.id;it.slot=sl;placed=true;break}}}
 if(!placed){const c=viewCenterWorld();it.x=g9(c.x-s.w/2);it.y=g9(c.y-s.h/2);if(d.rail)toast('No free rail space — placed on canvas')}
 S.items.push(it);sel=[{kind:'item',id:it.id}];commit();ensureVisible(it);if(placed||!d.rail)toast(`Added ${title}`)}
function afterPropChange(it){const d=D(it);
 if(it.type==='rail')it.props.mod=clamp(Math.round(+it.props.mod||12),2,120);
 if(it.type==='rail')for(const c of S.items)if(c.rail===it.id&&c.slot+D(c).units(c.props)>railTotal(it))detach(c);
 if(d.rail&&it.rail){const r=getRail(it.rail),u=d.units(it.props);if(r){if(!d.occupy){if(it.slot+u>railTotal(r))it.slot=Math.max(0,railTotal(r)-u);if(u>railTotal(r))detach(it)}
  else if(!isFree(r,it.slot,u,it.id)){const sl=firstFree(r,u,it.id,it.slot);if(sl!=null)it.slot=sl;else{detach(it);toast('Not enough rail space — device detached')}}}}
 pruneWires()}
function delSel(){if(!sel.length)return;pushUndo();
 const wids=new Set(sel.filter(s=>s.kind==='wire').map(s=>s.id)),iids=new Set(sel.filter(s=>s.kind==='item').map(s=>s.id));
 S.wires=S.wires.filter(w=>!wids.has(w.id));
 for(const id of iids){const it=find(id);if(it&&it.type==='rail')S.items.filter(c=>c.rail===it.id&&!iids.has(c.id)).forEach(detach)}
 S.items=S.items.filter(i=>!iids.has(i.id));pruneWires();sel=[];multi=false;commit()}
function dupSel(){const o=one();if(!o||o.kind!=='item')return;const it=find(o.id);if(!it)return;pushUndo();const c=JSON.parse(JSON.stringify(it));c.id=uid();
 if(c.rail){const r=getRail(c.rail),d=D(c),u=d.units(c.props);const sl=d.occupy?firstFree(r,u,c.id,it.slot+u):null;if(sl!=null)c.slot=sl;else{detach(c);c.x+=27;c.y+=27}}
 else{c.x+=27;c.y+=27}
 S.items.push(c);sel=[{kind:'item',id:c.id}];commit()}
function moveSelTo(lid){const L=layerOf(lid);if(!sel.length||!L)return;pushUndo();const n=sel.length;
 for(const s of sel){const o=objOf(s);if(o)o.layer=L.id}
 if(!L.visible||L.locked)sel=[];commit();toast(`Moved ${n} to "${L.name}"${L.visible?'':' (hidden)'}`)}

/* ---------- UI: library ---------- */
let curTab=0;
function thumb(type,props){const it=normalize({id:'x',type,props:{...DEFS[type].defaults,...props}});const d=D(it),s=size(it);let g=d.draw(it.props,s.w,s.h);
 if(d.screw)for(const t of termsOf(it))g+=screw(t.x,t.y,d.screw);
 const pl=type==='comb'?40:8,pt=type==='supply'?22:8,pb=type==='outgoing'?24:8;
 return `<svg viewBox="${-pl} ${-pt} ${s.w+pl+8} ${s.h+pt+pb}" preserveAspectRatio="xMidYMid meet">${g}</svg>`}
function renderTabs(){const LIB=appMode==='room'?ROOM_LIB:PANEL_LIB;if(curTab>=LIB.length)curTab=0;$('#tabs').innerHTML=LIB.map((t,i)=>`<button class="tab ${i===curTab?'on':''}" data-tab="${i}">${t.tab}</button>`).join('');
 $('#lib').innerHTML=LIB[curTab].groups.map(g=>`<h4>${g.g}</h4><div class="grid">${g.items.map(([t,p,n],j)=>`<button class="card" data-add="${t}" data-props='${esc(JSON.stringify(p))}' data-title="${esc(n)}">${appMode==='room'?roomThumb(t,p):thumb(t,p)}<span>${esc(n)}</span></button>`).join('')}</div>`).join('');$('#lib').scrollTop=0}
$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;curTab=+b.dataset.tab;renderTabs()};
$('#lib').onclick=e=>{const b=e.target.closest('[data-add]');if(!b)return;(appMode==='room'?roomAdd:addFromLib)(b.dataset.add,JSON.parse(b.dataset.props),b.dataset.title)};
function setSheet(open){document.body.classList.toggle('sheet-open',open)}
$('#bAdd').onclick=()=>setSheet(!document.body.classList.contains('sheet-open'));
(()=>{let y0=null;const g=$('#grip');g.addEventListener('pointerdown',e=>{y0=e.clientY;try{g.setPointerCapture(e.pointerId)}catch(_){}});g.addEventListener('pointerup',e=>{if(y0==null)return;const dy=e.clientY-y0;y0=null;if(dy>30||Math.abs(dy)<6)setSheet(false)})})();

/* ---------- UI: bars ---------- */
const ICON={
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',share:'<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
 undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',redo:'<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
 wire:'<path d="M6 18c0-7 12-5 12-12"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/>',fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',
 layers:'<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
 eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',unlock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
 up:'<path d="M6 15l6-6 6 6"/>',down:'<path d="M6 9l6 6 6-6"/>',more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>'};
const ic=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
[['bMenu','menu'],['bShare','share'],['bUndo','undo'],['bRedo','redo'],['bWire','wire'],['bLayers','layers'],['bFit','fit'],['bAdd','plus']].forEach(([id,n])=>$('#'+id).innerHTML=ic(n));
function chips(cur,attr){return `<div class="chips">${WIRE_COLORS.map(([c,n])=>`<button class="chip ${c==='gy'?'gy':c==='auto'?'auto':''} ${c===cur?'on':''}" ${attr}="${c}" title="${n}" style="${c!=='gy'&&c!=='auto'?'background:'+c:''}">${c==='auto'?'A':''}</button>`).join('')}</div>`}
const sizeSel=(cur,attr)=>`<select class="bb" ${attr}>${WIRE_SIZES.map(s=>`<option value="${s}" ${+s===+cur?'selected':''}>${s} mm²</option>`).join('')}</select>`;
function layerSel(){const ls=new Set(sel.map(s=>objOf(s)?.layer));const cur=ls.size===1?[...ls][0]:'';
 return `<label class="lsel">Layer<select class="bb" data-mvl>${cur?'':'<option value="" selected disabled>Mixed</option>'}${S.layers.slice().reverse().map(l=>`<option value="${esc(l.id)}" ${l.id===cur?'selected':''}>${esc(l.name)}${l.visible?'':' (hidden)'}${l.locked?' (locked)':''}</option>`).join('')}</select></label>`}
function updButtons(){$('#modeSw').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.mode===appMode));$('#bUndo').disabled=!undoS.length;$('#bRedo').disabled=!redoS.length;$('#bWire').classList.toggle('on',mode==='wire');
 $('#bLayers').classList.toggle('on',!$('#layers').classList.contains('hidden'));$('#bLayers').classList.toggle('dot',S.layers&&S.layers.some(l=>!l.visible))}
function updUI(){if(appMode==='room'){updButtons();$('#wirebar').classList.add('hidden');return roomUpdUI()}
 pruneSel();updButtons();$('#roomTabs').innerHTML='';document.body.classList.toggle('wiring',mode==='wire');
 const wb=$('#wirebar'),sb=$('#selbar');
 if(mode==='wire'){const L=layerOf(S.defs.wires);wb.classList.remove('hidden');wb.innerHTML=`<div class="ttl">Wiring<small>→ layer “${esc(L.name)}”</small></div>${chips(settings.wireColor,'data-wc')}${sizeSel(settings.wireSize,'data-ws')}<button class="bb pri" data-act="wdone">Done</button><div class="hint">${pending?'Now tap the destination terminal (tap the same one to cancel).':'Tap a terminal to start a wire. Wires route around devices automatically.'}</div>`}else wb.classList.add('hidden');
 const o=one(),mb=`<button class="bb ${multi?'pri':''}" data-act="multi">${multi?'Multi ✓':'Select more'}</button>`,cl=`<button class="bb" data-act="close">✕</button>`;let html='';
 if(sel.length>1){const ni=sel.filter(s=>s.kind==='item').length,nw=sel.length-ni;
  html=`<div class="ttl">${sel.length} selected<small>${ni} part${ni===1?'':'s'} · ${nw} wire${nw===1?'':'s'}</small></div>${layerSel()}${nw&&!ni?`<button class="bb" data-act="reroute">Auto route</button>`:''}<button class="bb danger" data-act="del">Delete</button>${mb}${cl}`}
 else if(o&&o.kind==='item'){const it=find(o.id),d=D(it);
  html=`<div class="ttl">${esc(d.name(it.props))}<small>${esc(it.props.label||(d.desc?d.desc(it.props):''))}</small></div><button class="bb" data-act="edit">Edit</button>${it.type==='rail'?'<button class="bb" data-act="pack">Close gaps</button>':''}<button class="bb" data-act="dup">Copy</button>${layerSel()}<button class="bb danger" data-act="del">Delete</button>${mb}${cl}`}
 else if(o&&o.kind==='wire'){const w=S.wires.find(w=>w.id===o.id);
  html=`<div class="ttl">Wire${w.path?' · manual':''}<small>${w.size} mm² · ${COLOR_NAME[w.color]||'Custom'}</small></div>${chips(w.color,'data-sc')}${sizeSel(w.size,'data-ss')}${w.path?'<button class="bb" data-act="reroute">Auto route</button>':''}${layerSel()}<button class="bb danger" data-act="del">Delete</button>${mb}${cl}<div class="hint">${mode==='select'?'Drag a blue handle to move that run · tap the wire to add a bend.':''}</div>`}
 sb.innerHTML=html;sb.classList.toggle('hidden',!html);
 $('#titleChip').classList.toggle('hidden',mode==='wire'||!!html);
 const hid=S.layers.filter(l=>!l.visible).length;
 $('#titleChip').innerHTML=`${esc(S.name)}<small>v${APP_VERSION}${hid?` · ${hid} layer${hid>1?'s':''} hidden`:''}</small>`}
const selWires=()=>sel.filter(s=>s.kind==='wire').map(s=>S.wires.find(w=>w.id===s.id)).filter(Boolean);
$('#bars').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.id==='titleChip')return openProjects();
 if(b.dataset.wc){settings.wireColor=b.dataset.wc;saveSettings();updUI();return}
 if(b.dataset.sc){const ws=selWires();if(ws.length){pushUndo();ws.forEach(w=>w.color=b.dataset.sc);commit()}return}
 const a=b.dataset.act;if(!a)return;const o=one();
 if(a==='wdone')return setMode('select');
 if(a==='edit'&&o)return openProps(o.id);
 if(a==='dup')return dupSel();
 if(a==='pack'&&o){const r=find(o.id);pushUndo();const n=packRail(r);if(!n){undoS.pop();updButtons();return toast('No gaps on this rail')}commit();toast(`Closed gaps — ${n} device${n>1?'s':''} moved`)}
 if(a==='del')return delSel();
 if(a==='close')return select(null);
 if(a==='multi'){multi=!multi;updUI();if(multi)toast('Tap parts and wires to add or remove them');return}
 if(a==='reroute'){const ws=selWires().filter(w=>w.path);if(ws.length){pushUndo();ws.forEach(w=>delete w.path);commit()}}});
$('#bars').addEventListener('change',e=>{const t=e.target;
 if(t.hasAttribute('data-ws')){settings.wireSize=+t.value;saveSettings()}
 if(t.hasAttribute('data-ss')){const ws=selWires();if(ws.length){pushUndo();ws.forEach(w=>w.size=+t.value);commit()}}
 if(t.hasAttribute('data-mvl')&&t.value)moveSelTo(t.value)});
function setMode(m){mode=m;pending=null;if(m==='wire'){sel=[];multi=false}render();updUI();if(m==='wire'){setSheet(false);toast('Wire mode — tap two terminals')}}
$('#bWire').onclick=()=>setMode(mode==='wire'?'select':'wire');
$('#bUndo').onclick=doUndo;$('#bRedo').onclick=doRedo;$('#bFit').onclick=()=>appMode==='room'?roomFit():fit();$('#bShare').onclick=()=>appMode==='room'?roomExport():exportPNG();$('#bMenu').onclick=openMenu;
$('#titleChip').onclick=openProjects;
/** Switch between the panel designer and the room designer. */
function setAppMode(m){if(m===appMode)return;if(appMode==='panel'&&mode==='wire')setMode('select');appMode=m;settings.mode=m;saveSettings();sel=[];multi=false;
 document.body.classList.toggle('room',m==='room');if(m==='room')toggleLayers(false);curTab=0;renderTabs();
 if(m==='room')roomEnter();else{roomLeave();render();requestAnimationFrame(fit)}updUI()}
$('#modeSw').onclick=e=>{const b=e.target.closest('[data-mode]');if(b)setAppMode(b.dataset.mode)};

/* ---------- UI: layers panel ---------- */
const lp=$('#layers');
function toggleLayers(open){lp.classList.toggle('hidden',open===undefined?!lp.classList.contains('hidden'):!open);renderLayers();updButtons()}
$('#bLayers').onclick=()=>toggleLayers();
function layerCounts(id){return {i:S.items.filter(x=>layerOf(x.layer).id===id).length,w:S.wires.filter(x=>layerOf(x.layer).id===id).length}}
function renderLayers(){if(lp.classList.contains('hidden'))return;const n=S.layers.length;
 const rows=S.layers.map((l,idx)=>({l,idx})).reverse().map(({l,idx})=>{const c=layerCounts(l.id),tags=(S.defs.items===l.id?'<span class="tag">new parts</span>':'')+(S.defs.wires===l.id?'<span class="tag">new wires</span>':'');
  return `<div class="lrow ${l.visible?'':'hid'}"><button class="ib ${l.visible?'':'off'}" data-lv="${esc(l.id)}" title="${l.visible?'Hide':'Show'}">${ic(l.visible?'eye':'eyeoff')}</button><button class="ib ${l.locked?'on':'off'}" data-ll="${esc(l.id)}" title="${l.locked?'Unlock':'Lock'}">${ic(l.locked?'lock':'unlock')}</button>
  <div class="lname"><span>${esc(l.name)}</span><small>${c.i} part${c.i===1?'':'s'} · ${c.w} wire${c.w===1?'':'s'}${tags}</small></div>
  <button class="ib" data-lup="${idx}" ${idx===n-1?'disabled':''} title="Move up">${ic('up')}</button><button class="ib" data-ldn="${idx}" ${idx===0?'disabled':''} title="Move down">${ic('down')}</button><button class="ib" data-lmore="${esc(l.id)}" title="More">${ic('more')}</button>
  ${sel.length?`<button class="bb lmv" data-lmv="${esc(l.id)}">Move ${sel.length} selected here</button>`:''}</div>`}).join('');
 lp.innerHTML=`<div class="lhead"><b>Layers</b><button class="ib" data-lclose title="Close">${ic('x')}</button></div>${rows}<div class="lfoot"><button class="bb" data-ladd>+ Add layer</button><button class="bb" data-lall>Show all</button></div><p class="muted" style="margin:6px 4px 2px">Hidden layers are not drawn or exported. Locked layers can't be selected or moved.</p>`}
function setLayerFlag(id,k){const l=layerOf(id);l[k]=!l[k];pruneSel();save();render();updUI();renderLayers()}
lp.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if('lclose' in d)return toggleLayers(false);
 if(d.lv)return setLayerFlag(d.lv,'visible');
 if(d.ll)return setLayerFlag(d.ll,'locked');
 if(d.lup||d.ldn){const i=+(d.lup||d.ldn),j=d.lup?i+1:i-1;if(j<0||j>=S.layers.length)return;pushUndo();[S.layers[i],S.layers[j]]=[S.layers[j],S.layers[i]];return commit()}
 if(d.lmv)return moveSelTo(d.lmv);
 if(d.lmore)return openLayerMenu(d.lmore);
 if('ladd' in d){pushUndo();let k=S.layers.length+1;while(S.layers.some(l=>l.name==='Layer '+k))k++;S.layers.push({id:uid(),name:'Layer '+k,visible:true,locked:false});commit();toast('Layer added — tap ⋯ to rename');return}
 if('lall' in d){S.layers.forEach(l=>l.visible=true);save();render();updUI();renderLayers()}});
function openLayerMenu(id){const l=layerOf(id),c=layerCounts(id);
 openModal(`<h3>Layer</h3><form id="lf"><label>Name<input name="n" value="${esc(l.name)}" maxlength="30" autocomplete="off"></label>
 <label class="row"><input type="checkbox" name="di" ${S.defs.items===id?'checked disabled':''}>New parts go on this layer</label>
 <label class="row"><input type="checkbox" name="dw" ${S.defs.wires===id?'checked disabled':''}>New wires go on this layer</label>
 <p class="muted">${c.i} parts · ${c.w} wires</p>
 <div class="mact"><button type="button" class="bb" id="lSelAll">Select all on layer</button><button type="button" class="bb danger" id="lDel" ${S.layers.length<2?'disabled':''}>Delete layer</button></div>
 <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button class="bb pri">Save</button></div></form>`,box=>{
 box.querySelector('#lf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);pushUndo();const nm=String(fd.get('n')||'').trim();if(nm)l.name=nm;
  if(fd.get('di'))S.defs.items=id;if(fd.get('dw'))S.defs.wires=id;closeModal();commit()};
 box.querySelector('#lSelAll').onclick=()=>{if(!l.visible||l.locked){toast('Show and unlock the layer first');return}closeModal();if(mode==='wire')setMode('select');
  sel=S.items.filter(x=>layerOf(x.layer).id===id).map(x=>({kind:'item',id:x.id})).concat(S.wires.filter(x=>layerOf(x.layer).id===id).map(x=>({kind:'wire',id:x.id})));multi=sel.length>0;render();updUI();renderLayers()};
 box.querySelector('#lDel').onclick=()=>{const other=S.layers.find(x=>x.id!==id);const ti=S.defs.items!==id?S.defs.items:other.id,tw=S.defs.wires!==id?S.defs.wires:other.id;
  if(!confirm(`Delete layer "${l.name}"? Its ${c.i} parts move to "${layerOf(ti).name}" and ${c.w} wires to "${layerOf(tw).name}".`))return;
  pushUndo();S.items.forEach(x=>{if(layerOf(x.layer).id===id)x.layer=ti});S.wires.forEach(x=>{if(layerOf(x.layer).id===id)x.layer=tw});
  S.layers=S.layers.filter(x=>x.id!==id);if(S.defs.items===id)S.defs.items=ti;if(S.defs.wires===id)S.defs.wires=tw;closeModal();commit()}})}

/* ---------- modals ---------- */
const modal=$('#modal'),mbox=$('#modal .mbox');
function openModal(html,mount){mbox.innerHTML=html;modal.classList.remove('hidden');mbox.scrollTop=0;mount&&mount(mbox)}
function closeModal(){modal.classList.add('hidden');mbox.innerHTML=''}
modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-close]'))closeModal()});
function openProps(id){const it=find(id);if(!it)return;const d=D(it);
 if(!d.props.length){toast('This item has no properties');return}
 const f=d.props.map(f=>{const v=it.props[f.k];
  if(f.type==='select')return `<label>${f.label}<select name="${f.k}">${f.opts.map(o=>`<option value="${esc(o)}" ${String(o)===String(v)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
  if(f.type==='number')return `<label>${f.label}<input name="${f.k}" type="number" inputmode="numeric" value="${esc(v)}"></label>`;
  return `<label>${f.label}<input name="${f.k}" value="${esc(v)}" maxlength="40" autocomplete="off"></label>`}).join('');
 openModal(`<h3>${esc(d.name(it.props))}</h3><form id="pf">${f}${d.desc?`<p class="muted">${esc(d.desc(it.props))}</p>`:''}<div class="mact"><button type="button" class="bb" data-close>Cancel</button><button type="submit" class="bb pri">Apply</button></div></form>`,box=>{
  box.querySelector('#pf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);pushUndo();
   for(const f of d.props){let v=fd.get(f.k);if(f.type==='select'&&typeof f.opts[0]==='number')v=Number(v);if(f.type==='number')v=Number(v)||0;it.props[f.k]=v}
   afterPropChange(it);closeModal();commit()}})}
function openMenu(){openModal(`<h3>Menu</h3><div class="mlist">
 <button data-m="projects">Projects <small>${esc(S.name)}</small></button>
 <button data-m="mode">${appMode==='room'?'Panel designer':'Room designer'} <small>switch</small></button>${appMode==='room'?'<button data-m="roomset">Room settings <small>size, wall names</small></button>':''}
 <button data-m="bom">Bill of materials <small>BOM & rail usage</small></button>
 <button data-m="png">Export image <small>PNG</small></button>
 <button data-m="svg">Export drawing <small>SVG</small></button>
 <button data-m="json">Export project <small>.json</small></button>
 <button data-m="import">Import project <small>.json</small></button>
 <button data-m="layers">Layers <small>${S.layers.length}</small></button>
 <button data-m="rerouteall">Auto-route all wires <small>resets manual paths</small></button>
 <button data-m="clearw">Remove all wires</button>
 <button data-m="settings">Settings</button>
 <button data-m="help">How to use</button>
 <button data-m="about">About <small>v${APP_VERSION}</small></button></div><div class="mact"><button class="bb" data-close>Close</button></div>`,box=>{
 box.querySelector('.mlist').onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;const m=b.dataset.m;closeModal();
  ({projects:openProjects,mode:()=>setAppMode(appMode==='room'?'panel':'room'),roomset:()=>openRoomSettings(),bom:openBOM,png:()=>appMode==='room'?roomExport():exportPNG(),svg:()=>appMode==='room'?roomExport(true):shareOrDownload(new Blob([exportSVG().svg],{type:'image/svg+xml'}),fname()+'.svg'),json:exportJSON,import:()=>$('#fileIn').click(),
   clearw:()=>{if(!S.wires.length)return toast('No wires');if(confirm('Remove all wires?')){pushUndo();S.wires=[];sel=[];commit()}},layers:()=>toggleLayers(true),
   rerouteall:()=>{if(!S.wires.some(w=>w.path))return toast('All wires are already auto-routed');pushUndo();S.wires.forEach(w=>delete w.path);commit();toast('Wires re-routed')},settings:openSettings,help:openHelp,
   about:()=>openModal(`<h3>DB Panel Designer</h3><p class="muted">Version ${APP_VERSION}<br>Panel + room designer · works offline · data stored on this device.<br>3D by three.js (MIT).</p><div class="mact"><button class="bb pri" data-close>OK</button></div>`)})[m]()}})}
function openSettings(){openModal(`<h3>Settings</h3><form id="sf">
 <label>Wire colour scheme (Auto)<select name="scheme">${Object.entries(SCHEMES).map(([k,v])=>`<option value="${k}" ${k===settings.scheme?'selected':''}>${v.name}</option>`).join('')}</select></label>
 <label class="row"><input type="checkbox" name="snap" ${settings.snap?'checked':''}>Snap free items to grid</label>
 <label class="row"><input type="checkbox" name="labels" ${settings.labels?'checked':''}>Show circuit labels</label>
 <div class="mact"><button type="button" class="bb" data-close>Cancel</button><button class="bb pri">Save</button></div></form>`,box=>{
 box.querySelector('#sf').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);settings.scheme=fd.get('scheme');settings.snap=!!fd.get('snap');settings.labels=!!fd.get('labels');saveSettings();closeModal();render();renderTabs();updUI()}})}
function openHelp(){openModal(`<h3>How to use</h3><div class="help">
 <p><b>Add parts:</b> tap + to open the library, then tap a part. Devices drop into the first free space on a DIN rail.</p>
 <p><b>Move:</b> drag a device along or between rails — it snaps to module positions. Drag it off a rail to place it freely. Rails and enclosures must be selected first before dragging.</p>
 <p><b>Edit:</b> tap a part to select, tap again (or Edit) to change rating, poles, curve, label etc.</p>
 <p><b>Wire:</b> tap the wire button, then tap two terminals. Wires route around devices automatically and spread out so they don't overlap. Pick colour and size in the bar (Auto colours by phase).</p>
 <p><b>Shape a wire:</b> select it, then drag any blue handle to move that run. Tap the selected wire to add a bend at that spot. <i>Auto route</i> returns it to automatic.</p>
 <p><b>Layers:</b> tap the layers button. Use the eye to show/hide and the lock to freeze a layer. Add layers, rename them with ⋯, and choose which layer new parts and new wires go on. Move things between layers with the Layer dropdown in the selection bar or <i>Move selected here</i>.</p>
 <p><b>Multi-select:</b> tap <i>Select more</i> (or Shift/Ctrl-click) to pick several parts and wires, then move them to a layer or delete them together.</p>
 <p><b>Navigate:</b> drag empty space to pan, pinch or mouse-wheel to zoom, ⤢ to fit.</p>
 <p><b>Room designer:</b> switch to <i>Room</i> at the top. Pick a wall (A–D) or the ceiling to place points on a flat view with heights and distances, then open <i>3D</i> to see the whole room — drag to rotate, pinch to zoom, two fingers to pan. Tap a wall in 3D to edit it.</p>
 <p><b>Keys:</b> W wire mode · L layers · Del delete · Ctrl+Z / Ctrl+Y · Ctrl+D copy · Esc deselect.</p>
 <p class="muted">Everything autosaves on this device. Use Export project to back up or move to another device.</p></div><div class="mact"><button class="bb pri" data-close>Got it</button></div>`)}

/* ---------- projects ---------- */
function blankDoc(){const r={id:uid(),type:'rail',props:{mod:12,label:''},x:0,y:0,rail:null,slot:0,layer:'base'};return {name:'Untitled panel',items:[r],wires:[],layers:defaultLayers(),defs:{items:'base',wires:'wires'}}}
function demoDoc(){const it=[];const mk=(type,props,extra)=>{const o=normalize({id:uid(),type,props:{...DEFS[type].defaults,...props},x:0,y:0,rail:null,slot:0,...extra});it.push(o);return o};
 const r1=mk('rail',{mod:12},{x:0,y:0}),r2=mk('rail',{mod:18},{x:-108,y:320});
 const vr=mk('vrelay',{},{rail:r1.id,slot:4}),ms=mk('mcb',{poles:2,rating:40,label:'MAIN'},{rail:r1.id,slot:8}),rc1=mk('rcd',{poles:2,rating:40},{rail:r1.id,slot:12});
 const sp=mk('mcb',{poles:1,rating:6,curve:'B',label:'SPARE'},{rail:r2.id,slot:10});
 const names=['LIGHT 1','LIGHT 2','SKT 1','SKT 2','A/C 1','W/H'],rt=[10,10,16,16,20,20],m=[];
 for(let i=0;i<6;i++)m.push(mk('mcb',{poles:1,rating:rt[i],curve:i<2?'B':'C',label:names[i]},{rail:r2.id,slot:12+i*2}));
 const comb=mk('comb',{poles:1,mod:6},{rail:r2.id,slot:12}),rc2=mk('rcd',{poles:2,rating:40},{rail:r2.id,slot:24});
 const sup=mk('supply',{ph:1},{x:-261,y:-171}),eb=mk('busbar',{kind:'PE',holes:8},{x:-270,y:558}),nb1=mk('busbar',{kind:'N',holes:8},{x:189,y:558}),nb2=mk('busbar',{kind:'N',holes:8},{x:423,y:558});
 mk('earthsym',{},{x:-333,y:551,layer:'earth'});eb.layer='earth';
 const W=(a,b,size=6)=>({id:uid(),a,b,color:'auto',size,layer:'wires'});
 const wires=[W(sup.id+':L',vr.id+':t0',10),W(sup.id+':N',vr.id+':t1',10),W(vr.id+':b0',ms.id+':t0',10),W(vr.id+':b1',ms.id+':t1',10),W(ms.id+':b0',rc1.id+':t0'),W(ms.id+':b1',rc1.id+':t1'),
  W(rc1.id+':b0',comb.id+':f'),W(rc1.id+':b1',nb1.id+':h0'),W(ms.id+':b0',rc2.id+':t0'),W(ms.id+':b1',rc2.id+':t1'),W(rc2.id+':b1',nb2.id+':h0'),Object.assign(W(sup.id+':PE',eb.id+':h0',10),{layer:'earth'})];
 it.forEach(o=>{if(!o.layer)o.layer='base'});
 return {name:'Demo — 1φ house DB',items:it,wires,layers:[{id:'base',name:'Components',visible:true,locked:false},{id:'earth',name:'Earthing',visible:true,locked:false},{id:'wires',name:'Wires',visible:true,locked:false}],defs:{items:'base',wires:'wires'},room:demoRoom()}}
function loadDoc(id){const P=loadProjects(),rec=P[id];if(!rec)return false;curId=id;S=migrate({name:rec.name,...(rec.data||{})});
 pruneWires();invalidate();undoS=[];redoS=[];sel=[];multi=false;pending=null;lsSet(LS_C,id);roomReset();if(appMode==='room')roomRefresh(true);else{render();requestAnimationFrame(fit)}updUI();renderLayers();return true}
function newProject(doc){save();curId=uid();S=migrate(doc);save();loadDoc(curId)}
function openProjects(){const P=loadProjects(),ids=Object.keys(P).sort((a,b)=>(P[b].updated||0)-(P[a].updated||0));
 const rows=ids.map(id=>`<div class="prow ${id===curId?'cur':''}"><b>${esc(P[id].name)}</b><small>${new Date(P[id].updated||Date.now()).toLocaleString()} · ${(P[id].data?.items||[]).length} items · ${(P[id].data?.wires||[]).length} wires</small><div class="pbtns">${id===curId?'<span class="badge">OPEN</span>':`<button class="bb pri" data-open="${id}">Open</button>`}<button class="bb" data-ren="${id}">Rename</button><button class="bb" data-copy="${id}">Copy</button><button class="bb danger" data-delp="${id}">Delete</button></div></div>`).join('');
 openModal(`<h3>Projects</h3>${rows||'<p class="muted">No projects yet.</p>'}<div class="mact"><button class="bb" data-new="demo">New from demo</button><button class="bb pri" data-new="blank">New blank</button><button class="bb" data-close>Close</button></div>`,box=>{
 box.onclick=e=>{const b=e.target.closest('button');if(!b)return;const P=loadProjects();
  if(b.dataset.open){closeModal();save();loadDoc(b.dataset.open)}
  else if(b.dataset.ren){const id=b.dataset.ren,n=prompt('Project name',P[id].name);if(n&&n.trim()){if(id===curId){S.name=n.trim();save();updUI()}else{P[id].name=n.trim();saveProjects(P)}openProjects()}}
  else if(b.dataset.copy){save();const src=loadProjects()[b.dataset.copy];closeModal();newProject({...JSON.parse(JSON.stringify(src.data)),name:src.name+' (copy)'});toast('Project copied')}
  else if(b.dataset.delp){const id=b.dataset.delp;if(!confirm(`Delete "${P[id].name}"? This cannot be undone.`))return;delete P[id];saveProjects(P);
   if(id===curId){const rest=Object.keys(P);curId=null;if(rest.length)loadDoc(rest.sort((a,c)=>(P[c].updated||0)-(P[a].updated||0))[0]);else newProject(blankDoc())}openProjects()}
  else if(b.dataset.new){closeModal();newProject(b.dataset.new==='demo'?demoDoc():blankDoc());setSheet(true)}}})}

/* ---------- export / import ---------- */
const fname=()=>(S.name||'panel').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-')||'panel';
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
async function shareOrDownload(blob,name){try{const f=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}download(blob,name);toast('Downloaded '+name)}
function exportSVG(){const b=contentBBox(),pad=30,x=b.x-pad,y=b.y-pad,w=b.w+pad*2,h=b.h+pad*2+30;
 const foot=txt(x+w-12,y+h-12,`${S.name}  ·  ${new Date().toLocaleDateString()}  ·  DB Panel Designer v${APP_VERSION}`,11,'#6b7075',600,'end');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/><g font-family="Arial,Helvetica,sans-serif">${buildScene(true)}</g>${foot}</svg>`;
 return {svg,w,h}}
function exportPNG(){if(!S.items.length)return toast('Nothing to export');if(S.layers.some(l=>!l.visible))setTimeout(()=>toast('Hidden layers are not included'),2400);const {svg,w,h}=exportSVG();const sc=Math.min(3,6000/Math.max(w,h));const img=new Image();
 img.onload=()=>{const c=document.createElement('canvas');c.width=Math.round(w*sc);c.height=Math.round(h*sc);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?shareOrDownload(b,fname()+'.png'):toast('Export failed'),'image/png')};
 img.onerror=()=>toast('Export failed');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
function exportJSON(){const o={app:'db-panel-designer',appVersion:APP_VERSION,schema:2,name:S.name,exported:new Date().toISOString(),...docData()};shareOrDownload(new Blob([JSON.stringify(o,null,1)],{type:'application/json'}),fname()+'.json')}
$('#fileIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const o=JSON.parse(await f.text());if(!Array.isArray(o.items)||!Array.isArray(o.wires))throw 0;newProject({...o,name:(o.name||'Imported panel')+''});toast('Project imported')}catch(_){toast('Not a valid panel project file')}};

/* ---------- BOM ---------- */
function openBOM(){const m=new Map();for(const it of S.items){const d=D(it);if(!d.desc)continue;const k=d.desc(it.props);m.set(k,(m.get(k)||0)+1)}
 const wm=new Map();for(const w of S.wires){const L=wireLen(w);if(L==null)continue;const k=`Wire ${w.size} mm² ${COLOR_NAME[wireColor(w)]||'Custom'}`;wm.set(k,(wm.get(k)||0)+L)}
 const rows=[...m].sort().map(([k,q])=>[k,q,'pcs']).concat([...wm].sort().map(([k,L])=>[k,(L/2000*1.15).toFixed(2),'m']));
 const rails=S.items.filter(r=>r.type==='rail').sort((a,b)=>a.y-b.y).map((r,i)=>{const used=S.items.filter(c=>c.rail===r.id&&D(c).occupy).reduce((a,c)=>a+D(c).units(c.props),0)/2;return `<tr><td>${esc(r.props.label||'Rail '+(i+1))}</td><td class="n">${used} / ${r.props.mod} mod</td><td class="n">${r.props.mod-used} free</td></tr>`}).join('');
 rows.push(...roomBOMRows());
 const csv=[['Item','Qty','Unit']].concat(rows).map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
 openModal(`<h3>Bill of materials</h3><table class="bom"><tr><th>Item</th><th class="n">Qty</th><th></th></tr>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="n">${r[1]}</td><td>${r[2]}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">No components yet</td></tr>'}</table>
 <p class="muted">Includes the panel and the room points. Panel wire lengths are measured from the panel drawing (1 module = 18 mm) plus 15% allowance. Room cable is each point measured back to the DB along the conduit route (radial, not looped-in) plus 10% — a loop-in install will come out shorter.</p>${rails?`<h3 style="margin-top:14px">Rail usage</h3><table class="bom">${rails}</table>`:''}
 <div class="mact"><button class="bb" id="bCopy">Copy CSV</button><button class="bb" id="bCsv">Download CSV</button><button class="bb pri" data-close>Close</button></div>`,box=>{
 box.querySelector('#bCopy').onclick=async()=>{try{await navigator.clipboard.writeText(csv);toast('BOM copied')}catch(_){toast('Copy not available here')}};
 box.querySelector('#bCsv').onclick=()=>shareOrDownload(new Blob([csv],{type:'text/csv'}),fname()+'-BOM.csv')})}

/* ---------- misc ---------- */
function reportError(err){console.error(err);toast('Error: '+((err&&err.message)||err))}
window.addEventListener('error',e=>toast('Error: '+e.message));
window.addEventListener('unhandledrejection',e=>toast('Error: '+((e.reason&&e.reason.message)||e.reason)));
let tt=0;function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2200)}
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea')||!modal.classList.contains('hidden'))return;const k=e.key.toLowerCase(),c=e.ctrlKey||e.metaKey;
 if(appMode==='room'&&roomKey(e,k,c))return;
 if(c&&k==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo()}else if(c&&k==='y'){e.preventDefault();doRedo()}else if(c&&k==='d'){e.preventDefault();dupSel()}
 else if(k==='delete'||k==='backspace'){if(sel.length){e.preventDefault();delSel()}}else if(k==='l'&&!c)toggleLayers();else if(k==='escape'){if(mode==='wire')setMode('select');else select(null)}else if(k==='w'&&!c)setMode(mode==='wire'?'select':'wire')});
document.addEventListener('gesturestart',e=>e.preventDefault());

/* ---------- boot ---------- */
window.addEventListener('DOMContentLoaded',function boot(){document.body.classList.toggle('room',appMode==='room');if(appMode==='room')roomEnter(true);renderTabs();const P=loadProjects();let id=lsGet(LS_C);
 if(!id||!P[id]){const ids=Object.keys(P).sort((a,b)=>(P[b].updated||0)-(P[a].updated||0));id=ids[0]||null}
 if(id&&loadDoc(id))return;
 curId=uid();const d=demoDoc();S=migrate(d);save();loadDoc(curId)});
applyView();
