/* Down the Stack — the problem map (web/pm.js).
   Every LeetCode problem in content/problemmap/map.json, ordered as a DAG: each problem names the easier problems it
   builds on, and is pinned to one idea (a technique). The 264 ideas form their own DAG, drawn as a cross-section:
   one column per family, level 0 (foundations) at the bottom, edges = "builds on". Problems are never drawn as SVG
   nodes in bulk: they are lists (an idea's ladder) and a small neighbourhood graph per problem.
   app.js calls DTSPM.render(el), DTSPM.panel(el), DTSPM.hash(), DTSPM.fillPins(root), DTSPM.fillNext(el);
   algo.js asks for links (practiceLink, patternLink, vizLink). Data: /api/problemmap, or DATA.problemmap standalone. */
(function(){
"use strict";
const app = () => window.__dts;
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $ = id => document.getElementById(id);
const DIFF = ["Easy","Medium","Hard"];
const fmt = n => Number(n).toLocaleString("en-US");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 900px)").matches;

/* ---------------- data ---------------- */
const PM = { raw:null, loading:null, err:"", waiters:[] };
let I = null;            // indexes built from the raw data (see build())
// the per-concept summary is in /api/graph -> problemmap (server) or DATA.pm_summary (standalone, next to the full map)
const sum = () => { const A = app(); if(!A) return null; const D = A.DATA; return D.pm_summary || (D.problemmap && D.problemmap.concepts ? D.problemmap : null); };
const available = () => !!sum();

function ensure(cb){
  if(I){ if(cb) cb(); return Promise.resolve(I); }
  if(cb) PM.waiters.push(cb);
  if(PM.loading) return PM.loading;
  const A = app();
  PM.loading = (async () => {
    try{
      const raw = A.STANDALONE ? A.DATA.problemmap : await A.api("GET", "/api/problemmap");
      if(!raw || !raw.p) throw new Error("no problem map in this build");
      PM.raw = raw; build(raw);
    } catch(e){ PM.err = e.message || String(e); }
    const w = PM.waiters.splice(0); w.forEach(f=>{ try{ f(); }catch(e){} });
    return I;
  })();
  return PM.loading;
}

function build(raw){
  const C = {}; raw.cols.forEach((k,i)=>C[k]=i);
  const fams = raw.families.map((f,i)=>Object.assign({i, ideas:[], probs:0}, f));
  const ideas = raw.ideas.map((d,i)=>({i, id:d.id, name:d.name, f:d.f, l:d.l, b:d.b||[], c:d.c||[], a:d.a, s:d.s||"", nc:d.nc||null, probs:[], used:[], up:[], diff:[0,0,0], worked:0}));
  const byId = {}; ideas.forEach(d=>byId[d.id]=d);
  ideas.forEach(d=>{ d.b = d.b.filter(x=>byId[x]); d.b.forEach(x=>byId[x].up.push(d)); fams[d.f].ideas.push(d); });
  const practice = new Set(((app().DATA.practice)||[]).map(p=>p.id));
  const P = raw.p.map(r=>({n:r[C.n], t:r[C.title], s:r[C.slug], d:r[C.difficulty], f:r[C.family], i:r[C.idea], u:r[C.uses]||[], p:r[C.prereqs]||[], w:r[C.new]||"",
    dp:r[C.depth]||0, c:r[C.concepts]||[], g:r[C.tags]||[], un:[], wk:practice.has(r[C.slug])}));
  const byN = {}; P.forEach(q=>byN[q.n]=q);
  P.forEach(q=>{ q.p = q.p.filter(m=>byN[m]); q.p.forEach(m=>byN[m].un.push(q.n)); });
  const ord = (a,b)=>a.dp-b.dp || a.d-b.d || a.n-b.n;
  P.forEach(q=>{ q.un.sort((a,b)=>ord(byN[a],byN[b])); const d = ideas[q.i]; d.probs.push(q); d.diff[q.d]++; if(q.wk) d.worked++; fams[q.f].probs++;
    q.u.forEach(k=>{ if(ideas[k]) ideas[k].used.push(q); }); });
  ideas.forEach(d=>{ d.probs.sort(ord); d.used.sort(ord); });
  // concept index: "about it" = the primary idea's concepts + the problem's own; "uses it" = the concepts of the other ideas it needs
  const con = {};
  const add = (c, k, q) => { (con[c] = con[c] || {primary:[], uses:[], ps:new Set()}); if(k==="primary"){ if(!con[c].ps.has(q.n)){ con[c].ps.add(q.n); con[c].primary.push(q); } } else con[c].uses.push(q); };
  P.forEach(q=>{ const prim = new Set(ideas[q.i].c.concat(q.c)); prim.forEach(c=>add(c,"primary",q));
    const also = new Set(); q.u.forEach(k=>(ideas[k]?ideas[k].c:[]).forEach(c=>{ if(!prim.has(c)) also.add(c); })); also.forEach(c=>add(c,"uses",q)); });
  Object.values(con).forEach(v=>{ v.primary.sort(ord); v.uses.sort(ord); delete v.ps; });
  const maxL = Math.max(0, ...ideas.map(d=>d.l));
  I = {raw, C, fams, ideas, byId, P, byN, con, maxL, tags:raw.tags||[], stats:raw.stats||{}, practice, lay:null};
}

/* ---------------- state ---------------- */
function S(){ const st = app().state; if(!st.pm) st.pm = {idea:null, prob:null, fam:-1, diff:-1, worked:false, q:"", concept:null, z:0, more:{}, mode:"road", open:{}}; return st.pm; }
function hash(){ const s = S(); return s.prob ? "#problems/" + s.prob : s.idea ? "#problems/idea/" + s.idea : "#problems"; }
function setHash(){ const A = app(); if(A.state.view==="problems" && !A.R.open) try{ history.replaceState(null, "", hash()); }catch(e){} }
const doneSet = () => {
  const A = app(), me = A.Store.me || {}, out = new Set(Object.keys(me.problems||{}).map(Number));
  // a worked practice problem marked solved counts too (it is the same LeetCode problem)
  let prac = me.practice || {};
  if(A.STANDALONE){ try{ const ls = JSON.parse(localStorage.getItem("dts:practice:v1")) || {}; prac = Object.fromEntries(Object.entries(ls).map(([k,v])=>[k, !!(v&&v.solved)])); }catch(e){} }
  try{ const s = window.DTSAlgo && window.DTSAlgo.practiceSaved && window.DTSAlgo.practiceSaved(); if(s) prac = Object.assign({}, prac, Object.fromEntries(Object.entries(s).map(([k,v])=>[k, !!(v&&v.solved)]))); }catch(e){}
  if(I){ const bySlug = {}; I.P.forEach(q=>bySlug[q.s]=q.n); Object.entries(prac).forEach(([id,v])=>{ if(v && bySlug[id]) out.add(bySlug[id]); }); }
  return out;
};

/* ---------------- filters ---------------- */
function probOk(q, s){
  if(s.diff>=0 && q.d!==s.diff) return false;
  if(s.worked && !q.wk) return false;
  return true;
}
function qMatch(s){
  const q = s.q.trim().toLowerCase(); if(!q) return null;
  const num = q.replace(/^#/, ""), isNum = /^\d+$/.test(num);
  const ideas = I.ideas.filter(d=>(d.name+" "+d.id+" "+d.s).toLowerCase().includes(q));
  const probs = isNum ? (I.byN[+num] ? [I.byN[+num]] : []) : I.P.filter(p=>p.t.toLowerCase().includes(q));
  return {q, ideas, probs};
}
function ideaMatch(d, s, qm){
  if(s.fam>=0 && d.f!==s.fam) return false;
  if(s.diff>=0 && !d.diff[s.diff]) return false;
  if(s.worked && !d.worked) return false;
  if(s.concept && !(d.c.includes(s.concept) || d.probs.some(q=>q.c.includes(s.concept)))) return false;
  if(qm && !(qm.ideas.includes(d) || qm.probs.some(q=>q.i===d.i))) return false;
  return true;
}

/* ---------------- roadmap: the default view ----------------
   The same DAG, told as a route: families in the order their prerequisites allow, each family as numbered stages
   (stage k = level k-1), each idea with a status computed from what you solved. The cross-section stays as "Full map". */
// an idea is "started" with one solved problem and "done" with its anchor plus three solved (or all, if it has fewer)
function ideaState(d, done){
  const n = d.probs.length, k = d.probs.filter(q=>done.has(q.n)).length;
  const started = id => I.byId[id].probs.some(q=>done.has(q.n));
  const need = d.b.filter(id=>!started(id));
  const st = n && k >= Math.min(n, 3) && (!d.a || done.has(d.a) || k===n) ? "done" : k ? "started" : need.length ? "locked" : "ready";
  return {st, k, n, need};
}
// families ordered so that a family comes after the families its ideas build on (ties keep the file order)
function famOrder(){
  if(I.famOrd) return I.famOrd;
  const deps = I.fams.map(f=>new Set(f.ideas.flatMap(d=>d.b.map(b=>I.byId[b].f)).filter(g=>g!==f.i)));
  const out = [], seen = new Set();
  while(out.length < I.fams.length){
    const free = I.fams.filter(f=>!seen.has(f.i)).map(f=>({f, left:[...deps[f.i]].filter(g=>!seen.has(g)).length}));
    free.sort((a,b)=>a.left-b.left || a.f.i-b.f.i); const pick = free[0].f; seen.add(pick.i); out.push(pick);
  }
  I.famDeps = deps; return I.famOrd = out;
}
const STAT = {done:["✓","Done"], started:["◐","Started"], ready:["●","Ready"], locked:["○","Needs"]};
function roadHTML(s, qm){
  const done = doneSet(), fams = famOrder(), solved = I.P.filter(q=>done.has(q.n)).length;
  const nx = nextList(done, 3), first = nx[0];
  let h = `<section class="pm-you" aria-label="Your progress"><div class="pm-yt"><b>${fmt(solved)}</b> of ${fmt(I.P.length)} problems solved<span class="pm-bar" aria-hidden="true"><span style="width:${(100*solved/I.P.length).toFixed(2)}%"></span></span></div>
    ${first ? `<button type="button" class="pm-nextbig" data-pmprob="${first.q.n}" style="--c:${famVar(first.q.f)}"><span class="pm-nk">${solved ? "Your next problem" : "Start here"}</span><span class="pm-nt">#${first.q.n} ${esc(first.q.t)}</span><span class="pm-nw">${esc(I.ideas[first.q.i].name)} · ${DIFF[first.q.d]} · ${esc(first.why)}</span></button>` : ""}
    ${nx.length>1 ? `<p class="pm-also">Or: ${nx.slice(1).map(x=>pref(x.q.n)).join(" · ")}</p>` : ""}
    <p class="pm-legend" aria-label="Idea status"><span class="pm-ir done"><span class="pm-is">✓</span>done</span><span class="pm-ir started"><span class="pm-is">◐</span>started</span><span class="pm-ir ready"><span class="pm-is">●</span>ready to start</span><span class="pm-ir locked"><span class="pm-is">○</span>needs another idea first</span><span><span class="pm-mix" aria-hidden="true"><i class="easy" style="flex:1"></i><i class="medium" style="flex:1"></i><i class="hard" style="flex:1"></i></span> easy, medium, hard</span></p></section>`;
  const fs = fams.filter(f=>s.fam<0 || f.i===s.fam), filt = s.fam>=0 || s.diff>=0 || s.worked || s.concept || qm;
  h += `<ol class="pm-fams">` + fs.map((f, k)=>{
    const ideas = f.ideas.filter(d=>ideaMatch(d, s, qm)); if(filt && !ideas.length) return "";
    const fk = f.ideas.reduce((a,d)=>a + d.probs.filter(q=>done.has(q.n)).length, 0), pos = g => fams.indexOf(I.fams[g]);
    const before = [...I.famDeps[f.i]].filter(g=>pos(g) < pos(f.i)).map(g=>I.fams[g]), later = [...I.famDeps[f.i]].filter(g=>pos(g) > pos(f.i)).map(g=>I.fams[g]);
    const names = (list, n) => list.slice(0, n).map(g=>esc(g.name)).join(", ") + (list.length > n ? ` and ${list.length - n} more` : "");
    const dep = (before.length ? `Builds on ${names(before, 3)}.` : "Start here: needs no earlier family.") + (later.length ? ` A few later stages also use ${names(later, 2)}.` : "");
    const open = s.open[f.id]!==undefined ? s.open[f.id] : (filt || (!solved && k===0) || ideas.some(d=>d.id===s.idea) || (solved && fk>0 && fk<f.probs));
    const levels = [...new Set(ideas.map(d=>d.l))].sort((a,b)=>a-b);
    const body = levels.map(l=>`<li class="pm-stage-l"><p class="pm-sl"><span class="pm-sn">${l+1}</span>Stage ${l+1}${l===0?" · foundations":""}</p><ul class="pm-ideas">${ideas.filter(d=>d.l===l).sort((a,b)=>a.name.localeCompare(b.name)).map(d=>{
        const x = ideaState(d, done), t = d.probs.length || 1;
        return `<li><button type="button" class="pm-ir ${x.st}${d.id===s.idea?" sel":""}" data-pmidea="${d.id}" aria-pressed="${d.id===s.idea}" aria-label="${esc(d.name)}: ${STAT[x.st][1]}, ${x.k} of ${x.n} solved">
          <span class="pm-is" aria-hidden="true">${STAT[x.st][0]}</span><span class="pm-ib"><span class="pm-in1">${esc(d.name)}</span><span class="pm-in2">${esc(d.s)}</span>
          ${x.st==="locked" ? `<span class="pm-need">Needs: ${x.need.map(id=>esc(I.byId[id].name)).join(", ")}</span>` : ""}</span>
          <span class="pm-im"><span class="mono">${x.k}/${x.n}</span><span class="pm-mix" title="${d.diff[0]} easy, ${d.diff[1]} medium, ${d.diff[2]} hard" aria-hidden="true">${d.diff.map((c,i)=>c?`<i class="${DIFF[i].toLowerCase()}" style="flex:${c/t}"></i>`:"").join("")}</span></span></button></li>`; }).join("")}</ul></li>`).join("");
    return `<li class="pm-fcard${open?" open":""}" style="--c:${famVar(f.i)}"><button type="button" class="pm-fh" data-pmopen="${f.id}" aria-expanded="${open}">
      <span class="pm-fno mono">${k+1}</span><span class="pm-fb"><span class="pm-fn">${esc(f.name)}</span><span class="pm-fd">${esc(f.description||"")}</span>
      <span class="pm-fm"><span class="pm-bar"><span style="width:${(100*fk/Math.max(1,f.probs)).toFixed(1)}%"></span></span><span class="mono">${fk}/${f.probs}</span><span>${f.ideas.length} ideas · ${levels.length} stage${levels.length===1?"":"s"}</span></span>
      <span class="pm-fdep">${dep}</span></span><span class="pm-chev" aria-hidden="true">▾</span></button>
      ${open ? `<ol class="pm-stages">${body}</ol>` : ""}</li>`;
  }).join("") + `</ol>`;
  return h;
}

/* ---------------- layout: a cross-section, one column (lane) per family, level 0 at the bottom ---------------- */
const NW = 158, NH = 40, GX = 8, LG = 26, RG = 8, BP = 14, GUT = 92, FOOT = 58, TOPP = 8;
function layout(){
  if(I.lay) return I.lay;
  const F = I.fams.length, L = I.maxL + 1;
  const cnt = I.fams.map(f=>{ const a = Array(L).fill(0); f.ideas.forEach(d=>a[d.l]++); return a; });
  const dims = K => {
    const rows = Array.from({length:L}, (x,l)=>Math.max(1, ...cnt.map((a,f)=>Math.ceil(a[l]/K[f]))));
    const W = GUT + K.reduce((s,k)=>s + k*NW + (k-1)*GX, 0) + (F-1)*LG + 16;
    const H = TOPP + rows.reduce((s,r)=>s + r*NH + (r-1)*RG + 2*BP, 0) + FOOT;
    return {rows, W, H};
  };
  // widen the lanes that make a level tall, while that makes the whole drawing smaller
  let K = Array(F).fill(1), cur = dims(K);
  for(let it=0; it<40; it++){
    let best = null;
    for(let f=0; f<F; f++){ if(K[f]>=3) continue; const K2 = K.slice(); K2[f]++; const d = dims(K2); if(d.W*d.H < cur.W*cur.H*0.985 && (!best || d.W*d.H < best.d.W*best.d.H)) best = {K:K2, d}; }
    if(!best) break; K = best.K; cur = best.d;
  }
  const lx = []; let x = GUT; K.forEach((k,f)=>{ lx[f] = x; x += k*NW + (k-1)*GX + LG; });
  const band = []; let y = TOPP;
  for(let l=L-1; l>=0; l--){ const h = cur.rows[l]*NH + (cur.rows[l]-1)*RG + 2*BP; band[l] = {y, h}; y += h; }
  const pos = {};
  for(let l=0; l<L; l++){
    I.fams.forEach((fm,f)=>{
      const cell = fm.ideas.filter(d=>d.l===l).map(d=>{ const xs = d.b.map(b=>pos[b]).filter(Boolean).map(p=>p.x+NW/2); return {d, bx: xs.length ? xs.reduce((s,v)=>s+v,0)/xs.length : Infinity}; })
        .sort((a,b)=>a.bx-b.bx || b.d.probs.length-a.d.probs.length || a.d.name.localeCompare(b.d.name));
      cell.forEach((c,k)=>{ const col = k % K[f], row = Math.floor(k / K[f]);
        pos[c.d.id] = {x: lx[f] + col*(NW+GX), y: band[l].y + band[l].h - BP - (row+1)*NH - row*RG}; });
    });
  }
  I.lay = {K, lx, band, pos, W:cur.W, H:cur.H, L};
  return I.lay;
}
function wrap(t, n, lines){
  const words = String(t).split(/\s+/), out = [""];
  for(const w of words){ const cur = out[out.length-1]; if(!cur) out[out.length-1] = w; else if((cur+" "+w).length <= n) out[out.length-1] = cur+" "+w; else out.push(w); }
  if(out.length > lines){ const keep = out.slice(0, lines); let last = keep[lines-1] + " " + out.slice(lines).join(" "); keep[lines-1] = last.length > n ? last.slice(0, n-1).trimEnd() + "…" : last; return keep; }
  return out.map(l=>l.length > n ? l.slice(0, n-1) + "…" : l);
}
const famVar = f => `var(--pf${f % 18})`;
function mapSVG(){
  const Y = layout(), s = S();
  let g = `<defs><pattern id="pm-bed" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="pm-hatch"/></pattern></defs>`;
  // strata: one band per level, foundations at the bottom
  for(let l=0; l<Y.L; l++){ const b = Y.band[l], n = I.ideas.filter(d=>d.l===l).length;
    g += `<rect class="pm-band${l%2?" odd":""}" x="0" y="${b.y}" width="${Y.W}" height="${b.h}"/>`;
    g += `<text class="pm-lvl" x="14" y="${b.y+b.h/2-4}">Level ${l}</text><text class="pm-lvls" x="14" y="${b.y+b.h/2+12}">${l===0?"foundations · ":""}${n} ideas</text>`; }
  // family lanes (core samples) and their names under the foundations
  const base = Y.band[0].y + Y.band[0].h;
  g += `<rect x="0" y="${base}" width="${Y.W}" height="${FOOT}" fill="url(#pm-bed)" class="pm-bedrock"/>`;
  I.fams.forEach((fm,f)=>{ const w = Y.K[f]*NW + (Y.K[f]-1)*GX;
    g += `<rect class="pm-lane" style="--c:${famVar(f)}" x="${Y.lx[f]-6}" y="${TOPP}" width="${w+12}" height="${base-TOPP}" rx="8"/>`;
    const lines = wrap(fm.name.replace(/ & /g, " & "), Math.max(14, Math.floor((w+8)/6.4)), 2);
    g += `<g class="pm-lname" data-pmfam="${f}" style="--c:${famVar(f)}" role="button" tabindex="-1" aria-label="Show only ${esc(fm.name)}"><rect x="${Y.lx[f]-6}" y="${base+6}" width="${w+12}" height="${FOOT-12}" rx="6"/>${lines.map((t,k)=>`<text x="${Y.lx[f]+w/2}" y="${base+22+k*14}" text-anchor="middle">${esc(t)}</text>`).join("")}</g>`;
  });
  // edges: from an idea down to each idea it builds on
  let e = "";
  I.ideas.forEach(d=>{ const a = Y.pos[d.id]; d.b.forEach(bid=>{ const b = Y.pos[bid]; if(!a||!b) return;
    const x1 = a.x+NW/2, y1 = a.y+NH, x2 = b.x+NW/2, y2 = b.y, my = (y1+y2)/2;
    e += `<path class="pm-e" data-from="${d.id}" data-to="${bid}" d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"/>`; }); });
  g += `<g class="pm-edges">${e}</g>`;
  let nodes = "";
  I.ideas.forEach(d=>{ const p = Y.pos[d.id]; if(!p) return; const lines = wrap(d.name, 21, 2), n = d.probs.length;
    nodes += `<g class="pm-n${n?"":" empty"}" data-pmidea="${d.id}" style="--c:${famVar(d.f)}" role="button" tabindex="-1" aria-label="${esc(d.name)}, level ${d.l}, ${n} problem${n===1?"":"s"}"><title>${esc(d.name)} · level ${d.l} · ${esc(I.fams[d.f].name)} · ${n} problem${n===1?"":"s"}</title>`+
      `<rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="6"/>`+
      lines.map((t,k)=>`<text class="pm-nt" x="${p.x+8}" y="${p.y + (lines.length===1?24:17) + k*14}">${esc(t)}</text>`).join("") +
      `<text class="pm-nc" x="${p.x+NW-6}" y="${p.y+14}" text-anchor="end">${n||""}</text></g>`; });
  g += `<g class="pm-nodes">${nodes}</g>`;
  return `<svg class="pm-svg" id="pm-svg" viewBox="0 0 ${Y.W} ${Y.H}" width="${Math.round(Y.W*s.z)}" height="${Math.round(Y.H*s.z)}" role="group" aria-label="Idea map: ${I.ideas.length} ideas in ${I.fams.length} families, level 0 at the bottom. Arrow keys move between ideas, Enter opens one.">${g}</svg>`;
}

/* ---------------- the view ---------------- */
let EL = null;
function render(el){
  EL = el;
  if(!available()){ el.innerHTML = `<h2 class="vh">Problem map</h2><p class="vsub">This build has no problem map yet. Run <code>python3 tools/merge_problemmap.py</code>, then <code>python3 tools/build.py</code>.</p>`; el.__pm = false; return; }
  if(!I){ el.innerHTML = `<h2 class="vh">Problem map</h2><p class="empty">${PM.err ? "Could not load the problem map: " + esc(PM.err) : "Loading the problem map…"}</p>`; el.__pm = false;
    if(!PM.err) ensure(()=>{ const A = app(); if(A.state.view==="problems"){ render(EL); A.renderPanel(); } }); return; }
  bind(el);
  if(!el.__pm || !$("pm-svg")) build_view(el);
  refresh();
}
function build_view(el){
  const s = S(), st = I.stats, cat = st.catalog || I.P.length, Y = layout();
  if(!s.z) s.z = narrow() ? 0.7 : 0.9;   // readable from the start; "Fit" shows the whole cross-section
  const miss = (st.missing_families||[]).map(id=>(I.fams.find(f=>f.id===id)||{name:id}).name);
  el.innerHTML = `<div class="pm">
    <div class="pm-head"><h2 class="vh">Problem map</h2>
      <p class="vsub">${fmt(I.P.length)}${I.P.length<cat?` of ${fmt(cat)}`:""} LeetCode problems, built from the ground up. Each one is pinned to one of ${I.ideas.length} ideas (techniques), grouped in ${I.fams.length} families. Work down the roadmap: each family is a set of stages, and each idea opens its problems as a ladder, easiest first.${miss.length?` Still being mapped: ${esc(miss.join(", "))}.`:""}</p></div>
    <div class="filters pm-mode" role="group" aria-label="View"><button type="button" data-pmmode="road" aria-pressed="true">Roadmap</button><button type="button" data-pmmode="map" aria-pressed="false">Full map</button></div>
    <div class="pm-tools">
      <div class="pm-search"><label for="pm-q" class="sr">Find an idea or a problem</label><input id="pm-q" type="search" placeholder="Find an idea or a problem (name or number)" value="${esc(s.q)}" autocomplete="off" spellcheck="false"><div class="pm-sres" id="pm-sres" hidden></div></div>
      <div class="filters pm-diff" role="group" aria-label="Difficulty">${["All"].concat(DIFF).map((d,k)=>`<button type="button" data-pmdiff="${k-1}" aria-pressed="false">${d}</button>`).join("")}</div>
      <button type="button" class="pm-tog" data-pmworked aria-pressed="false"><span class="pm-box" aria-hidden="true"></span>Has a worked problem</button>
      <label class="pm-fam" id="pm-famw"><span class="sw" aria-hidden="true"></span><span class="sr">Family</span><select id="pm-fam"><option value="-1">All ${I.fams.length} families</option>${I.fams.map(f=>`<option value="${f.i}">${esc(f.name)}</option>`).join("")}</select></label>
      <span id="pm-concept"></span>
    </div>
    <div id="pm-road"></div>
    <div id="pm-mapw">
    <div class="pm-stage">
      <div class="pm-frame" id="pm-frame">${mapSVG()}</div>
      <div class="pm-zoom" role="group" aria-label="Zoom"><button type="button" class="btn" data-pmzoom="out" aria-label="Zoom out">−</button><button type="button" class="btn" data-pmzoom="in" aria-label="Zoom in">+</button><button type="button" class="btn" data-pmzoom="fit">Fit</button><button type="button" class="btn" data-pmzoom="ground">Foundations</button></div>
    </div>
    <p class="pm-cap" id="pm-cap" aria-live="polite"></p>
    </div>
    <details class="pm-list"><summary>Every idea as a list, by family</summary><div class="pm-listb">${I.fams.map(f=>`<div class="pm-lg" style="--c:${famVar(f.i)}"><div class="uh"><span class="sw"></span>${esc(f.name)} · ${f.probs} problems</div><div class="chips">${f.ideas.slice().sort((a,b)=>a.l-b.l||a.name.localeCompare(b.name)).map(d=>`<button type="button" class="chip" data-pmidea="${d.id}" style="--c:${famVar(f.i)}"><span class="sw"></span>${esc(d.name)} <span class="mono pm-cn">L${d.l} · ${d.probs.length}</span></button>`).join("")}</div></div>`).join("")}</div></details>
  </div>`;
  el.__pm = true;
  const fr = $("pm-frame");
  // start at the foundations: the bottom of the drawing
  requestAnimationFrame(()=>{ if(s.idea && !s.scrolled) centerOn(s.idea, false); else if(!s.scrolled) fr.scrollTop = fr.scrollHeight; s.scrolled = true; });
  fr.addEventListener("scroll", ()=>{ s.sx = fr.scrollLeft; s.sy = fr.scrollTop; }, {passive:true});
  if(s.sx!==undefined){ fr.scrollLeft = s.sx; fr.scrollTop = s.sy; }
}
// related ideas of the selection: everything it builds on (all the way down) and the ideas built directly on it
function related(id){
  const d = I.byId[id]; if(!d) return null;
  const anc = new Set(), q = [d]; while(q.length){ const c = q.shift(); c.b.forEach(b=>{ if(!anc.has(b)){ anc.add(b); q.push(I.byId[b]); } }); }
  return {anc, up:new Set(d.up.map(x=>x.id))};
}
function refresh(){
  if(!EL || !EL.__pm) return;
  const s = S(), qm = qMatch(s), rel = s.idea ? related(s.idea) : null;
  let nIdeas = 0, nProbs = 0;
  const on = {};
  I.ideas.forEach(d=>{ on[d.id] = ideaMatch(d, s, qm); if(on[d.id]){ nIdeas++; nProbs += d.probs.filter(q=>probOk(q,s) && (!qm || !qm.probs.length || qm.ideas.includes(d) || qm.probs.includes(q))).length; } });
  let focusId = s.idea && I.byId[s.idea] ? s.idea : null;
  EL.querySelectorAll(".pm-n").forEach(g=>{ const id = g.dataset.pmidea;
    g.classList.toggle("off", !on[id]); g.classList.toggle("sel", id===s.idea);
    g.classList.toggle("anc", !!(rel && rel.anc.has(id))); g.classList.toggle("up", !!(rel && rel.up.has(id)));
    g.classList.toggle("dim", !!(rel && id!==s.idea && !rel.anc.has(id) && !rel.up.has(id)));
    g.setAttribute("aria-pressed", String(id===s.idea));
    g.tabIndex = -1; });
  if(!focusId){ const first = I.ideas.find(d=>d.l===0 && on[d.id]) || I.ideas.find(d=>on[d.id]) || I.ideas[0]; focusId = first && first.id; }
  const fn = focusId && EL.querySelector(`.pm-n[data-pmidea="${CSS.escape(focusId)}"]`); if(fn) fn.tabIndex = 0;
  EL.querySelectorAll(".pm-e").forEach(p=>{ const a = p.dataset.from, b = p.dataset.to;
    const hot = !!rel && ((a===s.idea || rel.anc.has(a)) && rel.anc.has(b) || (rel.up.has(a) && b===s.idea));
    p.classList.toggle("hot", hot); p.classList.toggle("off", !on[a] || !on[b]); p.classList.toggle("dim", !!rel && !hot); });
  EL.querySelectorAll("[data-pmdiff]").forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.pmdiff===s.diff)));
  const fs = $("pm-fam"), fw = $("pm-famw"); if(fs){ fs.value = String(s.fam); fw.classList.toggle("on", s.fam>=0); fw.style.setProperty("--c", s.fam>=0 ? famVar(s.fam) : "var(--line-strong)"); }
  EL.querySelectorAll(".pm-lname").forEach(g=>g.classList.toggle("on", +g.dataset.pmfam===s.fam));
  const wb = EL.querySelector("[data-pmworked]"); if(wb) wb.setAttribute("aria-pressed", String(!!s.worked));
  const N = app().N, cc = $("pm-concept");
  if(cc) cc.innerHTML = s.concept ? `<button type="button" class="chip pm-cchip" data-pmconcept="" style="--c:var(--l${N[s.concept]?N[s.concept].l:3})" aria-label="Clear the concept filter"><span class="sw"></span>Concept: ${esc(N[s.concept]?N[s.concept].label:s.concept)} <span aria-hidden="true">✕</span></button>` : "";
  const cap = $("pm-cap");
  if(cap){ const filtered = s.fam>=0 || s.diff>=0 || s.worked || s.concept || qm;
    cap.innerHTML = (filtered ? `<b>${nIdeas} of ${I.ideas.length} ideas</b> match, with ${fmt(nProbs)} problems. <button type="button" class="linkish" data-pmclear>Clear filters</button> ` : `${I.ideas.length} ideas in ${I.fams.length} families. `) +
      `Lines run from an idea down to the ideas it builds on. Drag or scroll to move; Ctrl + wheel, pinch or the buttons zoom.`; }
  const road = s.mode!=="map", rw = $("pm-road"), mw = $("pm-mapw");
  EL.querySelectorAll("[data-pmmode]").forEach(b=>b.setAttribute("aria-pressed", String((b.dataset.pmmode==="road")===road)));
  if(rw){ rw.hidden = !road; if(road) rw.innerHTML = roadHTML(s, qm); }
  if(mw){ const was = mw.hidden; mw.hidden = road; if(was && !road) requestAnimationFrame(()=>{ const fr = $("pm-frame"); if(fr && !s.sx) fr.scrollTop = fr.scrollHeight; }); }
  const pl = EL.querySelector(".pm-list"); if(pl) pl.hidden = road;
  searchResults(qm);
}
function searchResults(qm){
  const box = $("pm-sres"); if(!box) return;
  const inp = $("pm-q");
  if(!qm || document.activeElement!==inp){ box.hidden = true; return; }
  const ideas = qm.ideas.slice(0,6), probs = qm.probs.slice(0,8);
  box.innerHTML = (ideas.length||probs.length) ? ideas.map(d=>`<button type="button" data-pmidea="${d.id}" style="--c:${famVar(d.f)}"><span class="sw"></span><span><b>${esc(d.name)}</b><span class="pm-sm">idea · level ${d.l} · ${d.probs.length} problems</span></span></button>`).join("") +
    probs.map(q=>`<button type="button" data-pmprob="${q.n}" style="--c:${famVar(q.f)}"><span class="sw"></span><span>#${q.n} ${esc(q.t)}<span class="pm-sm">${DIFF[q.d]} · ${esc(I.ideas[q.i].name)}</span></span></button>`).join("") +
    (qm.probs.length>8?`<div class="pm-sm pm-more">${qm.probs.length-8} more problems match; the map shows their ideas.</div>`:"")
    : `<div class="pm-sm pm-more">Nothing matches "${esc(qm.q)}".</div>`;
  box.hidden = false;
}

/* ---------------- zoom and pan ---------------- */
function setZoom(z, cx, cy){
  const s = S(), fr = $("pm-frame"), svg = $("pm-svg"); if(!fr || !svg) return;
  const Y = layout(); z = Math.max(0.2, Math.min(2.2, z));
  const r = fr.getBoundingClientRect();
  const px = cx===undefined ? fr.clientWidth/2 : cx - r.left, py = cy===undefined ? fr.clientHeight/2 : cy - r.top;
  const mx = (fr.scrollLeft + px) / s.z, my = (fr.scrollTop + py) / s.z;
  s.z = z; svg.setAttribute("width", Math.round(Y.W*z)); svg.setAttribute("height", Math.round(Y.H*z));
  fr.scrollLeft = mx*z - px; fr.scrollTop = my*z - py;
}
function fitZoom(){ const fr = $("pm-frame"); if(!fr) return; const Y = layout(); setZoom(Math.min(fr.clientWidth / Y.W, fr.clientHeight / Y.H)); fr.scrollLeft = 0; fr.scrollTop = 0; }
function centerOn(id, smooth){
  const fr = $("pm-frame"), p = layout().pos[id]; if(!fr || !p) return;
  const s = S(); if(s.z < 0.55) setZoom(0.75);
  const x = (p.x + NW/2)*s.z - fr.clientWidth/2, y = (p.y + NH/2)*s.z - fr.clientHeight/2;
  fr.scrollTo({left:Math.max(0,x), top:Math.max(0,y), behavior: smooth && !reduced() ? "smooth" : "auto"});
}
let drag = null, dragged = false;
function bind(el){
  if(el.__pmBound) return; el.__pmBound = true;
  el.addEventListener("pointerdown", e=>{
    const fr = e.target.closest && e.target.closest("#pm-frame"); if(!fr || e.pointerType!=="mouse" || e.button!==0) return;
    drag = {x:e.clientX, y:e.clientY, sl:fr.scrollLeft, st:fr.scrollTop, fr}; dragged = false;
  });
  window.addEventListener("pointermove", e=>{ if(!drag) return; const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
    if(!dragged && Math.abs(dx)+Math.abs(dy) > 5){ dragged = true; drag.fr.classList.add("grab"); }
    if(dragged){ drag.fr.scrollLeft = drag.sl - dx; drag.fr.scrollTop = drag.st - dy; } });
  window.addEventListener("pointerup", ()=>{ if(drag) drag.fr.classList.remove("grab"); drag = null; setTimeout(()=>{ dragged = false; }, 0); });
  el.addEventListener("wheel", e=>{ const fr = e.target.closest && e.target.closest("#pm-frame"); if(!fr || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); setZoom(S().z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY); }, {passive:false});
  // two-finger pinch on touch screens
  const touches = {}; let pinch = null;
  el.addEventListener("touchstart", e=>{ if(e.touches.length===2 && e.target.closest("#pm-frame")){ const [a,b] = e.touches; pinch = {d:Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY), z:S().z}; } }, {passive:true});
  el.addEventListener("touchmove", e=>{ if(!pinch || e.touches.length!==2) return; e.preventDefault(); const [a,b] = e.touches;
    setZoom(pinch.z * Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY) / pinch.d, (a.clientX+b.clientX)/2, (a.clientY+b.clientY)/2); }, {passive:false});
  el.addEventListener("touchend", ()=>{ pinch = null; });
  el.addEventListener("input", e=>{ if(e.target.id==="pm-q"){ S().q = e.target.value; refresh(); } });
  el.addEventListener("change", e=>{ if(e.target.id==="pm-fam"){ S().fam = +e.target.value; refresh(); app().renderPanel(); } });
  el.addEventListener("focusin", e=>{ if(e.target.id==="pm-q") refresh(); });
  el.addEventListener("keydown", e=>{
    if(e.target.id==="pm-q"){
      const box = $("pm-sres"), items = box && !box.hidden ? [...box.querySelectorAll("button")] : [];
      if(e.key==="Escape"){ box.hidden = true; return; }
      if(e.key==="ArrowDown" && items.length){ e.preventDefault(); items[0].focus(); return; }
      if(e.key==="Enter" && items.length){ e.preventDefault(); items[0].click(); return; }
      return;
    }
    if(e.target.closest && e.target.closest("#pm-sres") && (e.key==="ArrowDown"||e.key==="ArrowUp")){ e.preventDefault(); const items = [...$("pm-sres").querySelectorAll("button")], i = items.indexOf(e.target);
      const n = items[i + (e.key==="ArrowDown"?1:-1)]; if(n) n.focus(); else if(e.key==="ArrowUp") $("pm-q").focus(); return; }
    const node = e.target.closest && e.target.closest(".pm-n");
    if(node && /^Arrow/.test(e.key)){ e.preventDefault(); const nx = nearest(node.dataset.pmidea, e.key); if(nx){ node.tabIndex = -1; nx.tabIndex = 0; nx.focus({preventScroll:true}); keepVisible(nx.dataset.pmidea); } return; }
    if(node && (e.key==="Enter" || e.key===" ")){ e.preventDefault(); pickIdea(node.dataset.pmidea); return; }
    const lane = e.target.closest && e.target.closest(".pm-lname");
    if(lane && (e.key==="Enter" || e.key===" ")){ e.preventDefault(); lane.dispatchEvent(new MouseEvent("click", {bubbles:true})); return; }
    if(e.target.closest && e.target.closest(".pm-stage") && !e.ctrlKey && !e.metaKey){
      if(e.key==="+"||e.key==="="){ e.preventDefault(); setZoom(S().z*1.25); } else if(e.key==="-"){ e.preventDefault(); setZoom(S().z/1.25); } else if(e.key==="0"){ e.preventDefault(); fitZoom(); }
    }
  });
}
function nearest(id, key){
  const P = layout().pos, a = P[id]; let best = null, bd = Infinity;
  const dir = {ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0]}[key];
  EL.querySelectorAll(".pm-n").forEach(g=>{ const b = P[g.dataset.pmidea]; if(!b || g.dataset.pmidea===id) return;
    const dx = b.x-a.x, dy = b.y-a.y, along = dx*dir[0] + dy*dir[1]; if(along <= 0) return;
    const across = Math.abs(dx*dir[1]) + Math.abs(dy*dir[0]), d = along + across*2.5 + (g.classList.contains("off")?400:0);
    if(d < bd){ bd = d; best = g; } });
  return best;
}
function keepVisible(id){
  const fr = $("pm-frame"), p = layout().pos[id], z = S().z; if(!fr||!p) return;
  const x0 = p.x*z, y0 = p.y*z, x1 = (p.x+NW)*z, y1 = (p.y+NH)*z, m = 24;
  if(x0 < fr.scrollLeft + m) fr.scrollLeft = x0 - m; else if(x1 > fr.scrollLeft + fr.clientWidth - m) fr.scrollLeft = x1 - fr.clientWidth + m;
  if(y0 < fr.scrollTop + m) fr.scrollTop = y0 - m; else if(y1 > fr.scrollTop + fr.clientHeight - m) fr.scrollTop = y1 - fr.clientHeight + m;
}

/* ---------------- navigation ---------------- */
function revealPanel(){ const p = $("panel"); if(!p) return; if(narrow()) p.scrollIntoView({behavior:reduced()?"auto":"smooth", block:"start"}); else p.scrollTop = 0; }
function go(fn){
  const A = app(); if(A.R.open) A.closeRead();
  const s = S(); fn(s);
  if(A.state.view!=="problems") A.setView("problems"); else { if(EL) render(EL); A.renderPanel(); }
  setHash();
}
function pickIdea(id, opts){
  if(!I || !I.byId[id]) return;
  go(s=>{ s.idea = id; s.prob = null; s.more = {}; });
  if(!opts || opts.center!==false) requestAnimationFrame(()=>{ const fr = $("pm-frame"), p = layout().pos[id]; if(fr && p){ const z = S().z, r = {x:p.x*z, y:p.y*z};
    if(r.x < fr.scrollLeft || r.x > fr.scrollLeft+fr.clientWidth-NW*z || r.y < fr.scrollTop || r.y > fr.scrollTop+fr.clientHeight-NH*z) centerOn(id, true); } });
  revealPanel();
}
function pickProb(n){
  const q = I && I.byN[n]; if(!q) return;
  go(s=>{ s.prob = n; s.idea = I.ideas[q.i].id; });
  requestAnimationFrame(()=>centerOn(I.ideas[q.i].id, true));
  revealPanel();
}

/* ---------------- shared bits ---------------- */
const diffPill = d => `<span class="pr-d ${DIFF[d].toLowerCase()}">${DIFF[d]}</span>`;
const lcURL = q => `https://leetcode.com/problems/${encodeURIComponent(q.s)}/`;
const pref = n => { const q = I.byN[n]; return q ? `<button type="button" class="linkish" data-pmprob="${n}">#${n} ${esc(q.t)}</button>` : `#${n}`; };
const ideaChip = d => `<button type="button" class="chip" data-pmidea="${d.id}" style="--c:${famVar(d.f)}"><span class="sw"></span>${esc(d.name)}</button>`;
function conceptChips(ids){
  const N = app().N;
  return ids.map(c=>N[c] ? `<button type="button" class="chip" style="--c:var(--l${N[c].l})" data-read="${c}"><span class="sw"></span>${esc(N[c].label)}</button>`
    : `<span class="chip pm-planned" title="A concept the map proposes; its read is not written yet"><span class="sw"></span>${esc(c)} (planned)</span>`).join("");
}
function probRow(q, done, o){
  o = o || {};
  const dn = done.has(q.n), d = I.ideas[q.i];
  const pre = q.p.length ? `<span>after ${q.p.map(pref).join(", ")}</span>` : `<span>needs nothing before it</span>`;
  return `<div class="pm-row${dn?" done":""}" style="--c:${famVar(q.f)}">
    ${o.toggle===false ? `<span class="pm-dot${dn?" on":""}" aria-hidden="true">${dn?"✓":""}</span>` : `<button type="button" class="pm-done" data-pmdone="${q.n}" aria-pressed="${dn}" aria-label="${dn?"Solved":"Mark as solved"}: #${q.n} ${esc(q.t)}" title="${dn?"Solved (click to undo)":"Mark as solved"}">${dn?"✓":""}</button>`}
    <div class="pm-rb"><div class="pm-rt"><button type="button" class="pm-pt" data-pmprob="${q.n}">#${q.n} ${esc(q.t)}</button>${diffPill(q.d)}${o.idea?`<span class="pm-in">${esc(d.name)}</span>`:""}</div>
    ${q.w?`<p class="pm-new">${esc(q.w)}</p>`:""}
    <p class="pm-meta">${o.why?`<span>${o.why}</span>`:pre}<a href="${lcURL(q)}" target="_blank" rel="noopener noreferrer">LeetCode ↗</a>${q.wk?`<button type="button" class="linkish" data-pmpractice="${esc(q.s)}">Worked problem</button>`:""}</p></div></div>`;
}

/* ---------------- side panel ---------------- */
function panel(el){
  if(!available()){ el.innerHTML = `<p class="empty">No problem map in this build.</p>`; return; }
  if(!I){ el.innerHTML = `<p class="empty">Loading…</p>`; ensure(()=>{ if(app().state.view==="problems") panel($("panel")); }); return; }
  const s = S();
  if(s.prob && I.byN[s.prob]) el.innerHTML = probPanel(I.byN[s.prob]);
  else if(s.idea && I.byId[s.idea]) el.innerHTML = ideaPanel(I.byId[s.idea]);
  else el.innerHTML = introPanel();
}
function introPanel(){
  const done = doneSet();
  const road = S().mode!=="map";
  return `<div class="pm-intro"><h2>How to use the map</h2>
    <p class="mech">${road ? "The roadmap lists the 18 families in the order their prerequisites allow. Inside a family, stage 1 holds the foundations (scan an array, use a hash set, recurse) and each later stage builds on the ones before it. Every idea shows how many of its problems you solved and whether you are ready for it." : "Read the full map from the bottom up. Level 0 holds the foundations: scan an array, use a hash set, recurse. Every idea above builds on the ideas its lines reach down to. Each column is one family of techniques."}</p>
    <ol class="pm-how"><li>Pick an idea to see its problems as a ladder: start with the first step, then climb.</li><li>Pick a problem to see what it builds on (below) and what it unlocks (above), and the shortest path to it from the foundations.</li><li>Mark problems as solved; the You tab then suggests the problems whose prerequisites you have all solved.</li></ol>
    <h3>Next problems for you</h3>${nextHTML(done, 6)}</div>`;
}
function ideaPanel(d){
  const s = S(), fam = I.fams[d.f], done = doneSet();
  const list = d.probs.filter(q=>probOk(q,s));
  const lim = s.more.ladder || 30, shown = list.slice(0, lim);
  // a ladder: one step per depth, easiest (shallowest) first
  const steps = []; shown.forEach(q=>{ const last = steps[steps.length-1]; if(last && last.dp===q.dp) last.q.push(q); else steps.push({dp:q.dp, q:[q]}); });
  const filt = s.diff>=0 || s.worked;
  const anchor = I.byN[d.a];
  const solvedHere = d.probs.filter(q=>done.has(q.n)).length;
  let h = `<div class="eyebrow"><span class="lpill" style="--c:${famVar(d.f)}"><span class="sw"></span>${esc(fam.name)}</span><span>Level ${d.l}</span><span class="mono">${d.probs.length} problem${d.probs.length===1?"":"s"}${solvedHere?` · ${solvedHere} solved`:""}</span></div>
    <h2>${esc(d.name)}</h2><p class="mech">${esc(d.s)}</p>`;
  h += `<div class="btnrow"><button type="button" class="btn" data-pmclose>Back to the overview</button></div>`;
  h += `<h3>Builds on</h3>` + (d.b.length ? `<div class="chips">${d.b.map(b=>ideaChip(I.byId[b])).join("")}</div>` : `<p class="empty">Nothing: this is a foundation.</p>`);
  if(d.c.length) h += `<h3>Pinned to these concepts</h3><div class="chips">${conceptChips(d.c)}</div>`;
  if(anchor) h += `<h3>The anchor problem</h3><p class="pm-anchor">The simplest problem that introduces this idea: ${pref(anchor.n)} ${diffPill(anchor.d)}</p>`;
  h += `<h3>The ladder · ${list.length}${filt?` of ${d.probs.length}`:""} problems</h3>`;
  if(filt) h += `<p class="pm-note">Showing ${s.diff>=0?DIFF[s.diff]+" ":""}problems${s.worked?" with a worked problem":""} only. <button type="button" class="linkish" data-pmclear>Show all</button></p>`;
  if(!list.length) h += `<p class="empty">${d.probs.length ? "No problems match the filters." : "No problems are mapped to this idea yet."}</p>`;
  h += `<ol class="pm-ladder">${steps.map((st,k)=>`<li class="pm-step"><span class="pm-stepn" aria-hidden="true">${k+1}</span><div class="pm-stepb"><p class="pm-steph">${k===0?"Start here":"Then"} <span class="mono">depth ${st.dp}</span></p>${st.q.map(q=>probRow(q, done)).join("")}</div></li>`).join("")}</ol>`;
  if(list.length > lim) h += `<button type="button" class="btn" data-pmmore="ladder">Show ${Math.min(40, list.length-lim)} more (${list.length-lim} left)</button>`;
  if(d.up.length){ const ups = d.up.slice().sort((a,b)=>a.l-b.l||a.name.localeCompare(b.name)), all = s.more.up;
    h += `<h3>Leads to · ${d.up.length} idea${d.up.length===1?"":"s"}</h3><div class="chips">${(all?ups:ups.slice(0,8)).map(ideaChip).join("")}${ups.length>8&&!all?`<button type="button" class="chip" data-pmmore="up" style="--c:var(--fg)">Show all ${ups.length}</button>`:""}</div>`; }
  if(d.used.length){ const ul = s.more.used || 8, uu = d.used.filter(q=>probOk(q,s));
    h += `<h3>Also needed in · ${uu.length} problems</h3><p class="pm-note">Problems about another idea that use this one along the way.</p>${uu.slice(0, ul).map(q=>probRow(q, done, {idea:true})).join("")}${uu.length>ul?`<button type="button" class="btn" data-pmmore="used">Show ${Math.min(30, uu.length-ul)} more</button>`:""}`; }
  return h;
}
function pathTo(q){
  const out = [q]; let cur = q; const seen = new Set([q.n]);
  while(cur.p.length){ const nx = cur.p.map(n=>I.byN[n]).filter(Boolean).sort((a,b)=>b.dp-a.dp||a.n-b.n)[0]; if(!nx || seen.has(nx.n)) break; seen.add(nx.n); out.push(nx); cur = nx; }
  return out.reverse();
}
function miniDAG(q, done){
  // two levels of prerequisites below, two levels of unlocks above, this problem in the middle
  const MAX = 4, W = 400;
  const uniq = (arr, skip) => [...new Set(arr)].filter(n=>!skip.has(n) && I.byN[n]);
  const self = new Set([q.n]);
  const down1 = uniq(q.p, self), down2 = uniq(down1.flatMap(n=>I.byN[n].p), new Set([q.n, ...down1]));
  const up1 = uniq(q.un, self), up2 = uniq(up1.slice(0, MAX).flatMap(n=>I.byN[n].un), new Set([q.n, ...up1]));
  const rows = [["Unlocks, two steps on", up2], ["Unlocks", up1], ["This problem", [q.n]], ["Builds on", down1], ["Builds on those", down2]].filter(r=>r[1].length);
  const BH = 40, LBL = 15, GAP = 22; let y = 4, svg = "", lab = "";
  const pos = {};
  rows.forEach(([name, ns])=>{
    const show = ns.slice(0, MAX), extra = ns.length - show.length, k = show.length, avail = W - 8 - (extra ? 52 : 0), bw = Math.min(150, avail/k - 8);
    lab += `<text class="pm-ml" x="4" y="${y+10}">${esc(name)}${ns.length>1?` · ${ns.length}`:""}</text>`; y += LBL;
    show.forEach((n,i)=>{ const x = 4 + avail*(i+.5)/k - bw/2; pos[n] = pos[n] || {x, y, bw}; const p = I.byN[n], me = n===q.n, lines = wrap(`#${n} ${p.t}`, Math.max(8, Math.floor((bw-12)/5.6)), 2);
      svg += `<g class="pm-mn${me?" me":""}${done.has(n)?" done":""}" ${me?"":`data-pmprob="${n}" role="button" tabindex="0"`} style="--c:${famVar(p.f)}" aria-label="#${n} ${esc(p.t)}, ${DIFF[p.d]}"><title>#${n} ${esc(p.t)} · ${DIFF[p.d]} · ${esc(I.ideas[p.i].name)}</title><rect x="${x}" y="${y}" width="${bw}" height="${BH}" rx="6"/><circle class="pm-dd ${DIFF[p.d].toLowerCase()}" cx="${x+bw-7}" cy="${y+7}" r="3"/>${lines.map((t,j)=>`<text x="${x+6}" y="${y+(lines.length===1?24:17)+j*13}">${esc(t)}</text>`).join("")}</g>`; });
    if(extra) svg += `<text class="pm-ml" x="${W-4}" y="${y+24}" text-anchor="end">+${extra} more</text>`;
    y += BH + GAP;
  });
  // edges: from a problem down to each prerequisite that is drawn
  let e = "";
  Object.keys(pos).forEach(k=>{ const n = +k, a = pos[n]; I.byN[n].p.forEach(m=>{ const b = pos[m]; if(!b || b.y <= a.y) return;
    const x1 = a.x+a.bw/2, y1 = a.y+BH, x2 = b.x+b.bw/2, y2 = b.y, my = (y1+y2)/2; e += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"/>`; }); });
  return `<svg class="pm-mini" viewBox="0 0 ${W} ${y-GAP+6}" role="group" aria-label="What #${q.n} builds on (below) and what it unlocks (above)">${e}${lab}${svg}</svg>`;
}
function probPanel(q){
  const d = I.ideas[q.i], fam = I.fams[q.f], done = doneSet();
  const path = pathTo(q), dn = done.has(q.n), N = app().N;
  const prim = [...new Set(d.c.concat(q.c))], also = [...new Set(q.u.flatMap(k=>I.ideas[k]?I.ideas[k].c:[]))].filter(c=>!prim.includes(c));
  let h = `<div class="btnrow"><button type="button" class="btn" data-pmidea="${d.id}">← ${esc(d.name)}</button></div>
    <div class="eyebrow"><span class="lpill" style="--c:${famVar(q.f)}"><span class="sw"></span>${esc(fam.name)}</span>${diffPill(q.d)}<span>Level ${d.l}</span><span class="mono">depth ${q.dp}</span></div>
    <h2>#${q.n} ${esc(q.t)}</h2>${q.w?`<p class="mech">${esc(q.w)}</p>`:""}
    <div class="btnrow"><button type="button" class="btn${dn?" on":""}" data-pmdone="${q.n}" aria-pressed="${dn}">${dn?"✓ Solved":"Mark as solved"}</button><a class="btn" href="${lcURL(q)}" target="_blank" rel="noopener noreferrer">Open on LeetCode ↗</a>${q.wk?`<button type="button" class="btn primary" data-pmpractice="${esc(q.s)}">Worked problem</button>`:""}</div>`;
  h += `<h3>Where it sits</h3>${miniDAG(q, done)}`;
  h += `<h3>Learning path to this problem · ${path.length} step${path.length===1?"":"s"}</h3><p class="pm-note">From a problem that needs nothing before it, along the longest chain of prerequisites.</p><ol class="pm-path">${path.map(p=>`<li class="${p.n===q.n?"me":""}${done.has(p.n)?" done":""}" style="--c:${famVar(p.f)}"><span class="pm-pdot" aria-hidden="true">${done.has(p.n)?"✓":""}</span>${p.n===q.n?`<b>#${p.n} ${esc(p.t)}</b>`:`<button type="button" class="linkish" data-pmprob="${p.n}">#${p.n} ${esc(p.t)}</button>`} ${diffPill(p.d)}<span class="pm-in">${esc(I.ideas[p.i].name)}</span></li>`).join("")}</ol>`;
  h += `<h3>Builds on · ${q.p.length}</h3>` + (q.p.length ? q.p.map(n=>probRow(I.byN[n], done, {idea:true})).join("") : `<p class="empty">Nothing: start here.</p>`);
  const ul = S().more.unlocks || 6;
  if(q.un.length) h += `<h3>Unlocks · ${q.un.length}</h3>${q.un.slice(0, ul).map(n=>probRow(I.byN[n], done, {idea:true})).join("")}${q.un.length>ul?`<button type="button" class="btn" data-pmmore="unlocks">Show ${Math.min(20, q.un.length-ul)} more</button>`:""}`;
  h += `<h3>Ideas it uses</h3><div class="chips">${ideaChip(d)}${q.u.map(k=>I.ideas[k]).filter(Boolean).map(ideaChip).join("")}</div>`;
  if(prim.length || also.length) h += `<h3>Concepts</h3><div class="chips">${conceptChips(prim)}${also.length?conceptChips(also):""}</div>`;
  if(q.g.length) h += `<h3>LeetCode tags</h3><p class="pm-tags">${q.g.map(t=>esc(I.tags[t])).join(", ")}</p>`;
  return h;
}

/* ---------------- next problems (You tab, overview panel) ---------------- */
function nextList(done, k){
  const ok = q => !done.has(q.n);
  const ready = I.P.filter(q=>ok(q) && q.p.length && q.p.every(n=>done.has(n)));
  ready.sort((a,b)=>a.dp-b.dp || a.d-b.d || b.un.length-a.un.length || a.n-b.n);
  let out = ready.slice(0, k).map(q=>({q, why:`ready: you solved ${q.p.map(n=>"#"+n).join(" and ")}`}));
  if(out.length < k){
    const roots = I.P.filter(q=>ok(q) && !q.p.length).sort((a,b)=>I.ideas[a.i].l-I.ideas[b.i].l || a.d-b.d || b.un.length-a.un.length || a.n-b.n);
    out = out.concat(roots.slice(0, k-out.length).map(q=>({q, why:"a foundation: needs nothing before it"})));
  }
  return out;
}
function nextHTML(done, k){
  const list = nextList(done, k || 8);
  if(!list.length) return `<p class="empty">You have solved every mapped problem. Impressive.</p>`;
  return `<div class="pm-next">${list.map(x=>probRow(x.q, done, {idea:true, why:x.why})).join("")}</div>`;
}
function fillNext(el){
  if(!el) return;
  if(!available()){ el.innerHTML = ""; return; }
  if(!I){ el.innerHTML = `<p class="empty">Loading the problem map…</p>`; ensure(()=>{ if(el.isConnected) fillNext(el); }); return; }
  const done = doneSet(), n = I.P.filter(q=>done.has(q.n)).length;
  el.innerHTML = `<p class="pm-note">${n ? `You have solved ${n} of ${fmt(I.P.length)} mapped problems. These are next: every problem they build on is solved.` : "Mark problems as solved in the problem map (or solve a worked practice problem) and this list follows you up the map. Start at the foundations:"}</p>${nextHTML(done, 8)}<div class="btnrow"><button type="button" class="btn" data-view="problems">Open the problem map</button></div>`;
}

/* ---------------- pins in a concept's read ---------------- */
const PINS = {};
function pinsCount(id){ const s = sum(); const c = s && s.concepts && s.concepts[id]; return c ? c[0] + c[1] : 0; }
function fillPins(root){
  if(!root) return;
  root.querySelectorAll("[data-pmpins]").forEach(box=>{
    const id = box.dataset.pmpins;
    if(!I){ box.innerHTML = `<p class="empty">Loading the problem map…</p>`; ensure(()=>{ if(box.isConnected) fillPins(root); }); return; }
    const c = I.con[id]; if(!c){ box.innerHTML = `<p class="empty">No mapped problem uses this yet.</p>`; return; }
    const st = PINS[id] = PINS[id] || {tab: c.primary.length ? "primary" : "uses", n:8};
    const list = st.tab==="primary" ? c.primary : c.uses, done = doneSet();
    const ideas = I.ideas.filter(d=>d.c.includes(id)).sort((a,b)=>a.l-b.l||b.probs.length-a.probs.length);
    const label = (app().N[id]||{label:id}).label;
    box.innerHTML = `<p class="stand-sum">${c.primary.length} problem${c.primary.length===1?" is":"s are"} about ${esc(label)} directly; ${c.uses.length} more use it along the way. Easiest first: problems that need fewer steps come first. Each opens in the problem map.</p>
      ${ideas.length?`<p class="pm-note">Ideas in the problem map pinned here:</p><div class="chips pm-pinideas">${ideas.map(ideaChip).join("")}</div>`:""}
      <div class="filters pm-pintabs" role="group" aria-label="Which problems">${c.primary.length?`<button type="button" data-pmpintab="primary" data-pmc="${id}" aria-pressed="${st.tab==="primary"}">About it · ${c.primary.length}</button>`:""}${c.uses.length?`<button type="button" data-pmpintab="uses" data-pmc="${id}" aria-pressed="${st.tab==="uses"}">Also uses it · ${c.uses.length}</button>`:""}</div>
      <div class="pm-pinlist">${list.slice(0, st.n).map(q=>probRow(q, done, {idea:true, toggle:false})).join("")}</div>
      ${list.length>st.n?`<div class="btnrow"><button type="button" class="btn" data-pmpinmore="${id}">${st.n<=8?`Show all ${list.length}`:`Show ${Math.min(60, list.length-st.n)} more`}</button><button type="button" class="btn" data-pmconcept="${id}">See them in the problem map</button></div>`:`<div class="btnrow"><button type="button" class="btn" data-pmconcept="${id}">See them in the problem map</button></div>`}`;
  });
}

/* ---------------- links for algo.js: practice problems, pattern templates, visualizers ---------------- */
// visualizer id -> the ideas it animates (checked against the map at run time; unknown ids are ignored)
const VIZ_IDEAS = {bubble:["sortfirst"], insertion:["sortfirst"], merge:["mergesort","merge2","inversions"], quick:["quickselect","dutchflag"], heap:["heap"],
  binsearch:["bsearch","bsboundary"], twoptr:["twoptr-sorted","twoptr"], window:["varwin"], window2:["varwin","anagram-win","minwin","fixedwin"],
  dijkstra:["dijkstra","dijkstra-state"], topo:["topo"], unionfind:["uf"], binheap:["heap","topk"], chaining:["hashmap","hashset"], probing:["hashset"],
  lru:["lru"], bloom:["hashset"], trie:["trie"], btree:["orderedset"], lcs:["lcs"], editdist:["editdist"], knapsack:["knap01","coin"],
  monostack:["mono-next","histogram"], backtrack:["subsets","perms","combos","prune"], treedfs:["treerec","treereturn"], dp1d:["dp1d","memo"],
  prefix:["prefixsum","diffarray","prefixhash"], segtree:["segtree","segtree-lazy"], fastslow:["fastslow","cycle-entry"], bsanswer:["bsanswer","bsfeasible"],
  mst:["mst"], sweep:["sweep","rooms"], kmp:["kmp"], topk:["topk","twoheaps"], sieve:["sieve"], dp2d:["griddp","intervaldp"], bfs:["bfsgrid","levelorder"], dfs:["dfsgraph","floodfill"]};
function later(){ ensure(()=>{ const A = app(); if(A && A.algoReady) A.algoReady(); }); return ""; }
const linkRow = (lead, ideas) => ideas.length ? `<p class="av-aux pm-links">${lead} ${ideas.map(d=>`<button type="button" class="linkish" data-pmidea="${d.id}">${esc(d.name)}</button>`).join(" · ")}</p>` : "";
function practiceLink(slug){
  if(!available()) return ""; if(!I) return later();
  const q = I.P.find(x=>x.s===slug); if(!q) return "";
  const d = I.ideas[q.i];
  return `<p class="av-aux pm-links">In the problem map: <button type="button" class="linkish" data-pmprob="${q.n}">#${q.n} at depth ${q.dp}</button>, idea <button type="button" class="linkish" data-pmidea="${d.id}">${esc(d.name)}</button> (level ${d.l})${q.p.length?`, after ${q.p.map(n=>`#${n}`).join(", ")}`:""}.</p>`;
}
function patternIdeas(name){
  const prac = (app().DATA.practice||[]).filter(p=>p.pattern===name), cnt = {};
  prac.forEach(p=>{ const q = I.P.find(x=>x.s===p.id); if(q) cnt[q.i] = (cnt[q.i]||0) + 1; });
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([i])=>I.ideas[+i]);
}
function patternLink(name){ if(!available()) return ""; if(!I) return later(); return linkRow("Ideas in the problem map:", patternIdeas(name)); }
function vizLink(id){ if(!available()) return ""; if(!I) return later(); return linkRow("In the problem map:", (VIZ_IDEAS[id]||[]).map(x=>I.byId[x]).filter(Boolean)); }

/* ---------------- clicks ---------------- */
document.addEventListener("click", async e=>{
  if(dragged && e.target.closest && e.target.closest("#pm-frame")){ e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target.closest && e.target.closest("[data-pmidea],[data-pmprob],[data-pmdone],[data-pmpractice],[data-pmfam],[data-pmdiff],[data-pmworked],[data-pmzoom],[data-pmconcept],[data-pmclear],[data-pmclose],[data-pmmore],[data-pmpintab],[data-pmpinmore],[data-pmmode],[data-pmopen]");
  if(!t) return;
  const d = t.dataset, A = app(); if(!A) return;
  try{
    if(d.pmidea!==undefined){ e.preventDefault(); await ensure(); return pickIdea(d.pmidea); }
    if(d.pmprob!==undefined){ e.preventDefault(); await ensure(); return pickProb(+d.pmprob); }
    if(d.pmdone!==undefined){ const n = +d.pmdone, on = !doneSet().has(n);
      if(!on && !(A.Store.me.problems||{})[n]){ A.toast("Solved as a worked practice problem: undo it there"); return; }
      await A.Store.setPmSolved(n, on); A.toast(on ? "Marked as solved" : "Marked as not solved");
      if(A.state.view==="problems"){ A.renderPanel(); refresh(); } else if(A.state.view==="you") A.render(false); return; }
    if(d.pmpractice){ if(A.R.open) A.closeRead(); A.state.algo.tab = "practice"; A.state.algo.prob = d.pmpractice; return A.setView("algorithms"); }
    if(d.pmconcept!==undefined){ await ensure(); return go(s=>{ s.concept = d.pmconcept || null; if(s.concept){ s.idea = null; s.prob = null; } }); }
    if(d.pmpintab){ PINS[d.pmc] = Object.assign(PINS[d.pmc]||{}, {tab:d.pmpintab, n:8}); return fillPins(t.closest(".rd-sec") || document); }
    if(d.pmpinmore){ const st = PINS[d.pmpinmore]; st.n = st.n<=8 ? 60 : st.n + 60; return fillPins(t.closest(".rd-sec") || document); }
    const s = S();
    if(d.pmmode){ s.mode = d.pmmode; refresh(); return A.renderPanel(); }
    if(d.pmopen){ const li = t.closest(".pm-fcard"); s.open[d.pmopen] = !(li && li.classList.contains("open")); refresh();
      const b = EL && EL.querySelector(`[data-pmopen="${CSS.escape(d.pmopen)}"]`); if(b) b.focus({preventScroll:true}); return; }
    if(d.pmfam!==undefined){ s.fam = (+d.pmfam===s.fam) ? -1 : +d.pmfam; refresh(); return A.renderPanel(); }
    if(d.pmdiff!==undefined){ s.diff = +d.pmdiff; refresh(); return A.renderPanel(); }
    if(d.pmworked!==undefined){ s.worked = !s.worked; refresh(); return A.renderPanel(); }
    if(d.pmclear!==undefined){ s.fam = -1; s.diff = -1; s.worked = false; s.q = ""; s.concept = null; const q = $("pm-q"); if(q) q.value = ""; refresh(); return A.renderPanel(); }
    if(d.pmclose!==undefined){ const was = s.idea; s.idea = null; s.prob = null; refresh(); A.renderPanel(); setHash();
      // on a phone the panel sits below the roadmap: go back to the idea's row
      const row = was && EL && EL.querySelector(`#pm-road [data-pmidea="${CSS.escape(was)}"]`); if(row && narrow()){ row.scrollIntoView({block:"center", behavior:reduced()?"auto":"smooth"}); row.focus({preventScroll:true}); } return; }
    if(d.pmmore==="up"){ s.more.up = true; return A.renderPanel(); }
    if(d.pmmore){ s.more[d.pmmore] = (s.more[d.pmmore] || (d.pmmore==="ladder"?30:d.pmmore==="used"?8:6)) + (d.pmmore==="ladder"?40:d.pmmore==="used"?30:20); return A.renderPanel(); }
    if(d.pmzoom){ if(d.pmzoom==="in") setZoom(s.z*1.25); else if(d.pmzoom==="out") setZoom(s.z/1.25); else if(d.pmzoom==="fit") fitZoom();
      else { const fr = $("pm-frame"); if(s.z < 0.6) setZoom(0.8); fr.scrollTo({left:0, top:fr.scrollHeight, behavior:reduced()?"auto":"smooth"}); } return; }
  } catch(err){ A.toast("Something went wrong: " + err.message); }
});

/* ---------------- routing helpers for app.js ---------------- */
function route(kind, val){
  // kind: "idea" | "prob" | null; called by app.js for #problems, #problems/idea/<id>, #problems/<n>
  const s = S();
  if(kind==="idea"){ s.idea = val; s.prob = null; }
  else if(kind==="prob"){ s.prob = +val; s.idea = null; }
  if(kind) ensure(()=>{ const q = s.prob && I.byN[s.prob]; if(q) s.idea = I.ideas[q.i].id; if(s.prob && !q) s.prob = null; if(s.idea && !I.byId[s.idea]) s.idea = null;
    const A = app(); if(A.state.view==="problems"){ if(EL) render(EL); A.renderPanel(); if(s.idea) requestAnimationFrame(()=>centerOn(s.idea, false)); } });
}

window.DTSPM = { available, ensure, render, panel, hash, route, fillPins, fillNext, pinsCount, practiceLink, patternLink, vizLink, refresh,
  count: () => { const s = sum(); return s ? s.problems : 0; }, done: () => doneSet(), _I: () => I };
if(window.__dts && window.__dts.pmReady) window.__dts.pmReady();
})();
