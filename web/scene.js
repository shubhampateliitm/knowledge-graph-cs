/* Down the Stack — animated scene player. Loaded before app.js (inlined before it in the standalone file).
   Scenes are JSON (content/anim/*.json; format in content/anim/README.md): actors, groups and links drawn as SVG, then steps
   that send messages, change labels, move, add and remove actors.
     DTSScene.mount(host, scene, opts)  -> player in host (Back / Play / Next / Restart, speed, keyboard)
     DTSScene.thumb(scene)              -> a static <svg> of the last step (gallery cards)
     DTSScene.stopAll()                 -> pause every player, forget the ones no longer in the page
   State after step k is rebuilt from the scene's start, so Back and jumps are exact; only forward steps animate. */
(function(){
"use strict";
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
const reduced = () => mq.matches;
const TONES = {normal:1, accent:1, ok:1, bad:1, muted:1, warn:1};
const toneOf = t => TONES[t] ? t : "normal";
const r1 = v => Math.round(v*10)/10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
const clone = o => JSON.parse(JSON.stringify(o));
const SPEEDS = [0.5, 1, 2];
const live = new Set();
let uid = 0;

/* ---------------- model: state after k steps ---------------- */
function addActor(s, a){
  if(!a || a.id==null) return;
  const o = {id:String(a.id), label:a.label!=null?String(a.label):"", sub:a.sub!=null?String(a.sub):"", tone:toneOf(a.tone), shape:a.shape||"box",
             x:+a.x||0, y:+a.y||0, w:+a.w||120, h:+a.h||50};
  if(!s.a[o.id]) s.order.push(o.id);
  s.a[o.id] = o;
}
function addLink(s, l){
  if(!l) return;
  s.links = s.links.filter(x=>!(x.from===l.from && x.to===l.to));
  s.links.push({from:l.from, to:l.to, label:l.label?String(l.label):"", dashed:!!l.dashed});
}
function apply(s, st){
  (st.remove||[]).forEach(id=>{ delete s.a[id]; s.order = s.order.filter(x=>x!==id); s.links = s.links.filter(l=>l.from!==id && l.to!==id); });
  (st.add||[]).forEach(a=>addActor(s, a));
  Object.entries(st.set||{}).forEach(([id,v])=>{ const a=s.a[id]; if(!a||!v) return;
    if(v.label!==undefined) a.label=String(v.label); if(v.sub!==undefined) a.sub=String(v.sub); if(v.tone!==undefined) a.tone=toneOf(v.tone); });
  Object.entries(st.move||{}).forEach(([id,v])=>{ const a=s.a[id]; if(!a||!v) return; if(v.x!==undefined) a.x=+v.x; if(v.y!==undefined) a.y=+v.y; });
  (st.unlink||[]).forEach(p=>{ const f = Array.isArray(p)?p[0]:p&&p.from, t = Array.isArray(p)?p[1]:p&&p.to;
    const n = s.links.length; s.links = s.links.filter(l=>!(l.from===f && l.to===t)); if(s.links.length===n) s.links = s.links.filter(l=>!(l.from===t && l.to===f)); });
  (st.link||[]).forEach(l=>addLink(s, l));
  s.links = s.links.filter(l=>s.a[l.from] && s.a[l.to]);
}
function states(sc){
  const s0 = {a:{}, order:[], links:[]};
  (sc.actors||[]).forEach(a=>addActor(s0, a)); (sc.links||[]).forEach(l=>addLink(s0, l));
  s0.links = s0.links.filter(l=>s0.a[l.from] && s0.a[l.to]);
  const out = [s0];
  (sc.steps||[]).forEach(st=>{ const s = clone(out[out.length-1]); apply(s, st||{}); out.push(s); });
  return out;
}

/* ---------------- text fitting ---------------- */
let ctx2d = null; const FONT = {};
function fam(kind){
  if(!FONT[kind]){ let v = ""; try{ v = getComputedStyle(document.documentElement).getPropertyValue(kind==="mono"?"--font-mono":"--font-body").trim(); }catch(e){}
    FONT[kind] = v || (kind==="mono" ? "ui-monospace, monospace" : "system-ui, sans-serif"); }
  return FONT[kind];
}
function tw(text, size, kind, weight){
  if(ctx2d===null){ try{ ctx2d = document.createElement("canvas").getContext("2d") || false; }catch(e){ ctx2d = false; } }
  if(!ctx2d) return text.length * size * (kind==="mono" ? .6 : .56);
  ctx2d.font = `${weight||400} ${size}px ${fam(kind)}`;
  return ctx2d.measureText(text).width;
}
function wrap(text, size, kind, weight, maxW, maxLines){
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for(const w of words){
    const t = cur ? cur + " " + w : w;
    if(tw(t, size, kind, weight) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if(cur) lines.push(cur);
  if(lines.length > maxLines || lines.some(l=>tw(l, size, kind, weight) > maxW)) return null;
  return lines;
}
// label and sub-label lines that fit inside the actor; bigger than the base size when the drawing is shown small (phones)
function layout(a, scale){
  const mono = a.shape==="cell", kind = mono ? "mono" : "body";
  const base = mono ? 13.5 : 14, sbase = 11.5;
  const padX = a.shape==="circle" ? a.w*.17 : a.shape==="note" ? 12 : 8;
  const aw = Math.max(16, a.w - 2*padX), ah = Math.max(12, a.h - (a.shape==="db" ? Math.min(11, a.h*.2) + 8 : 6));
  let L = Math.min(base*1.55, Math.max(base, 10.5/scale)), S = Math.min(sbase*1.55, Math.max(sbase, 9.5/scale));
  const floorL = base*.7, floorS = sbase*.75;
  let last = null;
  for(let i=0; i<16; i++){
    const ll = a.label ? wrap(a.label, L, kind, 600, aw, 3) : [];
    const sl = a.sub ? wrap(a.sub, S, "body", 400, aw, 3) : [];
    if(ll && sl){
      const hgt = ll.length*L*1.12 + (sl.length ? 2 + sl.length*S*1.16 : 0);
      last = {L, S, ll, sl, kind};
      if(hgt <= ah) return last;
    }
    if(L<=floorL && S<=floorS) break;
    L = Math.max(floorL, L*.92); S = Math.max(floorS, S*.92);
  }
  return last || {L, S, ll:a.label?[a.label]:[], sl:a.sub?[a.sub]:[], kind};
}

/* ---------------- geometry ---------------- */
const center = a => [a.x + a.w/2, a.y + a.h/2];
function edge(a, ux, uy){
  const hw = a.w/2, hh = a.h/2;
  if(a.shape==="circle") return 1/Math.sqrt((ux/hw)**2 + (uy/hh)**2);
  return Math.min(Math.abs(ux)<1e-9 ? Infinity : hw/Math.abs(ux), Math.abs(uy)<1e-9 ? Infinity : hh/Math.abs(uy));
}
// segment between two actors' outlines, shifted sideways by off; (sx,sy) points to the side the shift went
function seg(A, B, off, gap){
  const [ax,ay] = center(A), [bx,by] = center(B);
  const len = Math.hypot(bx-ax, by-ay) || 1, ux = (bx-ax)/len, uy = (by-ay)/len, sx = uy, sy = -ux;
  let da = edge(A,ux,uy) + gap, db = edge(B,ux,uy) + gap;
  if(da + db > len - 6){ const k = Math.max(0, (len-6)/(da+db)); da *= k; db *= k; }
  return {x1:ax+ux*da+sx*off, y1:ay+uy*da+sy*off, x2:bx-ux*db+sx*off, y2:by-uy*db+sy*off, sx, sy, off};
}

function shapeSVG(a){
  const w = a.w, h = a.h;
  switch(a.shape){
    case "round": return `<rect class="sc-sh" width="${w}" height="${h}" rx="${r1(Math.min(h/2, 18))}"/>`;
    case "circle": return `<ellipse class="sc-sh" cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/>`;
    case "db": { const e = r1(Math.min(11, h*.2));
      return `<path class="sc-sh" d="M0,${e} A${w/2},${e} 0 0 1 ${w},${e} V${h-e} A${w/2},${e} 0 0 1 0,${h-e} Z"/><path class="sc-sh2" d="M0,${e} A${w/2},${e} 0 0 0 ${w},${e}"/>`; }
    case "cell": return `<rect class="sc-sh" width="${w}" height="${h}" rx="3"/>`;
    case "note": { const f = r1(Math.min(12, h/3));
      return `<path class="sc-sh" d="M0,0 H${w-f} L${w},${f} V${h} H0 Z"/><path class="sc-sh2" d="M${w-f},0 V${f} H${w}"/>`; }
    default: return `<rect class="sc-sh" width="${w}" height="${h}" rx="6"/>`;
  }
}
function textSVG(a, lay){
  const w = a.w, h = a.h, lh = lay.L*1.12, sh = lay.S*1.16;
  const total = lay.ll.length*lh + (lay.sl.length ? 2 + lay.sl.length*sh : 0);
  let y = (h - total)/2 + (a.shape==="db" ? Math.min(11, h*.2)/2 : 0), out = "";
  if(lay.ll.length){
    out += `<text class="sc-lab${lay.kind==="mono"?" mono":""}" font-size="${r1(lay.L)}" text-anchor="middle">` + lay.ll.map((t,i)=>`<tspan x="${w/2}" y="${r1(y + lh*i + lay.L*.8)}">${esc(t)}</tspan>`).join("") + `</text>`;
    y += lay.ll.length*lh + 2;
  }
  if(lay.sl.length) out += `<text class="sc-sub" font-size="${r1(lay.S)}" text-anchor="middle">` + lay.sl.map((t,i)=>`<tspan x="${w/2}" y="${r1(y + sh*i + lay.S*.8)}">${esc(t)}</tspan>`).join("") + `</text>`;
  return out;
}

/* ---------------- stage: draws one state, animates one step ---------------- */
class Stage {
  constructor(svg, sc){
    this.svg = svg; this.sc = sc; this.W = +sc.w || 720; this.H = +sc.h || 400; this.id = "scn" + (++uid);
    this.scale = 1; this.speed = 1; this.tok = 0; this.raf = 0; this.dying = []; this.busy = false;
    this.nodes = {}; this.lnodes = {}; this.disp = {a:{}, order:[], links:[]}; this.base = this.disp; this.ghostMsgs = [];
    svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    svg.classList.add("sc-svg");
    const mk = t => `<marker id="${this.id}-${t}" viewBox="0 0 10 10" refX="8.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="sc-mk t-${t}"/></marker>`;
    svg.innerHTML = `<defs>${["link"].concat(Object.keys(TONES)).map(mk).join("")}</defs>` +
      `<g class="sc-groups">${(sc.groups||[]).map(g=>`<g class="sc-g"><rect x="${+g.x||0}" y="${+g.y||0}" width="${+g.w||0}" height="${+g.h||0}" rx="12"/><text class="sc-gl" x="${(+g.x||0)+12}" data-y="${(+g.y||0)+8}">${esc(String(g.label||"").toUpperCase())}</text></g>`).join("")}</g>` +
      `<g class="sc-links"></g><g class="sc-ghosts"></g><g class="sc-actors"></g><g class="sc-rings"></g><g class="sc-fx"></g>`;
    this.L = {}; ["links","ghosts","actors","rings","fx"].forEach(k=>this.L[k] = svg.querySelector(".sc-"+k));
  }
  setScale(s){ s = clamp(Math.round(s*20)/20, .2, 2); if(s===this.scale) return false; this.scale = s; return true; }
  get fs(){ return clamp(10/this.scale, 11, 17); }          // message label size
  get dotR(){ return clamp(3.6/this.scale, 6, 9); }
  later(fn, ms){ const tok = this.tok; setTimeout(()=>{ if(tok===this.tok) fn(); }, ms); }
  tween(dur, frame, end, next){
    const tok = this.tok; let p = 0, last = performance.now();
    const tick = now => {
      if(tok!==this.tok) return;
      if(!this.svg.isConnected){ this.tok++; return; }
      p = Math.min(1, p + Math.max(0, now-last)*this.speed/dur); last = now;
      frame(p);
      if(p<1) this.raf = requestAnimationFrame(tick); else { if(end) end(); if(next) next(); }
    };
    frame(0); this.raf = requestAnimationFrame(tick);
  }
  cancel(){
    this.tok++; cancelAnimationFrame(this.raf); this.busy = false;
    this.L.fx.textContent = ""; this.dying.forEach(g=>g.remove()); this.dying = [];
  }
  pos(id){ return this.disp.a[id] || this.base.a[id]; }

  // ---- actors ----
  node(a){
    let n = this.nodes[a.id];
    if(!n){
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", "sc-a"); g.dataset.id = a.id;
      g.innerHTML = `<g class="sc-in"><g class="sc-shp"></g><g class="sc-txt"></g></g>`;
      n = this.nodes[a.id] = {g, inner:g.firstChild, shp:g.querySelector(".sc-shp"), txt:g.querySelector(".sc-txt"), tone:null, skey:"", tkey:""};
    }
    return n;
  }
  paint(a, animated){
    const n = this.node(a); let changed = false;
    n.g.setAttribute("transform", `translate(${r1(a.x)},${r1(a.y)})`);
    if(n.tone!==a.tone){ if(n.tone){ n.g.classList.remove("t-"+n.tone); changed = true; } n.g.classList.add("t-"+a.tone); n.tone = a.tone; }
    const skey = a.shape+"|"+a.w+"|"+a.h;
    if(n.skey!==skey){ n.shp.innerHTML = shapeSVG(a); n.g.setAttribute("data-shape", a.shape); n.skey = skey; }
    const tkey = a.label+"\u0001"+a.sub+"\u0001"+a.w+"\u0001"+a.h+"\u0001"+this.scale;
    if(n.tkey!==tkey){ const textChanged = n.tkey && n.tkey.split("\u0001").slice(0,2).join("\u0001") !== a.label+"\u0001"+a.sub;
      if(textChanged) changed = true; n.txt.innerHTML = textSVG(a, layout(a, this.scale)); n.tkey = tkey; }
    n.g.dataset.label = a.label; n.g.dataset.sub = a.sub;
    if(changed && animated) this.flash(n.g, "chg");
    return n;
  }
  flash(g, cls){ g.classList.remove(cls); void g.getBoundingClientRect(); g.classList.add(cls); setTimeout(()=>g.classList.remove(cls), 900); }

  // ---- links ----
  linkNode(l){
    const k = l.from + ">" + l.to; let n = this.lnodes[k];
    if(!n){
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", "sc-l");
      g.innerHTML = `<line class="sc-ln" marker-end="url(#${this.id}-link)"/><text class="sc-lt" text-anchor="middle"></text>`;
      n = this.lnodes[k] = {g, line:g.firstChild, txt:g.lastChild, l};
      this.L.links.appendChild(g);
    }
    n.l = l; n.line.classList.toggle("dash", l.dashed);
    if(n.txt.textContent!==l.label) n.txt.textContent = l.label;
    n.txt.setAttribute("font-size", r1(clamp(9.5/this.scale, 11, 16)));
    return n;
  }
  placeLink(n){
    const l = n.l, A = this.disp.a[l.from], B = this.disp.a[l.to]; if(!A || !B) return;
    const rev = this.disp.links.some(x=>x.from===l.to && x.to===l.from);
    const s = seg(A, B, rev?5:0, 5), ln = n.line;
    ln.setAttribute("x1", r1(s.x1)); ln.setAttribute("y1", r1(s.y1)); ln.setAttribute("x2", r1(s.x2)); ln.setAttribute("y2", r1(s.y2));
    n.len = Math.hypot(s.x2-s.x1, s.y2-s.y1);
    if(l.label){ const fs = +n.txt.getAttribute("font-size"); n.txt.setAttribute("x", r1((s.x1+s.x2)/2 + s.sx*(fs*.9))); n.txt.setAttribute("y", r1((s.y1+s.y2)/2 + s.sy*(fs*.9) + fs*.35)); }
  }

  // ---- messages that already happened in this step, drawn as faint arrows with their labels ----
  pill(x, y, text, tone, extra){
    const fs = this.fs, w = tw(text, fs, "mono", 500) + fs*1.1, h = fs*1.65;
    x = clamp(x, w/2 + 2, this.W - w/2 - 2); y = clamp(y, h/2 + 2, this.H - h/2 - 2);
    return `<g class="sc-pill t-${tone}${extra||""}" transform="translate(${r1(x)},${r1(y)})"><rect x="${r1(-w/2)}" y="${r1(-h/2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h/2)}"/><text text-anchor="middle" y="${r1(fs*.36)}" font-size="${r1(fs)}">${esc(text)}</text></g>`;
  }
  // messages run beside the centre line (requests above, replies below), further out when an arrow joins the pair
  msgSeg(m){ const A = this.pos(m.from), B = this.pos(m.to); if(!A || !B) return null;
    const linked = this.disp.links.some(l=>(l.from===m.from && l.to===m.to) || (l.from===m.to && l.to===m.from));
    return seg(A, B, linked ? 11 : 7, 4); }
  labelAt(s, x, y){ const off = s.off + this.fs*1.65/2 + 5; return [x + s.sx*off, y + s.sy*off]; }
  drawGhosts(fresh){
    let h = "";
    for(const m of this.ghostMsgs){
      const s = this.msgSeg(m); if(!s) continue;
      const tone = toneOf(m.tone), f = m.lost ? .5 : 1, ex = s.x1 + (s.x2-s.x1)*f, ey = s.y1 + (s.y2-s.y1)*f;
      const mx = (s.x1+ex)/2, my = (s.y1+ey)/2, cls = fresh && fresh.has(m) ? " gin" : "";
      h += `<g class="sc-gh t-${tone}${cls}${m.lost?" lost":""}"><line x1="${r1(s.x1)}" y1="${r1(s.y1)}" x2="${r1(ex)}" y2="${r1(ey)}"${m.lost?"":` marker-end="url(#${this.id}-${tone})"`}/>`;
      if(m.lost){ const d = 7; h += `<g class="sc-x"><line x1="${r1(ex-d)}" y1="${r1(ey-d)}" x2="${r1(ex+d)}" y2="${r1(ey+d)}"/><line x1="${r1(ex-d)}" y1="${r1(ey+d)}" x2="${r1(ex+d)}" y2="${r1(ey-d)}"/></g>`; }
      const [lx, ly] = this.labelAt(s, m.lost ? ex : mx, m.lost ? ey : my);
      if(m.label) h += this.pill(lx, ly, String(m.label), tone, m.lost ? " lost" : "");
      h += `</g>`;
    }
    this.L.ghosts.innerHTML = h;
  }
  drawRings(ids, pulse){
    let h = "";
    for(const id of ids||[]){
      const a = this.disp.a[id]; if(!a) continue;
      const p = 6, sh = a.shape==="circle"
        ? `<ellipse cx="${a.x+a.w/2}" cy="${a.y+a.h/2}" rx="${a.w/2+p}" ry="${a.h/2+p}"/>`
        : `<rect x="${a.x-p}" y="${a.y-p}" width="${a.w+2*p}" height="${a.h+2*p}" rx="${a.shape==="round"?Math.min(a.h/2,18)+p:9}"/>`;
      h += `<g class="sc-ring">${sh}</g>` + (pulse ? `<g class="sc-ring pulse">${sh}</g>` : "");
    }
    this.L.rings.innerHTML = h;
  }

  // ---- draw a state at once (Back, jumps, reduced motion, thumbnails) ----
  show(state, step, prev){
    this.cancel();
    this.svg.classList.add("sc-instant");
    const gfs = r1(clamp(9/this.scale, 11, 18));
    this.svg.querySelectorAll(".sc-gl").forEach(t=>{ if(t.getAttribute("font-size")!==String(gfs)){ t.setAttribute("font-size", gfs); t.setAttribute("y", r1(+t.dataset.y + gfs*.75)); } });
    for(const id in this.nodes) if(!state.a[id]){ this.nodes[id].g.remove(); delete this.nodes[id]; }
    this.disp = clone(state); this.base = prev || state;
    for(const id of state.order){ const n = this.paint(this.disp.a[id], false); n.g.style.opacity = ""; n.g.classList.remove("chg","recv","pop"); this.L.actors.appendChild(n.g); }
    this.syncLinks(false);
    this.ghostMsgs = ((step && step.msgs) || []).filter(m=>m && m.from!==m.to);
    this.drawGhosts(null); this.drawRings(step && step.focus, false);
    void this.svg.getBoundingClientRect();
    this.svg.classList.remove("sc-instant");
  }
  syncLinks(animated){
    const keep = new Set(), added = [], gone = [];
    for(const l of this.disp.links){ const k = l.from+">"+l.to; keep.add(k); const fresh = !this.lnodes[k]; const n = this.linkNode(l); this.placeLink(n);
      if(!animated){ n.g.style.opacity = ""; n.line.style.strokeDasharray = ""; n.line.style.strokeDashoffset = ""; }
      else if(fresh) added.push(n); }
    for(const k in this.lnodes) if(!keep.has(k)){ const n = this.lnodes[k]; delete this.lnodes[k]; if(animated){ gone.push(n.g); this.dying.push(n.g); } else n.g.remove(); }
    return {added, gone};
  }

  // ---- animate one step from the state on screen (prev) to target ----
  animate(prev, target, step, done){
    this.show(prev, null, prev);
    this.busy = true; this.ghostMsgs = []; this.drawGhosts(null);
    const tok = this.tok, d = this.disp;
    const msgs = (step.msgs||[]).filter(m=>m && m.from!==m.to && this.pos(m.from) && this.pos(m.to));
    // a sender changes as it sends; everything else changes when the messages have arrived
    const senders = new Set(msgs.map(m=>m.from)), receivers = new Set(msgs.map(m=>m.to));
    Object.keys(step.set||{}).forEach(id=>{ if(senders.has(id) && !receivers.has(id) && d.a[id] && target.a[id]){
      Object.assign(d.a[id], {label:target.a[id].label, sub:target.a[id].sub, tone:target.a[id].tone}); this.paint(d.a[id], true); } });
    // a message that answers an earlier one in the same step waits for it
    const wave = msgs.map(()=>0);
    msgs.forEach((m,i)=>{ for(let j=0;j<i;j++) if(msgs[j].to===m.from) wave[i] = Math.max(wave[i], wave[j]+1); });
    const nw = msgs.length ? Math.max(...wave)+1 : 0, phases = [];
    for(let w=0; w<nw; w++){ const list = msgs.filter((m,i)=>wave[i]===w); phases.push(next=>this.travel(list, next)); }
    phases.push(next=>this.change(target, next));
    phases.push(next=>{ this.drawRings(step.focus, true); next(); });
    let i = 0;
    const run = () => { if(tok!==this.tok) return; if(i<phases.length) return phases[i++](run); this.busy = false; if(done) done(); };
    run();
  }
  travel(list, next){
    const fx = this.L.fx, r = this.dotR, items = [];
    for(const m of list){
      const s = this.msgSeg(m); if(!s) continue;
      const tone = toneOf(m.tone), g = document.createElementNS(NS, "g");
      g.setAttribute("class", `sc-mv t-${tone}`);
      g.innerHTML = `<line class="sc-trail" x1="${r1(s.x1)}" y1="${r1(s.y1)}" x2="${r1(s.x1)}" y2="${r1(s.y1)}"/><circle class="sc-dot" r="${r1(r)}" cx="${r1(s.x1)}" cy="${r1(s.y1)}"/>` + (m.label ? this.pill(s.x1, s.y1, String(m.label), tone, "") : "");
      fx.appendChild(g);
      items.push({m, s, g, line:g.querySelector("line"), dot:g.querySelector("circle"), pill:g.querySelector(".sc-pill")});
    }
    if(this.onWave && items.length) this.onWave(items.reduce((t,it)=>t + (it.s.x1+it.s.x2)/2, 0)/items.length);
    const len = Math.max(0, ...items.map(it=>Math.hypot(it.s.x2-it.s.x1, it.s.y2-it.s.y1)));
    const dur = clamp(520 + len*1.1, 750, 1250);
    const fs = this.fs;
    this.tween(dur, p=>{
      const e = ease(p);
      for(const it of items){
        const f = it.m.lost ? e*.5 : e, x = it.s.x1 + (it.s.x2-it.s.x1)*f, y = it.s.y1 + (it.s.y2-it.s.y1)*f;
        it.dot.setAttribute("cx", r1(x)); it.dot.setAttribute("cy", r1(y));
        it.line.setAttribute("x2", r1(x)); it.line.setAttribute("y2", r1(y));
        if(it.m.lost) it.g.style.opacity = p > .75 ? String(1 - (p-.75)/.25*.6) : "";
        if(it.pill){ const w = +it.pill.firstChild.getAttribute("width"), h = fs*1.65, [lx, ly] = this.labelAt(it.s, x, y);
          it.pill.setAttribute("transform", `translate(${r1(clamp(lx, w/2+2, this.W-w/2-2))},${r1(clamp(ly, h/2+2, this.H-h/2-2))})`); }
      }
    }, ()=>{
      items.forEach(it=>it.g.remove());
      const fresh = new Set(items.map(it=>it.m));
      this.ghostMsgs = this.ghostMsgs.concat(items.map(it=>it.m));
      this.drawGhosts(fresh);
      items.forEach(it=>{ if(!it.m.lost && this.nodes[it.m.to]) this.flash(this.nodes[it.m.to].g, "recv"); });
    }, ()=>this.later(next, 90));
  }
  change(target, next){
    const d = this.disp, moves = [], fadeIn = [], fadeOut = [];
    for(const id of d.order) if(!target.a[id]){ const n = this.nodes[id]; if(n){ delete this.nodes[id]; fadeOut.push(n.g); this.dying.push(n.g); } }
    const nd = clone(target);
    for(const id of target.order){
      const t = nd.a[id], a = d.a[id];
      if(!a){ const n = this.paint(t, false); n.g.style.opacity = "0"; this.L.actors.appendChild(n.g); this.flash(n.g, "pop"); fadeIn.push(n.g); continue; }
      if(a.x!==t.x || a.y!==t.y){ moves.push({id, x0:a.x, y0:a.y, x1:t.x, y1:t.y}); t.x = a.x; t.y = a.y; }
      this.paint(t, true);
    }
    for(const id of target.order){ const n = this.nodes[id]; if(n) this.L.actors.appendChild(n.g); }
    this.disp = nd;
    const {added, gone} = this.syncLinks(true);
    added.forEach(n=>{ if(n.l.dashed) n.g.style.opacity = "0"; else { n.line.style.strokeDasharray = n.len; n.line.style.strokeDashoffset = n.len; } });
    if(!moves.length && !fadeIn.length && !fadeOut.length && !added.length && !gone.length) return this.later(next, 140);
    const moved = new Set(moves.map(m=>m.id));
    const touchL = Object.values(this.lnodes).filter(n=>moved.has(n.l.from) || moved.has(n.l.to));
    const touchG = this.ghostMsgs.some(m=>moved.has(m.from) || moved.has(m.to));
    this.tween(moves.length ? 720 : 420, p=>{
      const e = ease(p);
      for(const mv of moves){ const a = this.disp.a[mv.id]; a.x = mv.x0 + (mv.x1-mv.x0)*e; a.y = mv.y0 + (mv.y1-mv.y0)*e;
        const n = this.nodes[mv.id]; if(n) n.g.setAttribute("transform", `translate(${r1(a.x)},${r1(a.y)})`); }
      touchL.forEach(n=>this.placeLink(n));
      if(touchG && moves.length) this.drawGhosts(null);
      fadeIn.forEach(g=>g.style.opacity = String(e)); fadeOut.forEach(g=>g.style.opacity = String(1-e));
      gone.forEach(g=>g.style.opacity = String(1-e));
      added.forEach(n=>{ if(n.l.dashed) n.g.style.opacity = String(e); else { n.placeLen = n.len; n.line.style.strokeDasharray = n.len; n.line.style.strokeDashoffset = String(n.len*(1-e)); } });
    }, ()=>{
      fadeOut.concat(gone).forEach(g=>g.remove()); this.dying = [];
      fadeIn.forEach(g=>g.style.opacity = "");
      added.forEach(n=>{ n.g.style.opacity = ""; n.line.style.strokeDasharray = ""; n.line.style.strokeDashoffset = ""; });
    }, next);
  }
}

/* ---------------- player: controls around a stage ---------------- */
class Player {
  constructor(host, sc, opts){
    opts = opts || {};
    this.sc = sc; this.steps = (sc.steps||[]).map(s=>s||{}); this.n = this.steps.length; this.states = states(sc);
    this.k = Math.min(1, this.n); this.fresh = true; this.playing = false; this.timer = 0; this.zoom = false;
    this.speed = SPEEDS.includes(+opts.speed) ? +opts.speed : 1;
    const t = esc(sc.title || "Animation");
    host.innerHTML = `<figure class="scene" tabindex="0" data-scene="${esc(sc.id)}" aria-label="${t}: a ${this.n}-step animation. Left and right arrow keys step through it, space plays or pauses.">
      ${opts.title===false ? "" : `<div class="sc-head"><span class="sc-title">${t}</span></div>`}
      <div class="sc-stage"><svg role="img" aria-label="${t}"></svg></div>
      <p class="sc-cap" aria-live="polite"><span class="sc-no mono">1</span><span class="sc-say"></span></p>
      <div class="sc-ctl">
        <button type="button" class="btn" data-sc="back">← Back</button>
        <button type="button" class="btn primary sc-play" data-sc="play" aria-pressed="false">Play</button>
        <button type="button" class="btn" data-sc="next">Next →</button>
        <button type="button" class="btn" data-sc="restart">Restart</button>
        <span class="sc-speed" role="group" aria-label="Speed">${SPEEDS.map(v=>`<button type="button" data-sc="speed" data-v="${v}" aria-pressed="${v===this.speed}">${v}×</button>`).join("")}</span>
        <button type="button" class="btn sc-zoom" data-sc="zoom" aria-pressed="false" hidden>Zoom in</button>
        <span class="sc-k mono"></span>
      </div>
      <div class="sc-dots" aria-hidden="true">${this.steps.map((s,i)=>`<span data-sc="dot" data-i="${i+1}" title="Step ${i+1}"></span>`).join("")}</div>
    </figure>`;
    this.root = host.firstElementChild; this.box = this.root.querySelector(".sc-stage"); this.svg = this.root.querySelector("svg");
    this.stage = new Stage(this.svg, sc); this.stage.speed = this.speed; this.svg.style.setProperty("--sc-speed", this.speed);
    this.stage.onWave = x => { if(this.zoom) this.box.scrollTo({left: Math.max(0, x*this.stage.scale - this.box.clientWidth/2), behavior: reduced() ? "auto" : "smooth"}); };
    this.root.__player = this;
    this.root.addEventListener("click", e=>this.onClick(e));
    this.root.addEventListener("keydown", e=>this.onKey(e));
    this.measure();
    if("ResizeObserver" in window){ this.ro = new ResizeObserver(()=>this.measure()); this.ro.observe(this.box); }
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ for(const k in FONT) delete FONT[k]; if(!this.stage.busy && this.root.isConnected) this.redraw(); });
    this.redraw(); this.ui();
    live.add(this);
  }
  measure(){
    const cw = this.box.clientWidth; if(!cw) return;
    const fit = cw / this.stage.W, small = fit < .7;
    const zb = this.root.querySelector(".sc-zoom"); zb.hidden = !small;
    if(!small && this.zoom) this.setZoom(false);
    this.svg.style.width = this.zoom ? Math.round(this.stage.W*.8) + "px" : "";
    if(this.stage.setScale(this.zoom ? .8 : fit)){ if(this.stage.busy) this.stale = true; else this.redraw(); }
  }
  setZoom(on){ this.zoom = on; const zb = this.root.querySelector(".sc-zoom"); zb.setAttribute("aria-pressed", String(on)); zb.textContent = on ? "Fit" : "Zoom in"; this.box.classList.toggle("zoomed", on); this.measure(); }
  redraw(){ if(this.n) this.stage.show(this.states[this.k], this.steps[this.k-1], this.states[this.k-1]); else this.stage.show(this.states[0], null, null); }
  ui(){
    const k = Math.max(1, this.k), st = this.steps[k-1] || {};
    const no = this.root.querySelector(".sc-no"), say = this.root.querySelector(".sc-say");
    if(no.textContent!==String(k) || say.textContent!==(st.say||"")){ no.textContent = k; say.textContent = st.say || ""; }
    this.root.querySelector(".sc-k").textContent = `step ${k} of ${this.n}`;
    this.root.querySelector('[data-sc="back"]').disabled = k<=1;
    this.root.querySelector('[data-sc="next"]').disabled = k>=this.n;
    const pb = this.root.querySelector('[data-sc="play"]');
    pb.textContent = this.playing ? "Pause" : (k>=this.n && !this.fresh ? "Replay" : "Play"); pb.setAttribute("aria-pressed", String(this.playing));
    this.root.querySelectorAll(".sc-dots span").forEach((s,i)=>{ s.classList.toggle("done", i<k-1); s.classList.toggle("on", i===k-1); });
    this.root.classList.toggle("playing", this.playing);
  }
  // show step k; animate only when moving one step forward
  go(k, animate){
    if(!this.n) return;
    k = clamp(k, 1, this.n);
    const from = this.k; this.k = k; this.fresh = false; clearTimeout(this.timer); this.ui();
    if(animate && k===from+1 && !reduced()){
      this.root.classList.add("animating");
      this.stage.animate(this.states[k-1], this.states[k], this.steps[k-1], ()=>{ this.root.classList.remove("animating"); if(this.stale){ this.stale = false; this.redraw(); } this.after(); });
    } else { this.root.classList.remove("animating"); this.stage.show(this.states[k], this.steps[k-1], this.states[k-1]); this.after(); }
  }
  dwell(){ const say = (this.steps[this.k-1]||{}).say || ""; return (reduced() ? clamp(2200 + say.length*32, 2600, 7000) : clamp(1100 + say.length*26, 1600, 5200)) / this.speed; }
  after(){
    clearTimeout(this.timer);
    if(!this.playing) return;
    if(this.k>=this.n){ this.playing = false; this.ui(); return; }
    this.timer = setTimeout(()=>{ if(!this.root.isConnected) return this.destroy(); if(this.playing) this.go(this.k+1, true); }, this.dwell());
  }
  play(){
    if(!this.n) return;
    this.playing = true;
    if(this.fresh || this.k>=this.n) return this.restart();
    this.ui();
    if(!this.stage.busy) this.go(this.k+1, true);       // otherwise the running step calls after() when it ends
  }
  pause(){ this.playing = false; clearTimeout(this.timer); if(this.root) this.ui(); }
  restart(){
    if(!this.n) return;
    this.playing = true; clearTimeout(this.timer);
    if(reduced()){ this.k = 1; this.fresh = false; this.ui(); this.stage.show(this.states[1], this.steps[0], this.states[0]); return this.after(); }
    this.k = 0; this.go(1, true);
  }
  setSpeed(v){ this.speed = v; this.stage.speed = v; this.svg.style.setProperty("--sc-speed", v);
    this.root.querySelectorAll('[data-sc="speed"]').forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.v===v)));
    if(this.playing && !this.stage.busy) this.after(); }
  onClick(e){
    const b = e.target.closest("[data-sc]"); if(!b || !this.root.contains(b)) return;
    const a = b.dataset.sc;
    if(a==="play") return this.playing ? this.pause() : this.play();
    if(a==="next"){ this.pause(); return this.go(this.k+1, true); }
    if(a==="back"){ this.pause(); return this.go(this.k-1, false); }
    if(a==="restart") return this.restart();
    if(a==="speed") return this.setSpeed(+b.dataset.v);
    if(a==="zoom") return this.setZoom(!this.zoom);
    if(a==="dot"){ const i = +b.dataset.i; this.pause(); return this.go(i, i===this.k+1); }
  }
  onKey(e){
    if(e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = e.target.closest && e.target.closest("button");
    if(e.key==="ArrowRight"){ e.preventDefault(); this.pause(); return this.go(this.k+1, true); }
    if(e.key==="ArrowLeft"){ e.preventDefault(); this.pause(); return this.go(this.k-1, false); }
    if(e.key==="Home"){ e.preventDefault(); this.pause(); return this.go(1, false); }
    if(e.key==="End"){ e.preventDefault(); this.pause(); return this.go(this.n, false); }
    if((e.key===" " || e.key==="Spacebar") && !onButton){ e.preventDefault(); return this.playing ? this.pause() : this.play(); }
  }
  destroy(){ this.pause(); this.stage.cancel(); this.root.classList.remove("animating"); if(this.ro) this.ro.disconnect(); live.delete(this); }
}

function mount(host, scene, opts){ return new Player(host, scene, opts); }
function thumb(scene){
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const st = new Stage(svg, scene), all = states(scene), n = (scene.steps||[]).length;
  st.show(all[n], n ? scene.steps[n-1] : null, all[Math.max(0, n-1)]);
  return svg;
}
function stopAll(){ for(const p of Array.from(live)){ if(!p.root.isConnected) p.destroy(); else p.pause(); } }

window.DTSScene = { mount, thumb, stopAll, states, players: () => Array.from(live) };
})();
