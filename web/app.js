/* Down the Stack — one app, two modes.
   Server mode: data comes from the local API (/api/*); progress, bookmarks and notes are saved in SQLite.
   Standalone mode: window.DATA is embedded by tools/build.py; progress is kept in this browser only. */
(async function(){
"use strict";
const STANDALONE = !!window.DATA;
const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lc = l => `var(--l${l})`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 900px)").matches;
const SECTIONS = ["value","history","how","example","intuition","friction","practice"];
const KIND = {paper:"Paper",book:"Book",blog:"Article",docs:"Docs",course:"Course",video:"Video",spec:"Spec"};
const SIDE = {alt:"Alternative", comp:"Works with", evol:"Evolved from", related:"Related"};

function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove("on"), 2200); }

/* ---------------- data layer ---------------- */
async function api(method, path, body){
  const opt = {method, headers:{}};
  if(body!==undefined){ opt.headers["Content-Type"]="application/json"; opt.body=JSON.stringify(body); }
  const r = await fetch(path, opt);
  if(!r.ok){ let m = r.status+""; try{ m=(await r.json()).error||m; }catch(e){} throw new Error(m); }
  return r.json();
}
let DATA;
const READS = {};
try {
  if(STANDALONE){
    DATA = window.DATA;
    DATA.nodes.forEach(n=>{ READS[n.id]={id:n.id, rd:n.rd, refs:n.refs}; n.b=(n.rd.value||[""])[0]; n.q=(n.rd.intuition||[""])[0]; n.nr=n.refs.length; });
    DATA.layers.forEach(l=>{ READS[l.id]={id:l.id, rd:l.rd, refs:l.refs}; });
  } else {
    DATA = await api("GET","/api/graph");
  }
} catch(e){
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">Could not load the map: ${esc(e.message)}. Is the server running? Try <code>./run.sh</code>.</div>`;
  return;
}
$("mode").textContent = STANDALONE ? "standalone" : "local server";
$("mode").title = STANDALONE ? "Progress is saved in this browser only." : "Progress, bookmarks and notes are saved in data/user.db.";

const LAYERS = DATA.layers.map(l=>({n:l.n, d:l.d, rm:l.rm, id:l.id}));
const N = {}; DATA.nodes.forEach(n=>{ N[n.id]=n; n.kids=[]; n.pars=[]; n.side=[]; });
DATA.edges.forEach(e=>{ N[e.s].kids.push(e); N[e.t].pars.push(e); });
DATA.side.forEach(s=>{ N[s.a].side.push({o:s.b,t:s.t,r:s.r}); N[s.b].side.push({o:s.a,t:s.t,r:s.r}); });
const byLabel = (a,b)=>a.label.localeCompare(b.label);
DATA.nodes.forEach(n=>{ n.kids.sort((a,b)=> N[a.t].l-N[b.t].l || (a.k===b.k?0:a.k==="builds"?-1:1) || byLabel(N[a.t],N[b.t])); n.indeg = n.pars.filter(e=>e.k==="builds").length; });
const byLayer = [0,1,2,3,4,5].map(l=>DATA.nodes.filter(n=>n.l===l));
const hubs = DATA.nodes.filter(n=>n.l>=1).sort((a,b)=>b.indeg-a.indeg).slice(0,24);
const hubSet = new Set(hubs.map(n=>n.id));
const deepList = DATA.nodes.filter(n=>n.deep).sort((a,b)=>a.l-b.l||byLabel(a,b));
const CUR = DATA.curriculum || {programs:[], courses:[]};
const COURSE = {}; CUR.courses.forEach(c=>COURSE[c.code]=c);
const TAUGHT = {}; CUR.courses.forEach(c=>c.concepts.forEach(id=>(TAUGHT[id]=TAUGHT[id]||[]).push(c.code)));
const courseLabel = code => code.replace(/^([A-Z]+)(\d)/,"$1 $2");

const LSKEY = "dts:user:v1";
const BOX_DAYS = [0, 1, 3, 7, 21, 60];   // Leitner box -> days until the next review
function today(off){ const d=new Date(); d.setDate(d.getDate()+(off||0)); return d.toISOString().slice(0,10); }
function lsLoad(){ try{ return JSON.parse(localStorage.getItem(LSKEY))||null; }catch(e){ return null; } }
function lsSave(u){ try{ localStorage.setItem(LSKEY, JSON.stringify(u)); }catch(e){} }
const Store = {
  me: {progress:{}, bookmarks:[], notes:{}, time:{}, recent:[], review:{}},
  local: null,
  async init(){
    if(STANDALONE){ this.local = lsLoad() || {progress:{}, bookmarks:[], notes:{}, time:{}}; this.local.review = this.local.review || {}; this.syncLocal(); }
    else { try{ this.me = await api("GET","/api/me"); }catch(e){ toast("Could not load your progress"); } }
  },
  syncLocal(){
    const u=this.local, now=new Date().toISOString().slice(0,19);
    const recent = Object.entries(Object.assign({}, ...Object.entries(u.time).map(([k,v])=>({[k]:v.at})), ...Object.entries(u.progress).map(([k,v])=>({[k]:v.at}))))
      .sort((a,b)=>a[1]<b[1]?1:-1).slice(0,12).map(([id,at])=>({id,at}));
    this.me = {review:u.review||{}, progress:u.progress, bookmarks:u.bookmarks, notes:Object.fromEntries(Object.entries(u.notes).filter(([k,v])=>v.length).map(([k,v])=>[k,v.length])), time:Object.fromEntries(Object.entries(u.time).map(([k,v])=>[k,v.s])), recent};
    lsSave(u); return now;
  },
  stamp(){ return new Date().toISOString().slice(0,19); },
  async read(id){
    if(READS[id]) return READS[id];
    const r = await api("GET","/api/read/"+encodeURIComponent(id)); READS[id]=r; return r;
  },
  status(id){ const p=this.me.progress[id]; return p?p.status:null; },
  isBookmarked(id){ return this.me.bookmarks.some(b=>b.id===id); },
  async setProgress(id, status){
    if(STANDALONE){ if(status) this.local.progress[id]={status, at:this.stamp()}; else delete this.local.progress[id]; this.syncLocal(); }
    else this.me = status ? await api("PUT","/api/progress/"+id,{status}) : await api("DELETE","/api/progress/"+id);
    if(status==="read" && N[id]) { try{ await this.enroll(id); }catch(e){} }
  },
  async setReview(id, q, box, due){
    if(STANDALONE){ this.local.review[id+"#"+q]=[box, due]; this.syncLocal(); return; }
    this.me = await api("PUT","/api/review/"+id+"/"+q,{box, due});
  },
  // add a concept's self-check questions to the review deck (box 1, due today); returns how many were added
  async enroll(id){
    const r = await this.read(id), n = (r.rd && r.rd.quiz || []).length; let added = 0;
    for(let q=0; q<n; q++){ if(!this.me.review[id+"#"+q]){ await this.setReview(id, q, 1, today()); added++; } }
    return added;
  },
  async toggleBookmark(id){
    const on = this.isBookmarked(id);
    if(STANDALONE){ if(on) this.local.bookmarks=this.local.bookmarks.filter(b=>b.id!==id); else this.local.bookmarks.unshift({id, at:this.stamp()}); this.syncLocal(); return !on; }
    this.me = on ? await api("DELETE","/api/bookmarks/"+id) : await api("PUT","/api/bookmarks/"+id,{}); return !on;
  },
  async addTime(id, s){
    if(s<3) return;
    if(STANDALONE){ const t=this.local.time[id]||{s:0}; t.s+=Math.min(1800,Math.round(s)); t.at=this.stamp(); this.local.time[id]=t; this.syncLocal(); return; }
    try{ this.me = await api("POST","/api/time/"+id,{seconds:Math.round(s)}); }catch(e){}
  },
  async notes(id){ if(STANDALONE) return (this.local.notes[id]||[]).slice(); return api("GET","/api/notes?node="+encodeURIComponent(id)); },
  async addNote(id, body){
    if(STANDALONE){ const t=this.stamp(); (this.local.notes[id]=this.local.notes[id]||[]).push({id:Date.now(), body, created_at:t, updated_at:t}); this.syncLocal(); return; }
    await api("POST","/api/notes",{node:id, body}); this.me.notes[id]=(this.me.notes[id]||0)+1;
  },
  async delNote(id, noteId){
    if(STANDALONE){ this.local.notes[id]=(this.local.notes[id]||[]).filter(n=>n.id!==noteId); this.syncLocal(); return; }
    await api("DELETE","/api/notes/"+noteId); this.me.notes[id]=Math.max(0,(this.me.notes[id]||1)-1);
  },
  async search(q){
    if(!STANDALONE){ try{ return (await api("GET","/api/search?limit=14&q="+encodeURIComponent(q))).results; }catch(e){} }
    return localSearch(q);
  },
  async library(){
    if(!STANDALONE) return (await api("GET","/api/library")).works;
    return localLibrary();
  },
  exportData(){
    if(!STANDALONE){ location.href="/api/export"; return; }
    const text = JSON.stringify(this.local,null,2);
    const done = ()=>toast("Your data (JSON) was copied to the clipboard");
    try{ navigator.clipboard.writeText(text).then(done, ()=>window.prompt("Copy your data:", text)); }catch(e){ window.prompt("Copy your data:", text); }
  }
};
await Store.init();

/* ---------- local fallbacks (standalone) ---------- */
function readText(id){ const r=READS[id]; return r ? SECTIONS.flatMap(s=>r.rd[s]||[]).join(" ") : ""; }
function localSearch(q){
  const s=q.trim().toLowerCase(); if(!s) return [];
  const terms = s.split(/\s+/).filter(Boolean);
  const all = DATA.nodes.map(n=>({id:n.id,label:n.label,l:n.l,m:n.m,cat:n.cat})).concat(DATA.layers.map(l=>({id:l.id,label:"Layer "+l.l+": "+l.n,l:l.l,m:l.d,cat:""})));
  const out=[];
  for(const n of all){
    const lab=n.label.toLowerCase();
    let sc = lab===s?0 : lab.startsWith(s)?1 : lab.includes(s)?2 : (n.cat||"").toLowerCase().includes(s)?3 : n.m.toLowerCase().includes(s)?4 : 9;
    let text="";
    if(sc===9){ text=readText(n.id); const tl=text.toLowerCase(); if(tl.includes(s)) sc=5; else if(terms.every(t=>tl.includes(t))) sc=6; }
    if(sc<9) out.push({id:n.id,label:n.label,score:sc,snippet:sc>=5?snip(text,sc===5?s:terms[0]):"", l:n.l});
  }
  return out.sort((a,b)=>a.score-b.score||a.l-b.l).slice(0,14);
}
function snip(text, term){
  const i=text.toLowerCase().indexOf(term); if(i<0) return "";
  const a=Math.max(0,i-70), b=Math.min(text.length,i+term.length+90);
  return (a>0?"… ":"")+text.slice(a,i)+"\u0002"+text.slice(i,i+term.length)+"\u0003"+text.slice(i+term.length,b)+(b<text.length?" …":"");
}
function workKey(r){ return r.t.toLowerCase().replace(/\s*\(.*?\)/g,"").replace(/,?\s*(\d+(st|nd|rd|th)\s+ed\.?|ch\.\s*[\w–-]+.*)$/,"").replace(/[^a-z0-9]+/g," ").trim(); }
function localLibrary(){
  const works={};
  const add=(owner, refs)=>refs.forEach(r=>{ const k=workKey(r); const w=works[k]||(works[k]={k:r.k,t:r.t,w:r.w,u:"",by:[]}); if(r.u&&!w.u) w.u=r.u; const tt=r.t.replace(/,\s*ch(apter)?s?\.?\s.*$/,""); if(tt.length<w.t.length||w.t===r.t) w.t=tt; if(!w.by.includes(owner)) w.by.push(owner); });
  DATA.nodes.forEach(n=>add(n.id, READS[n.id].refs)); DATA.layers.forEach(l=>add(l.id, READS[l.id].refs));
  return Object.values(works).sort((a,b)=>b.by.length-a.by.length||a.t.localeCompare(b.t));
}

/* ---------------- graph helpers ---------------- */
function under(id){
  const seen=new Set([id]), q=[id], out=[[],[],[],[],[],[]];
  while(q.length){ const c=q.shift(); N[c].kids.forEach(e=>{ if(e.k!=="builds"||seen.has(e.t)) return; seen.add(e.t); q.push(e.t); out[N[e.t].l].push(e.t); }); }
  return out;
}
function aboveByLayer(id){
  const seen=new Set([id]), q=[id], out=[0,0,0,0,0,0];
  while(q.length){ const c=q.shift(); N[c].pars.forEach(e=>{ if(e.k!=="builds"||seen.has(e.s)) return; seen.add(e.s); q.push(e.s); out[N[e.s].l]++; }); }
  return out;
}
const label = id => /^L\d$/.test(id) ? "Layer "+id[1]+": "+LAYERS[+id[1]].n : N[id].label;
const layerOf = id => /^L\d$/.test(id) ? +id[1] : N[id].l;
function refURL(r){
  if(r.u) return r.u;
  const who = r.w.replace(/\(.*?\)/g,"").split(/[,;]/)[0].trim();
  const q = encodeURIComponent((r.t+" "+who).trim());
  return r.k==="paper" ? "https://scholar.google.com/scholar?q="+q : "https://www.google.com/search?q="+q;
}
const markHTML = id => { const s=Store.status(id); return s==="read"?`<span class="mark" title="Read">✓</span>`:s==="reading"?`<span class="mark reading" title="Started">◐</span>`:""; };

/* ---------------- state ---------------- */
const state = { program:"bs", course:"CS111", view:"explore", start:0, path:["kafka","commitlog","wal"], sel:"wal", tour:0, tstep:0, filter:"", expand:{}, libKind:"all", libQ:"", libN:120 };

/* ---------------- strip ---------------- */
function renderStrip(){
  const reached = new Set(state.path.map(id=>N[id].l));
  if(state.view!=="explore" && state.sel) reached.add(N[state.sel].l);
  $("strip").innerHTML = LAYERS.map((L,i)=>{
    const done = byLayer[i].filter(n=>Store.status(n.id)==="read").length, pct = Math.round(100*done/byLayer[i].length);
    return `${i?'<span class="arrow" aria-hidden="true" style="align-self:center;color:var(--muted)">↓</span>':""}<button type="button" class="lp${reached.has(i)?" reached":""}" style="--c:${lc(i)}" data-layer="${i}" aria-pressed="${state.view==="explore"&&state.start===i}" title="${esc(L.d)}${done?` · ${done} read`:""}"><span class="sw"></span><span class="ln">L${i}</span><span class="nm">${esc(L.n)}</span><span class="ct">${done?done+"/":""}${byLayer[i].length}</span><span class="pg" style="width:${pct}%"></span></button>`; }).join("");
}

/* ---------------- explore ---------------- */
function itemHTML(n, col, edge, pressed){
  const why = edge ? `<span class="it-why">${esc(edge.r)}</span>` : "";
  const tags = (edge&&edge.k==="inspired"?`<span class="tag">analogy</span>`:"") + (edge&&N[edge.s].l===n.l?`<span class="tag">uses</span>`:"") + `<span class="tag">L${n.l}</span>` + (n.deep?`<span class="tag">deep</span>`:"");
  const kids = n.kids.length;
  return `<button type="button" class="item" style="--c:${lc(n.l)}" data-col="${col}" data-id="${n.id}" aria-pressed="${pressed}"><span class="bar${edge&&edge.k==="inspired"?" dash":""}"></span><span><span class="it-top"><span class="it-label">${esc(n.label)}</span>${tags}</span>${why}</span><span class="it-n" title="${kids} parts below">${markHTML(n.id)}${kids?kids+" ›":""}</span></button>`;
}
function renderTrail(){
  if(!state.path.length){ $("trail").innerHTML = `<span class="lbl">Your path</span><span class="empty">Pick anything in the first column to start breaking it down.</span>`; return; }
  $("trail").innerHTML = `<span class="lbl">Your path</span>` + state.path.map((id,i)=>`${i?'<span class="sep">↓</span>':""}<button type="button" class="crumb" style="--c:${lc(N[id].l)}" data-crumb="${i}"><span class="sw"></span>${esc(N[id].label)}</button>`).join("")
    + (state.path.length>1?`<button type="button" class="rlist" data-rpath>Read this path · ${state.path.reduce((s,id)=>s+N[id].rm,0)} min · ${state.path.reduce((s,id)=>s+N[id].nr,0)} sources</button>`:"");
}
function renderCols(scroll){
  const L = state.start, f = state.filter.trim().toLowerCase();
  const first = byLayer[L].filter(n=>!f || (n.label+" "+n.cat+" "+n.m).toLowerCase().includes(f));
  const cats = [...new Set(first.map(n=>n.cat))];
  let html = `<div class="col" style="--c:${lc(L)}"><div class="col-h"><span class="k">Start · L${L}</span><span class="t">${esc(LAYERS[L].n)}</span><button type="button" class="essay-link" style="--c:${lc(L)}" data-essay="${L}">Read what this layer adds · ${LAYERS[L].rm} min</button><input id="cf" type="search" placeholder="Filter this layer" value="${esc(state.filter)}" aria-label="Filter layer"></div><div class="col-b">` +
    (first.length ? cats.map(c=>`<div class="cat">${esc(c)}</div>` + first.filter(n=>n.cat===c).sort(byLabel).map(n=>itemHTML(n,0,null,state.path[0]===n.id)).join("")).join("") : `<div class="bedrock">No matches in this layer.</div>`) + `</div></div>`;
  state.path.forEach((id,i)=>{
    const n = N[id];
    if(n.kids.length){
      const layers = [...new Set(n.kids.map(e=>N[e.t].l))].map(l=>"L"+l).join(", ");
      html += `<div class="col" style="--c:${lc(Math.min(5,n.l+1))}"><div class="col-h"><span class="k">${esc(n.label)} breaks down into · ${layers}</span><span class="t">${n.kids.length} part${n.kids.length===1?"":"s"}</span></div><div class="col-b">` +
        n.kids.map(e=>itemHTML(N[e.t], i+1, e, state.path[i+1]===e.t)).join("") + `</div></div>`;
    } else {
      html += `<div class="col" style="--c:${lc(n.l)}"><div class="col-h"><span class="k">Bottom reached</span><span class="t">${esc(n.label)}</span></div><div class="bedrock"><b>Bedrock.</b><span>This is a first principle in this map: nothing below it. Try another branch, or look at what is built on top of it in the panel.</span></div></div>`;
    }
  });
  const cols = $("cols"); cols.innerHTML = html;
  const cf = $("cf"); cf.addEventListener("input", ()=>{ state.filter = cf.value; const pos = cf.selectionStart; renderCols(false); const n=$("cf"); n.focus(); n.setSelectionRange(pos,pos); });
  if(scroll) requestAnimationFrame(()=>{ cols.scrollTo({left:cols.scrollWidth, behavior:reduced?"auto":"smooth"}); });
}

/* ---------------- neighbourhood graph (SVG) ---------------- */
function egoSVG(n){
  const W=360, BH=26, gapY=50, MAXR=7;
  const up = n.pars.slice().sort((a,b)=>N[b.s].indeg-N[a.s].indeg).map(e=>({id:e.s,k:e.k}));
  const down = n.kids.map(e=>({id:e.t,k:e.k}));
  const rows = [];
  if(up.length) rows.push(up); rows.push([{id:n.id,me:true}]); if(down.length) rows.push(down);
  const H = 18 + rows.length*BH + (rows.length-1)*gapY + 18;
  const pos = {}; let svg="";
  rows.forEach((row,ri)=>{
    let items = row.slice(0, MAXR); const extra = row.length - items.length;
    const k = items.length + (extra>0?1:0), bw = Math.min(150, (W-12)/k - 6), y = 18 + ri*(BH+gapY);
    items.forEach((it,i)=>{ const x = 6 + (W-12)*(i+.5)/k - bw/2; pos[it.id+(it.me?"#me":"")]={x:x+bw/2, y, it}; it.x=x; it.y=y; it.bw=bw; });
    if(extra>0){ const x = 6 + (W-12)*(k-.5)/k - bw/2; svg += `<text x="${x+bw/2}" y="${y+17}" text-anchor="middle" class="lt">+${extra} more</text>`; }
    row.length = 0; row.push(...items);
  });
  const me = rows[up.length?1:0][0];
  const curve = (x1,y1,x2,y2,cls)=>`<path class="${cls}" d="M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}"/>`;
  if(up.length) rows[0].forEach(it=>{ svg = curve(it.x+it.bw/2, it.y+BH, me.x+me.bw/2, me.y, it.k==="inspired"?"insp":"") + svg; });
  if(down.length) rows[rows.length-1].forEach(it=>{ svg = curve(me.x+me.bw/2, me.y+BH, it.x+it.bw/2, it.y, it.k==="inspired"?"insp":"") + svg; });
  rows.forEach(row=>row.forEach(it=>{
    const m = N[it.id], chars = Math.max(4, Math.floor(it.bw/6.2)); let t = m.label; if(t.length>chars) t = t.slice(0,chars-1)+"…";
    svg += `<g class="nd${it.me?" me":""}${Store.status(it.id)==="read"?" read":""}" style="--c:${lc(m.l)}" data-gsel="${it.id}" tabindex="0" role="button" aria-label="${esc(m.label)}"><title>${esc(m.label)} · L${m.l}</title><rect x="${it.x}" y="${it.y}" width="${it.bw}" height="${BH}" rx="6"/><text x="${it.x+it.bw/2}" y="${it.y+16.5}" text-anchor="middle">${esc(t)}</text></g>`;
  }));
  return `<svg class="ego" viewBox="0 0 ${W} ${H}" role="img" aria-label="What ${esc(n.label)} is built from, and what is built on it">${svg}</svg>`;
}

/* ---------------- panel ---------------- */
function relList(items, mk){ return `<div class="rel">${items.map(mk).join("")}</div>`; }
function renderPanel(){
  const p = $("panel");
  if(!state.sel){ p.innerHTML = introHTML(); return; }
  const n = N[state.sel], u = under(n.id), total = u.reduce((s,a)=>s+a.length,0), upTot = aboveByLayer(n.id).reduce((s,x)=>s+x,0);
  const inPath = state.view==="explore" && state.path.includes(n.id);
  const downs = n.kids.filter(e=>e.k==="builds"), insp = n.kids.filter(e=>e.k==="inspired");
  const ups = n.pars.slice().sort((a,b)=>N[a.s].l-N[b.s].l || byLabel(N[a.s],N[b.s]));
  const st = Store.status(n.id), bm = Store.isBookmarked(n.id);
  let h = `<div class="eyebrow"><span class="lpill" style="--c:${lc(n.l)}"><span class="sw"></span>L${n.l} · ${esc(LAYERS[n.l].n)}</span><span>${esc(n.cat)}</span>${n.y?`<span class="mono">${n.y.startsWith("-")?esc(n.y.slice(1))+" BCE":esc(n.y)}</span>`:""}${hubSet.has(n.id)?`<span class="kind" style="margin:0">hub</span>`:""}${n.deep?`<span class="kind" style="margin:0">deep read</span>`:""}${st?`<span class="kind" style="margin:0">${st==="read"?"✓ read":"started"}</span>`:""}</div>
    <h2>${esc(n.label)}</h2>
    ${n.st?`<p class="status">${esc(n.st)}</p>`:""}
    <p class="mech">${esc(n.m)}</p>
    ${n.b?`<p class="byte">${esc(n.b)}</p>`:""}
    ${n.q?`<p class="quip" style="--c:${lc(n.l)}"><b>The intuition</b>${esc(n.q)}</p>`:""}
    <div class="btnrow"><button type="button" class="btn primary" data-read="${n.id}">Read · ${n.rm} min</button>${!inPath?`<button type="button" class="btn" data-explore="${n.id}">Break this down</button>`:""}<button type="button" class="btn${bm?" on":""}" style="--c:${lc(n.l)}" data-bookmark="${n.id}" aria-pressed="${bm}">${bm?"★ Saved":"☆ Save"}</button></div>`;
  h += `<h3>Neighbourhood</h3>${egoSVG(n)}`;
  h += `<h3>Everything underneath · ${total} concepts</h3>`;
  if(total){
    h += `<div class="under" role="img" aria-label="Concepts underneath by layer">${u.map((a,l)=>a.length?`<span style="background:${lc(l)};flex:${a.length}" title="L${l}: ${a.length}"></span>`:"").join("")}</div>`;
    u.forEach((a,l)=>{ if(!a.length) return; const ex = state.expand[l]; const list = a.map(id=>N[id]).sort((x,y)=>y.indeg-x.indeg||byLabel(x,y)); const show = ex?list:list.slice(0,10);
      h += `<div class="ugrp"><div class="uh" style="--c:${lc(l)}"><span class="sw"></span>L${l} ${esc(LAYERS[l].n)} · ${a.length}</div><div class="chips">${show.map(m=>`<button type="button" class="chip${hubSet.has(m.id)?" hub":""}" style="--c:${lc(l)}" data-sel="${m.id}"><span class="sw"></span>${esc(m.label)}</button>`).join("")}</div>${list.length>10?`<button type="button" class="more" data-expand="${l}">${ex?"Show fewer":"Show all "+list.length}</button>`:""}</div>`; });
  } else h += `<p class="empty">Nothing below: this is bedrock in this map.</p>`;
  if(downs.length) h += `<h3>Breaks down into · ${downs.length}</h3>` + relList(downs, e=>`<button type="button" data-sel="${e.t}"><span class="bar" style="--c:${lc(N[e.t].l)}"></span><span><span class="rn">${esc(N[e.t].label)}</span><span class="kind">L${N[e.t].l}</span><span class="rw">${esc(e.r)}</span></span></button>`);
  if(insp.length) h += `<h3>Inspired by (analogy)</h3>` + relList(insp, e=>`<button type="button" data-sel="${e.t}"><span class="bar dash" style="--c:${lc(N[e.t].l)}"></span><span><span class="rn">${esc(N[e.t].label)}</span><span class="kind">L${N[e.t].l}</span><span class="rw">${esc(e.r)}</span></span></button>`);
  h += `<h3>Used by · ${ups.length} directly, ${upTot} in total</h3>` + (ups.length ? relList(ups, e=>`<button type="button" data-sel="${e.s}"><span class="bar${e.k==="inspired"?" dash":""}" style="--c:${lc(N[e.s].l)}"></span><span><span class="rn">${esc(N[e.s].label)}</span><span class="kind">L${N[e.s].l}</span><span class="rw">${esc(e.r)}</span></span></button>`) : `<p class="empty">Nothing in this map is built on it yet: it is a top-level product.</p>`);
  if(n.side.length) h += `<h3>Related · ${n.side.length}</h3>` + relList(n.side, s=>`<button type="button" data-sel="${s.o}"><span class="bar" style="--c:${lc(N[s.o].l)}"></span><span><span class="rn">${esc(N[s.o].label)}</span><span class="kind">${SIDE[s.t]||s.t}</span><span class="rw">${esc(s.r)}</span></span></button>`);
  if(TAUGHT[n.id]) h += `<h3>Taught in · Stanford</h3><div class="chips">${TAUGHT[n.id].map(code=>`<button type="button" class="chip" style="--c:var(--fg)" data-course="${code}"><span class="sw"></span>${esc(courseLabel(code))} ${esc(COURSE[code].title)}</button>`).join("")}</div>`;
  const rd = READS[n.id];
  h += `<h3>Go deeper · ${n.nr} source${n.nr===1?"":"s"}</h3>` + (rd ? `<div class="minirefs">${rd.refs.map(r=>`<a href="${esc(refURL(r))}" target="_blank" rel="noopener noreferrer"><span class="rk">${esc(KIND[r.k]||r.k)}</span><span class="rt">${esc(r.t)}</span> <span style="color:var(--muted)">· ${esc(r.w)}</span></a>`).join("")}</div>` : `<p class="empty">Loading sources…</p>`);
  p.innerHTML = h;
  if(!rd){ const id=n.id; Store.read(id).then(()=>{ if(state.sel===id) renderPanel(); }).catch(()=>{}); }
}
function introHTML(){
  const read = Object.values(Store.me.progress).filter(p=>p.status==="read").length;
  return `<div class="intro"><div class="eyebrow">How to use this</div><h2>Six layers, from tools to first principles</h2>
  <p>Every tool you use is built on ideas, which are built on older ideas, all the way down to physics and logic. Pick something at the top and keep clicking to break it down.</p>
  <ol><li><b>Explore:</b> each click opens the next column with what it is built on, and why.</li><li><b>Read:</b> every concept has a read (why it exists, how it works, what it stands on, why it makes sense, where it still hurts) and sources to go deeper. ${deepList.length} are deep reads of 5–12 minutes with history, a worked example and practical advice; the six layer essays take about 10 minutes each.</li><li><b>Tours:</b> ${DATA.tours.length} complete descents, such as Kafka down to quantum tunneling.</li><li><b>Library:</b> every book, paper and article cited, ranked by how many concepts rely on it.</li><li><b>You:</b> what you have read, saved and noted.</li></ol>
  ${read?`<p class="quip" style="--c:var(--l2)"><b>Your progress</b>${read} of ${DATA.nodes.length} concepts read. <button type="button" class="essay-link" style="display:inline;--c:var(--l2)" data-view="you">See your map</button></p>`:""}
  <h3>Start with the six layer essays</h3><div class="legend">${LAYERS.map((L,i)=>`<span class="sw" style="--c:${lc(i)}"></span><span><button type="button" class="essay-link" style="--c:${lc(i)};margin:0;display:inline" data-essay="${i}">L${i} ${esc(L.n)} · ${L.rm} min</button><br>${esc(L.d)}</span>`).join("")}</div>
  <p class="note">${DATA.nodes.length} concepts, ${DATA.edges.length} links, ${DATA.stats.refs} sources and about ${Math.round(DATA.stats.words/1000)}k words of reading. Versions checked as of October 2026. Dashed links are analogies rather than mechanisms. Press <span class="kbd">/</span> to search.</p></div>`;
}

/* ---------------- tours ---------------- */
function renderTours(){
  const t = DATA.tours[state.tour];
  $("v-tours").innerHTML = `<div class="tlist">${DATA.tours.map((x,i)=>{ const done=x.steps.filter(s=>Store.status(s[0])==="read").length; return `<button type="button" class="tcard" data-tour="${i}" aria-pressed="${i===state.tour}"><span class="tt">${esc(x.title)}</span><span class="ts">${esc(x.sub)}${done?` · ${done}/${x.steps.length} read`:""}</span><span class="tl" aria-hidden="true">${x.steps.map(s=>`<span style="--c:${lc(N[s[0]].l)};${Store.status(s[0])==="read"?"":"opacity:.45"}"></span>`).join("")}</span></button>`; }).join("")}</div>
  <div class="tsteps"><h2>${esc(t.title)}</h2><p class="sub">${esc(t.sub)} · ${t.steps.length} steps from L${N[t.steps[0][0]].l} to L${N[t.steps[t.steps.length-1][0]].l}</p><div class="btnrow" style="margin:-4px 0 14px"><button type="button" class="btn primary" data-rtour="0">Read the tour · ${t.steps.reduce((s,x)=>s+N[x[0]].rm,0)} min</button></div>
  ${t.steps.map((s,i)=>{ const n=N[s[0]]; return `<button type="button" class="step" style="--c:${lc(n.l)}" data-tstep="${i}" aria-pressed="${i===state.tstep}"><span class="rail"><span class="dot"></span></span><span class="body"><span class="sl"><span class="sn">${esc(n.label)}</span><span class="tag">L${n.l} · ${esc(LAYERS[n.l].n)}</span>${markHTML(n.id)}</span><span class="sx">${esc(s[1])}</span></span></button>`; }).join("")}</div>`;
}

/* ---------------- courses ---------------- */
function renderCourses(){
  const prog = CUR.programs.find(p=>p.id===state.program) || CUR.programs[0];
  if(!prog){ $("v-courses").innerHTML = `<p class="empty">No curriculum loaded.</p>`; return; }
  const c = COURSE[state.course] || COURSE[prog.groups[0].courses[0]];
  const done = id => Store.status(id)==="read";
  const card = code => { const k=COURSE[code]; if(!k) return ""; const d=k.concepts.filter(done).length; return `<button type="button" class="tcard" data-course="${code}" aria-pressed="${c&&c.code===code}"><span class="tt">${esc(courseLabel(code))} · ${esc(k.title)}</span><span class="ts">${k.concepts.length} concepts${d?` · ${d} read`:""}</span><span class="tl" aria-hidden="true">${k.concepts.map(id=>`<span style="--c:${lc(N[id].l)};${done(id)?"":"opacity:.45"}"></span>`).join("")}</span></button>`; };
  const lays = c ? [0,1,2,3,4,5].map(l=>c.concepts.filter(id=>N[id].l===l).length) : [];
  $("v-courses").innerHTML = `<div class="tlist"><div class="filters" role="group" aria-label="Program" style="margin:0 0 4px">${CUR.programs.map(p=>`<button type="button" data-program="${p.id}" aria-pressed="${p.id===prog.id}">${esc(p.id.toUpperCase())}</button>`).join("")}</div>
    <p class="ts" style="font-size:12px;color:var(--muted);margin:0 0 6px">${esc(prog.name)} · ${esc(prog.year)}. ${esc(prog.summary)} <a href="${esc(prog.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--muted)">Requirements ↗</a></p>
    ${prog.groups.map(g=>`<div class="cat" style="position:static;padding:8px 0 2px" title="${esc(g.note)}">${esc(g.name)}</div>${g.courses.map(card).join("")}`).join("")}</div>
  <div class="tsteps">${c?`<h2>${esc(courseLabel(c.code))}: ${esc(c.title)}</h2><p class="sub">${c.concepts.length} concepts in this map · ${esc(c.text)}${c.term&&c.term!=="—"?` · latest public term: ${esc(c.term)}`:""}${c.url?` · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">course site ↗</a>`:" · course site not verified"}</p>
    <div class="under" role="img" aria-label="Concepts by layer" style="margin:0 0 6px">${lays.map((k,l)=>k?`<span style="background:${lc(l)};flex:${k}" title="L${l}: ${k}"></span>`:"").join("")}</div>
    <div class="btnrow" style="margin:6px 0 14px"><button type="button" class="btn primary" data-rcourse="${c.code}">Study this course · ${c.concepts.reduce((s,id)=>s+N[id].rm,0)} min</button></div>
    ${c.concepts.map((id,i)=>{ const n=N[id]; return `<button type="button" class="step" style="--c:${lc(n.l)}" data-sel="${id}" aria-pressed="${state.sel===id}"><span class="rail"><span class="dot"></span></span><span class="body"><span class="sl"><span class="sn">${i+1}. ${esc(n.label)}</span><span class="tag">L${n.l} · ${esc(LAYERS[n.l].n)}</span>${markHTML(id)}</span><span class="sx">${esc(n.m)}</span></span></button>`; }).join("")}`:""}</div>`;
}

/* ---------------- atlas ---------------- */
function renderAtlas(){
  let h = `<div class="hubs"><h2 class="vh" style="font-size:18px">The hubs</h2><p>The concepts the most other things are built on. Notice how often the same few ideas (the log, hashing, consensus, the memory hierarchy, linear algebra, probability) sit under very different tools.</p><div class="chips">${hubs.map(n=>`<button type="button" class="chip hub" style="--c:${lc(n.l)}" data-sel="${n.id}" aria-pressed="${state.sel===n.id}"><span class="sw"></span>${esc(n.label)} <span class="mono" style="color:var(--muted);font-size:11px">${n.indeg}</span></button>`).join("")}</div></div>`;
  h += `<div class="hubs"><h2 class="vh" style="font-size:18px">Deep reads · ${deepList.length}</h2><p>Long reads (5–12 minutes) with history, a worked example with real numbers, and practical advice.</p><div class="chips">${deepList.map(n=>`<button type="button" class="chip" style="--c:${lc(n.l)}" data-read="${n.id}"><span class="sw"></span>${esc(n.label)} <span class="mono" style="color:var(--muted);font-size:11px">${n.rm}′</span>${markHTML(n.id)}</button>`).join("")}</div></div>`;
  LAYERS.forEach((L,l)=>{
    const cats = [...new Set(byLayer[l].map(n=>n.cat))];
    h += `<section class="asec" style="--c:${lc(l)}"><h2><span class="ln">L${l}</span>${esc(L.n)}<span class="ct">${byLayer[l].length}</span></h2><p class="desc">${esc(L.d)} <button type="button" class="essay-link" style="--c:${lc(l)};display:inline" data-essay="${l}">Read the layer essay · ${L.rm} min</button></p>` +
      cats.map(c=>`<div class="agrp"><h3>${esc(c)}</h3><div class="chips">${byLayer[l].filter(n=>n.cat===c).sort(byLabel).map(n=>`<button type="button" class="chip${hubSet.has(n.id)?" hub":""}" style="--c:${lc(l)}" data-sel="${n.id}" aria-pressed="${state.sel===n.id}"><span class="sw"></span>${esc(n.label)}${markHTML(n.id)}</button>`).join("")}</div></div>`).join("") + `</section>`;
  });
  $("v-atlas").innerHTML = h;
}

/* ---------------- library ---------------- */
let LIB = null;
async function renderLibrary(){
  const el = $("v-library");
  if(!LIB){ el.innerHTML = `<p class="empty">Loading the library…</p>`; try{ LIB = await Store.library(); }catch(e){ el.innerHTML = `<p class="empty">Could not load the library.</p>`; return; } }
  const kinds = ["all", ...Object.keys(KIND).filter(k=>LIB.some(w=>w.k===k))];
  const q = state.libQ.trim().toLowerCase();
  const list = LIB.filter(w=>(state.libKind==="all"||w.k===state.libKind) && (!q || (w.t+" "+w.w).toLowerCase().includes(q) || w.by.some(id=>label(id).toLowerCase().includes(q))));
  el.innerHTML = `<h2 class="vh">Library</h2><p class="vsub">Every source cited in the map, grouped by work and ranked by how many concepts rely on it. ${LIB.length} works; the ones at the top give the most understanding per hour.</p>
    <div class="filters" role="group" aria-label="Kind">${kinds.map(k=>`<button type="button" data-libkind="${k}" aria-pressed="${state.libKind===k}">${k==="all"?"All":KIND[k]+"s"} <span class="mono" style="opacity:.7">${k==="all"?LIB.length:LIB.filter(w=>w.k===k).length}</span></button>`).join("")}
    <input id="libq" type="search" placeholder="Filter by title, author or concept" value="${esc(state.libQ)}" style="padding:4px 10px;border:1px solid var(--line-strong);border-radius:999px;background:var(--surface);color:var(--fg);font:inherit;font-size:12.5px;min-width:220px"></div>
    <ul class="lib">${list.slice(0,state.libN).map(w=>`<li><span class="rk">${esc(KIND[w.k]||w.k)}</span><span><a href="${esc(refURL(w))}" target="_blank" rel="noopener noreferrer">${esc(w.t)}</a>${w.u?"":` <span class="via" style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted)">${w.k==="paper"?"via Scholar":"via search"}</span>`}<span class="who">${esc(w.w)}</span><span class="by">${w.by.slice(0,8).map(id=>`<button type="button" class="chip" style="--c:${lc(layerOf(id))}" ${/^L\d$/.test(id)?`data-essay="${id[1]}"`:`data-read="${id}"`}><span class="sw"></span>${esc(label(id))}</button>`).join("")}${w.by.length>8?`<span class="mono" style="font-size:11px;color:var(--muted)">+${w.by.length-8}</span>`:""}</span></span><span class="cnt">${w.by.length} concept${w.by.length===1?"":"s"}</span></li>`).join("")}</ul>
    ${list.length>state.libN?`<button type="button" class="btn" data-libmore style="margin-top:12px">Show more (${list.length-state.libN} left)</button>`:""}`;
  const li=$("libq"); li.addEventListener("input",()=>{ state.libQ=li.value; state.libN=120; const pos=li.selectionStart; renderLibrary().then(()=>{ const n=$("libq"); n.focus(); n.setSelectionRange(pos,pos); }); });
}

/* ---------------- you ---------------- */
/* ---------------- spaced review ---------------- */
const REV = { q:[], cur:null, shown:false, done:0, knew:0 };
function dueCards(){ const t=today(); return Object.entries(Store.me.review||{}).filter(([k,v])=>v[1]<=t && N[k.split("#")[0]]).sort((a,b)=>a[1][1]<b[1][1]?-1:a[1][1]>b[1][1]?1:a[1][0]-b[1][0]).map(([k])=>k); }
function reviewSummary(){
  const all = Object.values(Store.me.review||{}), due = dueCards().length;
  const boxes = [1,2,3,4,5].map(b=>all.filter(v=>v[0]===b).length);
  return {all:all.length, due, boxes};
}
async function startReview(){ REV.q = dueCards().slice(0, 20); REV.done=0; REV.knew=0; return nextReview(); }
async function nextReview(){
  const el = $("review"); if(!el) return;
  if(!REV.q.length){ el.innerHTML = `<div class="rev-card"><p class="rev-meta">Session finished</p><p class="rev-q">${REV.done? `You reviewed ${REV.done} question${REV.done===1?"":"s"} and knew ${REV.knew}.` : "Nothing is due right now."}</p><div class="btnrow"><button type="button" class="btn" data-revstop>Close</button></div></div>`; return; }
  const key = REV.q[0], [id, qi] = key.split("#"), r = await Store.read(id), item = (r.rd.quiz||[])[+qi];
  if(!item){ REV.q.shift(); return nextReview(); }
  const i = item.indexOf(" || "), box = Store.me.review[key][0];
  REV.cur = {key, id, qi:+qi, a:item.slice(i+4)}; REV.shown=false;
  el.innerHTML = `<div class="rev-card" style="--c:${lc(N[id].l)}"><p class="rev-meta"><span class="lpill" style="--c:${lc(N[id].l)}"><span class="sw"></span>L${N[id].l}</span> ${esc(N[id].label)} · box ${box} of 5 · ${REV.q.length} left</p><p class="rev-q">${esc(item.slice(0,i))}</p><div id="rev-a"></div><div class="btnrow" id="rev-btns"><button type="button" class="btn on" data-revshow>Show answer</button><button type="button" class="btn" data-read="${id}">Open the read</button></div></div>`;
}
function showReviewAnswer(){
  if(!REV.cur) return; REV.shown=true;
  $("rev-a").innerHTML = `<p class="rev-ans">${esc(REV.cur.a)}</p>`;
  $("rev-btns").innerHTML = `<button type="button" class="btn on" data-revgrade="1">I knew it</button><button type="button" class="btn" data-revgrade="0">Not yet</button>`;
}
async function gradeReview(knew){
  const c = REV.cur; if(!c) return;
  const box = Store.me.review[c.key][0], nb = knew ? Math.min(5, box+1) : 1;
  await Store.setReview(c.id, c.qi, nb, today(knew ? BOX_DAYS[nb] : 0));
  REV.q.shift(); REV.done++; if(knew) REV.knew++; else if(!REV.q.includes(c.key)) REV.q.push(c.key);
  if(!knew && REV.q.filter(k=>k===c.key).length>1) REV.q.pop();
  return nextReview();
}
function reviewHTML(){
  const s = reviewSummary();
  if(!s.all) return `<div id="review"><div class="rev-card"><p class="rev-meta">Review deck</p><p class="rev-q" style="font-weight:500">When you mark a deep read as read, its five self-check questions join your review deck. Each question comes back after 1, 3, 7, 21 and then 60 days while you keep answering it correctly, and goes back to the start when you miss it. This spacing is what moves ideas into long-term memory.</p></div></div>`;
  return `<div id="review"><div class="rev-card"><p class="rev-meta">Review deck · ${s.all} questions · ${s.boxes.map((n,i)=>`box ${i+1}: ${n}`).join(" · ")}</p><p class="rev-q">${s.due? `${s.due} question${s.due===1?" is":"s are"} due today.` : "Nothing is due today. Come back tomorrow."}</p>${s.due?`<div class="btnrow"><button type="button" class="btn on" data-revstart>Start review (${Math.min(20,s.due)})</button></div>`:""}</div></div>`;
}

function renderYou(){
  const me = Store.me, prog = me.progress;
  const read = DATA.nodes.filter(n=>prog[n.id]&&prog[n.id].status==="read");
  const deepRead = deepList.filter(n=>Store.status(n.id)==="read").length;
  const secs = Object.values(me.time).reduce((s,x)=>s+x,0);
  const notes = Object.values(me.notes).reduce((s,x)=>s+x,0);
  const essays = LAYERS.filter(L=>Store.status(L.id)==="read").length;
  const started = me.recent.map(r=>r.id).filter(id=>N[id]&&Store.status(id)!=="read").slice(0,8);
  // suggestions: unread concepts directly underneath what you have read, most depended-on first
  const readSet = new Set(read.map(n=>n.id)), cand = new Map();
  read.forEach(n=>n.kids.forEach(e=>{ if(e.k==="builds"&&!readSet.has(e.t)) cand.set(e.t,(cand.get(e.t)||0)+1); }));
  const next = [...cand.entries()].sort((a,b)=>b[1]-a[1]||N[b[0]].indeg-N[a[0]].indeg).slice(0,8).map(x=>x[0]);
  const start = read.length ? next : ["kafka","spark","llm","commitlog","consensus","memhier","linalg","transistor"];
  const row = (id, extra) => { const n=N[id]; return `<button type="button" class="srow" style="--c:${lc(n.l)}" data-read="${id}"><span class="bar"></span><span><span class="sn">${esc(n.label)}</span><span class="sm">L${n.l} · ${n.rm} min${extra?" · "+extra:""}</span><span class="sr">${esc(n.m)}</span></span></button>`; };
  const fmt = s => s<60? s+" s" : s<3600? Math.round(s/60)+" min" : (s/3600).toFixed(1)+" h";
  $("v-you").innerHTML = `<h2 class="vh">Your map</h2><p class="vsub">${STANDALONE?"Saved in this browser only. Run the local server to keep progress, bookmarks and notes in a database.":"Saved in data/user.db on your computer; it survives content rebuilds."}</p>
    <div class="cards">
      <div class="card"><div class="big">${read.length}<span style="font-size:15px;color:var(--muted)"> / ${DATA.nodes.length}</span></div><div class="lbl">concepts read</div></div>
      <div class="card"><div class="big">${deepRead}<span style="font-size:15px;color:var(--muted)"> / ${deepList.length}</span></div><div class="lbl">deep reads finished</div></div>
      <div class="card"><div class="big">${essays}<span style="font-size:15px;color:var(--muted)"> / 6</span></div><div class="lbl">layer essays read</div></div>
      <div class="card"><div class="big">${fmt(secs)}</div><div class="lbl">time spent reading · ${notes} note${notes===1?"":"s"} · ${me.bookmarks.length} saved</div></div>
    </div>
    <h3 class="ysec">Review</h3>${reviewHTML()}
    <h3 style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500;margin:18px 0 8px">Depth reached, layer by layer</h3>
    ${LAYERS.map((L,i)=>{ const d=byLayer[i].filter(n=>readSet.has(n.id)).length; return `<div class="lprog" style="--c:${lc(i)}"><span><b>L${i}</b> ${esc(L.n)}</span><span class="track"><span class="fill" style="display:block;width:${Math.round(100*d/byLayer[i].length)}%"></span></span><span class="num">${d}/${byLayer[i].length}</span></div>`; }).join("")}
    <div style="height:18px"></div>
    ${started.length?`<h3 class="ysec">Continue reading</h3><div class="ylist">${started.map(id=>row(id, me.time[id]?fmt(me.time[id])+" so far":"")).join("")}</div>`:""}
    <h3 class="ysec">${read.length?"Next layer down from what you have read":"Good places to start"}</h3><div class="ylist">${start.map(id=>row(id, cand.get(id)?`under ${cand.get(id)} you read`:"")).join("")}</div>
    ${me.bookmarks.length?`<h3 class="ysec">Saved</h3><div class="ylist">${me.bookmarks.filter(b=>N[b.id]).map(b=>row(b.id)).join("")}</div>`:""}
    ${Object.keys(me.notes).length?`<h3 class="ysec">With your notes</h3><div class="ylist">${Object.keys(me.notes).filter(id=>N[id]).map(id=>row(id, me.notes[id]+" note"+(me.notes[id]===1?"":"s"))).join("")}</div>`:""}
    <div class="btnrow" style="margin-top:18px"><button type="button" class="btn" data-export>${STANDALONE?"Copy my data (JSON)":"Export my data (JSON)"}</button></div>`;
  $("v-you").querySelectorAll(".ysec").forEach(h=>h.setAttribute("style","font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500;margin:0 0 8px"));
}

/* ---------------- reader ---------------- */
function refsHTML(refs){
  return `<ul class="refs">${refs.map(r=>`<li><span class="rk">${esc(KIND[r.k]||r.k)}</span><span><a href="${esc(refURL(r))}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a>${r.u?"":`<span class="via">${r.k==="paper"?"via Scholar":"via search"}</span>`}<span class="rw">${esc(r.w)}</span></span></li>`).join("")}</ul>`;
}
function P(list, cls){ return (list||[]).map((p,i)=>`<p${i===0&&cls?` class="${cls}"`:""}>${esc(p)}</p>`).join(""); }
function termsHTML(list){ return list&&list.length ? `<dl class="terms">${list.map(t=>{const i=t.indexOf(" — "); return i<0?`<div><dt>${esc(t)}</dt></div>`:`<div><dt>${esc(t.slice(0,i))}</dt><dd>${esc(t.charAt(i+3).toUpperCase()+t.slice(i+4))}</dd></div>`;}).join("")}</dl>` : ""; }
function diagramHTML(list){ return list&&list.length ? `<figure class="diagram"><pre>${esc(list.join("\n"))}</pre></figure>` : ""; }
function mistakesHTML(list){ return list&&list.length ? `<div class="mistakes">${list.map(p=>`<p>${esc(p)}</p>`).join("")}</div>` : ""; }
function quizHTML(list, id){ const inDeck = id && Store.me.review[id+"#0"]; return list&&list.length ? `<p class="stand-sum">Try to answer each one in your head first, then open it to check. ${id?(inDeck?"These questions are in your review deck; they come back in the You tab when they are due.":`<button type="button" class="btn" data-enroll="${id}" style="margin-left:4px">Add to my review deck</button>`):""}</p><ol class="quiz">${list.map(q=>{const i=q.indexOf(" || "); return `<li><details><summary>${esc(q.slice(0,i))}</summary><p>${esc(q.slice(i+4))}</p></details></li>`;}).join("")}</ol>` : ""; }
function sec(id, no, title, body){ return body ? `<section class="rd-sec" id="rs-${id}"><h2><span class="no">${no}</span>${title}</h2>${body}</section>` : ""; }
function srow(id, reason, dash, meta){ const m=N[id]; return `<button type="button" class="srow" style="--c:${lc(m.l)}" data-read="${id}"><span class="bar${dash?" dash":""}"></span><span><span class="sn">${esc(m.label)}</span><span class="sm">${meta||"L"+m.l}</span>${markHTML(id)}<span class="sr">${esc(reason)}</span></span></button>`; }
function groupByLayer(list, key){
  const g=[[],[],[],[],[],[]]; list.forEach(e=>g[N[e[key]].l].push(e));
  return g.map((a,l)=>a.length?`<div class="sgrp" style="--c:${lc(l)}"><div class="sh"><span class="sw"></span>L${l} · ${esc(LAYERS[l].n)}</div>${a.map(e=>srow(e[key], e.r, e.k==="inspired")).join("")}</div>`:"").join("");
}
function ladderHTML(n){
  const u=under(n.id), upL=aboveByLayer(n.id), max=Math.max(1,...u.map(a=>a.length),...upL);
  const cells = LAYERS.map((L,l)=>{ const c = l===n.l?"this":l<n.l?(upL[l]?upL[l]+" above":""):(u[l].length?u[l].length+" below":""); const v = l===n.l?max:(l<n.l?upL[l]:u[l].length);
    return `<div class="${l===n.l?"on":""}" style="--c:${lc(l)}" title="${esc(L.n)}"><span class="ln">L${l}<i>${c}</i></span><span class="bar" style="width:${Math.max(4,Math.round(100*v/max))}%;${v?"":"opacity:.15"}"></span></div>`; }).join("");
  return `<div class="ladder" aria-hidden="true">${cells}</div><p class="ladder-cap">Stands on ${u.reduce((s,a)=>s+a.length,0)} concepts below it; ${upL.reduce((s,x)=>s+x,0)} concepts above depend on it.</p>`;
}
function actionsHTML(id, col){
  const st = Store.status(id), bm = Store.isBookmarked(id);
  return `<div class="rd-actions" style="--c:${col}"><button type="button" class="btn${st==="read"?" on":""}" data-markread="${id}" aria-pressed="${st==="read"}">${st==="read"?"✓ Read":"Mark as read"}</button><button type="button" class="btn${bm?" on":""}" data-bookmark="${id}" aria-pressed="${bm}">${bm?"★ Saved":"☆ Save"}</button><a class="btn" href="#rs-notes" data-jump="rs-notes" style="text-decoration:none">Notes${Store.me.notes[id]?" · "+Store.me.notes[id]:""}</a></div>`;
}
function notesSec(id, no){ return sec("notes", no, "Your notes", `<div class="notes" id="notes" data-owner="${id}"><p class="empty">Loading…</p></div>`); }
async function fillNotes(id){
  const box=$("notes"); if(!box) return;
  let list=[]; try{ list = await Store.notes(id); }catch(e){ box.innerHTML=`<p class="empty">Could not load notes.</p>`; return; }
  if(!$("notes")||$("notes").dataset.owner!==id) return;
  box.innerHTML = list.map(n=>`<div class="note">${esc(n.body)}<div class="nm"><span>${esc((n.updated_at||n.created_at||"").replace("T"," "))}</span><button type="button" data-delnote="${n.id}">Delete</button></div></div>`).join("") +
    `<label for="nt" style="position:absolute;left:-9999px">New note</label><textarea id="nt" placeholder="What did you learn? What will you try? Notes are ${STANDALONE?"saved in this browser":"saved in your local database"}."></textarea><div><button type="button" class="btn primary" data-addnote="${id}">Save note</button></div>`;
}
function nodeRead(n, r, ctx){
  const rd = r.rd, downs = n.kids.filter(e=>e.k==="builds"), insp = n.kids.filter(e=>e.k==="inspired");
  const ups = n.pars.slice().sort((a,b)=>N[a.s].l-N[b.s].l||byLabel(N[a.s],N[b.s]));
  const u = under(n.id), tot = u.reduce((s,a)=>s+a.length,0), lays = u.map((a,l)=>a.length?l:-1).filter(l=>l>=0);
  let h = `<div class="rd-eye"><span class="lpill" style="--c:${lc(n.l)}"><span class="sw"></span>L${n.l} · ${esc(LAYERS[n.l].n)}</span><span>${esc(n.cat)}</span>${n.y?`<span class="mono">${n.y.startsWith("-")?esc(n.y.slice(1))+" BCE":esc(n.y)}</span>`:""}<span class="mono">${n.rm} min read</span>${n.deep?`<span class="kind" style="margin:0">deep read</span>`:""}</div>
  <h1>${esc(n.label)}</h1><p class="rd-sub">${esc(n.m)}</p>${n.st?`<p class="status">${esc(n.st)}</p>`:""}`;
  h += actionsHTML(n.id, lc(n.l));
  if(ctx) h += `<div class="rd-ctx"><b>${esc(ctx.k)}</b>${esc(ctx.t)}</div>`;
  h += ladderHTML(n);
  if(TAUGHT[n.id]) h += `<p class="ladder-cap">Taught in Stanford ${TAUGHT[n.id].map(code=>`<button type="button" class="essay-link" style="display:inline;--c:${lc(n.l)}" data-course="${code}">${esc(courseLabel(code))}</button>`).join(", ")}.</p>`;
  const toc = [["value","Why it exists"],rd.terms&&["terms","Key terms"],rd.history&&["history","How we got here"],["how","How it works"],rd.example&&["example","A worked example"],downs.length&&["stands","What it stands on"],["intuition","Why it makes sense"],rd.mistakes&&["mistakes","Common misunderstandings"],["friction","Where it still hurts"],rd.practice&&["practice","In practice"],rd.quiz&&["quiz","Check yourself"],ups.length&&["built","What's built on it"],n.side.length&&["side","Neighbours"],["deeper","Go deeper"],["notes","Notes"]].filter(Boolean);
  h += `<nav class="toc" aria-label="Sections">${toc.map(([id,t])=>`<a href="#rs-${id}" data-jump="rs-${id}">${t}</a>`).join("")}</nav>`;
  let no=0; const NO=()=>String(++no).padStart(2,"0");
  h += sec("value", NO(), "Why it exists", P(rd.value,"lead"));
  if(rd.terms) h += sec("terms", NO(), "Key terms", termsHTML(rd.terms));
  if(rd.history) h += sec("history", NO(), "How we got here", P(rd.history));
  h += sec("how", NO(), "How it works", P(rd.how) + diagramHTML(rd.diagram));
  if(rd.example) h += sec("example", NO(), "A worked example", `<div class="example">${P(rd.example)}</div>`);
  if(downs.length||insp.length) h += sec("stands", NO(), "What it stands on",
    `<p class="stand-sum">${esc(n.label)} rests directly on ${downs.length} idea${downs.length===1?"":"s"}. Counting everything beneath those, it stands on ${tot} concepts across ${lays.length} layer${lays.length===1?"":"s"} (${lays.map(l=>"L"+l).join(", ")}). Each line says what that lower layer contributes.</p>` +
    groupByLayer(downs,"t") + (insp.length?`<div class="sgrp" style="--c:var(--muted)"><div class="sh"><span class="sw"></span>Borrowed ideas (analogies, not mechanisms)</div>${insp.map(e=>srow(e.t,e.r,true)).join("")}</div>`:""));
  h += sec("intuition", NO(), "Why it makes sense", (rd.intuition&&rd.intuition.length?`<p class="rd-quote">${esc(rd.intuition[0])}</p>`+P(rd.intuition.slice(1)):""));
  if(rd.mistakes) h += sec("mistakes", NO(), "Common misunderstandings", mistakesHTML(rd.mistakes));
  h += sec("friction", NO(), "Where it still hurts", P(rd.friction));
  if(rd.practice) h += sec("practice", NO(), "In practice", P(rd.practice));
  if(rd.quiz) h += sec("quiz", NO(), "Check yourself", quizHTML(rd.quiz, n.id));
  if(ups.length) h += sec("built", NO(), "What's built on it", `<p class="stand-sum">${ups.length} concept${ups.length===1?"":"s"} use ${esc(n.label)} directly.</p>` + groupByLayer(ups,"s"));
  if(n.side.length) h += sec("side", NO(), "Neighbours", n.side.map(s=>srow(s.o, s.r, false, SIDE[s.t]||s.t)).join(""));
  h += sec("deeper", NO(), "Go deeper", refsHTML(r.refs));
  h += notesSec(n.id, NO());
  if(downs.length) h += sec("down", "↓", "Read one layer down", `<div class="rd-next">${downs.map(e=>{const m=N[e.t]; return `<button type="button" class="ncard" style="--c:${lc(m.l)}" data-read="${m.id}"><span class="nk">L${m.l} · ${m.rm} min ${markHTML(m.id)}</span><span class="nt">${esc(m.label)}</span><span class="nr">${esc(m.m)}</span></button>`;}).join("")}</div>`);
  return h;
}
function essayRead(l, r){
  const rd = r.rd, cats = [...new Set(byLayer[l].map(n=>n.cat))], top = byLayer[l].slice().sort((a,b)=>b.indeg-a.indeg).slice(0,12);
  let h = `<div class="rd-eye"><span class="lpill" style="--c:${lc(l)}"><span class="sw"></span>Layer ${l} of 5</span><span class="mono">${LAYERS[l].rm} min read</span><span>${byLayer[l].length} concepts</span></div>
  <h1>${esc(LAYERS[l].n)}</h1><p class="rd-sub">${esc(LAYERS[l].d)}</p>${actionsHTML("L"+l, lc(l))}
  <div class="ladder" aria-hidden="true">${LAYERS.map((L,i)=>`<div class="${i===l?"on":""}" style="--c:${lc(i)}"><span class="ln">L${i}<i>${byLayer[i].length}</i></span><span class="bar" style="width:${Math.round(100*byLayer[i].length/150)}%"></span></div>`).join("")}</div>
  <nav class="toc" aria-label="Sections">${[["value","What this layer adds"],rd.terms&&["terms","Key terms"],rd.history&&["history","How we got here"],["how","How the layers below support it"],rd.example&&["example","A worked example"],["intuition","Why it makes sense"],rd.mistakes&&["mistakes","Common misunderstandings"],["friction","Where it still hurts"],rd.practice&&["practice","How to use this layer"],rd.quiz&&["quiz","Check yourself"],["here","What lives here"],["deeper","Go deeper"],["notes","Notes"]].filter(Boolean).map(([id,t])=>`<a href="#rs-${id}" data-jump="rs-${id}">${t}</a>`).join("")}</nav>`;
  let no=0; const NO=()=>String(++no).padStart(2,"0");
  h += sec("value",NO(),"What this layer adds", P(rd.value,"lead"));
  if(rd.terms) h += sec("terms",NO(),"Key terms", termsHTML(rd.terms));
  if(rd.history) h += sec("history",NO(),"How we got here", P(rd.history));
  h += sec("how",NO(),"How the layers below support it", P(rd.how) + diagramHTML(rd.diagram));
  if(rd.example) h += sec("example",NO(),"A worked example", `<div class="example">${P(rd.example)}</div>`);
  h += sec("intuition",NO(),"Why it makes sense", rd.intuition&&rd.intuition.length?`<p class="rd-quote">${esc(rd.intuition[0])}</p>`+P(rd.intuition.slice(1)):"");
  if(rd.mistakes) h += sec("mistakes",NO(),"Common misunderstandings", mistakesHTML(rd.mistakes));
  h += sec("friction",NO(),"Where it still hurts", P(rd.friction));
  if(rd.practice) h += sec("practice",NO(),"How to use this layer", P(rd.practice));
  if(rd.quiz) h += sec("quiz",NO(),"Check yourself", quizHTML(rd.quiz));
  h += sec("here",NO(),"What lives here", `<p class="stand-sum">The most depended-on concepts in this layer, then everything by area. Each opens its own read.</p><div class="sgrp" style="--c:${lc(l)}"><div class="sh"><span class="sw"></span>Most depended-on</div>${top.map(n=>srow(n.id, n.m, false, n.indeg+" use it")).join("")}</div>` +
    cats.map(c=>`<div class="agrp"><h3>${esc(c)}</h3><div class="chips">${byLayer[l].filter(n=>n.cat===c).sort(byLabel).map(n=>`<button type="button" class="chip${hubSet.has(n.id)?" hub":""}" style="--c:${lc(l)}" data-read="${n.id}"><span class="sw"></span>${esc(n.label)}${markHTML(n.id)}</button>`).join("")}</div></div>`).join(""));
  h += sec("deeper",NO(),"Go deeper", refsHTML(r.refs));
  h += notesSec("L"+l, NO());
  return h;
}
function pathRead(ids){
  const all = ids.reduce((s,id)=>s+N[id].nr,0);
  let h = `<div class="rd-eye"><span class="lpill" style="--c:var(--fg)"><span class="sw"></span>Reading list</span><span class="mono">${ids.length} concepts · ${all} sources · about ${ids.reduce((s,id)=>s+N[id].rm,0)} min of reads</span></div>
  <h1>Your path, as a syllabus</h1><p class="rd-sub">${ids.map(id=>esc(N[id].label)).join(" → ")}</p><p class="stand-sum">Read top to bottom: each concept is built on the one after it. Start with the read for each, then pick one source per step.</p><div class="plist">`;
  ids.forEach((id,i)=>{ const n=N[id], r=READS[id]; h += `<div><div class="ph"><span class="lpill" style="--c:${lc(n.l)}"><span class="sw"></span>${i+1} · L${n.l}</span><button type="button" style="--c:${lc(n.l)}" data-read="${n.id}">${esc(n.label)}</button><span class="mono" style="color:var(--muted);font-size:11.5px">${n.rm} min ${markHTML(id)}</span></div>${r?refsHTML(r.refs):""}</div>`; });
  return h + `</div>`;
}
const R = { open:false, cur:null, hist:[], t0:0, secs:0 };
const SEQ = () => R.open && R.cur ? R.cur.seq : null;
function seqNav(){
  const q = R.cur.seq; if(!q || R.cur.type!=="node") return "";
  const i = q.ids.indexOf(R.cur.id); if(i<0) return "";
  const pv = q.ids[i-1], nx = q.ids[i+1];
  return `<div class="seqnav">${pv?`<button type="button" data-rseq="${i-1}"><span class="k">← ${esc(q.name)} · ${i}/${q.ids.length}</span><span class="t">${esc(N[pv].label)}</span></button>`:"<span></span>"}${nx?`<button type="button" class="nx" data-rseq="${i+1}"><span class="k">${esc(q.name)} · ${i+2}/${q.ids.length} →</span><span class="t">${esc(N[nx].label)}</span></button>`:"<span></span>"}</div>`;
}
const curId = () => R.cur ? (R.cur.type==="node" ? R.cur.id : R.cur.type==="layer" ? "L"+R.cur.l : null) : null;
function flushTime(){ const id=curId(); if(id&&R.t0){ const s=(performance.now()-R.t0)/1000; R.secs+=s; R.t0=document.hidden?0:performance.now(); Store.addTime(id, s); } }
document.addEventListener("visibilitychange", ()=>{ if(!R.open) return; if(document.hidden) flushTime(); else R.t0=performance.now(); });
async function renderReader(){
  const el = $("reader"), c = R.cur;
  let title, col, mins, body;
  try{
    const need = c.type==="node" ? [c.id] : c.type==="layer" ? ["L"+c.l] : c.ids;
    if(need.some(id=>!READS[id])){ el.innerHTML = `<div class="rd-bar"><button type="button" class="btn" data-rback>← Back</button><span class="rt">Loading…</span></div><article class="rd-wrap"><p class="empty">Loading…</p></article>`; }
    if(c.type==="node"){ const n=N[c.id]; col=lc(n.l); title=n.label; mins=n.rm;
      el.style.setProperty("--c", col);
      const r = await Store.read(c.id); if(R.cur!==c) return;
      let ctx=null; const q=c.seq; if(q&&q.notes){ const i=q.ids.indexOf(n.id); if(i>=0&&q.notes[i]) ctx={k:q.name+" · step "+(i+1), t:q.notes[i]}; }
      body = nodeRead(n, r, ctx) + seqNav(); }
    else if(c.type==="layer"){ col=lc(c.l); title="L"+c.l+" · "+LAYERS[c.l].n; mins=LAYERS[c.l].rm; const r = await Store.read("L"+c.l); if(R.cur!==c) return;
      body = essayRead(c.l, r) + `<div class="seqnav">${c.l>0?`<button type="button" data-essay="${c.l-1}"><span class="k">↑ Layer ${c.l-1}</span><span class="t">${esc(LAYERS[c.l-1].n)}</span></button>`:"<span></span>"}${c.l<5?`<button type="button" class="nx" data-essay="${c.l+1}"><span class="k">Layer ${c.l+1} ↓</span><span class="t">${esc(LAYERS[c.l+1].n)}</span></button>`:"<span></span>"}</div>`; }
    else { col="var(--fg)"; title="Reading list"; mins=null; await Promise.all(c.ids.map(id=>Store.read(id))); if(R.cur!==c) return; body = pathRead(c.ids); }
  } catch(e){ body = `<p class="empty">Could not load this read: ${esc(e.message)}</p>`; }
  el.style.setProperty("--c", col);
  el.innerHTML = `<div class="rd-bar"><button type="button" class="btn" data-rback>${R.hist.length?"← Back":"← Close"}</button><span class="rt">${esc(title)}${mins?`<span class="mono">${mins} min</span>`:""}</span>${c.type==="node"?`<button type="button" class="btn" data-rmap="${c.id}">Show in map</button>`:""}<button type="button" class="btn" data-rclose aria-label="Close reader">✕</button><span class="rd-prog" id="rprog"></span></div><article class="rd-wrap">${body}<p class="foot">${DATA.nodes.length} concepts, ${DATA.stats.refs} sources and about ${Math.round(DATA.stats.words/1000)}k words of reading in this map. Links marked "via Scholar" or "via search" open a search for that title. Facts checked as of October 2026.</p></article>`;
  el.scrollTop = 0; updProg();
  const h1 = el.querySelector("h1"); if(h1){ h1.tabIndex=-1; try{ h1.focus({preventScroll:true}); }catch(e){} }
  const id = curId(); if(id) fillNotes(id);
}
function updProg(){
  const el=$("reader"), p=$("rprog"); if(!p) return;
  const m = el.scrollHeight-el.clientHeight, f = m>0 ? el.scrollTop/m : 1;
  p.style.width = Math.min(100,100*f)+"%";
  const id = curId();
  if(id && f>0.97 && Store.status(id)!=="read"){
    const spent = R.secs + (R.t0?(performance.now()-R.t0)/1000:0), need = Math.min(45, (N[id]?N[id].rm:LAYERS[+id[1]].rm)*15);
    if(spent>=need){ Store.setProgress(id,"read").then(()=>{ toast("Marked as read"); refreshMarks(); }).catch(()=>{}); }
  }
}
function hashFor(c){ return c.type==="node" ? "#read/"+c.id : c.type==="layer" ? "#layer/"+c.l : "#reading-list"; }
function openRead(c, opts={}){
  flushTime();
  if(R.open && R.cur && !opts.replace) R.hist.push(R.cur);
  if(!R.open){ R.hist=[]; R.ret = document.activeElement; }
  c.seq = opts.seq!==undefined ? opts.seq : SEQ();
  R.cur = c; R.open = true; R.secs = 0; R.t0 = performance.now();
  $("reader").hidden = false; document.body.style.overflow="hidden";
  try{ history.replaceState(null,"",hashFor(c)); }catch(e){}
  const id = curId(); if(id && !Store.status(id)) Store.setProgress(id,"reading").catch(()=>{});
  renderReader();
}
function closeRead(){ flushTime(); R.t0=0; R.open=false; R.hist=[]; $("reader").hidden=true; document.body.style.overflow=""; try{history.replaceState(null,"","#"+state.view)}catch(e){} render(false); if(R.ret&&R.ret.focus) try{R.ret.focus({preventScroll:true})}catch(e){} }
function backRead(){ if(R.hist.length){ flushTime(); R.cur=R.hist.pop(); R.secs=0; R.t0=performance.now(); try{history.replaceState(null,"",hashFor(R.cur))}catch(e){} renderReader(); } else closeRead(); }
$("reader").addEventListener("scroll", updProg, {passive:true});
const pathSeq = () => ({name:"Your path", ids:state.path.slice()});
function refreshMarks(){ if(R.open){ const a=$("reader").querySelector(".rd-actions"); const id=curId(); if(a&&id){ a.outerHTML = actionsHTML(id, getComputedStyle($("reader")).getPropertyValue("--c")); } } else render(false); }

/* ---------------- render ---------------- */
const VIEWS = ["explore","tours","courses","atlas","library","you"];
function render(scrollCols){
  renderStrip();
  const v = state.view;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.view===v)));
  $("v-explore").hidden = v!=="explore"; $("cols").hidden = v!=="explore";
  $("v-tours").hidden = v!=="tours"; $("v-courses").hidden = v!=="courses"; $("v-atlas").hidden = v!=="atlas"; $("v-library").hidden = v!=="library"; $("v-you").hidden = v!=="you";
  if(v==="explore"){ renderTrail(); renderCols(scrollCols); }
  if(v==="tours") renderTours();
  if(v==="courses") renderCourses();
  if(v==="atlas") renderAtlas();
  if(v==="library") renderLibrary();
  if(v==="you") renderYou();
  renderPanel();
}
function revealPanel(){ if(narrow()) $("panel").scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"}); else $("panel").scrollTop = 0; }
function select(id, opts={}){ state.sel = id; state.expand = {}; render(false); if(opts.reveal!==false) revealPanel(); }
function exploreFrom(id){ state.view="explore"; state.start=N[id].l; state.filter=""; state.path=[id]; state.sel=id; state.expand={}; try{history.replaceState(null,"","#explore")}catch(e){} render(true); revealPanel(); }
function setView(v){ state.view=v; try{history.replaceState(null,"","#"+v)}catch(e){} if(v==="tours"){ state.sel = DATA.tours[state.tour].steps[state.tstep][0]; } if(v==="explore"){ state.sel = state.path[state.path.length-1]||null; } render(v==="explore"); if(v==="library"||v==="you") $("main").scrollTop=0; }

document.addEventListener("click", async e=>{
  const j = e.target.closest("a[data-jump]"); if(j){ e.preventDefault(); const t=document.getElementById(j.dataset.jump); if(t) t.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"}); return; }
  const g = e.target.closest("[data-gsel]"); if(g){ return select(g.dataset.gsel); }
  const b = e.target.closest("button"); if(!b) return;
  const d = b.dataset;
  try{
    if(d.rclose!==undefined) return closeRead();
    if(d.rback!==undefined) return backRead();
    if(d.markread){ const on = Store.status(d.markread)==="read"; await Store.setProgress(d.markread, on?"reading":"read"); toast(on?"Marked as not read":"Marked as read"); return refreshMarks(); }
    if(d.bookmark){ const on = await Store.toggleBookmark(d.bookmark); toast(on?"Saved":"Removed from saved"); return refreshMarks(); }
    if(d.addnote){ const t=$("nt"); const v=(t&&t.value||"").trim(); if(!v) return toast("Write something first"); await Store.addNote(d.addnote, v); toast("Note saved"); fillNotes(d.addnote); return refreshMarks(); }
    if(d.delnote){ const owner=$("notes").dataset.owner; await Store.delNote(owner, isNaN(+d.delnote)?d.delnote:+d.delnote); toast("Note deleted"); fillNotes(owner); return refreshMarks(); }
    if(d.export!==undefined) return Store.exportData();
    if(d.enroll){ const k = await Store.enroll(d.enroll); toast(k?`${k} questions added to your review deck`:"Already in your review deck"); b.outerHTML = `<span class="mono" style="font-size:12px;color:var(--muted)">Added. Review them in the You tab.</span>`; return; }
    if(d.revstart!==undefined) return startReview();
    if(d.revshow!==undefined) return showReviewAnswer();
    if(d.revgrade!==undefined) return gradeReview(d.revgrade==="1");
    if(d.revstop!==undefined){ REV.q=[]; return renderYou(); }
    if(d.libkind){ state.libKind=d.libkind; state.libN=120; return renderLibrary(); }
    if(d.libmore!==undefined){ state.libN+=200; return renderLibrary(); }
    if(d.read){ const inSeq = SEQ() && SEQ().ids.includes(d.read); return openRead({type:"node", id:d.read}, inSeq?{}:{seq: (!R.open && state.view==="explore" && state.path.includes(d.read)) ? pathSeq() : null}); }
    if(d.essay!==undefined) return openRead({type:"layer", l:+d.essay}, {seq:null});
    if(d.rpath!==undefined) return openRead({type:"path", ids:state.path.slice()}, {seq:pathSeq()});
    if(d.rtour!==undefined){ const t=DATA.tours[state.tour]; return openRead({type:"node", id:t.steps[+d.rtour][0]}, {seq:{name:t.title, ids:t.steps.map(s=>s[0]), notes:t.steps.map(s=>s[1])}}); }
    if(d.rseq!==undefined) return openRead({type:"node", id:SEQ().ids[+d.rseq]});
    if(d.rmap){ closeRead(); return exploreFrom(d.rmap); }
    if(d.view){ if(R.open) closeRead(); return setView(d.view); }
    if(d.program){ state.program=d.program; const p=CUR.programs.find(x=>x.id===d.program); state.course=p.groups[0].courses[0]; return render(false); }
    if(d.course){ if(R.open) closeRead(); state.course=d.course; state.program = CUR.programs.find(p=>p.groups.some(g=>g.courses.includes(d.course)) && p.id===state.program) ? state.program : (CUR.programs.find(p=>p.groups.some(g=>g.courses.includes(d.course)))||{id:state.program}).id; if(state.view!=="courses") setView("courses"); else render(false); const ts=$("v-courses").querySelector(".tsteps"); if(ts) ts.scrollTop=0; return; }
    if(d.rcourse){ const c=COURSE[d.rcourse]; return openRead({type:"node", id:c.concepts[0]}, {seq:{name:courseLabel(c.code), ids:c.concepts.slice()}}); }
    if(d.layer!==undefined){ state.view="explore"; state.start=+d.layer; state.path=[]; state.sel=null; state.filter=""; return render(true); }
    if(d.col!==undefined){ const c=+d.col; state.path = state.path.slice(0,c).concat([d.id]); state.sel=d.id; state.expand={}; render(true); if(!narrow()) $("panel").scrollTop=0; return; }
    if(d.crumb!==undefined){ state.path = state.path.slice(0,+d.crumb+1); state.sel = state.path[state.path.length-1]; return render(true); }
    if(d.explore) return exploreFrom(d.explore);
    if(d.sel) return select(d.sel);
    if(d.expand!==undefined){ state.expand[d.expand]=!state.expand[d.expand]; return renderPanel(); }
    if(d.tour!==undefined){ state.tour=+d.tour; state.tstep=0; state.sel=DATA.tours[state.tour].steps[0][0]; render(false); const ts=$("v-tours").querySelector(".tsteps"); if(ts) ts.scrollTop=0; return; }
    if(d.tstep!==undefined){ state.tstep=+d.tstep; return select(DATA.tours[state.tour].steps[state.tstep][0]); }
    if(d.pick){ const id=d.pick; if(/^L\d$/.test(id)) return openRead({type:"layer", l:+id[1]}, {seq:null}); if(d.open==="read"){ exploreFrom(id); return openRead({type:"node", id}, {seq:null}); } return exploreFrom(id); }
  } catch(err){ toast("Something went wrong: "+err.message); }
});
document.addEventListener("keydown", e=>{
  if(e.key==="Escape" && R.open && document.activeElement!==$("q")){ e.preventDefault(); return backRead(); }
  if(e.key==="Enter" && e.target.closest && e.target.closest("[data-gsel]")){ select(e.target.closest("[data-gsel]").dataset.gsel); }
  if(e.key==="/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); if(R.open) closeRead(); $("q").focus(); }
});

/* ---------------- search ---------------- */
const q=$("q"), sres=$("sres"); let hits=[], hi=0, sq=0;
const snipHTML = s => esc(s).replace(/\u0002/g,"<mark>").replace(/\u0003/g,"</mark>");
async function doSearch(){
  const s=q.value.trim(); if(!s){ sres.hidden=true; return; }
  const my = ++sq; const res = await Store.search(s); if(my!==sq) return;
  hits = res; hi=0;
  sres.innerHTML = hits.length ? hits.map((h,i)=>{ const l=layerOf(h.id); return `<button type="button" data-pick="${h.id}" class="${i===hi?"hl":""}"><span class="sw" style="width:8px;height:8px;border-radius:2px;margin-top:5px;background:${lc(l)}"></span><span><span>${esc(label(h.id))}</span>${h.snippet?`<span class="snip">${snipHTML(h.snippet)}</span>`:""}</span><span class="lt">L${l}${N[h.id]?" "+markHTML(h.id):""}</span></button>`; }).join("") + `<div class="hint">↵ explore · ⇧↵ read · ${STANDALONE?"searching in the page":"full-text search (SQLite FTS5)"}</div>` : `<div class="none">Nothing matches "${esc(s)}".</div>`;
  sres.hidden=false;
}
let st0; q.addEventListener("input", ()=>{ clearTimeout(st0); st0=setTimeout(doSearch, STANDALONE?40:90); });
q.addEventListener("keydown", e=>{
  if(e.key==="Escape"){ sres.hidden=true; q.blur(); return; }
  if(sres.hidden||!hits.length) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); hi=(hi+(e.key==="ArrowDown"?1:hits.length-1))%hits.length; [...sres.querySelectorAll("button")].forEach((c,i)=>c.classList.toggle("hl",i===hi)); }
  if(e.key==="Enter"){ e.preventDefault(); sres.hidden=true; q.blur(); const id=hits[hi].id; if(/^L\d$/.test(id)) return openRead({type:"layer", l:+id[1]}, {seq:null}); exploreFrom(id); if(e.shiftKey) openRead({type:"node", id}, {seq:null}); }
});
document.addEventListener("click", e=>{ if(!e.target.closest(".search")) sres.hidden=true; else if(e.target.closest("[data-pick]")){ sres.hidden=true; q.value=""; } });

/* ---------------- start + routing ---------------- */
function route(initial){
  const h = decodeURIComponent((location.hash||"").slice(1));
  const m = h.match(/^read\/(.+)$/), ml = h.match(/^layer\/([0-5])$/);
  if(m && N[m[1]]){ if(R.open && curId()===m[1]) return; if(initial) render(true); exploreFrom(m[1]); return openRead({type:"node", id:m[1]}, {seq:null}); }
  if(ml){ if(R.open && curId()==="L"+ml[1]) return; if(initial) render(true); return openRead({type:"layer", l:+ml[1]}, {seq:null}); }
  if(VIEWS.includes(h) || initial){
    if(R.open) closeRead();
    if(VIEWS.includes(h)) state.view = h;
    if(state.view==="tours") state.sel=DATA.tours[state.tour].steps[state.tstep][0];
    if(initial && ["atlas","library","you"].includes(state.view)) state.sel=null;
    render(true);
  }
}
window.addEventListener("hashchange", ()=>route(false));
route(true);
window.__dts = { state, Store, N, R, openRead, closeRead, select, setView };
})();
