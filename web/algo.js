/* Down the Stack — Algorithms tab. Loaded after app.js (inlined after it in the standalone file).
   1. Visualizers: each algorithm runs once on your input and records every step as a frame, so Back works as well as Next.
   2. Practice: problems from DATA.practice; your code runs in a Web Worker with a 2-second limit.
   3. Animations: a gallery of every animated scene (web/scene.js), grouped by layer; each opens its concept's read at the scene.
   app.js calls DTSAlgo.render(el, state.algo) and reads DTSAlgo.hash(state.algo); everything else is local to this file. */
(function(){
"use strict";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const app = () => window.__dts;
const $ = id => document.getElementById(id);
const MAXF = 3000;   // frame cap: big inputs make the animation useless anyway

/* ---------------- recording ---------------- */
class Rec {
  constructor(){ this.frames = []; this.c = {}; }
  inc(k, n){ this.c[k] = (this.c[k]||0) + (n===undefined?1:n); }
  step(line, msg, s){
    if(this.frames.length >= MAXF) throw new Error("This input needs more than " + MAXF + " steps. Try a smaller one.");
    this.frames.push({line, msg, c:Object.assign({}, this.c), s:JSON.parse(JSON.stringify(s))});
  }
}
const COUNT = {cmp:"comparisons", swp:"swaps", wr:"writes", vis:"visited", relax:"edge updates", cells:"cells filled", probe:"probes",
               hit:"hits", miss:"misses", evict:"evictions", moved:"keys moved", steps:"pointer steps", set:"bits set", fp:"false positives",
               split:"splits", elect:"elections started", msg:"messages", commit:"entries committed"};

/* ---------------- small helpers ---------------- */
function nums(str, lo, hi, max){
  const a = String(str).split(/[\s,;]+/).filter(Boolean).map(Number);
  if(!a.length) throw new Error("Type some numbers, separated by commas.");
  if(a.some(x=>!Number.isFinite(x))) throw new Error("Only numbers, please (for example 5, 3, 8).");
  if(a.length > max) throw new Error(`At most ${max} numbers, so every step stays readable.`);
  if(a.some(x=>x<lo||x>hi)) throw new Error(`Use numbers from ${lo} to ${hi}.`);
  return a;
}
const rint = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const randArr = (n, lo, hi) => Array.from({length:n}, ()=>rint(lo,hi)).join(", ");
const ops = str => String(str).split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).map(x=>x.split(/\s+/));
function strHash(s){ let h = 0; for(let i=0;i<s.length;i++) h = (Math.imul(h,31) + s.charCodeAt(i)) >>> 0; return h; }   // Java's String.hashCode, unsigned
function fnv(s){ let h = 0x811c9dc5; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mix(h){ h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }   // murmur3 finalizer: spreads the bits
const ring = s => mix(fnv(s)) % 360;
function djb2(s){ let h = 5381; for(let i=0;i<s.length;i++) h = (Math.imul(h,33) + s.charCodeAt(i)) >>> 0; return h; }
const SCOL = ["var(--l0)","var(--l2)","var(--l4)","var(--l1)","var(--l3)","var(--l5)"];

/* bars for sorting: m = {index: class}, done = sorted indexes, range = [lo, hi) being worked on */
function bars(s){
  const a = s.a, max = Math.max(...a, 1), done = new Set(s.done||[]), r = s.range;
  return `<div class="av-bars" style="--n:${a.length}">${a.map((v,i)=>{ const cls = (s.m&&s.m[i]) || (done.has(i)?"done":""), dim = r && (i<r[0]||i>=r[1]);
    return `<div class="av-bar ${cls}${dim?" dim":""}"><span class="b" style="height:${Math.max(4,Math.round(100*v/max))}%"></span><span class="v">${v}</span>${s.ptr&&s.ptr[i]?`<span class="p">${esc(s.ptr[i])}</span>`:""}</div>`; }).join("")}</div>` +
    (s.aux ? `<p class="av-aux mono">${esc(s.aux)}</p>` : "");
}
/* a row of boxes with index above and pointer labels below */
function cells(arr, m, ptr, dimFn){
  return `<div class="av-cells">${arr.map((v,i)=>`<div class="av-cell ${(m&&m[i])||""}${dimFn&&dimFn(i)?" dim":""}"><span class="i">${i}</span><span class="v">${esc(v)}</span><span class="p">${ptr&&ptr[i]?esc(ptr[i]):""}</span></div>`).join("")}</div>`;
}
function ptrs(o){ const p = {}; Object.entries(o).forEach(([k,i])=>{ if(i!==null && i!==undefined && i>=0) p[i] = p[i] ? p[i]+","+k : k; }); return p; }
/* generic tree: nodes {id:{label, kids:[ids], cls, sub}}, roots [ids] */
function treeSVG(nodes, roots, o){
  o = o || {}; const UX = o.ux||46, UY = o.uy||58, R = o.r||16, GAP = o.gap===undefined?0.6:o.gap;
  let next = 0; const P = {};
  const lay = (id, d) => { const n = nodes[id], ks = (n.kids||[]).filter(k=>nodes[k]);
    if(!ks.length) P[id] = {x:next++, d}; else { ks.forEach(k=>lay(k, d+1)); P[id] = {x:(P[ks[0]].x+P[ks[ks.length-1]].x)/2, d}; } };
  roots.forEach(r=>{ lay(r, 0); next += GAP; });
  const ps = Object.values(P); if(!ps.length) return `<p class="empty">${esc(o.empty||"Empty.")}</p>`;
  const maxX = Math.max(...ps.map(p=>p.x)), maxD = Math.max(...ps.map(p=>p.d));
  const W = Math.max(120, (maxX+1)*UX + 16), H = (maxD+1)*UY + 10, X = x => 8 + UX/2 + x*UX, Y = d => R + 6 + d*UY;
  let e = "", n = "";
  Object.entries(P).forEach(([id,p])=>{ (nodes[id].kids||[]).forEach(k=>{ if(P[k]) e += `<line x1="${X(p.x)}" y1="${Y(p.d)}" x2="${X(P[k].x)}" y2="${Y(P[k].d)}" class="${nodes[k].ecls||""}"/>`; });
    const nd = nodes[id];
    n += `<g class="tn ${nd.cls||""}"><circle cx="${X(p.x)}" cy="${Y(p.d)}" r="${R}"/>${nd.end?`<circle cx="${X(p.x)}" cy="${Y(p.d)}" r="${R-4}" class="end"/>`:""}<text x="${X(p.x)}" y="${Y(p.d)+4}" text-anchor="middle">${esc(nd.label)}</text>${nd.sub!==undefined?`<text x="${X(p.x)}" y="${Y(p.d)+R+12}" text-anchor="middle" class="sub">${esc(nd.sub)}</text>`:""}</g>`; });
  return `<svg class="av-svg" viewBox="0 0 ${W} ${H+10}" style="max-width:${W}px" role="img" aria-label="${esc(o.label||"Tree")}">${e}${n}</svg>`;
}
const ARROW = `<defs><marker id="av-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
/* generic graph: nodes [{id,x,y,cls,sub}], edges [{a,b,w,cls}] */
function graphSVG(nodes, edges, o){
  o = o || {}; const R = o.r||19, W = o.w||500, H = o.h||270, P = {}; nodes.forEach(n=>P[n.id]=n);
  let e = "", n = "";
  edges.forEach(ed=>{ const a = P[ed.a], b = P[ed.b]; if(!a||!b) return; const dx = b.x-a.x, dy = b.y-a.y, L = Math.hypot(dx,dy)||1, ux = dx/L, uy = dy/L;
    const bw = o.box ? Math.min(Math.abs(ux)>1e-6 ? (o.box/2)/Math.abs(ux) : 1e9, Math.abs(uy)>1e-6 ? 14/Math.abs(uy) : 1e9) : R;
    const x1 = a.x+ux*bw, y1 = a.y+uy*bw, x2 = b.x-ux*(bw+(o.directed?3:0)), y2 = b.y-uy*(bw+(o.directed?3:0));
    e += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${ed.cls||""}"${o.directed?' marker-end="url(#av-arr)"':""}/>`;
    if(ed.w!==undefined){ const mx = (a.x+b.x)/2 - uy*10, my = (a.y+b.y)/2 + ux*10; e += `<text x="${mx}" y="${my+4}" text-anchor="middle" class="w ${ed.cls||""}">${ed.w}</text>`; } });
  nodes.forEach(nd=>{ n += o.box ? `<g class="gn ${nd.cls||""}"><rect x="${nd.x-o.box/2}" y="${nd.y-14}" width="${o.box}" height="28" rx="7"/><text x="${nd.x}" y="${nd.y+4}" text-anchor="middle">${esc(nd.id)}</text>${nd.sub!==undefined?`<text x="${nd.x}" y="${nd.y-19}" text-anchor="middle" class="sub">${esc(nd.sub)}</text>`:""}</g>`
    : `<g class="gn ${nd.cls||""}"><circle cx="${nd.x}" cy="${nd.y}" r="${R}"/><text x="${nd.x}" y="${nd.y+4}" text-anchor="middle">${esc(nd.id)}</text>${nd.sub!==undefined?`<text x="${nd.x}" y="${nd.y-R-6}" text-anchor="middle" class="sub">${esc(nd.sub)}</text>`:""}</g>`; });
  return `<svg class="av-svg" viewBox="0 0 ${W} ${H}" style="max-width:${W}px" role="img" aria-label="${esc(o.label||"Graph")}">${o.directed?ARROW:""}${e}${n}</svg>`;
}
function table(rows, o){
  return `<table class="av-table${o&&o.cls?" "+o.cls:""}">${rows.map((r,i)=>`<tr>${r.map((c,j)=>{ const t = (i===0&&o&&o.head) || (j===0&&o&&o.side) ? "th" : "td"; const v = c && typeof c==="object" ? c : {v:c};
    return `<${t}${v.cls?` class="${v.cls}"`:""}>${esc(v.v===undefined?"":v.v)}</${t}>`; }).join("")}</tr>`).join("")}</table>`;
}

/* ---------------- visualizers ---------------- */
const V = [];
const def = o => V.push(o);
const SORT_IN = [{k:"a", label:"Numbers (up to 24, from 1 to 99)", def:"38, 27, 43, 3, 9, 82, 10, 55, 17, 64"}];
const sortRandom = () => ({a: randArr(rint(9,13), 2, 99)});
const parseSort = v => nums(v.a, 1, 99, 24);

def({ id:"bubble", group:"Sorting", title:"Bubble sort", concepts:["sorting","bigo"],
  text:"Walk through the array and swap every pair of neighbours that is in the wrong order. After each pass the largest remaining value has moved to the end, like a bubble rising. It needs O(n²) comparisons, but it can stop early when a pass makes no swaps, so an already sorted array takes only one pass.",
  inputs:SORT_IN, random:sortRandom, counters:["cmp","swp"],
  code:["for i from 0 to n-2:","  for j from 0 to n-2-i:","    if a[j] > a[j+1]:","      swap a[j], a[j+1]","  a[n-1-i] is now in its final place","  if no swaps in this pass: stop"],
  run(v, R){ const a = parseSort(v), n = a.length, done = [];
    R.step(0, `Start with ${n} values. Each pass moves the largest remaining value to the end.`, {a, done});
    for(let i=0;i<n-1;i++){ let sw = false;
      for(let j=0;j<n-1-i;j++){ R.inc("cmp"); R.step(2, `Compare a[${j}] = ${a[j]} with a[${j+1}] = ${a[j+1]}.`, {a, done, m:{[j]:"cmp",[j+1]:"cmp"}});
        if(a[j] > a[j+1]){ [a[j],a[j+1]] = [a[j+1],a[j]]; sw = true; R.inc("swp"); R.step(3, `${a[j+1]} is bigger than ${a[j]}, so swap them.`, {a, done, m:{[j]:"swp",[j+1]:"swp"}}); } }
      done.push(n-1-i); R.step(4, `Pass ${i+1} is done: ${a[n-1-i]} is in its final place.`, {a, done});
      if(!sw){ for(let k=0;k<n-1-i;k++) done.push(k); R.step(5, "This pass made no swaps, so everything is in order. Stop early.", {a, done}); break; } }
    if(done.length < n){ done.push(0); }
    R.step(4, `Sorted with ${R.c.cmp||0} comparisons and ${R.c.swp||0} swaps.`, {a, done:a.map((x,i)=>i)}); },
  draw:bars });

def({ id:"insertion", group:"Sorting", title:"Insertion sort", concepts:["sorting","bigo"],
  text:"Grow a sorted part on the left. Take the next value and move it left, past every bigger value, until it sits in its place, the way you sort playing cards in your hand. It is O(n²) in the worst case but O(n) on nearly sorted data, which is why real sorts (Timsort, introsort) use it for short runs.",
  inputs:SORT_IN, random:sortRandom, counters:["cmp","swp"],
  code:["for i from 1 to n-1:","  j = i","  while j > 0 and a[j-1] > a[j]:","    swap a[j-1], a[j]; j = j-1","  a[0..i] is now sorted"],
  run(v, R){ const a = parseSort(v), n = a.length;
    R.step(0, "The first value alone is a sorted part of length 1.", {a, done:[0], range:[0,1]});
    for(let i=1;i<n;i++){ let j = i;
      R.step(1, `Take a[${i}] = ${a[i]} and insert it into the sorted part a[0..${i-1}].`, {a, range:[0,i+1], m:{[i]:"sel"}});
      while(j>0){ R.inc("cmp"); R.step(2, `Is a[${j-1}] = ${a[j-1]} bigger than ${a[j]}?`, {a, range:[0,i+1], m:{[j-1]:"cmp",[j]:"sel"}});
        if(a[j-1] <= a[j]){ R.step(2, `No: ${a[j]} is in place.`, {a, range:[0,i+1], m:{[j]:"sel"}}); break; }
        [a[j-1],a[j]] = [a[j],a[j-1]]; R.inc("swp"); j--; R.step(3, `Yes: move ${a[j]} one place left.`, {a, range:[0,i+1], m:{[j]:"swp",[j+1]:"swp"}}); }
      R.step(4, `a[0..${i}] is sorted.`, {a, range:[0,i+1], done:Array.from({length:i+1},(x,k)=>k)}); }
    R.step(4, `Sorted with ${R.c.cmp||0} comparisons and ${R.c.swp||0} moves.`, {a, done:a.map((x,i)=>i)}); },
  draw:bars });

def({ id:"merge", group:"Sorting", title:"Merge sort", concepts:["sorting","greedydc","bigo"],
  text:"Divide and conquer: split the array in half, sort each half, then merge the two sorted halves by repeatedly taking the smaller head. There are log₂ n levels of splitting and each level does O(n) work, so it is always O(n log n). Merging sorted runs is also how databases sort data bigger than memory (external merge sort).",
  inputs:SORT_IN, random:sortRandom, counters:["cmp","wr"],
  code:["mergeSort(a, lo, hi):","  if hi - lo <= 1: return","  mid = (lo + hi) / 2","  mergeSort(a, lo, mid); mergeSort(a, mid, hi)","  merge: compare the heads of left and right","    write the smaller head into a[k]","  copy whatever is left over"],
  run(v, R){ const a = parseSort(v);
    const ms = (lo, hi) => {
      if(hi-lo <= 1){ R.step(1, `a[${lo}] alone is already sorted.`, {a, range:[lo,hi]}); return; }
      const mid = (lo+hi) >> 1;
      R.step(2, `Split a[${lo}..${hi-1}] into a[${lo}..${mid-1}] and a[${mid}..${hi-1}].`, {a, range:[lo,hi]});
      ms(lo, mid); ms(mid, hi);
      const L = a.slice(lo, mid), Rr = a.slice(mid, hi); let i = 0, j = 0, k = lo;
      const aux = () => `left: [${L.slice(i).join(", ")}]   right: [${Rr.slice(j).join(", ")}]`;
      R.step(3, `Merge the sorted halves [${L.join(", ")}] and [${Rr.join(", ")}].`, {a, range:[lo,hi], aux:aux()});
      while(i<L.length && j<Rr.length){ R.inc("cmp"); R.step(4, `Compare the heads: ${L[i]} and ${Rr[j]}.`, {a, range:[lo,hi], aux:aux()});
        a[k] = L[i] <= Rr[j] ? L[i++] : Rr[j++]; R.inc("wr"); R.step(5, `${a[k]} is smaller (or equal), so write it into a[${k}].`, {a, range:[lo,hi], m:{[k]:"swp"}, aux:aux()}); k++; }
      while(i<L.length){ a[k] = L[i++]; R.inc("wr"); R.step(6, `Copy the leftover ${a[k]} into a[${k}].`, {a, range:[lo,hi], m:{[k]:"swp"}, aux:aux()}); k++; }
      while(j<Rr.length){ a[k] = Rr[j++]; R.inc("wr"); R.step(6, `Copy the leftover ${a[k]} into a[${k}].`, {a, range:[lo,hi], m:{[k]:"swp"}, aux:aux()}); k++; }
    };
    R.step(0, `Sort ${a.length} values by splitting until each part has one value, then merging back up.`, {a});
    ms(0, a.length);
    R.step(0, `Sorted with ${R.c.cmp||0} comparisons and ${R.c.wr||0} writes.`, {a, done:a.map((x,i)=>i)}); },
  draw:bars });

def({ id:"quick", group:"Sorting", title:"Quicksort (Lomuto partition)", concepts:["sorting","greedydc","bigo"],
  text:"Pick the last value as the pivot. Walk through the range and move every value smaller than the pivot to the left side (pointer i marks where the next small value goes). Then put the pivot right after the small values: it is now in its final place. Sort the two sides the same way. Average O(n log n), but O(n²) if the pivot is always the smallest or largest, for example on sorted input.",
  inputs:SORT_IN, random:sortRandom, counters:["cmp","swp"],
  code:["quickSort(a, lo, hi):","  if lo >= hi: return","  pivot = a[hi]; i = lo","  for j from lo to hi-1:","    if a[j] < pivot:","      swap a[i], a[j]; i = i+1","  swap a[i], a[hi]   (pivot is now in place)","  quickSort(a, lo, i-1); quickSort(a, i+1, hi)"],
  run(v, R){ const a = parseSort(v), done = [];
    const qs = (lo, hi) => {
      if(lo >= hi){ if(lo===hi){ done.push(lo); R.step(1, `a[${lo}] = ${a[lo]} is a range of one value: it is in place.`, {a, done, range:[lo,hi+1]}); } return; }
      const p = a[hi]; let i = lo;
      R.step(2, `Partition a[${lo}..${hi}] around the pivot ${p}.`, {a, done, range:[lo,hi+1], m:{[hi]:"piv"}, ptr:ptrs({i})});
      for(let j=lo;j<hi;j++){ R.inc("cmp"); R.step(4, `Is a[${j}] = ${a[j]} smaller than the pivot ${p}?`, {a, done, range:[lo,hi+1], m:{[hi]:"piv",[j]:"cmp"}, ptr:ptrs({i,j})});
        if(a[j] < p){ [a[i],a[j]] = [a[j],a[i]]; R.inc("swp"); R.step(5, `Yes: swap it into position i = ${i}, then move i right.`, {a, done, range:[lo,hi+1], m:{[hi]:"piv",[i]:"swp",[j]:"swp"}, ptr:ptrs({i:i+1,j})}); i++; } }
      [a[i],a[hi]] = [a[hi],a[i]]; R.inc("swp"); done.push(i);
      R.step(6, `Swap the pivot ${p} into a[${i}]. Everything left of it is smaller, everything right is not.`, {a, done, range:[lo,hi+1], m:{[i]:"piv"}});
      R.step(7, `Now sort the left part a[${lo}..${i-1}] and the right part a[${i+1}..${hi}].`, {a, done, range:[lo,hi+1]});
      qs(lo, i-1); qs(i+1, hi);
    };
    R.step(0, `Sort ${a.length} values.`, {a, done});
    qs(0, a.length-1);
    R.step(0, `Sorted with ${R.c.cmp||0} comparisons and ${R.c.swp||0} swaps.`, {a, done:a.map((x,i)=>i)}); },
  draw:bars });

def({ id:"heap", group:"Sorting", title:"Heap sort", concepts:["sorting","trees","bigo"],
  text:"First arrange the array as a max-heap: every parent at i is at least as big as its children at 2i+1 and 2i+2, so the largest value is at a[0]. Then swap a[0] with the last value of the heap, shrink the heap by one, and sift the new top down to repair the heap. O(n log n) always, in place, but not stable.",
  inputs:SORT_IN, random:sortRandom, counters:["cmp","swp"],
  code:["build a max-heap: for i from n/2-1 down to 0: siftDown(i, n)","for end from n-1 down to 1:","  swap a[0], a[end]   (largest goes to the end)","  siftDown(0, end)","siftDown(i, size): c = the larger child of i","  if a[c] > a[i]: swap a[i], a[c]; i = c; repeat"],
  run(v, R){ const a = parseSort(v), n = a.length, done = [];
    const sift = (i, size, line0) => { for(;;){ const l = 2*i+1, r = l+1; if(l >= size) return; let c = l;
        if(r < size){ R.inc("cmp"); if(a[r] > a[l]) c = r; }
        R.inc("cmp"); R.step(4, `Children of a[${i}] = ${a[i]}: the larger is a[${c}] = ${a[c]}.`, {a, done, range:[0,size], m:{[i]:"sel",[c]:"cmp"}});
        if(a[c] <= a[i]){ R.step(5, `${a[i]} is not smaller than its children: the heap is fine here.`, {a, done, range:[0,size], m:{[i]:"sel"}}); return; }
        [a[i],a[c]] = [a[c],a[i]]; R.inc("swp"); R.step(5, `Swap ${a[c]} down and ${a[i]} up.`, {a, done, range:[0,size], m:{[i]:"swp",[c]:"swp"}}); i = c; } };
    R.step(0, "Turn the array into a max-heap, starting from the last parent.", {a, done});
    for(let i=(n>>1)-1;i>=0;i--){ R.step(0, `Sift down from a[${i}].`, {a, done, m:{[i]:"sel"}}); sift(i, n); }
    R.step(1, `The array is a max-heap: the largest value ${a[0]} is at the top.`, {a, done, m:{0:"piv"}});
    for(let end=n-1;end>=1;end--){ [a[0],a[end]] = [a[end],a[0]]; R.inc("swp"); done.push(end);
      R.step(2, `Swap the top ${a[end]} to a[${end}]; it is now in its final place.`, {a, done, range:[0,end], m:{0:"swp",[end]:"swp"}});
      R.step(3, `Repair the heap a[0..${end-1}] by sifting ${a[0]} down.`, {a, done, range:[0,end], m:{0:"sel"}}); sift(0, end); }
    R.step(1, `Sorted with ${R.c.cmp||0} comparisons and ${R.c.swp||0} swaps.`, {a, done:a.map((x,i)=>i)}); },
  draw:bars });

def({ id:"binsearch", group:"Searching", title:"Binary search", concepts:["bigo","greedydc","indexing"],
  text:"In a sorted array, look at the middle value. If it is too small, the target can only be on the right; if too big, only on the left. Each step halves the range, so 1 million values need at most 20 steps (log₂ n). The same idea finds keys in B-tree pages and in sorted files on disk.",
  inputs:[{k:"a", label:"Numbers (sorted for you)", def:"3, 8, 12, 17, 21, 26, 30, 34, 41, 47, 53, 58, 66, 71"},{k:"t", label:"Target", def:"53", w:6}],
  random:()=>{ const a = [...new Set(Array.from({length:14},()=>rint(1,99)))].sort((x,y)=>x-y); return {a:a.join(", "), t:String(Math.random()<.75?a[rint(0,a.length-1)]:rint(1,99))}; }, counters:["cmp"],
  code:["lo = 0; hi = n-1","while lo <= hi:","  mid = (lo + hi) / 2, rounded down","  if a[mid] == target: found at mid","  if a[mid] < target: lo = mid + 1","  else: hi = mid - 1","not found"],
  run(v, R){ const a = nums(v.a, -999, 999, 24).sort((x,y)=>x-y), t = nums(v.t, -999, 999, 1)[0]; let lo = 0, hi = a.length-1;
    const S = (o) => Object.assign({a, lo, hi}, o);
    R.step(0, `Search for ${t} in ${a.length} sorted values.`, S({}));
    while(lo <= hi){ const mid = (lo+hi) >> 1; R.inc("cmp");
      R.step(2, `The range is a[${lo}..${hi}]; the middle is a[${mid}] = ${a[mid]}.`, S({mid}));
      if(a[mid] === t){ R.step(3, `a[${mid}] = ${t}: found after ${R.c.cmp} comparisons.`, S({mid, found:mid})); return; }
      if(a[mid] < t){ lo = mid+1; R.step(4, `${a[mid]} < ${t}, so the target can only be to the right. lo = ${lo}.`, S({mid})); }
      else { hi = mid-1; R.step(5, `${a[mid]} > ${t}, so the target can only be to the left. hi = ${hi}.`, S({mid})); } }
    R.step(6, `lo passed hi: ${t} is not in the array (${R.c.cmp||0} comparisons).`, S({lo, hi})); },
  draw(s){ return cells(s.a, {[s.mid]:s.found!==undefined?"done":"cmp"}, ptrs({lo:s.lo, mid:s.mid, hi:s.hi}), i=>i<s.lo||i>s.hi); } });

def({ id:"twoptr", group:"Arrays & strings", title:"Two pointers: pair with a target sum", concepts:["bigo","sorting"],
  text:"In a sorted array, find two values that add up to the target. Start one pointer at each end. If the sum is too small, only moving the left pointer right can make it bigger; if too big, move the right pointer left. Each step rules out one value for good, so it is O(n) instead of checking all O(n²) pairs.",
  inputs:[{k:"a", label:"Numbers (sorted for you)", def:"1, 3, 4, 6, 8, 11, 14, 15, 19"},{k:"t", label:"Target sum", def:"25", w:6}],
  random:()=>{ const a = [...new Set(Array.from({length:10},()=>rint(1,40)))].sort((x,y)=>x-y); return {a:a.join(", "), t:String(a[rint(0,3)]+a[rint(5,a.length-1)])}; }, counters:["cmp","steps"],
  code:["i = 0; j = n-1","while i < j:","  s = a[i] + a[j]","  if s == target: found (i, j)","  if s < target: i = i+1   (need a bigger sum)","  else: j = j-1   (need a smaller sum)","no pair"],
  run(v, R){ const a = nums(v.a, -999, 999, 24).sort((x,y)=>x-y), t = nums(v.t, -9999, 9999, 1)[0]; let i = 0, j = a.length-1;
    R.step(0, `Find two values that add up to ${t}.`, {a, i, j});
    while(i < j){ const s = a[i]+a[j]; R.inc("cmp");
      R.step(2, `a[${i}] + a[${j}] = ${a[i]} + ${a[j]} = ${s}.`, {a, i, j});
      if(s === t){ R.step(3, `${s} is the target: the pair is (${a[i]}, ${a[j]}).`, {a, i, j, found:true}); return; }
      if(s < t){ i++; R.inc("steps"); R.step(4, `${s} < ${t}: move i right to get a bigger sum.`, {a, i, j}); }
      else { j--; R.inc("steps"); R.step(5, `${s} > ${t}: move j left to get a smaller sum.`, {a, i, j}); } }
    R.step(6, `The pointers met: no pair adds up to ${t}.`, {a, i, j}); },
  draw(s){ return cells(s.a, {[s.i]:s.found?"done":"cmp", [s.j]:s.found?"done":"cmp"}, ptrs({i:s.i, j:s.j}), k=>k<s.i||k>s.j); } });

def({ id:"window", group:"Arrays & strings", title:"Sliding window: longest substring without repeats", concepts:["hashtables","bigo"],
  text:"Keep a window [left, right] with no repeated character, and a map from each character to the last place it was seen. Move right one step at a time; if the new character is already inside the window, jump left to just after its last position. Each pointer only moves forward, so the whole scan is O(n).",
  inputs:[{k:"s", label:"Text (up to 24 characters)", def:"abcabcbbxyzab"}],
  random:()=>({s:Array.from({length:rint(10,16)},()=>"abcdefg"[rint(0,6)]).join("")}), counters:["cmp"],
  code:["left = 0; last = {}; best = 0","for right from 0 to n-1:","  c = s[right]","  if c is in last and last[c] >= left:","    left = last[c] + 1   (jump past the repeat)","  last[c] = right","  best = max(best, right - left + 1)"],
  run(v, R){ const s = String(v.s||"").replace(/\s/g,""); if(!s) throw new Error("Type some text."); if(s.length>24) throw new Error("At most 24 characters.");
    let left = 0, best = 0, bl = 0, br = -1; const last = {};
    const S = (o) => Object.assign({s, left, best:[bl,br], last:Object.assign({}, last)}, o);
    R.step(0, "Start with an empty window.", S({right:-1}));
    for(let right=0; right<s.length; right++){ const c = s[right]; R.inc("cmp");
      R.step(2, `Add s[${right}] = '${c}' to the window.`, S({right}));
      if(c in last && last[c] >= left){ const old = left; left = last[c]+1; R.step(4, `'${c}' was already at ${last[c]}, inside the window. Move left from ${old} to ${left}.`, S({right, rep:last[c]})); }
      last[c] = right;
      if(right-left+1 > best){ best = right-left+1; bl = left; br = right; R.step(6, `The window "${s.slice(left,right+1)}" has length ${best}: a new best.`, S({right})); }
      else R.step(5, `The window is "${s.slice(left,right+1)}" (length ${right-left+1}); the best is still ${best}.`, S({right})); }
    R.step(6, `Done: the longest substring without repeats is "${s.slice(bl,br+1)}", length ${best}.`, S({right:s.length-1, end:true})); },
  draw(s){ const m = {}; for(let i=s.left;i<=s.right;i++) m[i] = "win"; if(s.rep!==undefined) m[s.rep] = "swp"; if(s.right>=0 && !s.end) m[s.right] = "cmp";
    if(s.end) for(let i=s.best[0];i<=s.best[1];i++) m[i] = "done";
    return cells(s.s.split(""), m, ptrs({L:s.left, R:s.right})) + `<p class="av-aux mono">best: ${s.best[1]>=s.best[0]?`"${esc(s.s.slice(s.best[0],s.best[1]+1))}" (${s.best[1]-s.best[0]+1})`:"none yet"}   last seen: ${esc(Object.entries(s.last).map(([k,i])=>k+"→"+i).join("  ")||"{}")}</p>`; } });

/* ---- grid search (BFS / DFS) ---- */
const GR = 9, GC = 13, GS = 4*GC+1, GG = 4*GC+11;
const GRIDS = {
  "Open field": Array(GR).fill(".".repeat(GC)).join(""),
  "Wall with a gap": [".............","......#......","......#......","......#......","......#......","......#......","......#......","......#......","......#......"].join(""),
  "Maze": ["....#........",".##.#.#####.#",".#..#.....#..",".#.####.#.##.","...#....#....","##.#.####.##.","...#.#......#",".###.#.####.#",".....#......."].join("")
};
function gridRandom(){ return {g:Array.from({length:GR*GC},(x,i)=>i===GS||i===GG?".":Math.random()<.28?"#":".").join("")}; }
function gridRun(v, R, dfs){
  const g = v.g, st = g.split(""), seen = new Set(), parent = {};
  const nb = i => { const r = Math.floor(i/GC), c = i%GC, out = []; [[-1,0],[0,1],[1,0],[0,-1]].forEach(([dr,dc])=>{ const rr=r+dr, cc=c+dc; if(rr>=0&&rr<GR&&cc>=0&&cc<GC&&g[rr*GC+cc]!=="#") out.push(rr*GC+cc); }); return out; };
  const S = (cur, front) => ({st:st.join(""), cur, front:front.slice(-40)});
  const path = (end) => { let x = end, n = 0; while(x!==undefined && x!==GS){ st[x] = "p"; x = parent[x]; n++; } return n; };
  if(!dfs){
    const q = [GS]; seen.add(GS); st[GS] = "f";
    R.step(0, "Put the start S in the queue and mark it as seen.", S(GS, q));
    while(q.length){ const cur = q.shift(); st[cur] = "v"; R.inc("vis");
      R.step(2, `Take the oldest cell from the queue (row ${Math.floor(cur/GC)}, column ${cur%GC}).`, S(cur, q));
      if(cur === GG){ const n = path(cur); R.step(3, `Reached the goal G. BFS finds a shortest path: ${n} steps. Visited ${R.c.vis} cells.`, S(cur, q)); return; }
      const add = nb(cur).filter(x=>!seen.has(x)); add.forEach(x=>{ seen.add(x); parent[x] = cur; st[x] = "f"; q.push(x); });
      if(add.length) R.step(6, `Add ${add.length} new neighbour${add.length===1?"":"s"} to the back of the queue. The frontier grows like a ripple.`, S(cur, q)); }
    R.step(7, "The queue is empty: the goal cannot be reached.", S(-1, q)); return;
  }
  const stack = [[GS, undefined]]; st[GS] = "f";
  R.step(0, "Push the start S on the stack.", S(GS, stack.map(x=>x[0])));
  while(stack.length){ const [cur, par] = stack.pop();
    if(seen.has(cur)){ R.step(3, `This cell was already visited; skip it.`, S(cur, stack.map(x=>x[0]))); continue; }
    seen.add(cur); if(par!==undefined) parent[cur] = par; st[cur] = "v"; R.inc("vis");
    R.step(2, `Pop the newest cell (row ${Math.floor(cur/GC)}, column ${cur%GC}) and visit it.`, S(cur, stack.map(x=>x[0])));
    if(cur === GG){ const n = path(cur); R.step(4, `Reached the goal G after visiting ${R.c.vis} cells. DFS found a path of ${n} steps, not necessarily the shortest.`, S(cur, [])); return; }
    const add = nb(cur).filter(x=>!seen.has(x)).reverse(); add.forEach(x=>{ stack.push([x, cur]); if(st[x]!=="v") st[x] = "f"; });
    if(add.length) R.step(6, `Push ${add.length} unvisited neighbour${add.length===1?"":"s"}. DFS keeps going deeper from the newest one.`, S(cur, stack.map(x=>x[0]))); }
  R.step(7, "The stack is empty: the goal cannot be reached.", S(-1, []));
}
function gridDraw(s){
  const fr = new Set(s.front);
  return `<div class="av-grid" style="--gc:${GC}">${s.st.split("").map((c,i)=>`<button type="button" class="gc ${c==="#"?"wall":c==="v"?"vis":c==="p"?"path":c==="f"&&fr.has(i)?"front":c==="f"?"vis":""}${i===s.cur?" cur":""}" data-acell="${i}" aria-label="row ${Math.floor(i/GC)} column ${i%GC}${c==="#"?" wall":""}">${i===GS?"S":i===GG?"G":""}</button>`).join("")}</div><p class="av-aux">Click a cell to add or remove a wall; the search runs again.</p>`;
}
const gridDef = { group:"Graphs", inputs:[], presets:Object.entries(GRIDS).map(([name,g])=>({name, v:{g}})), init:{g:GRIDS["Wall with a gap"]}, random:gridRandom, counters:["vis"], draw:gridDraw,
  click(v, i){ if(i===GS||i===GG) return null; const g = v.g.split(""); g[i] = g[i]==="#"?".":"#"; return {g:g.join("")}; } };
def(Object.assign({ id:"bfs", title:"Breadth-first search on a grid", concepts:["graphsalgo","queuesbuf","graphtheory"],
  text:"BFS explores in rings: all cells 1 step away, then all cells 2 steps away, and so on, using a first-in first-out queue. Because it reaches every cell by the fewest steps first, the first time it reaches the goal it has a shortest path (when all steps cost the same). Cost: O(V + E).",
  code:["queue = [start]; seen = {start}","while the queue is not empty:","  cell = queue.pop_front()","  if cell == goal: follow parents back to S","  for each neighbour n (up, right, down, left):","    if n is open and not seen:","      seen.add(n); parent[n] = cell; queue.push_back(n)","no path"],
  run(v, R){ gridRun(v, R, false); } }, gridDef));
def(Object.assign({ id:"dfs", title:"Depth-first search on a grid", concepts:["graphsalgo","graphtheory"],
  text:"DFS follows one direction as far as it can and backs up only at dead ends, using a last-in first-out stack (or recursion). It uses little memory on wide graphs and is the base of cycle detection, topological sort and finding connected parts, but the path it finds is usually not the shortest.",
  code:["stack = [start]","while the stack is not empty:","  cell = stack.pop()","  if cell was seen: skip it","  if cell == goal: follow parents back to S","  for each neighbour n:","    if n is open and not seen: stack.push(n)","no path"],
  run(v, R){ gridRun(v, R, true); } }, gridDef));

/* ---- weighted graphs ---- */
const DPOS = {A:[60,70], B:[200,40], C:[150,170], D:[330,110], E:[300,235], F:[450,185]};
function parseEdges(str, directed){
  const E = []; String(str).split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).forEach(t=>{
    const m = directed ? t.match(/^([\w]+)\s*>\s*([\w]+)$/) : t.match(/^([\w]+)\s*-\s*([\w]+)\s+(\d+)$/);
    if(!m) throw new Error(directed ? `Write edges like "a > b". Could not read "${t}".` : `Write edges like "A-B 4". Could not read "${t}".`);
    E.push(directed ? {a:m[1], b:m[2]} : {a:m[1], b:m[2], w:+m[3]}); });
  if(!E.length) throw new Error("Add some edges."); if(E.length > 24) throw new Error("At most 24 edges.");
  const ids = [...new Set(E.flatMap(e=>[e.a,e.b]))]; if(ids.length > 12) throw new Error("At most 12 nodes.");
  return {E, ids};
}
function circlePos(ids, cx, cy, r){ const P = {}; ids.forEach((id,i)=>{ const t = -Math.PI/2 + 2*Math.PI*i/ids.length; P[id] = [Math.round(cx+r*Math.cos(t)), Math.round(cy+r*Math.sin(t))]; }); return P; }
def({ id:"dijkstra", group:"Graphs", title:"Dijkstra's shortest paths", concepts:["graphsalgo","trees","greedydc"],
  text:"Find the cheapest path from a source to every node when edges have non-negative weights. Always take the unfinished node with the smallest known distance from a priority queue (it is final: nothing cheaper can still reach it), then try to improve its neighbours through it. With a binary heap it costs O((V + E) log V). Routing protocols like OSPF run it.",
  inputs:[{k:"e", label:"Edges (A-B weight)", def:"A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2"},{k:"src", label:"Source", def:"A", w:5}],
  random:()=>({e:"A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2".replace(/\d+/g,()=>rint(1,9)), src:"A"}), counters:["cmp","relax"],
  code:["dist[all] = ∞; dist[source] = 0; pq = {(0, source)}","while pq is not empty:","  (d, u) = pq.pop_min()","  if u is done: skip it; else mark u done","  for each edge (u, v, w):","    if dist[u] + w < dist[v]:","      dist[v] = dist[u] + w; prev[v] = u; pq.push((dist[v], v))","every dist is now final"],
  run(v, R){ const {E, ids} = parseEdges(v.e, false), src = String(v.src||"").trim(); if(!ids.includes(src)) throw new Error(`The source "${src}" is not a node.`);
    const dist = {}, prev = {}, done = [], adj = {}; ids.forEach(i=>{ dist[i] = null; adj[i] = []; }); E.forEach((e,k)=>{ adj[e.a].push([e.b,e.w,k]); adj[e.b].push([e.a,e.w,k]); });
    dist[src] = 0; let pq = [[0, src]];
    const S = (o) => Object.assign({E, ids, dist, prev, done, pq:pq.slice().sort((x,y)=>x[0]-y[0])}, o);
    R.step(0, `Every distance starts at ∞ except the source ${src}, which is 0.`, S({}));
    while(pq.length){ pq.sort((x,y)=>x[0]-y[0]); const [d, u] = pq.shift(); R.inc("cmp");
      if(done.includes(u)){ R.step(3, `${u} came out again with an old distance ${d}; it is already done, so skip it.`, S({u})); continue; }
      done.push(u); R.step(3, `Take ${u}, the closest unfinished node (distance ${d}). Its distance is now final.`, S({u}));
      for(const [w2, wt, k] of adj[u]){ if(done.includes(w2)) continue; const nd = d + wt;
        if(dist[w2]===null || nd < dist[w2]){ const old = dist[w2]; dist[w2] = nd; prev[w2] = u; pq.push([nd, w2]); R.inc("relax");
          R.step(6, `Through ${u}, ${w2} costs ${d} + ${wt} = ${nd}, better than ${old===null?"∞":old}. Update it.`, S({u, ek:k, v2:w2})); }
        else R.step(5, `Through ${u}, ${w2} would cost ${nd}, not better than ${dist[w2]}. Keep it.`, S({u, ek:k, v2:w2, no:true})); } }
    R.step(7, `All shortest distances from ${src} are final. Bold edges form the shortest-path tree.`, S({end:true})); },
  draw(s){ const pos = s.ids.every(i=>DPOS[i]) ? DPOS : circlePos(s.ids, 250, 135, 105);
    const tree = new Set(s.ids.filter(i=>s.prev[i]).map(i=>[i, s.prev[i]].sort().join("|")));
    const nodes = s.ids.map(i=>({id:i, x:pos[i][0], y:pos[i][1], cls:(i===s.u?"cur ":"")+(i===s.v2?"cmp ":"")+(s.done.includes(i)?"done":""), sub:s.dist[i]===null?"∞":s.dist[i]}));
    const edges = s.E.map((e,k)=>({a:e.a, b:e.b, w:e.w, cls:(k===s.ek?(s.no?"try":"hot"):"")+(tree.has([e.a,e.b].sort().join("|"))?" tree":"")}));
    return graphSVG(nodes, edges, {label:"Weighted graph"}) + table([["node",...s.ids],["dist",...s.ids.map(i=>s.dist[i]===null?"∞":s.dist[i])],["prev",...s.ids.map(i=>s.prev[i]||"–")],["done",...s.ids.map(i=>s.done.includes(i)?"✓":"")]], {side:true}) +
      `<p class="av-aux mono">priority queue: ${esc(s.pq.map(x=>`(${x[0]}, ${x[1]})`).join(" ")||"empty")}</p>`; } });

def({ id:"topo", group:"Graphs", title:"Topological sort (Kahn's algorithm)", concepts:["graphsalgo","dagsched","graphtheory"],
  text:"Order the tasks of a dependency graph so every task comes after the tasks it needs. Count the incoming edges of each node; nodes with none are ready. Repeatedly take a ready node, output it, and remove its outgoing edges, which may make other nodes ready. If some nodes never become ready, the graph has a cycle. Build tools, schedulers like Airflow and Spark's DAG scheduler do this.",
  inputs:[{k:"e", label:"Edges (a > b means a must come before b)", def:"config > compile, fetch > compile, compile > test, compile > package, lint > test, test > deploy, package > deploy"}],
  presets:[{name:"Build pipeline", v:{e:"config > compile, fetch > compile, compile > test, compile > package, lint > test, test > deploy, package > deploy"}},{name:"Getting dressed", v:{e:"socks > shoes, pants > shoes, pants > belt, shirt > belt, shirt > tie, tie > jacket, belt > jacket"}},{name:"With a cycle", v:{e:"a > b, b > c, c > a, c > d, x > a"}}],
  counters:["vis"],
  code:["indeg[v] = number of edges into v","queue = every v with indeg 0","while the queue is not empty:","  u = queue.pop_front(); output u","  for each edge u → v:","    indeg[v] = indeg[v] - 1","    if indeg[v] == 0: queue.push_back(v)","if fewer than n nodes were output: there is a cycle"],
  run(v, R){ const {E, ids} = parseEdges(v.e, true), indeg = {}, out = [], adj = {}; ids.forEach(i=>{ indeg[i] = 0; adj[i] = []; }); E.forEach((e,k)=>{ indeg[e.b]++; adj[e.a].push([e.b,k]); });
    const q = ids.filter(i=>indeg[i]===0); const S = o => Object.assign({E, ids, indeg:Object.assign({},indeg), q:q.slice(), out:out.slice(), gone:[]}, o);
    const gone = [];
    R.step(0, "Count the incoming edges of every node (the small numbers).", S({}));
    R.step(1, `Nodes with no incoming edges are ready: ${q.join(", ")||"none"}.`, S({gone}));
    while(q.length){ const u = q.shift(); out.push(u); R.inc("vis"); R.step(3, `Take ${u} from the queue and add it to the order.`, S({u, gone}));
      for(const [w2,k] of adj[u]){ indeg[w2]--; gone.push(k); R.step(5, `Remove the edge ${u} → ${w2}; ${w2} now waits for ${indeg[w2]} more.`, S({u, ek:k, gone}));
        if(indeg[w2]===0){ q.push(w2); R.step(6, `${w2} has nothing left to wait for: it is ready.`, S({u, v2:w2, gone})); } } }
    if(out.length < ids.length) R.step(7, `Only ${out.length} of ${ids.length} nodes came out. The rest (${ids.filter(i=>!out.includes(i)).join(", ")}) are stuck: they are in a cycle or wait on one, so no order exists.`, S({gone, cyc:true}));
    else R.step(7, `Done: a valid order is ${out.join(" → ")}.`, S({gone, end:true})); },
  draw(s){ const lv = {}; s.ids.forEach(i=>lv[i]=0);
    for(let r=0;r<s.ids.length;r++) s.E.forEach(e=>{ if(lv[e.b] < lv[e.a]+1 && lv[e.a]+1 < s.ids.length) lv[e.b] = lv[e.a]+1; });
    const cols = {}; s.ids.forEach(i=>(cols[lv[i]]=cols[lv[i]]||[]).push(i)); const nc = Math.max(...Object.keys(cols).map(Number))+1, rows = Math.max(...Object.values(cols).map(c=>c.length));
    const W = Math.max(300, nc*104+20), H = Math.max(120, rows*62+40), pos = {};
    Object.entries(cols).forEach(([c,list])=>list.forEach((id,k)=>{ pos[id] = [52 + (+c)*104, Math.round(H/2 + (k-(list.length-1)/2)*62)]; }));
    const nodes = s.ids.map(i=>({id:i, x:pos[i][0], y:pos[i][1], sub:s.indeg[i], cls:(i===s.u?"cur ":"")+(i===s.v2?"cmp ":"")+(s.out.includes(i)?"done":s.q.includes(i)?"front":"")}));
    const edges = s.E.map((e,k)=>({a:e.a, b:e.b, cls:k===s.ek?"hot":s.gone.includes(k)?"gone":""}));
    return graphSVG(nodes, edges, {directed:true, box:76, w:W, h:H, label:"Dependency graph"}) + `<p class="av-aux mono">queue: [${esc(s.q.join(", "))}]   order: ${esc(s.out.join(" → ")||"(empty)")}</p>`; } });

/* ---- data structures ---- */
def({ id:"unionfind", group:"Data structures", title:"Union–find with union by rank and path compression", concepts:["unionfind","trees","amortized"],
  text:"Keep groups of items as trees: each item points to a parent, and the root names the group. find(x) walks up to the root; union(a, b) hangs one root under the other. Union by rank puts the shorter tree under the taller one, and path compression points every node on a find path straight at the root, so operations cost almost O(1) (inverse Ackermann). Kruskal's minimum spanning tree and many clustering jobs use it.",
  inputs:[{k:"n", label:"Items 0..n-1", def:"10", w:5},{k:"ops", label:"Operations", def:"union 0 1, union 2 3, union 0 2, union 4 5, union 6 7, union 4 6, union 0 4, find 7, find 3, union 8 9, union 9 1"}],
  counters:["steps"],
  code:["find(x):","  if parent[x] != x: parent[x] = find(parent[x])   (path compression)","  return parent[x]","union(a, b):","  ra = find(a); rb = find(b); if ra == rb: same group, stop","  if rank[ra] < rank[rb]: swap ra, rb","  parent[rb] = ra   (shorter tree goes under the taller)","  if the ranks were equal: rank[ra] = rank[ra] + 1"],
  run(v, R){ const n = nums(v.n, 2, 16, 1)[0], p = Array.from({length:n},(x,i)=>i), rank = Array(n).fill(0);
    const S = o => Object.assign({p, rank}, o);
    const find = (x, why) => { const path = [x]; while(p[path[path.length-1]] !== path[path.length-1]) path.push(p[path[path.length-1]]);
      R.inc("steps", path.length-1); const root = path[path.length-1];
      R.step(1, `find(${x}) walks up ${path.join(" → ")}: the root is ${root}${why?" "+why:""}.`, S({hl:path, root}));
      const moved = path.slice(0,-1).filter(y=>p[y]!==root);
      if(moved.length){ moved.forEach(y=>p[y]=root); R.step(1, `Path compression: ${moved.join(", ")} now point${moved.length===1?"s":""} straight at ${root}, so the next find is one step.`, S({hl:moved.concat([root]), root})); }
      return root; };
    R.step(0, `${n} items, each in its own group (every item is its own root).`, S({}));
    for(const o of ops(v.ops)){ const [cmd, a1, b1] = o, a = +a1, b = +b1;
      if(cmd==="find"){ if(!(a>=0&&a<n)) throw new Error(`find needs an item from 0 to ${n-1}.`); find(a); continue; }
      if(cmd!=="union" || !(a>=0&&a<n&&b>=0&&b<n)) throw new Error(`Write "union a b" or "find x" with items from 0 to ${n-1}.`);
      let ra = find(a, `(for union ${a} ${b})`), rb = find(b, `(for union ${a} ${b})`);
      if(ra===rb){ R.step(4, `${a} and ${b} already share the root ${ra}: nothing to do.`, S({hl:[ra]})); continue; }
      if(rank[ra] < rank[rb]){ [ra, rb] = [rb, ra]; }
      p[rb] = ra; R.step(6, `Hang root ${rb} (rank ${rank[rb]}) under root ${ra} (rank ${rank[ra]}).`, S({hl:[ra, rb], root:ra}));
      if(rank[ra]===rank[rb]){ rank[ra]++; R.step(7, `Both trees had the same rank, so the new root ${ra} gets rank ${rank[ra]}.`, S({hl:[ra], root:ra})); } }
    const ng = p.filter((x,i)=>x===i).length; R.step(2, `Done. ${ng} group${ng===1?"":"s"} remain${ng===1?"s":""}.`, S({})); },
  draw(s){ const nodes = {}, hl = new Set(s.hl||[]); s.p.forEach((x,i)=>nodes[i] = {label:String(i), kids:[], cls:(i===s.root?"cur ":"")+(hl.has(i)?"cmp":""), sub:"r"+s.rank[i]});
    s.p.forEach((x,i)=>{ if(x!==i) nodes[x].kids.push(i); });
    return treeSVG(nodes, s.p.map((x,i)=>i).filter(i=>s.p[i]===i), {label:"Forest of groups", ux:40}) + table([["item",...s.p.map((x,i)=>i)],["parent",...s.p],["rank",...s.rank]], {side:true}); } });

def({ id:"binheap", group:"Data structures", title:"Binary heap: push and pop", concepts:["trees","queuesbuf","bigo"],
  text:"A min-heap is a complete binary tree stored in an array: the children of a[i] are a[2i+1] and a[2i+2], and every parent is at most its children, so the smallest value is always a[0]. push adds at the end and sifts up; pop moves the last value to the top and sifts it down. Both are O(log n). Priority queues, timers and Dijkstra use it.",
  inputs:[{k:"ops", label:"Operations", def:"push 5, push 3, push 8, push 1, push 9, push 2, pop, push 7, pop, pop"}],
  random:()=>({ops:Array.from({length:7},()=>"push "+rint(1,40)).concat(["pop","push "+rint(1,40),"pop"]).join(", ")}), counters:["cmp","swp"],
  code:["push(x): a.append(x); i = last index","  while i > 0 and a[parent(i)] > a[i]:","    swap a[i], a[parent(i)]; i = parent(i)   (sift up)","pop(): top = a[0]; a[0] = a.removeLast()","  while a child of i is smaller than a[i]:","    c = the smaller child; swap a[i], a[c]; i = c   (sift down)","  return top"],
  run(v, R){ const a = []; let out = [];
    const S = o => Object.assign({a, out:out.slice()}, o);
    R.step(0, "Start with an empty heap.", S({}));
    for(const o of ops(v.ops)){
      if(o[0]==="push"){ const x = Number(o[1]); if(!Number.isFinite(x)) throw new Error('Write "push 5".'); if(a.length >= 15) throw new Error("At most 15 values in the heap.");
        a.push(x); let i = a.length-1; R.step(0, `push ${x}: put it at the end, a[${i}].`, S({m:{[i]:"sel"}}));
        while(i>0){ const pi = (i-1)>>1; R.inc("cmp"); R.step(1, `Compare ${a[i]} with its parent a[${pi}] = ${a[pi]}.`, S({m:{[i]:"sel",[pi]:"cmp"}}));
          if(a[pi] <= a[i]){ R.step(1, `The parent is not bigger: ${x} stays here.`, S({m:{[i]:"done"}})); break; }
          [a[i],a[pi]] = [a[pi],a[i]]; R.inc("swp"); R.step(2, `The parent is bigger: swap, ${a[pi]} moves up.`, S({m:{[pi]:"swp",[i]:"swp"}})); i = pi; }
        if(i===0) R.step(2, `${a[0]} is now the smallest, at the top.`, S({m:{0:"done"}})); }
      else if(o[0]==="pop"){ if(!a.length){ R.step(3, "pop on an empty heap: nothing to return.", S({})); continue; }
        const top = a[0], last = a.pop(); out.push(top);
        if(!a.length){ R.step(6, `pop returns ${top}; the heap is now empty.`, S({})); continue; }
        a[0] = last; R.step(3, `pop returns ${top}. Move the last value ${last} to the top.`, S({m:{0:"sel"}})); let i = 0;
        for(;;){ const l = 2*i+1, r = l+1; if(l >= a.length) break; let c = l; if(r < a.length){ R.inc("cmp"); if(a[r] < a[l]) c = r; }
          R.inc("cmp"); R.step(4, `The smaller child of ${a[i]} is a[${c}] = ${a[c]}.`, S({m:{[i]:"sel",[c]:"cmp"}}));
          if(a[c] >= a[i]){ break; }
          [a[i],a[c]] = [a[c],a[i]]; R.inc("swp"); R.step(5, `Swap: ${a[i]} moves up, ${a[c]} moves down.`, S({m:{[i]:"swp",[c]:"swp"}})); i = c; }
        R.step(6, `The heap is repaired; the top is now ${a[0]}.`, S({m:{0:"done"}})); }
      else throw new Error('Write "push 5" or "pop".'); }
    R.step(6, `Done. Popped in order: ${out.join(", ")||"nothing"}.`, S({})); },
  draw(s){ const nodes = {}; s.a.forEach((x,i)=>nodes[i] = {label:String(x), kids:[2*i+1,2*i+2].filter(k=>k<s.a.length), cls:(s.m&&s.m[i])||""});
    return treeSVG(nodes, s.a.length?[0]:[], {label:"Heap as a tree", empty:"The heap is empty."}) + cells(s.a, s.m) + `<p class="av-aux mono">popped: ${esc(s.out.join(", ")||"none")}</p>`; } });

const HT_OPS = "put apple 3, put kiwi 7, put fig 2, put plum 5, put pear 1, put lime 9, get fig, get grape, put fig 4, put date 6";
function htParse(v){ return ops(v.ops).map(o=>{ if(!["put","get","del"].includes(o[0]) || !o[1]) throw new Error('Write "put key value", "get key" or "del key".'); return o; }); }
def({ id:"chaining", group:"Data structures", title:"Hash table with chaining", concepts:["hashtables","hashfn","bigo"],
  text:"A hash function turns a key into a number; modulo the number of buckets m it picks a bucket. Each bucket holds a small list of the keys that landed there. With a good hash and a load factor (keys / buckets) kept below about 1 by resizing, each list is short and get and put are O(1) on average. Java's HashMap works this way.",
  inputs:[{k:"m", label:"Buckets", def:"7", w:5},{k:"ops", label:"Operations", def:HT_OPS}], counters:["cmp"],
  code:["put(k, v): b = hash(k) mod m","  walk bucket b's list: if k is there, update its value","  else: add (k, v) to the end of bucket b's list","get(k): b = hash(k) mod m","  walk bucket b's list, compare each key with k","  found, or not found at the end of the list"],
  run(v, R){ const m = nums(v.m, 1, 13, 1)[0], B = Array.from({length:m},()=>[]);
    const S = o => Object.assign({B}, o);
    R.step(0, `${m} empty buckets.`, S({}));
    for(const [cmd, k, val] of htParse(v)){ const h = strHash(k), b = h % m;
      R.step(cmd==="put"?0:3, `hash("${k}") = ${h}; ${h} mod ${m} = ${b}, so look in bucket ${b}.`, S({b}));
      let idx = -1; for(let i=0;i<B[b].length;i++){ R.inc("cmp"); const hit = B[b][i][0]===k; R.step(cmd==="put"?1:4, `Compare "${B[b][i][0]}" with "${k}": ${hit?"same key":"different"}.`, S({b, at:i})); if(hit){ idx = i; break; } }
      if(cmd==="put"){ if(idx>=0){ B[b][idx][1] = val||"1"; R.step(1, `Update "${k}" to ${val||1}.`, S({b, at:idx, ok:true})); } else { B[b].push([k, val||"1"]); R.step(2, `Add "${k}" at the end of bucket ${b}${B[b].length>1?` (a collision: ${B[b].length} keys share it)`:""}.`, S({b, at:B[b].length-1, ok:true})); } }
      else if(cmd==="del"){ if(idx>=0){ B[b].splice(idx,1); R.step(5, `Remove "${k}" from bucket ${b}.`, S({b})); } else R.step(5, `"${k}" is not in the table.`, S({b})); }
      else R.step(5, idx>=0 ? `Found "${k}" = ${B[b][idx][1]}.` : `Reached the end of bucket ${b}: "${k}" is not in the table.`, S({b, at:idx, ok:idx>=0, miss:idx<0})); }
    const n = B.reduce((s,x)=>s+x.length,0); R.step(5, `Done: ${n} keys in ${m} buckets, load factor ${(n/m).toFixed(2)}. The longest list has ${Math.max(...B.map(x=>x.length))} keys.`, S({})); },
  draw(s){ return `<div class="av-buckets">${s.B.map((list,b)=>`<div class="bk${b===s.b?" cur":""}"><span class="bi mono">${b}</span>${list.map((kv,i)=>`<span class="kv${b===s.b&&i===s.at?(s.ok?" done":" cmp"):""}">${esc(kv[0])}: ${esc(kv[1])}</span>`).join('<span class="ar">→</span>')||'<span class="nil mono">empty</span>'}</div>`).join("")}</div>`; } });

def({ id:"probing", group:"Data structures", title:"Hash table with linear probing", concepts:["hashtables","hashfn","cachelines"],
  text:"Open addressing keeps all keys in one array. If the slot a key hashes to is taken, try the next slot, and the next, until a free one. It is cache friendly (neighbouring slots are in the same cache line), but keys form clusters, so the load factor must stay well below 1 (about 0.7). A delete must leave a tombstone, or later searches would stop too early.",
  inputs:[{k:"m", label:"Slots", def:"11", w:5},{k:"ops", label:"Operations", def:"put apple 3, put kiwi 7, put fig 2, put plum 5, put pear 1, put lime 9, put date 6, get lime, del fig, get date, get grape"}], counters:["probe"],
  code:["put(k): i = hash(k) mod m","  while slot i holds another key: i = (i + 1) mod m","  store k in slot i (a tombstone slot can be reused)","get(k): i = hash(k) mod m","  while slot i is not empty:","    if slot i holds k: found","    i = (i + 1) mod m","  hit an empty slot: not found","delete(k): find k, then leave a tombstone"],
  run(v, R){ const m = nums(v.m, 3, 17, 1)[0], T = Array(m).fill(null);
    const S = o => Object.assign({T}, o);
    R.step(0, `${m} empty slots.`, S({}));
    for(const [cmd, k, val] of htParse(v)){ const h = strHash(k); let i = h % m;
      R.step(cmd==="put"?0:3, `hash("${k}") = ${h}; ${h} mod ${m} = ${i}.`, S({i}));
      if(cmd==="put"){ let tomb = -1, n = 0;
        while(T[i] && T[i][0]!==k && n<m){ R.inc("probe"); if(T[i][0]==="†" && tomb<0) tomb = i;
          R.step(1, T[i][0]==="†" ? `Slot ${i} is a tombstone; remember it and keep looking for "${k}".` : `Slot ${i} holds "${T[i][0]}": a collision. Try slot ${(i+1)%m}.`, S({i})); i = (i+1)%m; n++; }
        if(n>=m && tomb<0) throw new Error("The table is full. Use more slots (real tables resize at about 70% full).");
        if(T[i] && T[i][0]===k){ T[i][1] = val||"1"; R.step(2, `"${k}" is already in slot ${i}: update it.`, S({i, ok:true})); }
        else { const at = tomb>=0 ? tomb : i; T[at] = [k, val||"1"]; R.inc("probe"); R.step(2, `Store "${k}" in slot ${at}.`, S({i:at, ok:true})); } continue; }
      let n = 0, found = -1;
      while(T[i] && n<m){ R.inc("probe"); if(T[i][0]===k){ found = i; break; } R.step(6, `Slot ${i} holds ${T[i][0]==="†"?"a tombstone":`"${T[i][0]}"`}, not "${k}". Try slot ${(i+1)%m}.`, S({i})); i = (i+1)%m; n++; }
      if(found<0){ R.step(7, `Slot ${i} is empty: "${k}" is not in the table.`, S({i, miss:true})); continue; }
      if(cmd==="get") R.step(5, `Found "${k}" = ${T[found][1]} in slot ${found}.`, S({i:found, ok:true}));
      else { T[found] = ["†",""]; R.step(8, `Delete "${k}": slot ${found} gets a tombstone (†), so searches for keys after it still go on.`, S({i:found})); } }
    const n = T.filter(x=>x&&x[0]!=="†").length; R.step(7, `Done: ${n} keys in ${m} slots, load factor ${(n/m).toFixed(2)}.`, S({})); },
  draw(s){ return `<div class="av-slots">${s.T.map((x,i)=>`<div class="sl${i===s.i?(s.ok?" done":s.miss?" miss":" cmp"):""}${x&&x[0]==="†"?" tomb":""}"><span class="bi mono">${i}</span><span>${x?(x[0]==="†"?"† tombstone":esc(x[0])+": "+esc(x[1])):'<span class="nil mono">empty</span>'}</span></div>`).join("")}</div>`; } });

def({ id:"lru", group:"Data structures", title:"LRU cache", concepts:["eviction","hashtables","cachelayer"],
  text:"A least-recently-used cache keeps a hash map from key to a node in a doubly linked list ordered by use. get moves the node to the front; put adds at the front; when the cache is full, the node at the back (used longest ago) is evicted. Every operation is O(1). Redis, CPU caches and the page cache use LRU or close approximations of it.",
  inputs:[{k:"cap", label:"Capacity", def:"3", w:5},{k:"ops", label:"Operations", def:"put a 1, put b 2, get a, put c 3, put d 4, get b, get c, put a 5, put e 6, get d"}], counters:["hit","miss","evict"],
  code:["get(k): if k is not in the map: miss","  move k's node to the front (most recent); return its value","put(k, v): if k is in the map: update v, move to the front","  else: new node at the front; map[k] = node","  if size > capacity: remove the node at the back (least recent)","    and delete its key from the map"],
  run(v, R){ const cap = nums(v.cap, 1, 6, 1)[0]; let L = [];   // L[0] is the most recent
    const S = o => Object.assign({L:L.slice(), cap}, o);
    R.step(0, `An empty cache with room for ${cap}.`, S({}));
    for(const [cmd, k, val] of ops(v.ops)){ if(!k || !["get","put"].includes(cmd)) throw new Error('Write "put key value" or "get key".');
      const i = L.findIndex(x=>x[0]===k);
      if(cmd==="get"){ if(i<0){ R.inc("miss"); R.step(0, `get ${k}: not in the map, a miss.`, S({miss:k})); continue; }
        const node = L.splice(i,1)[0]; L.unshift(node); R.inc("hit"); R.step(1, `get ${k}: a hit, value ${node[1]}. Move ${k} to the front.`, S({hl:k})); continue; }
      if(i>=0){ L.splice(i,1); L.unshift([k, val||"1"]); R.step(2, `put ${k}: already cached. Update to ${val||1} and move it to the front.`, S({hl:k})); continue; }
      L.unshift([k, val||"1"]); R.step(3, `put ${k}: new, so add it at the front.`, S({hl:k, add:true}));
      if(L.length > cap){ const old = L.pop(); R.inc("evict"); R.step(4, `Over capacity: evict ${old[0]} from the back, the least recently used, and remove it from the map.`, S({ev:old[0]})); } }
    R.step(5, `Done: ${R.c.hit||0} hits, ${R.c.miss||0} misses, ${R.c.evict||0} evictions.`, S({})); },
  draw(s){ const map = s.L.map(x=>x[0]).slice().sort();
    return `<div class="av-lru"><div class="lru-map"><span class="mono lbl">hash map</span>${map.map(k=>`<span class="kv${k===s.hl?" done":""}">${esc(k)} → node</span>`).join("")||'<span class="nil mono">empty</span>'}</div>
      <div class="lru-list"><span class="mono lbl">front (most recent)</span><div class="lru-row">${s.L.map(x=>`<span class="kv${x[0]===s.hl?" done":""}">${esc(x[0])}: ${esc(x[1])}</span>`).join('<span class="ar">⇄</span>')||'<span class="nil mono">empty</span>'}${s.ev?`<span class="ar">→</span><span class="kv miss">${esc(s.ev)} evicted</span>`:""}</div><span class="mono lbl">back (least recent) · ${s.L.length}/${s.cap}</span></div>${s.miss?`<p class="av-aux">get ${esc(s.miss)}: miss</p>`:""}</div>`; } });

const BLOOM_M = 20, BLOOM_K = 3;
const bloomIdx = (x, m, k) => { const a = fnv(x), b = djb2(x)|1; return Array.from({length:k},(z,i)=>(a + i*b) % m); };
function bloomPreset(){
  const add = ["cat","dog","fox","owl","bee"], bits = new Set(add.flatMap(x=>bloomIdx(x, BLOOM_M, BLOOM_K)));
  const cand = ["ant","elk","yak","emu","hen","ram","cod","eel","bat","cow","pig","rat","jay","gnu","koi","ape","asp","boa","doe","ewe","kid","orc","pug","roe"];
  const fp = cand.find(x=>bloomIdx(x, BLOOM_M, BLOOM_K).every(i=>bits.has(i))), neg = cand.find(x=>!bloomIdx(x, BLOOM_M, BLOOM_K).every(i=>bits.has(i)));
  return add.map(x=>"add "+x).concat(["check dog", "check "+neg].concat(fp?["check "+fp]:[])).join(", ");
}
def({ id:"bloom", group:"Probabilistic & distributed", title:"Bloom filter", concepts:["bloom","hashfn","probability"],
  text:"A Bloom filter answers \"is x in the set?\" with a bit array and k hash functions. add(x) sets k bits; check(x) looks at the same k bits: if any is 0, x was never added; if all are 1, x is probably there, but those bits may have been set by other items (a false positive). With n items in m bits the false positive rate is about (1 − e^(−kn/m))^k. LSM-tree databases use one per file to skip disk reads.",
  inputs:[{k:"m", label:"Bits", def:String(BLOOM_M), w:5},{k:"k", label:"Hashes", def:String(BLOOM_K), w:5},{k:"ops", label:"Operations", def:bloomPreset()}],
  counters:["set","fp"],
  code:["add(x): for i in 1..k:","  set bit h_i(x) mod m to 1","check(x): for i in 1..k:","  if bit h_i(x) mod m is 0: \"definitely not in the set\"","\"probably in the set\" (could be a false positive)"],
  run(v, R){ const m = nums(v.m, 8, 32, 1)[0], k = nums(v.k, 1, 6, 1)[0], bits = Array(m).fill(0), added = new Set(); const O = ops(v.ops);
    const S = o => Object.assign({bits:bits.slice(), n:added.size, m, k}, o);
    R.step(0, `${m} bits, all 0. Each item uses ${k} hash positions (h_i = h1 + i·h2, mod ${m}).`, S({}));
    for(const [cmd, x] of O){ if(!x || !["add","check"].includes(cmd)) throw new Error('Write "add word" or "check word".');
      const idx = bloomIdx(x, m, k);
      if(cmd==="add"){ R.step(0, `add "${x}": its hash positions are ${idx.join(", ")}.`, S({idx}));
        idx.forEach(i=>{ if(!bits[i]){ bits[i] = 1; R.inc("set"); } }); added.add(x); R.step(1, `Set bits ${idx.join(", ")} to 1.`, S({idx, setb:true})); continue; }
      R.step(2, `check "${x}": look at bits ${idx.join(", ")}.`, S({idx}));
      const zero = idx.find(i=>!bits[i]);
      if(zero!==undefined){ R.step(3, `Bit ${zero} is 0, so "${x}" was definitely never added.`, S({idx, zero})); continue; }
      if(added.has(x)) R.step(4, `All ${k} bits are 1: "${x}" is probably in the set (and it really is).`, S({idx, yes:true}));
      else { R.inc("fp"); R.step(4, `All ${k} bits are 1, but "${x}" was never added: a false positive. Other items set those bits.`, S({idx, fp:true})); } }
    const fpr = Math.pow(1-Math.exp(-k*added.size/m), k);
    R.step(4, `Done: ${added.size} items, ${bits.filter(Boolean).length} of ${m} bits set. Expected false positive rate ≈ ${(100*fpr).toFixed(1)}%.`, S({})); },
  draw(s){ const set = new Set(s.idx||[]);
    return `<div class="av-bits" style="--n:${s.bits.length}">${s.bits.map((b,i)=>`<div class="bit${b?" on":""}${set.has(i)?(i===s.zero?" miss":s.fp?" fp":s.yes||s.setb?" done":" cmp"):""}"><span class="v">${b}</span><span class="i">${i}</span></div>`).join("")}</div><p class="av-aux mono">items added: ${s.n} · bits set: ${s.bits.filter(Boolean).length}/${s.m} · k = ${s.k}</p>`; } });

def({ id:"conshash", group:"Probabilistic & distributed", title:"Consistent hashing with virtual nodes", concepts:["conshash","partitioning","hashfn"],
  text:"Place servers and keys on the same ring of hash values. A key belongs to the first server point found going clockwise. When a server joins or leaves, only the keys next to its points move, about K/N of them, instead of almost all keys with hash mod N. Each server gets several virtual points so the load evens out. Cassandra, DynamoDB and many caches split data this way.",
  inputs:[{k:"ops", label:"Operations", def:"vnodes 3, add A, add B, add C, keys 18, remove B, add D"}], counters:["moved"],
  code:["addServer(s): for v in 1..V: put a point at hash(s#v) on the ring","removeServer(s): take its V points off the ring","owner(key): walk clockwise from hash(key)","  to the first server point; that server owns the key","after a change, only keys between the changed points","  and their previous neighbours move (about K/N keys)"],
  run(v, R){ let V = 3; const servers = [], keys = [], seen = []; let owner = {};
    const pts = () => servers.flatMap(s=>Array.from({length:V},(x,i)=>({s, h:ring(s+"#"+i)}))).sort((a,b)=>a.h-b.h);
    const own = h => { const P = pts(); if(!P.length) return null; const p = P.find(p=>p.h>=h); return (p||P[0]).s; };
    const assign = () => { const o = {}; keys.forEach(k=>o[k.id]=own(k.h)); return o; };
    const S = o => Object.assign({P:pts(), keys:keys.map(k=>({id:k.id, h:k.h, o:owner[k.id]})), servers:servers.slice(), seen:seen.slice()}, o);
    R.step(0, "An empty ring of hash values from 0 to 359.", S({}));
    for(const [cmd, a] of ops(v.ops)){
      if(cmd==="vnodes"){ V = nums(a, 1, 8, 1)[0]; owner = assign(); R.step(0, `Each server gets ${V} virtual point${V===1?"":"s"} on the ring.`, S({})); continue; }
      if(cmd==="keys"){ const n = nums(a, 1, 40, 1)[0]; for(let i=0;i<n;i++){ const id = "k"+keys.length; keys.push({id, h:ring("key:"+id)}); }
        owner = assign(); R.step(2, `Hash ${n} keys onto the ring. Each key belongs to the next server point clockwise (its colour).`, S({})); continue; }
      if(!a || !["add","remove"].includes(cmd)) throw new Error('Write "vnodes 3", "add A", "remove A" or "keys 12".');
      if(cmd==="add"){ if(servers.includes(a)) throw new Error(`Server ${a} is already on the ring.`); if(servers.length>=6) throw new Error("At most 6 servers.");
        servers.push(a); if(!seen.includes(a)) seen.push(a); R.step(0, `add server ${a}: put ${V} points at ${Array.from({length:V},(x,i)=>ring(a+"#"+i)).join(", ")}.`, S({hs:a})); }
      else { if(!servers.includes(a)) throw new Error(`Server ${a} is not on the ring.`); servers.splice(servers.indexOf(a),1); R.step(1, `remove server ${a}: its points leave the ring.`, S({gone:a})); }
      const nw = assign(), moved = keys.filter(k=>owner[k.id] && owner[k.id]!==nw[k.id]).map(k=>k.id); owner = nw; R.inc("moved", moved.length);
      if(keys.length) R.step(4, `${moved.length} of ${keys.length} keys moved (${keys.length?Math.round(100*moved.length/keys.length):0}%). With hash mod N, most keys would have moved.`, S({moved, hs:cmd==="add"?a:null})); }
    R.step(5, `Done. Keys per server: ${servers.map(s=>s+" "+keys.filter(k=>owner[k.id]===s).length).join(", ")||"no servers"}.`, S({})); },
  draw(s){ const cx = 150, cy = 150, r = 112, col = id => s.seen.includes(id) ? SCOL[s.seen.indexOf(id) % SCOL.length] : "var(--muted)", pt = (h, rr) => [cx + rr*Math.sin(h*Math.PI/180), cy - rr*Math.cos(h*Math.PI/180)];
    const mv = new Set(s.moved||[]);
    let g = `<circle cx="${cx}" cy="${cy}" r="${r}" class="ring"/>`;
    s.P.forEach(p=>{ const [x,y] = pt(p.h, r), [tx,ty] = pt(p.h, r+16); g += `<rect x="${x-6}" y="${y-6}" width="12" height="12" rx="2" style="fill:${col(p.s)}" class="srv${p.s===s.hs?" new":""}"/><text x="${tx}" y="${ty+4}" text-anchor="middle" class="sub">${esc(p.s)}</text>`; });
    s.keys.forEach(k=>{ const [x,y] = pt(k.h, r-22); g += `<circle cx="${x}" cy="${y}" r="${mv.has(k.id)?7:5}" style="fill:${k.o?col(k.o):"var(--muted)"}" class="key${mv.has(k.id)?" moved":""}"><title>${k.id} at ${k.h} → ${k.o||"no server"}</title></circle>`; });
    const counts = s.servers.map(x=>`<span class="kv" style="border-color:${col(x)}"><span class="sw" style="background:${col(x)}"></span>${esc(x)}: ${s.keys.filter(k=>k.o===x).length} keys</span>`).join("");
    return `<div class="av-ring"><svg class="av-svg" viewBox="0 0 300 300" style="max-width:300px" role="img" aria-label="Hash ring">${g}</svg><div class="ring-side">${counts||'<span class="nil mono">no servers</span>'}${s.moved?`<p class="av-aux">Big dots with a ring moved to a new server.</p>`:""}</div></div>`; } });

/* ---- Raft ---- */
const RF = {n:5, lat:3, hb:6, to:[16, 30], maj:3};
function prng(seed){ let a = (seed*2654435761 + 1013904223) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t>>>15, t | 1); t ^= t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14) >>> 0) / 4294967296; }; }
const RAFT_EV = "40 write x=1, 62 crash follower, 70 write x=2, 76 write x=3, 113 write x=4, 114 crash leader, 165 write x=5, 190 restart all";
function raftParse(str){
  const out = String(str||"").split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).map(tk=>{
    const m = tk.match(/^(\d+)\s+(.+)$/); if(!m) throw new Error(`Start each event with a time, like "40 write x=1". Could not read "${tk}".`);
    const t = +m[1], a = m[2].trim().toLowerCase().replace(/\s+/g, " "); let e;
    if(t > 600) throw new Error("Use times from 0 to 600.");
    if((e = a.match(/^write (?:x ?= ?)?(\d{1,2})$/))) return {t, a:"write", v:+e[1]};
    if((e = a.match(/^(crash|restart) (s[1-5]|leader|follower|all)$/))) return {t, a:e[1], who:e[2]};
    if(a==="partition leader" || a==="partition") return {t, a:"part"};
    if(a==="heal") return {t, a:"heal"};
    throw new Error(`Could not read "${tk}". Use: write x=5, crash S2, crash leader, crash follower, restart S2, restart all, partition leader, heal.`);
  });
  if(out.length > 40) throw new Error("At most 40 events.");
  return out.map((e,i)=>[e,i]).sort((a,b)=>a[0].t-b[0].t || a[1]-b[1]).map(x=>x[0]);
}
const raftStr = evs => evs.map(e=>e.t + " " + (e.a==="write" ? "write x=" + e.v : e.a==="part" ? "partition leader" : e.a==="heal" ? "heal" : e.a + " " + (/^s\d$/.test(e.who) ? e.who.toUpperCase() : e.who))).join(", ");
const SN = i => "S" + (i+1);
function raftRun(v, R){
  const seed = nums(v.seed, 0, 9999, 1)[0], rnd = prng(seed), evs = raftParse(v.ev);
  const END = (evs.length ? evs[evs.length-1].t : 0) + 70;
  const to = () => RF.to[0] + Math.floor(rnd()*(RF.to[1]-RF.to[0]+1));
  const S = Array.from({length:RF.n}, ()=>({term:0, role:"F", voted:null, log:[], commit:0, up:true, timer:0, tmax:0, votes:[], next:[], match:[], last:[], hb:0}));
  S.forEach(s=>{ s.tmax = s.timer = to(); });
  let M = [], mid = 0, part = null, pend = [], idle = true;
  const lastT = s => s.log.length ? s.log[s.log.length-1].t : 0;
  const cut = (a, b) => part!==null && (a===part) !== (b===part);
  const send = (t, f, to2, ty, o) => { R.inc("msg"); M.push(Object.assign({id:mid++, f, to:to2, ty, sent:t, at:t+RF.lat, lost:cut(f, to2) ? "cut" : ""}, o)); };
  const top = skipCut => { let b = -1; S.forEach((s,i)=>{ if(s.up && s.role==="L" && !(skipCut && i===part) && (b<0 || s.term > S[b].term)) b = i; }); return b; };
  const sendAE = (t, L, i) => { const s = S[L], pv = s.next[i]-1; s.last[i] = t; send(t, L, i, "AE", {term:s.term, pv, pt:pv ? s.log[pv-1].t : 0, ents:s.log.slice(pv).map(e=>({t:e.t, v:e.v})), lc:s.commit}); };
  const ents = l => l.map(e=>"x=" + e.v).join(", ");
  const snap = (t, vis) => ({t, seek:t, part, lead:top(false),
    S:S.map(s=>({term:s.term, role:s.role, up:s.up, log:s.log.map(e=>[e.t, e.v]), commit:s.commit, timer:s.timer, tmax:s.tmax, votes:s.votes.length, next:s.role==="L" ? s.next.slice() : null})),
    M:vis.map(m=>({id:m.id, f:m.f, to:m.to, ty:m.ty, p:m.p, ok:m.ok, lost:m.lost, n:m.ents ? m.ents.length : 0}))});
  for(let t=0; t<=END; t++){
    const ev = [], say = (line, txt, pri) => ev.push({line, txt, pri}), grp = {};
    const group = (k, line, pri, who, fn) => { if(!grp[k]){ grp[k] = {who:[], fn}; ev.push({line, pri, g:grp[k]}); } grp[k].who.push(who); };   // "S1 and S2 vote for S3"
    const names = l => l.length===1 ? SN(l[0]) : l.slice(0,-1).map(SN).join(", ") + " and " + SN(l[l.length-1]);
    const arrived = M.filter(m=>m.at===t), vis = [];
    M = M.filter(m=>m.at > t);
    for(const m of arrived){
      if(m.lost) continue;
      const d = S[m.to], j = m.to, f = m.f;
      if(!d.up){ m.lost = "down"; m.p = 1; vis.push(m); continue; }
      m.p = 1; vis.push(m);
      if(m.term > d.term){ const was = d.role; d.term = m.term; d.voted = null; d.role = "F"; d.votes = [];
        if(was!=="F"){ d.timer = d.tmax = to(); const tm = m.term; group("d"+tm, 10, 2.5, j, w=>w.length===1 ? `${SN(w[0])} sees term ${tm}, newer than its own: it steps down to follower.` : `${names(w)} see term ${tm}, newer than their own: they step down to followers.`); } }
      if(m.ty==="RV"){
        const up2 = m.lt > lastT(d) || (m.lt===lastT(d) && m.li >= d.log.length);
        let ok = false, why = "";
        if(m.term < d.term) why = "old"; else if(d.voted!==null && d.voted!==f) why = "voted"; else if(!up2) why = "behind"; else ok = true;
        if(ok){ d.voted = f; d.timer = d.tmax = to(); const tm = d.term; group("v"+f+"/"+tm, 3, 1.2, j, w=>`${names(w)} vote${w.length===1?"s":""} for ${SN(f)} in term ${tm}.`); }
        else { const tm = d.term, mt = m.term, vf = d.voted; group("n"+f+why+tm, 3, 1.6, j, w=>{ const one = w.length===1, who = one ? SN(w[0]) + " says" : names(w) + " say";
          return why==="old" ? `${who} no to ${SN(f)}: its term ${mt} is old.` : why==="voted" ? `${who} no to ${SN(f)}: ${one ? `it already voted for ${SN(vf)}` : "they already voted"} in term ${tm}.`
            : `${who} no to ${SN(f)}: ${SN(f)}'s log is behind, so as leader it could lose committed entries.`; }); }
        send(t, j, f, "VR", {term:d.term, ok});
      } else if(m.ty==="VR"){
        if(d.role==="C" && m.term===d.term && m.ok && !d.votes.includes(f)){ d.votes.push(f);
          if(d.votes.length >= RF.maj){ d.role = "L"; d.next = S.map(()=>d.log.length+1); d.match = S.map(()=>0); d.last = []; d.hb = 0;
            say(5, `${SN(j)} has ${d.votes.length} of 5 votes, a majority: it is the leader for term ${d.term}.`, 3); }
          else say(5, `${SN(j)} has ${d.votes.length} votes (its own included); it needs 3.`, .9); }
      } else if(m.ty==="AE"){
        if(m.term < d.term){ send(t, j, f, "AR", {term:d.term, ok:false, match:0}); say(10, `${SN(j)} ignores ${SN(f)}: its term ${m.term} is older than ${d.term}.`, 1.5); continue; }
        if(d.role==="C"){ d.role = "F"; d.votes = []; const tm = m.term; group("b"+f, 10, 1.5, j, w=>`${names(w)} hear${w.length===1?"s":""} from leader ${SN(f)} in term ${tm}: back to follower.`); }
        d.timer = d.tmax = to();
        if(!(m.pv===0 || (d.log.length >= m.pv && d.log[m.pv-1].t===m.pt))){
          send(t, j, f, "AR", {term:d.term, ok:false, match:0, pv:m.pv});
          say(8, `${SN(j)}'s log does not match the leader's at index ${m.pv} (${d.log.length < m.pv ? "it has nothing there" : `it has term ${d.log[m.pv-1].t} there, not ${m.pt}`}), so it says no.`, 2); continue; }
        const added = []; let dropped = [];
        m.ents.forEach((e,k)=>{ const idx = m.pv + k + 1, c = d.log[idx-1];
          if(c && c.t!==e.t){ dropped = d.log.slice(idx-1); d.log.length = idx-1; }
          if(!d.log[idx-1]){ d.log.push({t:e.t, v:e.v}); added.push(idx); } });
        if(dropped.length) say(8, `${SN(j)} drops ${ents(dropped)}: ${dropped.length===1?"it conflicts":"they conflict"} with the leader's log and ${dropped.length===1?"was":"were"} never committed.`, 2.6);
        if(added.length) say(7, `${SN(j)} stores ${added.length===1?"entry " + added[0]:"entries " + added[0] + "–" + added[added.length-1]} and says ok.`, 1.7);
        const last = m.pv + m.ents.length, c2 = Math.min(m.lc, last);
        if(c2 > d.commit){ d.commit = c2; group("c"+c2, 9, .8, j, w=>`${names(w)} learn${w.length===1?"s":""} that entries up to ${c2} are committed.`); }
        send(t, j, f, "AR", {term:d.term, ok:true, match:last});
      } else if(m.ty==="AR"){
        if(d.role!=="L" || m.term!==d.term) continue;
        if(m.ok){ d.match[f] = Math.max(d.match[f], m.match); d.next[f] = d.match[f]+1;
          for(let n = d.log.length; n > d.commit; n--){
            const cnt = 1 + S.filter((x,i)=>i!==j && d.match[i] >= n).length;
            if(d.log[n-1].t===d.term && cnt >= RF.maj){ const old = d.commit; d.commit = n; R.inc("commit", n-old);
              say(9, n-old===1 ? `Entry ${n} (x=${d.log[n-1].v}) is stored on ${cnt} of 5 servers, a majority: it is committed.` : `Entries ${old+1}–${n} are stored on ${cnt} of 5 servers, a majority: committed.`, 3); break; } } }
        else if(m.pv!==undefined && d.next[f]===m.pv+1){ d.next[f] = Math.max(1, d.next[f]-1); say(8, `${SN(f)} said no, so leader ${SN(j)} steps back to index ${d.next[f]} for ${SN(f)} and tries again.`, 2.2); sendAE(t, j, f); }
      }
    }
    // the script: client writes, crashes, restarts, partitions
    for(const e of evs.filter(e=>e.t===t)){
      if(e.a==="write"){ const L = top(true);
        if(L<0){ pend.push(e.v); say(11, `Client writes x=${e.v}, but it cannot reach a leader right now. It will retry when there is one.`, 3); continue; }
        S[L].log.push({t:S[L].term, v:e.v}); say(11, `Client writes x=${e.v}. Leader ${SN(L)} adds it to its log at index ${S[L].log.length} (term ${S[L].term}); the next AppendEntries carries it.`, 3); continue; }
      if(e.a==="part"){ const L = top(false); if(L<0){ say(-1, "There is no leader to cut off.", 2); continue; }
        part = L; say(-1, `The network splits: leader ${SN(L)} is cut off from the other four. Messages across the split are lost (✕).`, 3); continue; }
      if(e.a==="heal"){ if(part!==null){ part = null; say(-1, "The network heals: all five servers can talk again.", 3); } continue; }
      let ids = [];
      if(e.who==="leader"){ const L = top(false); if(L>=0) ids = [L]; }
      else if(e.who==="follower"){ for(let i=RF.n-1;i>=0;i--) if(S[i].up && S[i].role!=="L"){ ids = [i]; break; } }
      else if(e.who==="all") ids = S.map((x,i)=>i);
      else ids = [+e.who.slice(1)-1];
      if(e.a==="crash"){ ids = ids.filter(i=>S[i].up); if(!ids.length){ say(-1, e.who==="leader" ? "There is no leader to crash." : "That server is already down.", 2); continue; }
        ids.forEach(i=>{ const s = S[i], was = s.role; s.up = false; s.role = "F"; s.votes = [];
          say(-1, `${SN(i)} crashes${was==="L"?" (it was the leader)":""}. It stops sending and answering; its term, vote and log stay on disk.`, 3); }); }
      else { ids = ids.filter(i=>!S[i].up); if(!ids.length){ say(-1, "Nothing to restart: that server is up.", 2); continue; }
        ids.forEach(i=>{ const s = S[i]; s.up = true; s.commit = 0; s.timer = s.tmax = to(); });
        say(-1, `${ids.map(SN).join(" and ")} restart${ids.length===1?"s":""} as follower${ids.length===1?"":"s"}. Term, vote and log come back from disk; the commit index starts at 0 until a leader sends a newer one.`, 3); }
    }
    if(pend.length){ const L = top(true); if(L>=0){ pend.forEach(x=>S[L].log.push({t:S[L].term, v:x})); say(11, `The client retries ${pend.map(x=>"x="+x).join(", ")}: leader ${SN(L)} adds ${pend.length===1?"it":"them"} to its log.`, 2.8); pend = []; } }
    // timers: followers and candidates count down; the leader sends AppendEntries every few ticks
    S.forEach((s,i)=>{ if(!s.up) return;
      if(s.role==="L"){ if(--s.hb <= 0){ s.hb = RF.hb; const any = S.some((o,k)=>k!==i && s.next[k] <= s.log.length);
          S.forEach((o,k)=>{ if(k!==i && !(t - s.last[k] < RF.hb)) sendAE(t, i, k); });   // skip a follower that was just sent a retry
          say(6, any ? `Leader ${SN(i)} sends AppendEntries with the entries each follower is missing.` : `Leader ${SN(i)} sends heartbeats (empty AppendEntries), so no one starts an election.`, any ? 1.5 : .5); }
        return; }
      if(--s.timer > 0) return;
      const again = s.role==="C"; s.term++; s.role = "C"; s.voted = i; s.votes = [i]; s.timer = s.tmax = to(); R.inc("elect");
      const tm = s.term;
      group("e"+again+tm, 1, 3, i, w=>w.length===1 ? (again ? `${SN(i)} got no majority in time (split vote or lost messages). It starts a new election for term ${tm}.` : `${SN(i)} heard nothing from a leader before its timer ran out. It becomes a candidate for term ${tm}, votes for itself and asks the others for votes.`)
        : (again ? `${names(w)} got no majority in time. They start new elections for term ${tm}.` : `${names(w)} heard nothing from a leader before their timers ran out. They become candidates for term ${tm}, vote for themselves and ask for votes.`));
      S.forEach((o,k)=>{ if(k!==i) send(t, i, k, "RV", {term:s.term, li:s.log.length, lt:lastT(s)}); }); });
    M.forEach(m=>{ m.p = Math.min(m.lost==="cut" ? .5 : 1, (t - m.sent)/RF.lat); vis.push(m); });
    if(t===0){ R.step(0, "Five servers start as followers in term 0, with no leader. Each one waits a random time (the ring around it) before it starts an election.", snap(t, vis)); continue; }
    if(!ev.length && !vis.length){ if(!idle) R.step(0, "Nothing is moving. Every server that is up waits; its election timer (the ring) runs down.", snap(t, vis)); idle = true; continue; }
    idle = false;
    ev.forEach(e=>{ if(e.g) e.txt = e.g.fn(e.g.who); });
    ev.sort((a,b)=>b.pri-a.pri);
    const types = new Set(vis.filter(m=>!m.lost).map(m=>m.ty)), fly = [];
    if(types.has("RV")) fly.push("vote requests"); if(types.has("VR")) fly.push("votes");
    if(vis.some(m=>m.ty==="AE" && m.ents.length && !m.lost)) fly.push("entries"); else if(types.has("AE")) fly.push("heartbeats");
    if(types.has("AR")) fly.push("replies to the leader");
    // the most important event, plus up to two more that matter on their own
    const say3 = ev.filter((e,i)=>i===0 || e.pri >= Math.min(1.5, ev[0].pri)).slice(0, 3);
    const txt = ev.length ? say3.map(e=>e.txt).join(" ") : fly.length ? `In flight: ${fly.join(", ")}.` : "Lost messages vanish.";
    R.step(ev.length ? ev[0].line : -1, txt, snap(t, vis));
  }
  const L = top(false);
  R.step(-1, `End at time ${END}. ${L>=0 ? `${SN(L)} leads term ${S[L].term}; ${S[L].commit} entr${S[L].commit===1?"y is":"ies are"} committed.` : "There is no leader right now."}`, snap(END, []));
}
def({ id:"raft", group:"Probabilistic & distributed", title:"Raft: leader election and log replication", concepts:["raft","consensus","leaderelect","replication","quorum"],
  text:"Five servers keep the same log of commands. Time is split into terms with at most one leader each. A follower that hears nothing from a leader for a random time becomes a candidate and asks for votes; a majority (3 of 5) makes it leader. The leader adds client writes to its log and copies them with AppendEntries; an entry is committed once a majority stores it. A server only votes for a candidate whose log is at least as up to date, so a new leader always has every committed entry, and it repairs followers whose logs differ.",
  inputs:[{k:"seed", label:"Random seed", def:"7", w:5},{k:"ev", label:"Events (time and action)", def:RAFT_EV}],
  presets:[{name:"Crash and repair", v:{seed:"7", ev:RAFT_EV}},{name:"Partition the leader", v:{seed:"7", ev:"40 write x=1, 60 partition leader, 66 write x=2, 120 write x=3, 150 heal"}},{name:"Split vote", v:{seed:"14", ev:"80 write x=1"}}],
  random:()=>({seed:String(rint(1,9999))}), counters:["elect","msg","commit"],
  live:{ title:"Change what happens next", fields:[{k:"x", label:"x =", def:"7", w:3, mode:"numeric"}],
    buttons:[{id:"write", label:"Client writes x", primary:true},{id:"part", label:"Partition leader"},"Crash or restart:",{id:"s0", label:"Crash S1"},{id:"s1", label:"Crash S2"},{id:"s2", label:"Crash S3"},{id:"s3", label:"Crash S4"},{id:"s4", label:"Crash S5"}],
    note:"Each button adds an event right after the current step to the events above, drops the later ones, and plays on from there. The seed keeps every run the same." },
  liveState(s){ const o = {part:{label:s.part!==null ? "Heal partition" : "Partition leader", disabled:s.part===null && s.lead<0}};
    s.S.forEach((x,i)=>{ o["s"+i] = {label:(x.up ? "Crash " : "Restart ") + SN(i)}; }); return o; },
  act(vals, id, fv, f){
    const T = f ? f.s.t : 0, evs = raftParse(vals.ev).filter(e=>e.t <= T), at = T + 1;
    if(at > 600) throw new Error("The simulation stops at time 600.");
    if(id==="write"){ const x = String(fv.x||"").trim(); if(!/^\d{1,2}$/.test(x)) throw new Error("Type a value for x from 0 to 99."); evs.push({t:at, a:"write", v:+x}); }
    else if(id==="part") evs.push(f && f.s.part!==null ? {t:at, a:"heal"} : {t:at, a:"part"});
    else { const i = +id.slice(1), up = f ? f.s.S[i].up : true; evs.push({t:at, a:up ? "crash" : "restart", who:"s" + (i+1)}); }
    return {v:Object.assign({}, vals, {ev:raftStr(evs)}), seek:at};
  },
  code:["every server starts as a follower with a random election timeout","timeout with no leader: become candidate, term + 1, vote for self","  send RequestVote(term, last log index and term) to all","on RequestVote: vote yes if the term is current, no vote yet in this term,","  and the candidate's log is at least as up to date as mine","votes from a majority (3 of 5): become leader","leader: send AppendEntries (new entries, or empty heartbeat) often","on AppendEntries: if my log matches at prevIndex, store the entries, reply ok","  else reply no; leader moves nextIndex back by one and retries (repair)","entry of the current term on a majority: committed","any message with a newer term: step down to follower","client write: leader adds x = v to its log"],
  run(v, R){ raftRun(v, R); },
  draw(s){ return raftDraw(s); } });
const RPOS = Array.from({length:5}, (x,i)=>{ const a = -Math.PI/2 + i*2*Math.PI/5; return [Math.round(160 + 104*Math.cos(a)), Math.round(158 + 104*Math.sin(a))]; });
const tcol = t => t ? SCOL[(t-1) % SCOL.length] : "var(--line-strong)";
function raftDraw(s){
  const R0 = 27, lead = s.lead;
  let g = "", m = "";
  if(s.part!==null){ const [x,y] = RPOS[s.part]; g += `<circle cx="${x}" cy="${y}" r="${R0+15}" class="rf-cut"/>`; }
  s.S.forEach((sv,i)=>{ const [x,y] = RPOS[i], role = !sv.up ? "down" : sv.role==="L" ? "leader" : sv.role==="C" ? "candidate" : "follower";
    const cls = !sv.up ? "down" : sv.role==="L" ? "lead" : sv.role==="C" ? "cand" : "fol";
    let arc = "";
    if(sv.up && sv.role!=="L" && sv.tmax){ const C = 2*Math.PI*(R0+5), f = Math.max(0, Math.min(1, sv.timer/sv.tmax));
      arc = `<circle cx="${x}" cy="${y}" r="${R0+5}" class="rf-tm" style="stroke-dasharray:${(C*f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${x} ${y})"/>`; }
    const ly = y > 158 ? y + R0 + 20 : y - R0 - 13, sub = role + (sv.role==="C" && sv.up ? ` · ${sv.votes} vote${sv.votes===1?"":"s"}` : "");
    g += `<g class="rf-s ${cls}">${arc}<circle cx="${x}" cy="${y}" r="${R0}" class="rf-c" style="--tc:${tcol(sv.term)}"/><text x="${x}" y="${y-2}" text-anchor="middle" class="rf-n">${SN(i)}</text><text x="${x}" y="${y+12}" text-anchor="middle" class="sub">term ${sv.term}</text>`
      + (!sv.up ? `<path d="M${x+15},${y-26} l9,9 m0,-9 l-9,9" class="rf-x"/>` : "")
      + `<text x="${x}" y="${ly}" text-anchor="middle" class="rf-role">${sub}</text></g>`; });
  s.M.forEach(q=>{ const [ax,ay] = RPOS[q.f], [bx,by] = RPOS[q.to], L = Math.hypot(bx-ax, by-ay), ux = (bx-ax)/L, uy = (by-ay)/L, side = q.f < q.to ? 1 : -1;
    const ox = -uy*5*side, oy = ux*5*side, x1 = ax + ux*(R0+4) + ox, y1 = ay + uy*(R0+4) + oy, x2 = bx - ux*(R0+4) + ox, y2 = by - uy*(R0+4) + oy;
    const x = x1 + (x2-x1)*q.p, y = y1 + (y2-y1)*q.p;
    const kind = q.ty==="RV" ? "rv" : q.ty==="VR" ? (q.ok ? "yes" : "no") : q.ty==="AE" ? (q.n ? "ae ent" : "ae") : (q.ok ? "ar" : "ar no");
    const shape = q.ty==="AE" && q.n ? `<rect x="${(x-6).toFixed(1)}" y="${(y-6).toFixed(1)}" width="12" height="12" rx="2"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${q.ty==="AR"||q.ty==="VR"?4.5:5.5}"/>`;
    m += `<g class="rf-m ${kind}${q.lost?" lost":""}" data-flip="m${q.id}">${shape}${q.lost ? `<path d="M${(x-5).toFixed(1)},${(y-5).toFixed(1)} l10,10 m0,-10 l-10,10" class="rf-x"/>` : ""}</g>`; });
  const ring = `<svg class="av-svg rf-ring" viewBox="0 0 320 312" role="img" aria-label="Five Raft servers in a ring. ${lead>=0 ? SN(lead) + " is the leader in term " + s.S[lead].term : "No leader"}.">${g}${m}</svg>`;
  // logs: one row per server, a cell per entry, coloured by term; the bar under a row reaches its commit index
  const maxLen = Math.max(6, ...s.S.map(x=>x.log.length)), CW = 30, LX = 46, W = LX + maxLen*CW + 6, RH = 44, H = 22 + 5*RH;
  let lg = "";
  for(let j=0;j<maxLen;j++) lg += `<text x="${LX + j*CW + CW/2}" y="14" text-anchor="middle" class="sub">${j+1}</text>`;
  s.S.forEach((sv,i)=>{ const y = 22 + i*RH, nx = lead>=0 && i!==lead && s.S[lead].next ? s.S[lead].next[i] : 0;
    lg += `<g class="rf-row${sv.up?"":" down"}${i===lead?" lead":""}"><text x="6" y="${y+16}" class="rf-n">${SN(i)}</text><text x="6" y="${y+29}" class="sub">${!sv.up?"down":sv.role==="L"?"leader":"c " + sv.commit}</text>`;
    sv.log.forEach(([t,v],j)=>{ const x = LX + j*CW, cm = j < sv.commit;
      lg += `<g class="rf-e${cm?" cm":""}" style="--tc:${tcol(t)}"><rect x="${x+1}" y="${y}" width="${CW-2}" height="32" rx="4"/><text x="${x+CW/2}" y="${y+14}" text-anchor="middle">x=${v}</text><text x="${x+CW/2}" y="${y+27}" text-anchor="middle" class="t">t${t}</text></g>`; });
    if(sv.commit) lg += `<rect x="${LX+1}" y="${y+34}" width="${sv.commit*CW-2}" height="3.5" rx="1.5" class="rf-cbar"/>`;
    if(nx && sv.up) lg += `<path d="M${LX + (nx-1)*CW + CW/2 - 4},${y+43} l4,-5 l4,5 z" class="rf-next"><title>leader's next index for ${SN(i)}: ${nx}</title></path>`;
    lg += `</g>`; });
  const logs = `<svg class="av-svg rf-logs" viewBox="0 0 ${W} ${H}" style="width:${W}px" role="img" aria-label="Logs of the five servers">${lg}</svg>`;
  const legend = `<p class="av-aux rf-key"><span><i class="rf-k rv"></i>vote request</span><span><i class="rf-k yes"></i>vote yes</span><span><i class="rf-k no"></i>no (vote or reply)</span><span><i class="rf-k ae"></i>heartbeat</span><span><i class="rf-k ent"></i>AppendEntries with entries</span><span><i class="rf-k ar"></i>reply</span><span><i class="rf-k x">✕</i>lost</span></p>`;
  const lab = lead>=0 ? `leader ${SN(lead)}, term ${s.S[lead].term}` : "no leader";
  return `<div class="av-raft"><div class="rf-left">${ring}</div><div class="rf-right"><div class="av-h mono">Logs · solid = committed</div><div class="rf-logw">${logs}</div><p class="av-aux">Cells show the command and its term (colour = term). The green bar ends at each server's commit index (c); ▲ is where the leader will send next.</p></div></div>${legend}<p class="av-aux mono">time ${s.t} · ${lab}${s.part!==null?` · ${SN(s.part)} is cut off`:""}</p>`;
}

def({ id:"trie", group:"Data structures", title:"Trie: insert, search and prefix counts", concepts:["trees","fst","invindex"],
  text:"A trie stores words letter by letter along paths from the root, so words with a common prefix share nodes. Insert and search cost O(length of the word), independent of how many words are stored. Each node also keeps a count of the words that pass through it, so \"how many words start with ca?\" is one walk down and one number. Autocomplete, routing tables (longest prefix match) and the term dictionaries in search engines build on it.",
  inputs:[{k:"ops", label:"Operations (insert, search, prefix, count)", def:"insert car, insert cat, insert cart, insert care, insert dog, insert do, search cat, search ca, prefix ca, count ca, search cow"}],
  random:()=>{ const w = ["car","cat","cart","care","cap","dog","do","dot","door","card"].sort(()=>Math.random()-.5).slice(0,6); return {ops:w.map(x=>"insert "+x).concat(["search "+w[0], "count "+w[1].slice(0,2), "prefix "+w[2].slice(0,1)]).join(", ")}; },
  counters:["steps"],
  code:["insert(w): if w is already a word: stop","  node = root; for each letter c in w:","    if node has no child c: create it","    node = node.child[c]; node.count += 1","  mark node as the end of a word","search(w) / prefix(p): follow each letter from the root","  a letter is missing: not found","  search: found only if the last node ends a word","count(p): walk p, then read node.count"],
  run(v, R){ const T = {0:{c:"·", kids:{}, end:false, n:0}}; let nid = 1;
    const S = o => Object.assign({T}, o);
    const walk = w => { let node = 0; for(const c of w){ const nx = T[node].kids[c]; if(nx===undefined) return -1; node = nx; } return node; };
    R.step(0, "An empty trie: just the root. The small number under a node is how many words pass through it.", S({}));
    for(const [cmd, w] of ops(v.ops)){ if(!w || !["insert","search","prefix","count"].includes(cmd) || !/^[a-z]{1,10}$/.test(w)) throw new Error('Write "insert word", "search word", "prefix ab" or "count ab" (lowercase letters, up to 10).');
      if(nid > 40) throw new Error("The trie got too big to draw. Use fewer words.");
      let node = 0; const path = [0];
      if(cmd==="insert"){ const at = walk(w);
        if(at >= 0 && T[at].end){ R.step(0, `insert "${w}": it is already a word, so nothing changes (the counts stay right).`, S({path:[], cur:at, ok:true})); continue; }
        R.step(1, `insert "${w}": start at the root.`, S({path:path.slice()}));
        for(const c of w){ R.inc("steps"); let made = false; if(!T[node].kids[c]){ T[nid] = {c, kids:{}, end:false, n:0}; T[node].kids[c] = nid++; made = true; }
          node = T[node].kids[c]; T[node].n++; path.push(node);
          R.step(made ? 2 : 3, made ? `No child '${c}': create it. Its count is ${T[node].n}.` : `Follow the existing child '${c}'; its count goes up to ${T[node].n}.`, S({path:path.slice(), cur:node, add:made})); }
        T[node].end = true; R.step(4, `Mark the last node: "${w}" is a word.`, S({path:path.slice(), cur:node, ok:true})); continue; }
      R.step(5, `${cmd} "${w}": start at the root.`, S({path:path.slice()}));
      let lost = false;
      for(const c of w){ R.inc("steps"); const nx = T[node].kids[c]; if(nx===undefined){ R.step(6, cmd==="count" ? `No child '${c}': no word starts with "${w}", the count is 0.` : `No child '${c}': "${w}" is not ${cmd==="prefix"?"a prefix of any word":"in the trie"}.`, S({path:path.slice(), cur:node, miss:true})); lost = true; break; }
        node = nx; path.push(node); R.step(5, `Follow '${c}'.`, S({path:path.slice(), cur:node})); }
      if(lost) continue;
      if(cmd==="count") R.step(8, `The node for "${w}" has count ${T[node].n}: ${T[node].n} word${T[node].n===1?"":"s"} start${T[node].n===1?"s":""} with "${w}". No need to visit them.`, S({path:path.slice(), cur:node, ok:true}));
      else if(cmd==="prefix"){ const words = []; const go = (n, pre) => { if(T[n].end) words.push(pre); Object.keys(T[n].kids).sort().forEach(c=>go(T[n].kids[c], pre+c)); }; go(node, w);
        R.step(5, `Every word under this node starts with "${w}": ${words.join(", ")||"none"}.`, S({path:path.slice(), cur:node, ok:true})); }
      else R.step(7, T[node].end ? `The last node ends a word: "${w}" is found.` : `The path exists, but the last node does not end a word: "${w}" is only a prefix.`, S({path:path.slice(), cur:node, ok:T[node].end, miss:!T[node].end})); }
    R.step(4, "Done.", S({})); },
  draw(s){ const nodes = {}, on = new Set(s.path||[]);
    Object.entries(s.T).forEach(([id,n])=>{ nodes[id] = {label:n.c, end:n.end, sub:+id ? n.n : undefined, kids:Object.keys(n.kids).sort().map(c=>String(n.kids[c])), cls:(+id===s.cur?(s.miss?"miss":s.ok?"done":"cur"):on.has(+id)?"cmp":""), ecls:on.has(+id)?"hot":""}; });
    return treeSVG(nodes, ["0"], {label:"Trie", ux:34, uy:54, r:14}) + `<p class="av-aux">A double circle marks the end of a word. The number under a node counts the words that pass through it.</p>`; } });

/* ---- B-tree ---- */
const BT_OPS = "insert 10 20 5 6 12 30 7 17 3 4 25 28 15 1 9, search 17, search 13";
function btParse(str){
  const out = [];
  ops(str).forEach(o=>{ if(!["insert","search"].includes(o[0]) || o.length < 2) throw new Error('Write "insert 10 20 5" or "search 17".');
    o.slice(1).forEach(x=>{ const k = Number(x); if(!Number.isInteger(k) || k < 0 || k > 999) throw new Error(`Keys are whole numbers from 0 to 999. Could not read "${x}".`); out.push([o[0], k]); }); });
  if(out.filter(x=>x[0]==="insert").length > 32) throw new Error("At most 32 inserts, so the tree stays readable.");
  return out;
}
const btFmt = keys => `[${keys.join(", ")}]`;
const btWhy = (keys, k, i) => i===0 ? `${k} < ${keys[0]}` : i===keys.length ? `${k} > ${keys[keys.length-1]}` : `${k} is between ${keys[i-1]} and ${keys[i]}`;
function btKeys(N){ return Object.values(N).flatMap(n=>n.keys); }
def({ id:"btree", group:"Data structures", title:"B-tree: insert, split and search", concepts:["btree","indexing","trees"],
  text:"A B-tree keeps sorted keys in wide nodes: each node holds up to M keys and M + 1 children, and all leaves are at the same depth. Insert walks down to a leaf and puts the key there. A leaf that gets one key too many splits at its median: the median moves up into the parent, which may split too. When the root splits, the tree grows one level at the top. In a database each node is one disk page with hundreds of keys, so a lookup reads only 3 or 4 pages.",
  inputs:[{k:"m", label:"Max keys per node (M)", def:"3", w:4},{k:"ops", label:"Operations", def:BT_OPS}],
  presets:[{name:"Ascending keys", v:{m:"3", ops:"insert 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16, search 11"}},{name:"2-3 tree (M = 2)", v:{m:"2", ops:BT_OPS}}],
  random:()=>{ const ks = [...new Set(Array.from({length:rint(12,16)},()=>rint(1,99)))]; return {ops:"insert " + ks.join(" ") + ", search " + ks[rint(0,ks.length-1)] + ", search " + rint(1,99)}; },
  counters:["vis","split"], clabel:{vis:"node visits"},
  live:{ title:"Try a key", fields:[{k:"key", label:"Key", def:"", w:4, mode:"numeric"}], buttons:[{id:"ins", label:"Insert", primary:true},{id:"find", label:"Search"},{id:"rnd", label:"Insert a random key"}],
    note:"The key is added to the operations above and the tree animates it from the root." },
  act(vals, id, fv, f){
    const list = btParse(vals.ops), have = new Set(f && f.s.N ? btKeys(f.s.N) : []);
    let k;
    if(id==="rnd"){ const free = Array.from({length:99},(x,i)=>i+1).filter(x=>!have.has(x)); if(!free.length) throw new Error("Every key from 1 to 99 is already in the tree."); k = free[rint(0, free.length-1)]; }
    else { const t = String(fv.key||"").trim(); if(!/^\d{1,3}$/.test(t)) throw new Error("Type a key: a whole number from 0 to 999."); k = +t; }
    const cmd = id==="find" ? "search" : "insert";
    return {v:Object.assign({}, vals, {ops:(String(vals.ops||"").trim() ? String(vals.ops).trim() + ", " : "") + cmd + " " + k}), seek:list.length};
  },
  code:["insert(k): node = root","while node is not a leaf:","  go to the child whose key range holds k","put k into the leaf, in sorted order","while node has more than M keys:","  split it at the median key: left half, right half","  push the median up into the parent","  if node was the root: the median is a new root (tree grows)","search(k): node = root","  if k is a key of node: found","  else go to the child whose range holds k (leaf: not found)"],
  run(v, R){ const M = nums(v.m, 2, 5, 1)[0], list = btParse(v.ops), N = {}; let nid = 0;
    const mk = (keys, kids) => { const id = "n" + (nid++); N[id] = {keys, kids:kids||[]}; return id; };
    let root = mk([]);
    const height = () => { let h = 1, x = root; while(N[x].kids.length){ x = N[x].kids[0]; h++; } return h; };
    const S = (op, o) => Object.assign({N, root, M, seek:op, h:height(), n:btKeys(N).length}, o);
    R.step(0, `An empty B-tree. Each node holds at most ${M} keys and ${M+1} children.`, S(-1, {}));
    list.forEach(([cmd, k], op) => {
      let x = root; const path = [x];
      if(cmd==="search"){ let n = 0;
        for(;;){ n++; R.inc("vis"); const nd = N[x], pre = n===1 ? `search ${k}: start at the root. ` : "";
          if(nd.keys.includes(k)){ R.step(9, `${pre}${btFmt(nd.keys)} holds ${k}: found after ${n} node visit${n===1?"":"s"}.`, S(op, {cur:x, path:path.slice(), tok:{k, at:x, q:true}, kh:{[k]:"done"}, found:true})); return; }
          if(!nd.kids.length){ R.step(10, `${pre}Leaf ${btFmt(nd.keys)} has no ${k}, and there is no child to go to: not found (${n} node visit${n===1?"":"s"}).`, S(op, {cur:x, path:path.slice(), tok:{k, at:x, q:true}, miss:x})); return; }
          const i = nd.keys.filter(y=>y<k).length;
          R.step(10, `${pre}At ${btFmt(nd.keys)}: ${btWhy(nd.keys, k, i)}, so go down to child ${i+1}.`, S(op, {cur:x, path:path.slice(), tok:{k, at:x, q:true}, ek:[x, i]}));
          x = nd.kids[i]; path.push(x); } }
      // insert: walk down to a leaf
      for(let first = true;; first = false){ R.inc("vis"); const nd = N[x], pre = first ? `insert ${k}: start at the root. ` : "";
        if(nd.keys.includes(k)){ R.step(9, `${pre}${k} is already in ${btFmt(nd.keys)}. A B-tree keeps each key once, so nothing changes.`, S(op, {cur:x, path:path.slice(), kh:{[k]:"done"}})); return; }
        if(!nd.kids.length){ R.step(1, nd.keys.length ? `${pre}${btFmt(nd.keys)} is a leaf, so ${k} goes here.` : `insert ${k}: the tree is empty, so ${k} goes into the root leaf.`, S(op, {cur:x, path:path.slice(), tok:{k, at:x}})); break; }
        const i = nd.keys.filter(y=>y<k).length;
        R.step(2, `${pre}At ${btFmt(nd.keys)}: ${btWhy(nd.keys, k, i)}, so go down to child ${i+1}.`, S(op, {cur:x, path:path.slice(), tok:{k, at:x}, ek:[x, i]}));
        x = nd.kids[i]; path.push(x); }
      const leaf = N[x]; leaf.keys.push(k); leaf.keys.sort((a,b)=>a-b);
      if(leaf.keys.length <= M){ R.step(3, `The leaf has room: ${k} goes in, in order: ${btFmt(leaf.keys)}.`, S(op, {cur:x, path:path.slice(), kh:{[k]:"new"}})); return; }
      const med0 = leaf.keys[Math.floor((leaf.keys.length-1)/2)];
      R.step(4, `Leaf is full: with ${k} it has ${leaf.keys.length} keys, one more than M = ${M}. It must split at its median ${med0}.`, S(op, {cur:x, over:x, path:path.slice(), kh:{[k]:"new", [med0]:"piv"}}));
      let node = x, pi = path.length-1, what = "the leaf";
      while(N[node].keys.length > M){
        const nd = N[node], mid = Math.floor((nd.keys.length-1)/2), med = nd.keys[mid];
        const right = mk(nd.keys.slice(mid+1), nd.kids.length ? nd.kids.slice(mid+1) : []);
        nd.keys = nd.keys.slice(0, mid); if(nd.kids.length) nd.kids = nd.kids.slice(0, mid+1);
        R.inc("split");
        if(pi===0){ root = mk([med], [node, right]);
          R.step(7, `Split ${what} at median ${med}: ${btFmt(nd.keys)} and ${btFmt(N[right].keys)}. ${what==="the root" ? "" : "It was the root, so "}${med} becomes a new root${what==="the root" ? ", so" : " and"} the tree grows one level taller (height ${height()}).`, S(op, {cur:root, split:[node, right], kh:{[med]:"up"}}));
          break; }
        const par = path[pi-1], pn = N[par], ci = pn.kids.indexOf(node);
        pn.keys.splice(ci, 0, med); pn.kids.splice(ci+1, 0, right);
        R.step(6, `Split ${what} at median ${med}: ${btFmt(nd.keys)} and ${btFmt(N[right].keys)}. Push ${med} up into the parent: ${btFmt(pn.keys)}.`, S(op, {cur:par, split:[node, right], kh:{[med]:"up"}}));
        node = par; pi--; what = pi===0 ? "the root" : "this node";
        if(pn.keys.length > M){ const m2 = pn.keys[Math.floor((pn.keys.length-1)/2)];
          R.step(4, `Now the parent has ${pn.keys.length} keys, more than M = ${M}: it must split too, at median ${m2}.`, S(op, {cur:par, over:par, kh:{[m2]:"piv"}})); }
      } });
    R.step(0, `Done: ${btKeys(N).length} keys, height ${height()}, ${Object.keys(N).length} nodes. Every leaf is at the same depth.`, S(list.length, {})); },
  draw(s){ return btDraw(s); } });
function btDraw(s){
  const CW = 26, CH = 28, PAD = 3, GAP = 12, UY = 70, TOP = 38, MX = 8, N = s.N, P = {}; let cur = MX;
  const width = id => Math.max(1, N[id].keys.length)*CW + 2*PAD;
  const lay = (id, d) => { const n = N[id];
    if(!n.kids.length){ const w = width(id); P[id] = {x:cur + w/2, d, w}; cur += w + GAP; return; }
    n.kids.forEach(c=>lay(c, d+1)); cur += GAP*.5;
    P[id] = {x:(P[n.kids[0]].x + P[n.kids[n.kids.length-1]].x)/2, d, w:width(id)}; };
  lay(s.root, 0);
  const maxD = Math.max(...Object.values(P).map(p=>p.d)), W = Math.max(200, Math.round(cur - GAP*1.5 + MX)), H = TOP + maxD*UY + CH + 14;
  const Y = d => TOP + d*UY, onPath = new Set(s.path||[]), split = new Set(s.split||[]), kh = s.kh || {};
  let e = "", n = "", t = "";
  Object.entries(P).forEach(([id,p])=>{ const nd = N[id], left = p.x - p.w/2;
    nd.kids.forEach((c,i)=>{ const q = P[c]; if(!q) return; const hot = (onPath.has(id) && onPath.has(c)) || (s.ek && s.ek[0]===id && s.ek[1]===i);
      e += `<line x1="${left + PAD + i*CW}" y1="${Y(p.d)+CH}" x2="${q.x}" y2="${Y(q.d)}" class="${hot?"hot":""}"/>`; });
    const cls = [id===s.cur?"cur":"", id===s.over?"over":"", id===s.miss?"miss":"", split.has(id)?"split":"", onPath.has(id)&&id!==s.cur?"path":""].filter(Boolean).join(" ");
    n += `<g class="bn ${cls}"><rect x="${left}" y="${Y(p.d)}" width="${p.w}" height="${CH}" rx="6"/>`;
    for(let j=1;j<nd.keys.length;j++) n += `<line class="sep" x1="${left+PAD+j*CW}" y1="${Y(p.d)+5}" x2="${left+PAD+j*CW}" y2="${Y(p.d)+CH-5}"/>`;
    n += `</g>`;
    nd.keys.forEach((k,j)=>{ const x = left + PAD + j*CW;
      t += `<g class="bk ${kh[k]||""}" data-flip="k${k}"><rect x="${x+2}" y="${Y(p.d)+3}" width="${CW-4}" height="${CH-6}" rx="4"/><text x="${x+CW/2}" y="${Y(p.d)+CH/2+4.5}" text-anchor="middle">${k}</text></g>`; });
    if(!nd.keys.length) t += `<text x="${p.x}" y="${Y(p.d)+CH/2+4}" text-anchor="middle" class="sub">empty</text>`; });
  if(s.tok && P[s.tok.at]){ const p = P[s.tok.at], lab = s.tok.q ? s.tok.k + "?" : String(s.tok.k), w = 12 + lab.length*8;
    t += `<g class="btok${s.tok.q?" q":""}" data-flip="${s.tok.q?"tok":"k"+s.tok.k}"><rect x="${p.x-w/2}" y="${Y(p.d)-27}" width="${w}" height="21" rx="10.5"/><text x="${p.x}" y="${Y(p.d)-12.5}" text-anchor="middle">${esc(lab)}</text></g>`; }
  const svg = `<svg class="av-svg av-bt" viewBox="0 0 ${W} ${H}" style="max-width:${Math.round(W*1.2)}px;min-width:${Math.round(W*.82)}px" role="img" aria-label="B-tree with ${s.n} keys and height ${s.h}">${e}${n}${t}</svg>`;
  return `<div class="av-btw">${svg}</div><p class="av-aux mono">M = ${s.M} keys per node · ${s.n} keys · height ${s.h} · ${Object.keys(N).length} node${Object.keys(N).length===1?"":"s"}</p>`;
}

/* ---- dynamic programming ---- */
function dpDraw(s){
  const T = s.T, path = new Set((s.path||[]).map(p=>p.join(","))), dep = new Set((s.dep||[]).map(p=>p.join(",")));
  const head = [{v:""}, {v:s.colLabel0||"∅"}].concat(s.cols.map(c=>({v:c})));
  const rows = [head].concat(T.map((row,i)=>[{v:i===0?(s.rowLabel0||"∅"):s.rows[i-1]}].concat(row.map((x,j)=>({v:x===null?"":x, cls:(s.cur&&s.cur[0]===i&&s.cur[1]===j?"cur":dep.has(i+","+j)?"cmp":path.has(i+","+j)?"done":"")})))));
  return `<div class="av-dpwrap">${table(rows, {head:true, side:true, cls:"dp"})}</div>${s.note?`<p class="av-aux mono">${esc(s.note)}</p>`:""}`;
}
def({ id:"lcs", group:"Dynamic programming", title:"Longest common subsequence", concepts:["dp","bigo"],
  text:"T[i][j] is the length of the longest common subsequence of the first i letters of A and the first j letters of B. If the letters match, extend the diagonal answer by 1; if not, take the better of dropping a letter from A or from B. Fill the table row by row in O(n·m), then walk back from the corner to read one LCS. diff and git use close relatives of this.",
  inputs:[{k:"a", label:"A", def:"ABCBDAB", w:12},{k:"b", label:"B", def:"BDCABA", w:12}], counters:["cells"],
  code:["T[i][0] = T[0][j] = 0","for i in 1..n, j in 1..m:","  if A[i] == B[j]: T[i][j] = T[i-1][j-1] + 1","  else: T[i][j] = max(T[i-1][j], T[i][j-1])","backtrack from T[n][m]: on a match go diagonal","  and keep the letter, else go to the larger neighbour"],
  run(v, R){ const A = String(v.a||"").trim(), B = String(v.b||"").trim(); if(!A||!B||A.length>9||B.length>9) throw new Error("Use two words of 1 to 9 letters.");
    const n = A.length, m = B.length, T = Array.from({length:n+1},(x,i)=>Array.from({length:m+1},(y,j)=>i===0||j===0?0:null));
    const S = o => Object.assign({T, rows:A.split(""), cols:B.split("")}, o);
    R.step(0, "Row 0 and column 0 are 0: an empty string has nothing in common with anything.", S({}));
    for(let i=1;i<=n;i++) for(let j=1;j<=m;j++){ R.inc("cells");
      if(A[i-1]===B[j-1]){ T[i][j] = T[i-1][j-1]+1; R.step(2, `A[${i}] = B[${j}] = '${A[i-1]}': T[${i}][${j}] = T[${i-1}][${j-1}] + 1 = ${T[i][j]}.`, S({cur:[i,j], dep:[[i-1,j-1]]})); }
      else { T[i][j] = Math.max(T[i-1][j], T[i][j-1]); R.step(3, `'${A[i-1]}' ≠ '${B[j-1]}': T[${i}][${j}] = max(${T[i-1][j]}, ${T[i][j-1]}) = ${T[i][j]}.`, S({cur:[i,j], dep:[[i-1,j],[i,j-1]]})); } }
    let i = n, j = m, out = ""; const path = [[i,j]];
    R.step(4, `The corner says the LCS has length ${T[n][m]}. Walk back to find one.`, S({path:path.slice()}));
    while(i>0 && j>0){ if(A[i-1]===B[j-1]){ out = A[i-1]+out; i--; j--; path.push([i,j]); R.step(4, `Match '${A[i]}': keep it and go diagonal. So far "${out}".`, S({path:path.slice(), note:"LCS: "+out})); }
      else if(T[i-1][j] >= T[i][j-1]){ i--; path.push([i,j]); R.step(5, "No match: go up to the larger neighbour.", S({path:path.slice(), note:"LCS: "+out})); }
      else { j--; path.push([i,j]); R.step(5, "No match: go left to the larger neighbour.", S({path:path.slice(), note:"LCS: "+out})); } }
    R.step(5, `One longest common subsequence is "${out}" (length ${out.length}).`, S({path, note:"LCS: "+out})); },
  draw:dpDraw });

def({ id:"editdist", group:"Dynamic programming", title:"Edit distance (Levenshtein)", concepts:["dp","bigo"],
  text:"T[i][j] is the fewest single-letter edits (insert, delete, replace) that turn the first i letters of A into the first j letters of B. Each cell looks at three neighbours: delete from A (up), insert into A (left), or replace or keep (diagonal). Spell checkers, DNA alignment and fuzzy search use it; it costs O(n·m).",
  inputs:[{k:"a", label:"A", def:"kitten", w:12},{k:"b", label:"B", def:"sitting", w:12}], counters:["cells"],
  code:["T[i][0] = i; T[0][j] = j","for i in 1..n, j in 1..m:","  if A[i] == B[j]: T[i][j] = T[i-1][j-1]   (no cost)","  else: T[i][j] = 1 + min(T[i-1][j]    delete,","                          T[i][j-1]    insert,","                          T[i-1][j-1]  replace)","backtrack from T[n][m] to list the edits"],
  run(v, R){ const A = String(v.a||"").trim(), B = String(v.b||"").trim(); if(A.length>9||B.length>9||(!A&&!B)) throw new Error("Use words of up to 9 letters.");
    const n = A.length, m = B.length, T = Array.from({length:n+1},(x,i)=>Array.from({length:m+1},(y,j)=>i===0?j:j===0?i:null));
    const S = o => Object.assign({T, rows:A.split(""), cols:B.split("")}, o);
    R.step(0, "Row 0: build B's prefix from nothing by inserts. Column 0: delete all of A's prefix.", S({}));
    for(let i=1;i<=n;i++) for(let j=1;j<=m;j++){ R.inc("cells");
      if(A[i-1]===B[j-1]){ T[i][j] = T[i-1][j-1]; R.step(2, `'${A[i-1]}' = '${B[j-1]}': no edit needed, copy the diagonal ${T[i][j]}.`, S({cur:[i,j], dep:[[i-1,j-1]]})); }
      else { T[i][j] = 1 + Math.min(T[i-1][j], T[i][j-1], T[i-1][j-1]); R.step(3, `'${A[i-1]}' ≠ '${B[j-1]}': 1 + min(delete ${T[i-1][j]}, insert ${T[i][j-1]}, replace ${T[i-1][j-1]}) = ${T[i][j]}.`, S({cur:[i,j], dep:[[i-1,j],[i,j-1],[i-1,j-1]]})); } }
    let i = n, j = m; const path = [[i,j]], edits = [];
    R.step(6, `The corner says ${T[n][m]} edits. Walk back to list them.`, S({path:path.slice()}));
    while(i>0 || j>0){
      if(i>0 && j>0 && A[i-1]===B[j-1] && T[i][j]===T[i-1][j-1]){ i--; j--; }
      else if(i>0 && j>0 && T[i][j]===T[i-1][j-1]+1){ edits.unshift(`replace '${A[i-1]}' with '${B[j-1]}'`); i--; j--; }
      else if(i>0 && T[i][j]===T[i-1][j]+1){ edits.unshift(`delete '${A[i-1]}'`); i--; }
      else { edits.unshift(`insert '${B[j-1]}'`); j--; }
      path.push([i,j]); R.step(6, edits.length ? `Edits so far: ${edits.join(", ")}.` : "Matching letters cost nothing; go diagonal.", S({path:path.slice(), note:edits.join(" · ")})); }
    R.step(6, `${A||"(empty)"} → ${B||"(empty)"} in ${T[n][m]} edit${T[n][m]===1?"":"s"}: ${edits.join(", ")||"none"}.`, S({path, note:edits.join(" · ")})); },
  draw:dpDraw });

def({ id:"knapsack", group:"Dynamic programming", title:"0/1 knapsack", concepts:["dp","greedydc","bigo"],
  text:"Pick items with weights and values to get the most value within a weight limit W, using each item at most once. T[i][c] is the best value using only the first i items with capacity c: either skip item i (the cell above) or take it (value plus the best for the capacity that is left). O(n·W) time. Greedy by value per weight fails here, which is the classic reason to reach for DP.",
  inputs:[{k:"w", label:"Weights", def:"1, 3, 4, 5", w:12},{k:"v", label:"Values", def:"1, 4, 5, 7", w:12},{k:"W", label:"Capacity", def:"7", w:5}],
  random:()=>{ const n = rint(3,5); return {w:randArr(n,1,6), v:randArr(n,1,12), W:String(rint(5,10))}; }, counters:["cells"],
  code:["T[0][c] = 0 for every capacity c","for item i in 1..n, capacity c in 0..W:","  T[i][c] = T[i-1][c]   (skip item i)","  if w[i] <= c: T[i][c] = max(T[i][c],","                   T[i-1][c-w[i]] + v[i])   (take item i)","backtrack: if T[i][c] != T[i-1][c], item i was taken"],
  run(v, R){ const w = nums(v.w, 1, 12, 6), val = nums(v.v, 0, 99, 6), W = nums(v.W, 1, 12, 1)[0]; if(w.length!==val.length) throw new Error("Give one value for each weight.");
    const n = w.length, T = Array.from({length:n+1},(x,i)=>Array.from({length:W+1},()=>i===0?0:null));
    const S = o => Object.assign({T, rows:w.map((x,i)=>`#${i+1} w${x} v${val[i]}`), cols:Array.from({length:W},(x,c)=>c+1), rowLabel0:"none", colLabel0:"0"}, o);
    R.step(0, "With no items, every capacity is worth 0.", S({}));
    for(let i=1;i<=n;i++) for(let c=0;c<=W;c++){ R.inc("cells"); T[i][c] = T[i-1][c];
      if(w[i-1] <= c){ const take = T[i-1][c-w[i-1]] + val[i-1]; if(take > T[i][c]){ T[i][c] = take; R.step(4, `Item ${i} (w ${w[i-1]}, v ${val[i-1]}) at capacity ${c}: take it, ${T[i-1][c-w[i-1]]} + ${val[i-1]} = ${take} beats skipping (${T[i-1][c]}).`, S({cur:[i,c], dep:[[i-1,c],[i-1,c-w[i-1]]]})); }
        else R.step(3, `Item ${i} at capacity ${c}: taking gives ${take}, skipping gives ${T[i-1][c]}. Skip.`, S({cur:[i,c], dep:[[i-1,c],[i-1,c-w[i-1]]]})); }
      else R.step(2, `Item ${i} weighs ${w[i-1]}, more than ${c}: it cannot fit, copy ${T[i][c]} from above.`, S({cur:[i,c], dep:[[i-1,c]]})); }
    let c = W; const path = [[n,c]], take = [];
    R.step(5, `The best value is ${T[n][W]}. Walk back to see which items give it.`, S({path:path.slice()}));
    for(let i=n;i>0;i--){ if(T[i][c]!==T[i-1][c]){ take.unshift(i); c -= w[i-1]; R.step(5, `T[${i}] differs from the row above: item ${i} was taken. Capacity left: ${c}.`, S({path:path.concat([[i-1,c]]), note:"take: "+take.map(x=>"#"+x).join(", ")})); }
      else R.step(5, `Same as the row above: item ${i} was skipped.`, S({path:path.concat([[i-1,c]]), note:"take: "+take.map(x=>"#"+x).join(", ")})); path.push([i-1,c]); }
    R.step(5, `Take items ${take.map(x=>"#"+x).join(", ")||"none"}: weight ${take.reduce((s,x)=>s+w[x-1],0)}, value ${T[n][W]}.`, S({path, note:"take: "+take.map(x=>"#"+x).join(", ")})); },
  draw:dpDraw });

/* ================= interview patterns: each one pairs with a template in content/practice/templates.json ================= */
Object.assign(COUNT, {push:"pushes", pop:"pops", calls:"calls", depth:"deepest stack", memo:"cache hits", prune:"pruned", sol:"answers",
  nodes:"nodes visited", w:"total weight", look:"map lookups", check:"feasibility checks", ev:"events", cross:"crossed out", shift:"shifts"});
const ARROWH = `<defs><marker id="av-arrh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hot"/></marker></defs>`;
/* a drawing that may be wider than a phone: it keeps a readable size (at least `min` of its width) and scrolls inside its own frame */
const wide = (W, H, body, label, min, cls) => `<div class="av-scroll"><svg class="av-svg${cls?" "+cls:""}" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;min-width:${Math.min(W, Math.round(W*(min||.8)))}px" role="img" aria-label="${esc(label)}">${body}</svg></div>`;
/* a stack drawn top first; items [{t, cls}] from bottom to top */
function stackHTML(title, items, empty, out){
  return `<div class="av-stack" role="list" aria-label="${esc(title)}, top first"><div class="av-h mono">${esc(title)}</div>${out?`<div class="sti out">${out}</div>`:""}${items.length ? items.slice().reverse().map((x,i)=>`<div class="sti ${x.cls||""}" role="listitem">${i===0?'<span class="tp mono">top</span>':""}${x.t}</div>`).join("") : `<div class="sti nil mono">${esc(empty||"empty")}</div>`}</div>`;
}
/* rows of boxes in one SVG, so ranges and offsets line up: rows [{label, cells:[{v, cls}], off}] (off = -0.5 puts a cell on the fence between two others) */
function rowsSVG(rows, o){
  o = o || {}; const PW = o.pw || 36, CW = PW - 4, CH = 28, LX = o.lx === undefined ? 40 : o.lx, RH = 46, TOP = o.top || 18;
  const n = Math.max(...rows.map(r=>r.cells.length + (r.off||0))), W = LX + n*PW + 8, H = TOP + rows.length*RH + (o.extra||0);
  let g = "";
  if(o.index!==false) for(let i=0;i<(o.index||rows[0].cells.length);i++) g += `<text x="${LX + (i + (o.idxOff||0))*PW + PW/2}" y="${TOP-5}" text-anchor="middle" class="sub">${i}</text>`;
  rows.forEach((r,ri)=>{ const y = TOP + ri*RH + 6;
    g += `<text x="${LX-8}" y="${y+CH/2+4}" text-anchor="end" class="rl">${esc(r.label)}</text>`;
    r.cells.forEach((c,i)=>{ const x = LX + (i + (r.off||0))*PW + 2; c = c && typeof c==="object" ? c : {v:c};
      g += `<g class="rc ${c.cls||""}"${c.focus?" data-focus":""}><rect x="${x}" y="${y}" width="${CW}" height="${CH}" rx="5"/><text x="${x+CW/2}" y="${y+CH/2+4.5}" text-anchor="middle">${esc(c.v===null||c.v===undefined?"":c.v)}</text>${c.sub!==undefined?`<text x="${x+CW/2}" y="${y+CH+11}" text-anchor="middle" class="sub">${esc(c.sub)}</text>`:""}</g>`; });
    (r.spans||[]).forEach(sp=>{ const x1 = LX + (sp[0] + (r.off||0))*PW + 2, x2 = LX + (sp[1] + (r.off||0))*PW + CW + 2;
      g += `<path d="M${x1},${y-3} v-4 H${x2} v4" class="span ${sp[2]||""}"/>`; }); });
  return wide(W, H, g + (o.add ? o.add(LX, PW, TOP, RH) : ""), o.label || "Array", o.min || .8);
}
const fmtInf = x => x===null || x===undefined ? "" : x >= 1e9 ? "∞" : x <= -1e9 ? "-∞" : x;

/* ---- monotonic stack ---- */
const MS_MODES = [{v:"next", label:"Next greater element", set:{a:"2, 7, 3, 5, 4, 6, 8, 1"}},
  {v:"temps", label:"Daily temperatures (days to wait)", set:{a:"73, 74, 75, 71, 69, 72, 76, 73"}},
  {v:"hist", label:"Largest rectangle in a histogram", set:{a:"2, 1, 5, 6, 2, 3"}}];
def({ id:"monostack", group:"Arrays & strings", title:"Monotonic stack: next greater element", concepts:["amortized","bigo","callstack"],
  text:v=>v.mode==="hist" ? "For each bar, find how far it can stretch before a lower bar stops it. Keep a stack of bar indexes whose heights go up from bottom to top. When a lower bar arrives, every taller bar on the stack has found its right edge (the new bar) and its left edge (the bar under it on the stack): pop it and measure height × width. A last bar of height 0 empties the stack. Each bar is pushed once and popped once, so it is O(n)."
    : "Keep a stack of indexes still waiting for a bigger value; their values go down from bottom to top. A new value that beats the top answers it: pop the top and write the answer, and keep popping while the new value wins. Then push the new index. Each index is pushed once and popped at most once, so the scan is O(n) instead of O(n²). The arcs show which value answered which.",
  inputs:[{k:"mode", label:"Problem", def:"next", opts:MS_MODES},{k:"a", label:"Numbers (up to 14, from 0 to 99)", def:"2, 7, 3, 5, 4, 6, 8, 1"}],
  random:()=>({a:randArr(rint(7,11), 1, 30)}), counters:["push","pop","cmp"],
  code:v=>v.mode==="hist"
    ? ["stack = []; best = 0   (indexes; heights go up)","for i from 0 to n   (bar n has height 0):","  while stack and h[top] >= h[i]:","    j = stack.pop(); left = new top, or -1","    best = max(best, h[j] * (i - left - 1))","  stack.push(i)","return best"]
    : ["ans = [" + (v.mode==="temps"?"0":"-1") + "] * n; stack = []   (indexes; values go down)","for i from 0 to n-1:","  while stack and a[top] < a[i]:", v.mode==="temps" ? "    j = stack.pop(); ans[j] = i - j   (days to wait)" : "    j = stack.pop(); ans[j] = a[i]","  stack.push(i)", "the rest of the stack never meets a bigger value"],
  run(v, R){ const mode = MS_MODES.some(m=>m.v===v.mode) ? v.mode : "next", a = nums(v.a, 0, 99, 14), n = a.length, ans = Array(n).fill(null), st = [], links = [];
    let best = 0, bestR = null;
    const S = o => Object.assign({a, mode, ans:ans.slice(), st:st.slice(), links:links.slice(), best, bestR}, o);
    if(mode==="hist"){
      const h = a.concat([0]);
      R.step(0, `Find the largest rectangle under ${n} bars. An extra bar of height 0 at the end will empty the stack.`, S({}));
      for(let i=0;i<=n;i++){
        R.step(1, i<n ? `Look at bar ${i} (height ${h[i]}).` : "The extra bar of height 0: every bar still on the stack gets measured now.", S({i}));
        while(st.length && h[st[st.length-1]] >= h[i]){ R.inc("cmp"); const j = st.pop(); R.inc("pop"); const left = st.length ? st[st.length-1] : -1, w = i-left-1, area = h[j]*w, better = area > best;
          if(better){ best = area; bestR = [left+1, i-1, h[j]]; }
          ans[j] = area; links.push([j, i]);
          R.step(better ? 4 : 3, `Bar ${i} (${h[i]}) is not taller than bar ${j} (${h[j]}), so pop ${j}. Bar ${j} reaches from ${left+1} to ${i-1}: ${left<0 ? "nothing lower on its left" : `bar ${left} below it on the stack is lower`}. Area ${h[j]} × ${w} = ${area}${better ? ": a new best." : "."}`, S({i, j, rect:[left+1, i-1, h[j]]})); }
        if(st.length && i<n) R.inc("cmp");
        if(i<n){ st.push(i); R.inc("push"); R.step(5, `Push bar ${i}${st.length>1 ? ` (bar ${st[st.length-2]} below it is lower, so stop popping)` : ""}. Heights on the stack still go up.`, S({i, push:i})); } }
      R.step(6, bestR ? `The largest rectangle has area ${best}: bars ${bestR[0]} to ${bestR[1]}, height ${bestR[2]}. ${R.c.push} pushes and ${R.c.pop} pops for ${n} bars: O(n).` : "Every bar has height 0, so the largest area is 0.", S({end:true, rect:bestR}));
      return; }
    const word = mode==="temps" ? "a warmer day" : "a bigger value";
    R.step(0, `Scan ${n} values from left to right. The stack holds indexes still waiting for ${word}.`, S({}));
    for(let i=0;i<n;i++){
      R.step(1, `Look at a[${i}] = ${a[i]}.`, S({i}));
      while(st.length && a[st[st.length-1]] < a[i]){ R.inc("cmp"); const j = st.pop(); R.inc("pop"); ans[j] = mode==="temps" ? i-j : a[i]; links.push([j, i]);
        R.step(3, mode==="temps" ? `${a[i]} > ${a[j]}: day ${j} waits ${i-j} day${i-j===1?"":"s"} for a warmer one. Pop ${j}.` : `${a[i]} > ${a[j]}: a[${i}] is the next greater element of a[${j}]. Pop ${j}; its answer is ${a[i]}.`, S({i, j})); }
      if(st.length) R.inc("cmp");
      st.push(i); R.inc("push");
      R.step(4, `Push ${i}${st.length>1 ? ` (the top before it, ${a[st[st.length-2]]}, is not smaller than ${a[i]}, so popping stopped)` : ""}. The stack's values still go down.`, S({i, push:i})); }
    const left = st.slice(); left.forEach(j=>{ ans[j] = mode==="temps" ? 0 : -1; });
    R.step(5, `${left.length ? `Index${left.length===1?"":"es"} ${left.join(", ")} never met ${word}: the answer stays ${mode==="temps"?0:-1}.` : "Every index found its answer."} ${R.c.push} pushes and ${R.c.pop||0} pops for ${n} values: O(n).`, S({end:true, rest:left})); },
  draw(s){ const a = s.a, n = a.length, hist = s.mode==="hist", m = n + (hist?1:0), BW = 24, PW = 30, X0 = 8, HH = 120, TOP = 40, max = Math.max(...a, 1);
    const x = i => X0 + i*PW, hy = v => TOP + HH - Math.round(HH*v/max), base = TOP + HH, W = X0*2 + m*PW - (PW-BW), H = base + 34;
    const st = new Set(s.st), rest = new Set(s.rest||[]);
    let g = ARROWH;
    if(s.rect){ const [l, r, ht] = s.rect; if(r >= l) g += `<rect x="${x(l)-2}" y="${hy(ht)}" width="${x(r)+BW-x(l)+4}" height="${base-hy(ht)}" class="ms-rect${s.end?" best":""}"/>`; }
    for(let i=0;i<m;i++){ const v = i<n ? a[i] : 0, cls = i===s.j ? "pop" : i===s.i ? "cur" : rest.has(i) ? "rest" : st.has(i) ? "stk" : s.ans[i]!==null && i<n ? "done" : "";
      g += `<g class="ms-b ${cls}${i>=n?" ghost":""}"${i===s.i?" data-focus":""}><rect x="${x(i)}" y="${Math.min(hy(v), base-2)}" width="${BW}" height="${Math.max(2, base-hy(v))}" rx="3"/><text x="${x(i)+BW/2}" y="${base+14}" text-anchor="middle">${v}</text><text x="${x(i)+BW/2}" y="${base+28}" text-anchor="middle" class="sub">${i}</text></g>`; }
    s.links.forEach(([j,i],k)=>{ const hot = k===s.links.length-1 && s.j===j, x1 = x(j)+BW/2, x2 = x(i)+BW/2, y1 = hy(a[j])-3, y2 = hy(i<n?a[i]:0)-3, top = Math.max(4, Math.min(y1, y2) - 12 - Math.min(20, (i-j)*4));
      g += `<path d="M${x1},${y1} C${x1},${top} ${x2},${top} ${x2},${y2}" class="ms-arc${hot?" hot":""}"${hot?' marker-end="url(#av-arrh)"':""}/>`; });
    const items = s.st.map(j=>({t:`<span class="mono">${j}</span><b>${a[j]}</b>`, cls:j===s.push?"new":""}));
    const ans = s.ans.map((x,i)=>({v:x===null?"·":x, cls:i===s.j?"done":rest.has(i)?"cmp":""}));
    return `<div class="av-ms"><div class="ms-chart">${wide(W, H, g, `Bars for ${n} values; the stack holds ${s.st.length}`, .85)}</div>${stackHTML("stack (index, value)", items, "empty", s.j!==undefined ? `<span class="mono">${s.j}</span><b>${a[s.j]}</b><span class="mono">just popped</span>` : "")}</div>
      ${rowsSVG([{label:hist?"area":"ans", cells:ans}], {lx:40, pw:30, label:"Answers", index:n})}
      <p class="av-aux">${hist ? `area = the biggest rectangle that uses bar i as its lowest bar. Best so far: ${s.best}.` : "An arc goes from each value to the value that answered it."}</p>`; } });

/* ---- sliding window with counts ---- */
const W2_MODES = [{v:"kdist", label:"Longest with at most K distinct letters", set:{s:"eceebaaccbd", p:"2"}},
  {v:"minwin", label:"Shortest window that contains T", set:{s:"ADOBECODEBANC", p:"ABC"}},
  {v:"anagram", label:"Anagrams of P (fixed size window)", set:{s:"cbaebabacd", p:"abc"}}];
def({ id:"window2", group:"Arrays & strings", title:"Sliding window with counts", concepts:["hashtables","bigo","amortized"],
  text:v=>v.mode==="minwin" ? "Grow the window on the right until it is valid (it holds every letter of T as often as T needs it). Then shrink it from the left while it stays valid, recording the shortest. A count map and one number (how many letters are fully covered) make each check O(1), and each pointer only moves forward: O(n)."
    : v.mode==="anagram" ? "The window always has exactly len(P) letters: one letter enters on the right and one leaves on the left. Keep a count of the letters inside; when the counts equal P's counts, the window is an anagram of P. O(n) moves, with a count compare for each window."
    : "Grow the window one letter at a time on the right and count the letters inside it. As soon as it has more than K different letters it is invalid, so shrink it from the left until it is valid again; then record its length. Each pointer moves at most n times, so the scan is O(n) instead of checking all O(n²) substrings.",
  inputs:[{k:"mode", label:"Problem", def:"kdist", opts:W2_MODES},{k:"s", label:"Text (up to 24 characters)", def:"eceebaaccbd"},{k:"p", label:v=>v.mode==="minwin"?"T (letters to cover)":v.mode==="anagram"?"P (pattern)":"K", def:"2", w:8}],
  random:v=>{ const al = v.mode==="minwin" ? "ABCDE" : "abcde"; const s = Array.from({length:rint(12,18)},()=>al[rint(0,4)]).join("");
    return {s, p:v.mode==="kdist" ? String(rint(1,3)) : v.mode==="minwin" ? [...new Set(Array.from({length:3},()=>al[rint(0,3)]))].join("") : s.slice(rint(0,8)).slice(0,3)}; },
  counters:["steps","cmp"],
  code:v=>v.mode==="minwin" ? ["need = counts of T; have = 0   (letters fully covered)","for right from 0 to n-1:","  count[s[right]] += 1; if it now equals need: have += 1","  while have == number of different letters in T:","    record the window if it is the shortest so far","    count[s[left]] -= 1; if below need: have -= 1","    left += 1   (shrink while it stays valid)","return the shortest window recorded"]
    : v.mode==="anagram" ? ["need = counts of P; k = len(P); count = {}","for right from 0 to n-1:","  count[s[right]] += 1   (a letter enters)","  if right >= k: count[s[right-k]] -= 1   (a letter leaves)","  if count == need: record right-k+1   (an anagram starts here)"]
    : ["left = 0; count = {}; best = 0","for right from 0 to n-1:","  count[s[right]] += 1   (grow)","  while count has more than K keys:","    count[s[left]] -= 1; delete it at 0; left += 1   (shrink)","  best = max(best, right - left + 1)   (valid: record)"],
  run(v, R){ const mode = W2_MODES.some(m=>m.v===v.mode) ? v.mode : "kdist", s = String(v.s||"").replace(/\s/g,""); if(!s) throw new Error("Type some text."); if(s.length>24) throw new Error("At most 24 characters.");
    const cnt = {}, need = {}; let left = 0, bl = 0, br = -1, found = [], have = 0, req = 0;
    const win = (l, r) => s.slice(l, r+1), D = () => Object.keys(cnt).length;
    const S = (right, o) => Object.assign({s, mode, left, right, cnt:Object.assign({}, cnt), need, best:[bl,br], found:found.slice(), have, req}, o);
    const add = c => { cnt[c] = (cnt[c]||0) + 1; }, drop = c => { cnt[c]--; if(!cnt[c]) delete cnt[c]; };
    if(mode==="kdist"){ const K = nums(v.p, 1, 26, 1)[0];
      R.step(0, `Find the longest part of "${s}" with at most ${K} different letter${K===1?"":"s"}.`, S(-1, {K}));
      for(let right=0; right<s.length; right++){ const c = s[right]; add(c); R.inc("steps");
        R.step(2, `Add '${c}' on the right (count ${cnt[c]}). "${win(left,right)}" has ${D()} different letter${D()===1?"":"s"}${D()>K?`, more than ${K}`:""}.`, S(right, {K, hl:c}));
        while(D() > K){ const o = s[left]; drop(o); left++; R.inc("steps"); R.inc("cmp");
          R.step(4, `Too many different letters: drop '${o}' from the left${cnt[o]?` (${cnt[o]} left inside)`:`; its count is 0, so it leaves the map`}. Now ${D()} different.`, S(right, {K, hl:o, out:left-1})); }
        R.inc("cmp");
        if(right-left+1 > br-bl+1){ bl = left; br = right; R.step(5, `Valid. "${win(left,right)}" has length ${right-left+1}: a new best.`, S(right, {K})); }
        else R.step(5, `Valid. "${win(left,right)}" has length ${right-left+1}; the best is still ${br-bl+1}.`, S(right, {K})); }
      R.step(5, `Done: the longest is "${win(bl,br)}" (length ${br-bl+1}). Each pointer moved at most ${s.length} times: O(n).`, S(s.length-1, {K, end:true})); return; }
    const p = String(v.p||"").replace(/\s/g,""); if(!p) throw new Error(mode==="minwin" ? "Type the letters T to cover." : "Type the pattern P.");
    if(p.length > 10) throw new Error("At most 10 letters in the pattern.");
    for(const c of p) need[c] = (need[c]||0) + 1; req = Object.keys(need).length;
    const needStr = Object.entries(need).map(([c,k])=>k>1?`${k}× '${c}'`:`'${c}'`).join(", ");
    if(mode==="minwin"){ let bestLen = Infinity;
      R.step(0, `Find the shortest part of "${s}" that contains ${needStr}.`, S(-1, {}));
      for(let right=0; right<s.length; right++){ const c = s[right]; add(c); R.inc("steps");
        if(need[c] && cnt[c]===need[c]){ have++; R.step(2, `Add '${c}': now ${cnt[c]} of ${need[c]} needed, so '${c}' is covered. ${have} of ${req} letters covered.`, S(right, {hl:c})); }
        else R.step(2, need[c] ? `Add '${c}' (${cnt[c]} inside, ${need[c]} needed). ${have} of ${req} letters covered.` : `Add '${c}': T does not need it. ${have} of ${req} letters covered.`, S(right, {hl:c}));
        while(have===req){ R.inc("cmp"); const len = right-left+1;
          if(len < bestLen){ bestLen = len; bl = left; br = right; R.step(4, `Every letter is covered: "${win(left,right)}" (length ${len}) is the shortest so far. Try to shrink it.`, S(right, {})); }
          else R.step(4, `Still valid: "${win(left,right)}" (length ${len}), but not shorter than ${bestLen}.`, S(right, {}));
          const o = s[left]; drop(o); left++; R.inc("steps");
          if(need[o] && (cnt[o]||0) < need[o]){ have--; R.step(5, `Drop '${o}' from the left. Now only ${cnt[o]||0} of ${need[o]} '${o}' inside: no longer valid, so grow again.`, S(right, {hl:o, out:left-1})); }
          else R.step(6, `Drop '${o}' from the left; ${need[o] ? `still ${cnt[o]} '${o}' inside, enough` : "T does not need it"}.`, S(right, {hl:o, out:left-1})); }
        if(have<req) R.inc("cmp"); }
      R.step(7, br>=bl ? `Done: the shortest window is "${win(bl,br)}" (length ${br-bl+1}). Both pointers only moved forward: O(n).` : `Done: no part of "${s}" contains ${needStr}.`, S(s.length-1, {end:true})); return; }
    const k = p.length;
    R.step(0, `Find every place where ${k} letters in a row are a reordering of "${p}" (the same letter counts).`, S(-1, {}));
    for(let right=0; right<s.length; right++){ const c = s[right]; add(c); R.inc("steps");
      R.step(2, `'${c}' enters on the right.`, S(right, {hl:c}));
      if(right >= k){ const o = s[right-k]; drop(o); left = right-k+1; R.inc("steps"); R.step(3, `'${o}' leaves on the left, so the window keeps exactly ${k} letters.`, S(right, {hl:o, out:right-k})); }
      if(right >= k-1){ R.inc("cmp"); const eq = Object.keys(need).every(x=>cnt[x]===need[x]) && Object.keys(cnt).every(x=>need[x]);
        if(eq){ found.push(left); R.step(4, `The counts equal P's counts: "${win(left,right)}" is an anagram, starting at ${left}.`, S(right, {match:true})); }
        else { const extra = Object.keys(cnt).filter(x=>(cnt[x]||0) > (need[x]||0));
          R.step(4, `"${win(left,right)}" is not an anagram: it has too many ${extra.map(x=>`'${x}'`).join(", ")}.`, S(right, {})); } } }
    R.step(4, found.length ? `Done: anagrams of "${p}" start at ${found.join(", ")}.` : `Done: no anagram of "${p}" in "${s}".`, S(s.length-1, {end:true})); },
  draw(s){ const m = {}, n = s.s.length;
    for(let i=s.left;i<=s.right;i++) m[i] = s.match ? "done" : "win";
    if(s.out!==undefined) m[s.out] = "swp"; if(s.right>=0 && !s.end && s.out===undefined) m[s.right] = "cmp";
    if(s.end && s.best[1]>=s.best[0]) for(let i=s.best[0];i<=s.best[1];i++) m[i] = "done";
    if(s.end && s.mode==="anagram"){ Object.keys(m).forEach(k=>delete m[k]); s.found.forEach(f=>{ m[f] = "done"; }); }
    const letters = [...new Set(Object.keys(s.need).concat(Object.keys(s.cnt)))].sort();
    const rows = [["letter", ...letters.map(c=>({v:c, cls:c===s.hl?"cur":""}))], ["in window", ...letters.map(c=>({v:s.cnt[c]||0, cls:c===s.hl?"cur":s.need[c]&&(s.cnt[c]||0)>=s.need[c]?"done":""}))]];
    if(s.mode!=="kdist") rows.push(["needed", ...letters.map(c=>s.need[c]||0)]);
    const info = s.mode==="kdist" ? `different letters: ${Object.keys(s.cnt).length} (at most ${s.K})` : s.mode==="minwin" ? `covered: ${s.have} of ${s.req} letters` : `anagrams found at: ${s.found.join(", ")||"none yet"}`;
    const best = s.mode==="anagram" ? "" : ` · best: ${s.best[1]>=s.best[0] ? `"${esc(s.s.slice(s.best[0], s.best[1]+1))}" (${s.best[1]-s.best[0]+1})` : "none yet"}`;
    return cells(s.s.split(""), m, ptrs({L:s.right>=0 && n ? s.left : -1, R:s.right})) + (letters.length ? `<div class="av-dpwrap">${table(rows, {side:true})}</div>` : "") + `<p class="av-aux mono">${esc(info)}${best}</p>`; } });

/* ---- backtracking: the recursion tree ---- */
/* a recursion tree drawn as it grows: T = {id:{label, kids, st, why}}; st is path | cur | sol | done | prn (pruned, drawn small) */
function recTreeSVG(T, o){
  const P = {}; let next = 8; const LW = 30, PWID = 17, UY = 46, R = 12;
  const lay = (id, d) => { const n = T[id], ks = n.kids.filter(k=>T[k]);
    if(!ks.length){ const w = n.st==="prn" ? PWID : LW; P[id] = {x:next + w/2, d}; next += w; return; }
    ks.forEach(k=>lay(k, d+1)); P[id] = {x:(P[ks[0]].x + P[ks[ks.length-1]].x)/2, d}; };
  lay(0, 0);
  const maxD = Math.max(...Object.values(P).map(p=>p.d)), W = Math.max(160, next + 8), H = 20 + maxD*UY + R + 22, Y = d => 18 + d*UY;
  let e = "", n = "";
  Object.entries(P).forEach(([id, p])=>{ const nd = T[id];
    nd.kids.forEach(k=>{ const q = P[k]; if(!q) return; const c = T[k].st; e += `<line x1="${p.x}" y1="${Y(p.d)}" x2="${q.x}" y2="${Y(q.d)}" class="${c==="prn"?"prn":c==="path"||c==="cur"?"hot":""}"/>`; });
    if(nd.st==="prn") n += `<g class="rt prn"${+id===o.cur?" data-focus":""}><title>pruned: ${esc(nd.why||"")}</title><circle cx="${p.x}" cy="${Y(p.d)}" r="6"/><path d="M${p.x-3},${Y(p.d)-3} l6,6 m0,-6 l-6,6"/>${+id===o.cur?`<text x="${p.x}" y="${Y(p.d)+19}" text-anchor="middle" class="why">${esc(nd.label)} ✕</text>`:""}</g>`;
    else n += `<g class="rt ${nd.st||""}"${+id===o.cur?" data-focus":""}><circle cx="${p.x}" cy="${Y(p.d)}" r="${R}"/><text x="${p.x}" y="${Y(p.d)+4}" text-anchor="middle">${esc(nd.label)}</text>${nd.sub!==undefined?`<text x="${p.x}" y="${Y(p.d)+R+12}" text-anchor="middle" class="sub">${esc(nd.sub)}</text>`:""}</g>`; });
  return wide(W, H, e + n, o.label || "Recursion tree", .9, "av-rt");
}
const BK_MODES = [{v:"subsets", label:"Subsets (duplicates skipped)", set:{a:"1, 2, 2, 3"}},{v:"perms", label:"Permutations", set:{a:"1, 2, 3"}},
  {v:"combsum", label:"Combination sum (reuse allowed)", set:{a:"2, 3, 6, 7", t:"7"}},{v:"queens", label:"N-Queens", set:{n:"4"}}];
const BK_CODE = {
  subsets:["sort the items (equal items sit together)","backtrack(start, path):","  record a copy of path   (every node is a subset)","  for i from start to n-1:","    if i > start and a[i] == a[i-1]: skip   (duplicate)","    path.push(a[i])   (choose)","    backtrack(i + 1, path)   (explore)","    path.pop()   (un-choose)"],
  perms:["sort the items; used = all false","backtrack(path):","  if len(path) == n: record a copy; return","  for i from 0 to n-1:","    if used[i], or a[i] == a[i-1] and not used[i-1]: skip","    used[i] = true; path.push(a[i])   (choose)","    backtrack(path)   (explore)","    path.pop(); used[i] = false   (un-choose)"],
  combsum:["sort the candidates","backtrack(start, path, sum):","  if sum == target: record a copy; return","  for i from start to n-1:","    if sum + c[i] > target: prune and stop   (the rest are bigger)","    path.push(c[i])   (choose; it may be used again)","    backtrack(i, path, sum + c[i])   (explore)","    path.pop()   (un-choose)"],
  queens:["backtrack(row):","  if row == n: record the board; return","  for col from 0 to n-1:","    if a queen above shares the column or a diagonal: prune","    put a queen at (row, col)   (choose)","    backtrack(row + 1)   (explore)","    remove the queen   (un-choose)"] };
def({ id:"backtrack", group:"Recursion & trees", title:"Backtracking: the recursion tree", concepts:["csp","callstack","graphsalgo","proofs"],
  text:"Backtracking builds an answer one choice at a time: choose, explore deeper, then un-choose and try the next option. The calls form a tree: each node is a partial answer and each edge is one choice. Pruning cuts a branch as soon as it cannot lead to a new answer (a duplicate, a sum that is already too big, a queen under attack), so the search visits far fewer nodes than the full tree.",
  inputs:[{k:"mode", label:"Problem", def:"subsets", opts:BK_MODES},{k:"a", label:v=>v.mode==="combsum"?"Candidates (up to 4, from 1 to 9)":"Items (up to "+(v.mode==="perms"?4:5)+", from 0 to 9)", def:"1, 2, 2, 3", when:v=>v.mode!=="queens"},
    {k:"t", label:"Target sum", def:"7", w:4, when:v=>v.mode==="combsum"},{k:"n", label:"Board size n (3 or 4)", def:"4", w:4, when:v=>v.mode==="queens"}],
  random:v=>v.mode==="queens" ? {n:String(Math.random()<.8?4:3)} : v.mode==="combsum" ? {a:[...new Set(Array.from({length:4},()=>rint(2,7)))].join(", "), t:String(rint(6,10))} : {a:randArr(v.mode==="perms"?3:4, 1, 4)},
  counters:["nodes","prune","sol"],
  code:v=>BK_CODE[v.mode] || BK_CODE.subsets,
  run(v, R){ const mode = BK_CODE[v.mode] ? v.mode : "subsets", T = {0:{label:"", kids:[], st:"cur"}}, sols = []; let nid = 1, path = [0];
    const add = (par, label, st, why) => { if(nid >= 120) throw new Error("The tree got too big to draw. Use a smaller input."); const id = nid++; T[id] = {label:String(label), kids:[], st, why}; T[par].kids.push(id); return id; };
    const S = (cur, o) => { Object.keys(T).forEach(k=>{ if(T[k].st==="cur" || T[k].st==="path") T[k].st = T[k].sol ? "sol" : ""; }); path.forEach(k=>{ T[k].st = "path"; }); if(T[cur] && T[cur].st!=="prn") T[cur].st = "cur";
      return Object.assign({T, cur, sols:sols.slice(-12), nsol:sols.length, mode}, o); };
    const mark = id => { T[id].sol = true; };
    const restore = () => Object.keys(T).forEach(k=>{ if(T[k].sol) T[k].st = "sol"; else if(T[k].st==="cur"||T[k].st==="path") T[k].st = "done"; });
    const fin = (full, o) => { restore(); R.step(0, `Done: ${sols.length} answer${sols.length===1?"":"s"}, ${R.c.nodes||0} nodes visited${R.c.prune?`, ${R.c.prune} branches pruned`:""}. ${full}`, Object.assign({T, cur:-1, sols:sols.slice(-12), nsol:sols.length, mode, end:true}, o)); };
    if(mode==="queens"){ const n = nums(v.n, 3, 4, 1)[0], cols = [];
      const hit = (r, c) => { for(let q=0;q<r;q++){ if(cols[q]===c) return [q, "same column"]; if(Math.abs(cols[q]-c)===r-q) return [q, "same diagonal"]; } return null; };
      R.step(0, `Place ${n} queens on a ${n}×${n} board, one per row, so that no two share a column or a diagonal.`, S(0, {n, cols:[]}));
      const go = (row, node) => {
        if(row===n){ sols.push(cols.map(c=>c+1).join("")); mark(node); R.inc("sol"); R.step(1, `All ${n} rows have a queen: record this board (answer ${sols.length}).`, S(node, {n, cols:cols.slice()})); return; }
        for(let c=0;c<n;c++){ const h = hit(row, c);
          if(h){ const id = add(node, c+1, "prn", h[1]); R.inc("prune"); R.step(3, `Row ${row+1}, column ${c+1}: the queen in row ${h[0]+1} attacks it (${h[1]}). Prune this branch.`, S(id, {n, cols:cols.slice(), tryc:[row, c], by:h[0]})); continue; }
          cols.push(c); const id = add(node, c+1, ""); path.push(id); R.inc("nodes");
          R.step(4, `Row ${row+1}, column ${c+1} is safe: put a queen there.`, S(id, {n, cols:cols.slice()}));
          go(row+1, id);
          cols.pop(); path.pop(); if(!T[id].sol) T[id].st = "done";
          R.step(6, `Remove the queen from row ${row+1}, column ${c+1}, and try the next column.`, S(node, {n, cols:cols.slice()})); } };
      go(0, 0); let full = 0; for(let k=0;k<=n;k++) full += Math.pow(n, k);
      fin(`Without pruning the tree would have ${full} nodes.`, {n, cols:[]}); return; }
    const a = nums(v.a, mode==="combsum"?1:0, 9, mode==="perms"?4:mode==="combsum"?4:5).sort((x,y)=>x-y);
    if(mode==="combsum"){ const t = nums(v.t, 1, 12, 1)[0], c = [...new Set(a)], cur = [];
      R.step(0, `Find every combination of ${c.join(", ")} that adds up to ${t}. A number may be used more than once. Sorted, so a too-big number ends the loop.`, S(0, {}));
      const go = (start, sum, node) => {
        if(sum===t){ sols.push(cur.slice()); mark(node); R.inc("sol"); R.step(2, `The sum is ${t}: record [${cur.join(", ")}].`, S(node, {})); return; }
        for(let i=start;i<c.length;i++){
          if(sum + c[i] > t){ const id = add(node, "+"+c[i], "prn", "too big"); R.inc("prune"); R.step(4, `${sum} + ${c[i]} = ${sum+c[i]} is more than ${t}: prune. Every later candidate is bigger, so stop this loop.`, S(id, {})); break; }
          cur.push(c[i]); const id = add(node, "+"+c[i], ""); T[id].sub = sum + c[i]; path.push(id); R.inc("nodes");
          R.step(5, `Choose ${c[i]}: path [${cur.join(", ")}], sum ${sum+c[i]}.`, S(id, {}));
          go(i, sum + c[i], id);
          cur.pop(); path.pop(); if(!T[id].sol) T[id].st = "done"; R.step(7, `Un-choose ${c[i]}: back to [${cur.join(", ")}] (sum ${sum}).`, S(node, {})); } };
      go(0, 0, 0); fin("Without the size check the tree would never end, since numbers can repeat.", {}); return; }
    if(mode==="perms"){ const n = a.length, used = Array(n).fill(false), cur = [];
      R.step(0, `List every ordering of ${a.join(", ")}. The items are sorted so equal ones sit together.`, S(0, {}));
      const go = node => {
        if(cur.length===n){ sols.push(cur.slice()); mark(node); R.inc("sol"); R.step(2, `All ${n} items are placed: record [${cur.join(", ")}].`, S(node, {})); return; }
        for(let i=0;i<n;i++){ if(used[i]) continue;
          if(i>0 && a[i]===a[i-1] && !used[i-1]){ const id = add(node, a[i], "prn", "duplicate"); R.inc("prune"); R.step(4, `Skip this ${a[i]}: an equal ${a[i]} was just tried in this position, so it would repeat the same orderings.`, S(id, {})); continue; }
          used[i] = true; cur.push(a[i]); const id = add(node, a[i], ""); path.push(id); R.inc("nodes");
          R.step(5, `Choose ${a[i]}: path [${cur.join(", ")}].`, S(id, {}));
          go(id);
          used[i] = false; cur.pop(); path.pop(); if(!T[id].sol) T[id].st = "done"; R.step(7, `Un-choose ${a[i]}: back to [${cur.join(", ")}].`, S(node, {})); } };
      go(0); let full = 0, f = 1; for(let k=0;k<=n;k++){ full += f; f *= (n-k); }
      fin(`With all items different the tree has ${full} nodes and ${[1,1,2,6,24][n]} leaves (n!).`, {}); return; }
    const n = a.length, cur = [];
    R.step(0, `List every subset of ${a.join(", ")}. The items are sorted so equal ones sit together.`, S(0, {}));
    const go = (start, node) => {
      sols.push(cur.slice()); mark(node); R.inc("sol"); R.step(2, `Record [${cur.join(", ")}] as a subset.`, S(node, {}));
      for(let i=start;i<n;i++){
        if(i>start && a[i]===a[i-1]){ const id = add(node, "+"+a[i], "prn", "duplicate"); R.inc("prune"); R.step(4, `Skip ${a[i]} here: the same value was just tried at this level, so it would repeat the same subsets.`, S(id, {})); continue; }
        cur.push(a[i]); const id = add(node, "+"+a[i], ""); path.push(id); R.inc("nodes");
        R.step(5, `Choose ${a[i]}: path [${cur.join(", ")}].`, S(id, {}));
        go(i+1, id);
        cur.pop(); path.pop(); R.step(7, `Un-choose ${a[i]}: back to [${cur.join(", ")}].`, S(node, {})); } };
    go(0, 0); fin(`With all items different there are 2^${n} = ${Math.pow(2,n)} subsets.`, {}); },
  draw(s){ let board = "";
    if(s.mode==="queens"){ const n = s.n, at = new Set();
      board = `<div class="av-board" style="--n:${n}" role="img" aria-label="Board: queens in columns ${s.cols.map(c=>c+1).join(", ")||"none"}">`;
      for(let r=0;r<n;r++) for(let c=0;c<n;c++){ const q = s.cols[r]===c, tr = s.tryc && s.tryc[0]===r && s.tryc[1]===c, by = s.tryc && s.by===r && s.cols[r]===c;
        board += `<span class="sq${(r+c)%2?" dk":""}${tr?" bad":""}${by?" by":""}">${q?"♛":tr?"✕":""}</span>`; }
      board += `</div>`; }
    const done = s.sols.map(x=>Array.isArray(x)?`[${x.join(", ")}]`:x);
    return `<div class="av-bk">${board}<div class="bk-tree">${recTreeSVG(s.T, {cur:s.cur, label:`Recursion tree with ${Object.keys(s.T).length} nodes`})}</div></div>
      <p class="av-aux av-key"><span><i class="cur"></i>current call</span><span><i class="cmp"></i>on the path</span><span><i class="done"></i>answer recorded</span><span><i class="prn"></i>pruned ✕</span></p>
      <p class="av-aux mono">answers (${s.nsol}): ${esc(s.mode==="queens" ? done.map(x=>"cols "+x.split("").join("-")).join("  ") : done.join(" ")) || "none yet"}${s.nsol>s.sols.length?" …":""}</p>`; } });

/* ---- tree DFS with return values ---- */
function parseTree(str){
  const t = String(str||"").split(/[\s,;]+/).filter(Boolean), nil = x => /^(null|none|nil|#|-|x)$/i.test(x);
  if(!t.length || nil(t[0])) throw new Error("Write the tree level by level, like 1, 2, 3, null, 5 (null = no child).");
  const vals = t.map(x=>nil(x) ? null : Number(x));
  if(vals.some(x=>x!==null && (!Number.isInteger(x) || x < -99 || x > 99))) throw new Error("Node values are whole numbers from -99 to 99; write null for a missing child.");
  const N = [], mk = v => { N.push({v, l:-1, r:-1}); return N.length-1; }, q = [mk(vals[0])]; let i = 1;
  while(q.length && i < vals.length){ const p = q.shift();
    if(vals[i]!==null && vals[i]!==undefined){ N[p].l = mk(vals[i]); q.push(N[p].l); } i++;
    if(i < vals.length){ if(vals[i]!==null){ N[p].r = mk(vals[i]); q.push(N[p].r); } i++; } }
  if(N.length > 15) throw new Error("At most 15 nodes, so the tree stays readable.");
  return N;
}
/* binary tree drawn with x = inorder position, so left and right children never swap sides */
function binTreeSVG(N, o){
  const X = [], D = []; let k = 0; const walk = (i, d) => { if(i<0) return; walk(N[i].l, d+1); X[i] = k++; D[i] = d; walk(N[i].r, d+1); }; walk(0, 0);
  const UX = 36, UY = 58, R = 15, W = 16 + N.length*UX, maxD = Math.max(...D), H = 26 + maxD*UY + R + 22, px = i => 8 + UX/2 + X[i]*UX, py = i => 22 + D[i]*UY;
  let e = "", n = "";
  N.forEach((nd, i)=>{ [nd.l, nd.r].forEach(c=>{ if(c>=0) e += `<line x1="${px(i)}" y1="${py(i)}" x2="${px(c)}" y2="${py(c)}" class="${(o.edge&&o.edge(i,c))||""}"/>`; });
    const st = o.cls ? o.cls(i) : "", sub = o.sub ? o.sub(i) : undefined, tag = o.tag ? o.tag(i) : "";
    n += `<g class="tn ${st}"${i===o.cur?" data-focus":""}><circle cx="${px(i)}" cy="${py(i)}" r="${R}"/><text x="${px(i)}" y="${py(i)+4}" text-anchor="middle">${esc(nd.v)}</text>${sub!==undefined&&sub!==""?`<text x="${px(i)}" y="${py(i)+R+13}" text-anchor="middle" class="sub ret">${esc(sub)}</text>`:""}${tag?`<text x="${px(i)+R+3}" y="${py(i)-R+2}" class="sub tag">${esc(tag)}</text>`:""}</g>`; });
  return wide(W, H, e + n, o.label || "Binary tree", .85);
}
const TD_TREE = "1, 2, 3, 4, 5, null, 6, 7, null, null, 8";
const TD_MODES = [{v:"height", label:"Height (max depth)", set:{tree:TD_TREE}},{v:"diameter", label:"Diameter (longest path)", set:{tree:TD_TREE}},{v:"maxpath", label:"Maximum path sum", set:{tree:"-10, 9, 20, null, null, 15, 7, 3, -8"}},
  {v:"pre", label:"Preorder: visit before the children", set:{tree:TD_TREE}},{v:"in", label:"Inorder: visit between the children", set:{tree:TD_TREE}},{v:"post", label:"Postorder: visit after the children", set:{tree:TD_TREE}}];
const TD_CODE = {
  height:["dfs(node):","  if node is null: return 0","  L = dfs(node.left)","  R = dfs(node.right)","  return 1 + max(L, R)   (my height, handed to my parent)"],
  diameter:["best = 0","dfs(node): if node is null: return 0","  L = dfs(node.left)","  R = dfs(node.right)","  best = max(best, L + R)   (longest path that bends here)","  return 1 + max(L, R)   (height, for the parent)"],
  maxpath:["best = -∞","dfs(node): if node is null: return 0","  L = max(0, dfs(node.left))   (drop a negative branch)","  R = max(0, dfs(node.right))","  best = max(best, node.val + L + R)   (path that bends here)","  return node.val + max(L, R)   (one side only, for the parent)"],
  order:["dfs(node): if node is null: return","  visit(node)   ← preorder visits here","  dfs(node.left)","  visit(node)   ← inorder visits here","  dfs(node.right)","  visit(node)   ← postorder visits here"] };
def({ id:"treedfs", group:"Recursion & trees", title:"Tree DFS with return values and the call stack", concepts:["trees","callstack","proofs"],
  text:"Each call works on one node: it calls itself on the left child, then on the right child, and combines the two answers it gets back into one value it returns to its parent. The call stack on the right holds the calls that are waiting for a child. Many tree problems are one such function plus a global best: the diameter and the maximum path sum look at the path that bends at each node, but return only one side to the parent. Every node is visited once: O(n) time, O(height) stack.",
  inputs:[{k:"mode", label:"Problem", def:"diameter", opts:TD_MODES},{k:"tree", label:"Tree, level by level (null = no child; up to 15 nodes)", def:TD_TREE}],
  presets:[{name:"A long thin tree", v:{tree:"1, 2, null, 3, null, 4, null, 5"}},{name:"Full tree", v:{tree:"1, 2, 3, 4, 5, 6, 7"}}],
  random:()=>{ const n = rint(6,11), out = [String(rint(1,9))]; let real = 1; while(real < n){ if(Math.random()<.22) out.push("null"); else { out.push(String(rint(-9,9))); real++; } } return {tree:out.join(", ")}; },
  counters:["calls","depth"],
  code:v=>TD_CODE[["pre","in","post"].includes(v.mode) ? "order" : v.mode] || TD_CODE.diameter,
  run(v, R){ const mode = TD_MODES.some(m=>m.v===v.mode) ? v.mode : "diameter", N = parseTree(v.tree), order = ["pre","in","post"].includes(mode);
    const ret = {}, stack = [], out = []; let best = mode==="maxpath" ? -Infinity : 0, bestAt = -1, maxd = 0;
    const L0 = mode==="height" ? 0 : 1, nm = i => `dfs(${N[i].v})`;
    const S = (cur, o) => Object.assign({N, mode, cur, ret:Object.assign({}, ret), stack:stack.map(f=>Object.assign({}, f)), out:out.slice(), best:best===-Infinity?null:best, bestAt}, o);
    const visit = (i, line, when) => { out.push(i); R.step(line, `Visit ${N[i].v} ${when}. The order so far: ${out.map(j=>N[j].v).join(", ")}.`, S(i, {vis:i})); };
    const kid = (i, side) => { const c = side==="L" ? N[i].l : N[i].r; return c; };
    const dfs = (i, from) => {
      const fr = {id:i, L:null, R:null}; stack.push(fr); R.inc("calls"); if(stack.length > maxd){ R.inc("depth", stack.length - maxd); maxd = stack.length; }
      const leaf = N[i].l<0 && N[i].r<0;
      R.step(order ? 0 : L0, `Call ${nm(i)}${from===undefined ? " on the root" : ` from ${nm(from)}`}. ${stack.length} call${stack.length===1?" is":"s are"} on the stack.${leaf ? ` Both children are empty${order ? "" : `, so they give ${mode==="maxpath" ? "0" : "0"}`}.` : ""}`, S(i, {}));
      if(mode==="pre") visit(i, 1, "first, before its children");
      for(const side of ["L","R"]){ const c = kid(i, side);
        if(order && side==="R" && mode==="in") visit(i, 3, "after its left subtree, before its right");
        if(c<0){ fr[side] = 0; if(!leaf && !order) R.step(side==="L"?L0+1:L0+2, `${N[i].v} has no ${side==="L"?"left":"right"} child: that side gives 0.`, S(i, {})); continue; }
        fr.wait = side; const got = dfs(c, i); fr.wait = null;
        if(order) continue;
        if(mode==="maxpath"){ fr[side] = Math.max(0, got);
          R.step(side==="L"?2:3, `Back in ${nm(i)}: the ${side==="L"?"left":"right"} child returned ${got}${got<0 ? `, which is negative, so this side counts as 0 (leave that branch out)` : ""}. ${side} = ${fr[side]}.`, S(i, {from:c})); }
        else { fr[side] = got; R.step(side==="L"?L0+1:L0+2, `Back in ${nm(i)}: the ${side==="L"?"left":"right"} child returned ${got}, so ${side} = ${got}.`, S(i, {from:c})); } }
      let r;
      if(order){ if(mode==="post") visit(i, 5, "last, after both children"); r = null; }
      else if(mode==="height"){ r = 1 + Math.max(fr.L, fr.R); }
      else if(mode==="diameter"){ const p = fr.L + fr.R; if(p > best || bestAt<0){ best = p; bestAt = i; }
        R.step(4, `A path can bend at ${N[i].v}: down ${fr.L} edge${fr.L===1?"":"s"} on the left plus ${fr.R} on the right = ${p}.${bestAt===i ? ` A new best: ${best}.` : ` The best stays ${best}.`}`, S(i, {})); r = 1 + Math.max(fr.L, fr.R); }
      else { const p = N[i].v + fr.L + fr.R; if(p > best || bestAt<0){ best = p; bestAt = i; }
        R.step(4, `The best path that bends at ${N[i].v}: ${fr.L} + ${N[i].v} + ${fr.R} = ${p}.${bestAt===i ? ` A new best: ${best}.` : ` The best stays ${best}.`}`, S(i, {})); r = N[i].v + Math.max(fr.L, fr.R); }
      stack.pop(); ret[i] = r;
      if(!order) R.step(mode==="height" ? 4 : 5, mode==="maxpath" ? `${nm(i)} returns ${N[i].v} + max(${fr.L}, ${fr.R}) = ${r}: a path to the parent can use only one side.` : `${nm(i)} returns 1 + max(${fr.L}, ${fr.R}) = ${r}${mode==="diameter" ? ", its height, so the parent can measure longer paths" : ""}.`, S(i, {back:i}));
      else R.step(0, `${nm(i)} is finished and leaves the stack.`, S(i, {back:i}));
      return r; };
    R.step(order ? 0 : (mode==="height" ? 0 : 0), mode==="height" ? "Find the height: the number of nodes on the longest path from the root down to a leaf." : mode==="diameter" ? "Find the diameter: the number of edges on the longest path between any two nodes. It may not pass through the root." : mode==="maxpath" ? "Find the largest sum along any path (it need not pass through the root, and it can bend at one node). Values can be negative." : `Walk the tree depth first and list the nodes in ${mode}order.`, S(-1, {}));
    const r = dfs(0);
    R.step(order ? 0 : mode==="height" ? 4 : 5, order ? `Done: ${mode}order is ${out.map(j=>N[j].v).join(", ")}. ${N.length} calls, never more than ${maxd} on the stack (the height).` : mode==="height" ? `The height is ${r}. ${N.length} calls; the stack was at most ${maxd} deep.` : `Done: the ${mode==="diameter"?"diameter":"maximum path sum"} is ${best}, on the path that bends at ${N[bestAt].v}. ${N.length} calls, at most ${maxd} on the stack.`, S(-1, {end:true})); },
  draw(s){ const N = s.N, onStack = new Set(s.stack.map(f=>f.id)), top = s.stack.length ? s.stack[s.stack.length-1].id : -1, order = ["pre","in","post"].includes(s.mode);
    const svg = binTreeSVG(N, { cur:s.cur, label:`Binary tree with ${N.length} nodes`,
      cls:i => (i===s.vis ? "done " : "") + (i===top || i===s.back ? "cur" : onStack.has(i) ? "cmp" : (order ? s.out.includes(i) : s.ret[i]!==undefined) ? "fin" : "") + (s.end && i===s.bestAt && !order ? " best" : ""),
      sub:i => order ? (s.out.includes(i) ? "#" + (s.out.indexOf(i)+1) : "") : s.ret[i]!==undefined ? "↑" + s.ret[i] : "",
      tag:i => i===s.bestAt && !order ? "★" : "",
      edge:(p,c) => onStack.has(p) && onStack.has(c) ? "hot" : "" });
    const fmt = x => x===null || x===undefined ? "?" : x;
    const items = s.stack.map(f=>({t:`<b>dfs(${esc(N[f.id].v)})</b>${order ? "" : `<span class="mono">L=${fmt(f.L)} R=${fmt(f.R)}</span>`}${f.wait ? `<span class="mono">waits for ${f.wait==="L"?"left":"right"}</span>` : ""}`, cls:f.id===top?"cur":""}));
    const best = order ? `order: ${s.out.map(j=>N[j].v).join(", ") || "(nothing yet)"}` : s.mode==="height" ? "" : `best so far: ${s.best===null ? "-∞" : s.best}${s.bestAt>=0 ? ` (bends at ${N[s.bestAt].v} ★)` : ""}`;
    return `<div class="av-bk"><div class="bk-tree">${svg}</div>${stackHTML("call stack", items, "empty: no call running")}</div>
      <p class="av-aux av-key"><span><i class="cur"></i>running call</span><span><i class="cmp"></i>waiting on the stack</span><span><i class="done"></i>${order ? "visited (#order)" : "returned (↑ value)"}</span></p>${best ? `<p class="av-aux mono">${esc(best)}</p>` : ""}`; } });

/* ---- 1-D DP: the same recurrence as a table, as memoized recursion, and as plain recursion ---- */
const INF = 1e9;
const D1_MODES = [{v:"stairs", label:"Climbing stairs (1 or 2 steps)", set:{}},{v:"robber", label:"House robber (no two neighbours)", set:{}},{v:"coins", label:"Coin change (fewest coins)", set:{}}];
const D1_METHODS = [{v:"table", label:"Bottom-up table (tabulation)", set:{}},{v:"memo", label:"Top-down recursion with a memo", set:{}},{v:"plain", label:"Plain recursion (no memo)", set:{}}];
function d1Problem(v){
  const mode = D1_MODES.some(m=>m.v===v.mode) ? v.mode : "stairs";
  if(mode==="robber"){ const a = nums(v.a, 0, 99, 10), m = a.length;
    return {mode, m, a, start:2, what:"f(i) = the most money from the first i houses", base:i=>i===0?0:i===1?a[0]:undefined, baseStr:"f(0) = 0; f(1) = a[0]", rec:"max(f(i-1), f(i-2) + a[i-1])",
      deps:i=>[i-1, i-2], calc:(i,f)=>Math.max(f[i-1], f[i-2]+a[i-1]),
      expl:(i,f,r)=>`f(${i}) = max(skip house ${i-1}: f(${i-1}) = ${f[i-1]}, rob it: f(${i-2}) + ${a[i-1]} = ${f[i-2]+a[i-1]}) = ${r}.`,
      intro:`Rob houses with ${a.join(", ")} in them, never two next to each other.`}; }
  if(mode==="coins"){ const c = [...new Set(nums(v.c, 1, 9, 4))].sort((x,y)=>x-y), m = nums(v.amt, 1, 15, 1)[0];
    return {mode, m, c, start:1, what:"f(i) = the fewest coins that make the amount i (∞ = impossible)", base:i=>i===0?0:undefined, baseStr:"f(0) = 0", rec:"1 + min over coins c ≤ i of f(i-c)",
      deps:i=>c.filter(x=>x<=i).map(x=>i-x), calc:(i,f)=>{ const ds = c.filter(x=>x<=i).map(x=>f[i-x]).filter(x=>x<INF); return ds.length ? 1 + Math.min(...ds) : INF; },
      expl:(i,f,r)=>{ const ds = c.filter(x=>x<=i); return ds.length ? `f(${i}) = 1 + min(${ds.map(x=>`f(${i-x}) = ${fmtInf(f[i-x])}`).join(", ")}) = ${fmtInf(r)}.` : `f(${i}): no coin is ${i} or less, so it is impossible (∞).`; },
      intro:`Make the amount ${m} with the fewest coins from ${c.join(", ")} (each coin can be used many times).`}; }
  const m = nums(v.n, 1, 15, 1)[0];
  return {mode, m, start:2, what:"f(i) = the number of ways to climb to step i", base:i=>i<=1?1:undefined, baseStr:"f(0) = 1; f(1) = 1", rec:"f(i-1) + f(i-2)",
    deps:i=>[i-1, i-2], calc:(i,f)=>f[i-1]+f[i-2], expl:(i,f,r)=>`f(${i}) = f(${i-1}) + f(${i-2}) = ${f[i-1]} + ${f[i-2]} = ${r}: the last move was 1 step or 2 steps.`,
    intro:`Count the ways to climb ${m} steps, taking 1 or 2 steps at a time.`};
}
def({ id:"dp1d", group:"Dynamic programming", title:"1-D DP: table, memo or plain recursion", concepts:["dp","callstack","bigo"],
  text:"One recurrence, three ways to run it. Bottom-up fills the table from the smallest case up, so every value it needs is already there (arrows). Top-down calls the recurrence from the top and stores each answer in a memo, so a repeated call is a cache hit. Plain recursion stores nothing and solves the same small cases again and again: its calls grow exponentially, while both DP versions do O(n) work.",
  inputs:[{k:"mode", label:"Problem", def:"stairs", opts:D1_MODES},{k:"method", label:"Method", def:"table", opts:D1_METHODS},
    {k:"n", label:"Steps n (1 to 15)", def:"7", w:4, when:v=>(v.mode||"stairs")==="stairs"},{k:"a", label:"Money in each house (up to 10)", def:"2, 7, 9, 3, 1, 4", when:v=>v.mode==="robber"},
    {k:"c", label:"Coins (up to 4, from 1 to 9)", def:"1, 3, 4", w:10, when:v=>v.mode==="coins"},{k:"amt", label:"Amount (1 to 15)", def:"10", w:4, when:v=>v.mode==="coins"}],
  random:v=>v.mode==="robber" ? {a:randArr(rint(5,8), 1, 15)} : v.mode==="coins" ? {c:[...new Set([1, rint(2,5), rint(4,7)])].join(", "), amt:String(rint(6,13))} : {n:String(rint(4,9))},
  counters:v=>v.method==="memo" ? ["calls","memo","cells"] : v.method==="plain" ? ["calls"] : ["cells"],
  code:v=>{ let p; try{ p = d1Problem(v); }catch(e){ p = d1Problem({mode:"stairs", n:"5"}); }
    return v.method==="memo" ? ["memo = {}", `f(i): base cases ${p.baseStr}`, "  if i is in memo: return memo[i]   (cache hit)", `  memo[i] = ${p.rec}`, "  return memo[i]"]
      : v.method==="plain" ? [`f(i): base cases ${p.baseStr}`, "  (no memo: the same f(i) is solved again and again)", `  return ${p.rec}`]
      : [`${p.baseStr}   (base cases)`, `for i from ${p.start} to n:`, `  f[i] = ${p.rec}`, "return f[n]"]; },
  run(v, R){ const p = d1Problem(v), method = ["memo","plain"].includes(v.method) ? v.method : "table", m = p.m, f = Array(m+1).fill(null), cnt = Array(m+1).fill(0), stack = [];
    const S = (o) => Object.assign({p:{mode:p.mode, m, a:p.a, c:p.c, what:p.what}, method, f:f.slice(), cnt:cnt.slice(), stack:stack.map(x=>Object.assign({}, x))}, o);
    if(method==="table"){
      for(let i=0;i<=m;i++) if(p.base(i)!==undefined){ f[i] = p.base(i); R.inc("cells"); }
      R.step(0, `${p.intro} ${p.what}. Fill the base cases first: ${p.baseStr}.`, S({}));
      for(let i=p.start;i<=m;i++){ const r = p.calc(i, f); R.inc("cells");
        R.step(1, `Next cell: f(${i}). Everything it needs is to its left and already filled.`, S({cur:i, deps:p.deps(i)}));
        f[i] = r; R.step(2, p.expl(i, f, r), S({cur:i, deps:p.deps(i), fresh:true})); }
      R.step(3, `The answer is f(${m}) = ${fmtInf(f[m])}. ${m+1} cells, each filled once: O(n) time${p.mode==="coins" ? " × the number of coins" : ""}.`, S({cur:m, end:true})); return; }
    const memo = method==="memo", LIM = 70, STOP = {};
    // count the calls plain recursion would make, without recording them
    const total = (() => { const cc = {}; const go = i => { if(p.base(i)!==undefined) return 1; if(cc[i]!==undefined) return cc[i]; let s = 1; p.deps(i).forEach(d=>{ s += go(d); }); return cc[i] = Math.min(s, 1e12); }; return go(m); })();
    let calls = 0;
    R.step(0, `${p.intro} ${p.what}. Start with the call f(${m}) and let it ask for what it needs.`, S({}));
    const call = (i, from) => {
      calls++; R.inc("calls"); if(!memo && calls > LIM) throw STOP;
      stack.push({i, w:null});
      const b = p.base(i);
      if(b!==undefined){ cnt[i]++; if(memo || f[i]===null) f[i] = b; R.step(memo?1:0, `f(${i}) is a base case: return ${b}.`, S({cur:i})); stack.pop(); return b; }
      if(memo && f[i]!==null){ R.inc("memo"); R.step(2, `f(${i}) is already in the memo: return ${fmtInf(f[i])} at once (a cache hit, no more calls).`, S({cur:i, hit:true})); stack.pop(); return f[i]; }
      const ds = p.deps(i);
      R.step(memo?3:2, `Call f(${i})${from!==undefined?` (asked by f(${from}))`:""}. It needs ${ds.length ? ds.map(d=>`f(${d})`).join(" and ") : "nothing"}${!memo && cnt[i] ? `. f(${i}) was already solved ${cnt[i]} time${cnt[i]===1?"":"s"}, but nothing was kept` : ""}.`, S({cur:i, deps:ds}));
      const got = {}; ds.forEach(d=>{ stack[stack.length-1].w = d; got[d] = call(d, i); }); stack[stack.length-1].w = null;
      const g = Object.assign([], f); Object.keys(got).forEach(d=>{ g[d] = got[d]; });
      const r = p.calc(i, g); cnt[i]++; f[i] = r; if(memo) R.inc("cells");
      R.step(memo?4:2, p.expl(i, g, r) + (memo ? ` Store it in the memo.` : cnt[i]>1 ? ` (Solved ${cnt[i]} times so far.)` : ""), S({cur:i, deps:ds, fresh:true}));
      stack.pop(); return r; };
    try { const r = call(m);
      R.step(memo?4:2, memo ? `f(${m}) = ${fmtInf(r)}. ${R.c.calls} calls and ${R.c.memo||0} cache hits: each f(i) was computed once, so it is O(n) like the table, plus stack space.` : `f(${m}) = ${fmtInf(r)} after ${R.c.calls} calls. A memo would need only about ${p.mode==="coins"?"n × coins":"2n"} calls; plain recursion grows exponentially.`, S({end:true})); }
    catch(e){ if(e!==STOP) throw e; stack.length = 0;
      R.step(1, `Stopped after ${LIM} calls. Plain recursion makes ${total >= 1e12 ? "more than a trillion" : total.toLocaleString("en-US")} calls in total for f(${m}), because every f(i) is solved again each time it is needed. The table fills only ${m+1} cells.`, S({end:true, stopped:true})); } },
  draw(s){ const m = s.p.m, deps = new Set(s.deps||[]);
    const fc = s.f.map((x,i)=>({v:x===null ? "" : fmtInf(x), cls:i===s.cur ? (s.hit ? "done" : "cur") : deps.has(i) ? "cmp" : x===null ? "nil" : s.method==="plain" ? "dim" : "", sub:s.method==="plain" && s.cnt[i] ? "×" + s.cnt[i] : undefined, focus:i===s.cur}));
    const rows = [{label:"f", cells:fc}];
    if(s.p.mode==="robber") rows.unshift({label:"house", cells:s.p.a.map(x=>({v:x})), off:1});
    const arcs = (LX, PW, TOP, RH) => { if(s.cur===undefined || !s.deps) return ""; const yb = TOP + (rows.length-1)*RH + 6, cx = i => LX + i*PW + PW/2;
      return s.deps.filter(d=>d>=0).map(d=>{ const x1 = cx(d), x2 = cx(s.cur), up = Math.min(40, 14 + (s.cur-d)*5), y = rows.length>1 ? yb : TOP - 16;
        return rows.length>1 ? `<path d="M${x1},${y+30} C${x1},${y+48} ${x2},${y+48} ${x2},${y+30}" class="ms-arc hot" marker-end="url(#av-arrh)"/>` : `<path d="M${x1},${y} C${x1},${y-up} ${x2},${y-up} ${x2},${y}" class="ms-arc hot" marker-end="url(#av-arrh)"/>`; }).join(""); };
    const svg = rowsSVG(rows, {lx:46, pw:34, top:rows.length>1 ? 18 : 56, extra:rows.length>1 ? 22 : (s.method==="plain" ? 10 : 0), label:"DP values f(0) to f(" + m + ")", add:(a,b,c,d)=>ARROWH + arcs(a,b,c,d), index:m+1, min:.85});
    const stack = s.method==="table" ? "" : stackHTML("call stack", s.stack.map((x,k)=>({t:`<b>f(${x.i})</b>${x.w!==null ? `<span class="mono">waits for f(${x.w})</span>` : ""}`, cls:k===s.stack.length-1 ? (s.hit ? "hit" : "cur") : ""})), "empty");
    return `<div class="av-bk"><div class="bk-tree">${svg}<p class="av-aux">${esc(s.p.what)}${s.p.mode==="coins" ? ` · coins: ${s.p.c.join(", ")}` : ""}${s.method==="plain" ? " · ×k = how many times f(i) was solved" : ""}</p></div>${stack}</div>`; } });

/* ---- prefix sums and difference arrays ---- */
const PS_MODES = [{v:"range", label:"Range sums with a prefix array", set:{a:"3, -1, 4, 1, 5, -9, 2, 6"}},{v:"subk", label:"Subarrays that sum to K (hash map)", set:{a:"1, 2, 1, -1, 3, -2, 2, 1"}},
  {v:"diff", label:"Range adds with a difference array", set:{a:"0, 0, 0, 0, 0, 0, 0, 0"}}];
const PS_CODE = {
  range:["P[0] = 0","for i from 0 to n-1: P[i+1] = P[i] + a[i]","sum(a[l..r]) = P[r+1] - P[l]   (one subtraction: O(1))"],
  subk:["seen = {0: 1}; sum = 0; count = 0","for i from 0 to n-1:","  sum = sum + a[i]   (P[i+1])","  count += seen[sum - K]   (each earlier P equal to sum - K","     starts a subarray that ends here and sums to K)","  seen[sum] += 1","return count"],
  diff:["d = [0] * (n + 1)","add v to a[l..r]: d[l] += v; d[r+1] -= v   (O(1) each)","run = 0; for i from 0 to n-1:","  run = run + d[i]; a[i] = a[i] + run   (one pass at the end)"] };
def({ id:"prefix", group:"Arrays & strings", title:"Prefix sums and difference arrays", concepts:["prefixsums","hashtables","rangeq"],
  text:v=>v.mode==="diff" ? "To add v to a whole range many times, do not touch every cell. Write +v where the range starts and −v just after it ends, in a difference array d. One prefix pass at the end turns d into the total added to each cell. k updates and one pass cost O(n + k) instead of O(n·k). Car pooling and flight bookings are this."
    : v.mode==="subk" ? "A subarray a[j..i] sums to K exactly when P[i+1] − P[j] = K, that is when an earlier prefix sum equals sum − K. Walk once, keep a hash map from each prefix sum to how many times it was seen, and add that count at every step: O(n) instead of trying all O(n²) subarrays. Negative numbers are fine, unlike a sliding window."
    : "Store running totals once: P[k] is the sum of the first k values (P sits on the fence before a[k]). Then the sum of any range a[l..r] is one subtraction, P[r+1] − P[l], so each query is O(1) after O(n) work. SQL window sums and Fenwick trees build on the same idea.",
  inputs:[{k:"mode", label:"Problem", def:"range", opts:PS_MODES},{k:"a", label:"Numbers (up to 12, from -50 to 50)", def:"3, -1, 4, 1, 5, -9, 2, 6"},
    {k:"q", label:"Queries (l r)", def:"0 3, 2 5, 4 4", w:16, when:v=>(v.mode||"range")==="range"},{k:"k", label:"K", def:"3", w:4, when:v=>v.mode==="subk"},
    {k:"u", label:"Updates (l r v)", def:"1 4 2, 3 6 5, 0 2 -1", w:20, when:v=>v.mode==="diff"}],
  random:v=>v.mode==="diff" ? {u:Array.from({length:3},()=>{ const l = rint(0,5); return `${l} ${rint(l,7)} ${rint(-3,6)}`; }).join(", ")} : v.mode==="subk" ? {a:randArr(8, -2, 4), k:String(rint(2,5))} : {a:randArr(rint(6,9), -5, 9), q:"0 2, 1 4, 3 5"},
  counters:v=>v.mode==="subk" ? ["cells","look","sol"] : v.mode==="diff" ? ["wr","cells"] : ["cells","look"],
  code:v=>PS_CODE[v.mode] || PS_CODE.range,
  run(v, R){ const mode = PS_CODE[v.mode] ? v.mode : "range", a = nums(v.a, -50, 50, 12), n = a.length, P = Array(n+1).fill(null);
    const S = o => Object.assign({mode, a, P:P.slice()}, o);
    if(mode==="diff"){
      const ups = ops(v.u).map(t=>{ const [l, r, x] = t.map(Number); if(t.length!==3 || ![l,r,x].every(Number.isInteger) || l<0 || r<l || r>=n || Math.abs(x)>99) throw new Error(`Write updates as "l r v" with 0 ≤ l ≤ r ≤ ${n-1}, like "1 4 2".`); return [l, r, x]; });
      if(ups.length > 6) throw new Error("At most 6 updates.");
      const d = Array(n+1).fill(0), run = Array(n).fill(null), res = Array(n).fill(null);
      const T = o => S(Object.assign({d:d.slice(), run:run.slice(), res:res.slice()}, o));
      R.step(0, `Start with a difference array d of ${n+1} zeros. Nothing in a changes until the end.`, T({}));
      ups.forEach(([l, r, x])=>{ d[l] += x; d[r+1] -= x; R.inc("wr", 2);
        R.step(1, `Add ${x} to a[${l}..${r}]: d[${l}] += ${x} and d[${r+1}] -= ${x}. Two writes, however long the range is.`, T({ul:[l, r], dl:[l, r+1]})); });
      let acc = 0;
      for(let i=0;i<n;i++){ acc += d[i]; run[i] = acc; res[i] = a[i] + acc; R.inc("cells");
        R.step(3, `run = ${acc - d[i]} + d[${i}] (${d[i]}) = ${acc}, the total added to a[${i}]; a[${i}] becomes ${a[i]} + ${acc} = ${res[i]}.`, T({i})); }
      R.step(3, `Done: ${ups.length} range updates with ${R.c.wr} writes, then one pass of ${n}. Updating every cell directly would have taken ${ups.reduce((s,u)=>s+u[1]-u[0]+1,0)} writes.`, T({end:true})); return; }
    P[0] = 0; R.inc("cells");
    if(mode==="range") R.step(0, `P[0] = 0: the sum of no values. P[k] will be the sum of the first k values.`, S({k:0}));
    if(mode==="subk"){ const K = nums(v.k, -99, 99, 1)[0], seen = {0:[0]}; let count = 0; const found = [];
      const T = o => S(Object.assign({K, seen:Object.fromEntries(Object.entries(seen).map(([s,l])=>[s, l.slice()])), count, found:found.slice()}, o));
      R.step(0, `Count the subarrays that sum to ${K}. The map starts with {0: 1}: the empty prefix.`, T({k:0}));
      for(let i=0;i<n;i++){ P[i+1] = P[i] + a[i]; R.inc("cells"); const want = P[i+1] - K, hits = seen[want] || [];
        R.step(2, `sum = ${P[i]} + ${a[i]} = ${P[i+1]} (P[${i+1}]).`, T({k:i+1, i}));
        R.inc("look"); hits.forEach(j=>found.push([j, i])); count += hits.length; R.inc("sol", hits.length);
        R.step(3, hits.length ? `Look up ${P[i+1]} − ${K} = ${want}: seen ${hits.length} time${hits.length===1?"":"s"} (P[${hits.join("], P[")}]). So ${hits.map(j=>`a[${j}..${i}]`).join(" and ")} sum${hits.length===1?"s":""} to ${K}. count = ${count}.` : `Look up ${P[i+1]} − ${K} = ${want}: not seen yet, so no subarray ending at ${i} sums to ${K}.`, T({k:i+1, i, hit:hits, want}));
        (seen[P[i+1]] = seen[P[i+1]] || []).push(i+1);
        R.step(5, `Remember sum ${P[i+1]}: seen[${P[i+1]}] = ${seen[P[i+1]].length}.`, T({k:i+1, i, put:P[i+1]})); }
      R.step(6, `Done: ${count} subarray${count===1?"":"s"} sum to ${K}${found.length ? ": " + found.map(([j,i])=>`a[${j}..${i}]`).join(", ") : ""}. One pass and ${n} map lookups: O(n).`, T({end:true})); return; }
    const qs = ops(v.q).map(t=>{ const [l, r] = t.map(Number); if(t.length!==2 || !Number.isInteger(l) || !Number.isInteger(r) || l<0 || r<l || r>=n) throw new Error(`Write queries as "l r" with 0 ≤ l ≤ r ≤ ${n-1}, like "2 5".`); return [l, r]; });
    if(qs.length > 6) throw new Error("At most 6 queries.");
    for(let i=0;i<n;i++){ P[i+1] = P[i] + a[i]; R.inc("cells"); R.step(1, `P[${i+1}] = P[${i}] + a[${i}] = ${P[i]} + ${a[i]} = ${P[i+1]}.`, S({k:i+1, i})); }
    R.step(1, `The prefix array is built in one pass: O(n). Now every range sum is one subtraction.`, S({}));
    qs.forEach(([l, r])=>{ R.inc("look"); R.step(2, `sum(a[${l}..${r}]) = P[${r+1}] − P[${l}] = ${P[r+1]} − ${P[l]} = ${P[r+1]-P[l]}. P[${r+1}] counts everything up to a[${r}]; subtracting P[${l}] removes what comes before a[${l}].`, S({q:[l, r]})); });
    R.step(2, `Done: ${qs.length} quer${qs.length===1?"y":"ies"}, each O(1).`, S({end:true})); },
  draw(s){ const n = s.a.length;
    if(s.mode==="diff"){ const dl = new Set(s.dl||[]);
      const rows = [{label:"a", cells:s.a.map((x,i)=>({v:x, cls:i===s.i?"cmp":""}))},
        {label:"d", cells:s.d.map((x,i)=>({v:x, cls:dl.has(i)?"cur":i===s.i?"cmp":x?"win":""})), spans:s.ul?[[s.ul[0], s.ul[1]]]:[]},
        {label:"run", cells:s.run.map((x,i)=>({v:x===null?"":x, cls:i===s.i?"cur":x===null?"nil":""}))},
        {label:"new a", cells:s.res.map((x,i)=>({v:x===null?"":x, cls:i===s.i?"done":x===null?"nil":s.end?"done":"", focus:i===s.i}))}];
      return rowsSVG(rows, {lx:50, label:"Array, difference array and the prefix pass"}) + `<p class="av-aux">The bracket over d is the range being updated. "run" is the prefix sum of d: what was added to each cell.</p>`; }
    const P = s.P.map((x,k)=>({v:x===null?"":x, cls:k===s.k && !s.q ? "cur" : s.q && (k===s.q[0] || k===s.q[1]+1) ? "cmp" : s.hit && s.hit.includes(k) ? "done" : x===null ? "nil" : "", focus:k===s.k, sub:k}));
    const A = s.a.map((x,i)=>({v:x, cls:s.q ? (i>=s.q[0] && i<=s.q[1] ? "win" : "dim") : i===s.i ? "cmp" : ""}));
    const spans = s.q ? [[s.q[0], s.q[1]]] : s.hit ? s.hit.map(j=>[j, s.i, "ok"]) : [];
    const rows = [{label:"a", cells:A, off:.5, spans}, {label:"P", cells:P}];
    let extra = "";
    if(s.mode==="subk") extra = `<div class="av-h mono" style="margin-top:8px">seen prefix sums → how many times</div><div class="av-kvs">${Object.entries(s.seen).sort((x,y)=>+x[0]-+y[0]).map(([k,l])=>`<span class="kv${+k===s.want?" done":""}${+k===s.put?" cmp":""}">${esc(k)} → ${l.length}</span>`).join("")}</div><p class="av-aux mono">K = ${s.K} · count = ${s.count}${s.found.length ? " · " + esc(s.found.map(([j,i])=>`a[${j}..${i}]`).join(" ")) : ""}</p>`;
    return rowsSVG(rows, {lx:30, label:"Array and its prefix sums", top:20, idxOff:.5, extra:8}) + `<p class="av-aux">Top numbers are indexes of a; numbers under P are k. P[k] sits on the fence before a[k]: it is the sum of everything to its left.${s.q ? ` The range a[${s.q[0]}..${s.q[1]}] = P[${s.q[1]+1}] − P[${s.q[0]}].` : ""}</p>` + extra; } });

/* ---- segment tree with lazy range adds ---- */
const SG_FN = {sum:{op:(x,y)=>x+y, id:0, sym:"+", name:"sum"}, min:{op:(x,y)=>Math.min(x,y), id:INF, sym:"min", name:"minimum"}, max:{op:(x,y)=>Math.max(x,y), id:-INF, sym:"max", name:"maximum"}};
def({ id:"segtree", group:"Data structures", title:"Segment tree: range query, update and lazy add", concepts:["rangeq","trees","bigo"],
  text:"Each node of a segment tree stores the answer (sum, min or max) for one range of the array; its two children split that range in half, and the leaves are single cells. A range query takes the few nodes that fit inside the range whole and skips the rest: at most about 4 log n nodes. A point update changes one leaf and fixes its log n ancestors. A range add stops at nodes that are fully covered and leaves a lazy note there, pushed down only when a later visit needs the children.",
  inputs:[{k:"fn", label:"Each node stores", def:"sum", opts:[{v:"sum", label:"the sum"},{v:"min", label:"the minimum"},{v:"max", label:"the maximum"}]},
    {k:"a", label:"Array (up to 10 numbers, from -99 to 99)", def:"5, 3, 8, 6, 1, 4, 7, 2"},{k:"ops", label:"Operations", def:"query 2 6, set 3 10, query 2 6, add 0 4 2, query 3 5"}],
  random:()=>{ const n = rint(6,9); return {a:randArr(n, 1, 20), ops:`query ${rint(0,2)} ${rint(3,n-1)}, set ${rint(0,n-1)} ${rint(1,20)}, add ${rint(0,2)} ${rint(3,n-1)} ${rint(1,5)}, query ${rint(0,3)} ${rint(4,n-1)}`}; },
  counters:["nodes"], clabel:{nodes:"node visits"},
  code:v=>{ const s = (SG_FN[v.fn]||SG_FN.sum).sym; return ["build(node, l, r): a leaf copies a[l]",`  else build both halves; t[node] = t[left] ${s} t[right]`,"query(node, l, r): [l..r] outside the query: skip it","  [l..r] inside the query: use t[node]   (do not go down)",`  else: push down a lazy add; return query(left) ${s} query(right)`,"set(i, v): go down to the leaf for i and set it",`  on the way back up: t[node] = t[left] ${s} t[right]`,"add(l..r, v): node inside the range: apply v, lazy[node] += v","  else: push down, add into both halves, recompute t[node]"]; },
  run(v, R){ const F = SG_FN[v.fn] || SG_FN.sum, a = nums(v.a, -99, 99, 10), n = a.length, t = {}, lz = {}, rg = {};
    const list = ops(v.ops).map(o=>{ const x = o.slice(1).map(Number);
      if(o[0]==="query" && x.length===2 && x[0]>=0 && x[0]<=x[1] && x[1]<n) return o;
      if(o[0]==="set" && x.length===2 && x[0]>=0 && x[0]<n && Number.isInteger(x[1]) && Math.abs(x[1])<=99) return o;
      if(o[0]==="add" && x.length===3 && x[0]>=0 && x[0]<=x[1] && x[1]<n && Number.isInteger(x[2]) && Math.abs(x[2])<=99) return o;
      throw new Error(`Write "query l r", "set i v" or "add l r v", with indexes from 0 to ${n-1}.`); });
    if(list.length > 8) throw new Error("At most 8 operations.");
    const S = (o) => Object.assign({a:a.slice(), n, t:Object.assign({}, t), lz:Object.assign({}, lz), rg, fn:v.fn in SG_FN ? v.fn : "sum"}, o);
    const lbl = nd => `[${rg[nd][0]}..${rg[nd][1]}]`, cls = {};
    const snap = o => S(Object.assign({cls:Object.assign({}, cls)}, o));
    const build = (nd, l, r) => { rg[nd] = [l, r]; R.inc("nodes");
      if(l===r){ t[nd] = a[l]; R.step(0, `Leaf ${lbl(nd)} holds a[${l}] = ${a[l]}.`, snap({cur:nd})); return; }
      const m = (l+r) >> 1; build(2*nd, l, m); build(2*nd+1, m+1, r); t[nd] = F.op(t[2*nd], t[2*nd+1]);
      R.step(1, `Node ${lbl(nd)} = ${fmtInf(t[2*nd])} ${F.sym} ${fmtInf(t[2*nd+1])} = ${fmtInf(t[nd])}, from its children ${lbl(2*nd)} and ${lbl(2*nd+1)}.`, snap({cur:nd, kids:[2*nd, 2*nd+1]})); };
    const apply = (nd, x) => { const [l, r] = rg[nd]; t[nd] += F===SG_FN.sum ? x*(r-l+1) : x; if(l<r) lz[nd] = (lz[nd]||0) + x; };
    const push = nd => { if(!lz[nd]) return; const x = lz[nd]; apply(2*nd, x); apply(2*nd+1, x); delete lz[nd];
      R.step(4, `Node ${lbl(nd)} has a pending add of ${x}. Push it down to both children before going below it.`, snap({cur:nd, kids:[2*nd, 2*nd+1]})); };
    R.step(0, `Build a segment tree over ${n} values. Each node stores the ${F.name} of its range.`, S({cls:{}}));
    build(1, 0, n-1);
    R.step(1, `Built: ${Object.keys(t).length} nodes, the root ${lbl(1)} holds ${fmtInf(t[1])}. Building is O(n).`, S({cls:{}}));
    for(const o of list){ const x = o.slice(1).map(Number); Object.keys(cls).forEach(k=>delete cls[k]);
      if(o[0]==="query"){ const [ql, qr] = x; let used = [], vis = 0;
        const q = nd => { const [l, r] = rg[nd]; R.inc("nodes"); vis++;
          if(r < ql || l > qr){ cls[nd] = "dim"; R.step(2, `${lbl(nd)} is outside [${ql}..${qr}]: skip it.`, snap({cur:nd, q:[ql, qr]})); return F.id; }
          if(ql <= l && r <= qr){ cls[nd] = "done"; used.push(nd); R.step(3, `${lbl(nd)} is inside [${ql}..${qr}]: use its value ${fmtInf(t[nd])} and do not go further down.`, snap({cur:nd, q:[ql, qr]})); return t[nd]; }
          cls[nd] = "cmp"; R.step(4, `${lbl(nd)} is partly inside [${ql}..${qr}]: ask both children.`, snap({cur:nd, q:[ql, qr]}));
          push(nd); return F.op(q(2*nd), q(2*nd+1)); };
        R.step(2, `query ${ql} ${rg[1] ? "" : ""}${qr}: the ${F.name} of a[${ql}..${qr}]. Start at the root.`, snap({q:[ql, qr]}));
        const res = q(1);
        R.step(3, `The ${F.name} of a[${ql}..${qr}] is ${used.map(nd=>fmtInf(t[nd])).join(` ${F.sym} `)}${used.length>1 ? ` = ${fmtInf(res)}` : ""}, from ${used.length} node${used.length===1?"":"s"} (${used.map(lbl).join(", ")}). ${vis} nodes visited, not ${qr-ql+1} cells.`, snap({q:[ql, qr], res})); continue; }
      if(o[0]==="set"){ const [i, val] = x; a[i] = val; const path = [];
        R.step(5, `set ${i} ${val}: go down to the leaf for a[${i}].`, snap({pt:i}));
        const go = nd => { const [l, r] = rg[nd]; R.inc("nodes"); path.push(nd); cls[nd] = "cmp";
          if(l===r){ t[nd] = val; cls[nd] = "cur"; R.step(5, `Leaf ${lbl(nd)} now holds ${val}.`, snap({cur:nd, pt:i})); return; }
          push(nd); const m = (l+r) >> 1; R.step(5, `${lbl(nd)}: index ${i} is in the ${i<=m?"left":"right"} half.`, snap({cur:nd, pt:i}));
          go(i<=m ? 2*nd : 2*nd+1); t[nd] = F.op(t[2*nd], t[2*nd+1]); cls[nd] = "done";
          R.step(6, `Back up at ${lbl(nd)}: recompute ${fmtInf(t[2*nd])} ${F.sym} ${fmtInf(t[2*nd+1])} = ${fmtInf(t[nd])}.`, snap({cur:nd, kids:[2*nd, 2*nd+1], pt:i})); };
        go(1); R.step(6, `Done: ${path.length} nodes changed, one per level: O(log n).`, snap({pt:i})); continue; }
      const [ql, qr, val] = x;
      R.step(7, `add ${ql} ${qr} ${val}: add ${val} to every value in a[${ql}..${qr}], without visiting every leaf.`, snap({q:[ql, qr]}));
      const ad = nd => { const [l, r] = rg[nd]; R.inc("nodes");
        if(r < ql || l > qr){ cls[nd] = "dim"; R.step(7, `${lbl(nd)} is outside the range: nothing to do.`, snap({cur:nd, q:[ql, qr]})); return; }
        if(ql <= l && r <= qr){ apply(nd, val); cls[nd] = "done"; R.step(7, `${lbl(nd)} is fully inside: its ${F.name} becomes ${fmtInf(t[nd])}${l<r ? `, and it keeps a lazy note "+${val}" for its children instead of updating them now` : ""}.`, snap({cur:nd, q:[ql, qr]})); return; }
        cls[nd] = "cmp"; push(nd); R.step(8, `${lbl(nd)} is partly inside: go into both halves.`, snap({cur:nd, q:[ql, qr]}));
        ad(2*nd); ad(2*nd+1); t[nd] = F.op(t[2*nd], t[2*nd+1]);
        R.step(8, `Back at ${lbl(nd)}: recompute ${fmtInf(t[2*nd])} ${F.sym} ${fmtInf(t[2*nd+1])} = ${fmtInf(t[nd])}.`, snap({cur:nd, kids:[2*nd, 2*nd+1], q:[ql, qr]})); };
      ad(1); for(let i=ql;i<=qr;i++) a[i] += val;
      R.step(8, `Done: the range add touched O(log n) nodes. Lazy notes wait until a query or update has to go below them.`, snap({q:[ql, qr]})); }
    R.step(3, "Done.", S({cls:{}})); },
  draw(s){ const UX = 44, BW = 38, BH = 24, UY = 52, X0 = 30, rg = s.rg, ids = Object.keys(rg).map(Number), X = {}, D = {};
    ids.forEach(nd=>{ const [l, r] = rg[nd]; D[nd] = Math.floor(Math.log2(nd)); X[nd] = X0 + (l + r + 1)/2*UX; });
    const maxD = Math.max(0, ...ids.map(i=>D[i])), Y = d => 26 + d*UY, AY = Y(maxD) + UY - 6, W = X0 + s.n*UX + 10, H = AY + 50;
    let e = "", g = "";
    ids.forEach(nd=>{ [2*nd, 2*nd+1].filter(c=>rg[c]).forEach(c=>{ e += `<line x1="${X[nd]}" y1="${Y(D[nd])+BH/2}" x2="${X[c]}" y2="${Y(D[c])-BH/2}" class="${s.cls[c]==="done"||s.cls[c]==="cmp"?"hot":""}"/>`; });
      const c = (nd===s.cur ? "cur " : "") + (s.kids && s.kids.includes(nd) ? "kid " : "") + (s.cls[nd]||""), [l, r] = rg[nd];
      g += `<g class="sg ${c}"${nd===s.cur?" data-focus":""}><rect x="${X[nd]-BW/2}" y="${Y(D[nd])-BH/2}" width="${BW}" height="${BH}" rx="5"/><text x="${X[nd]}" y="${Y(D[nd])+4.5}" text-anchor="middle">${s.t[nd]===undefined?"":fmtInf(s.t[nd])}</text><text x="${X[nd]}" y="${Y(D[nd])+BH/2+11}" text-anchor="middle" class="sub">${l===r?l:l+"–"+r}</text>${s.lz[nd]?`<g class="lz"><rect x="${X[nd]+BW/2-12}" y="${Y(D[nd])-BH/2-11}" width="${String(s.lz[nd]).length*7+14}" height="15" rx="7"/><text x="${X[nd]+BW/2-5}" y="${Y(D[nd])-BH/2}">${s.lz[nd]>0?"+":""}${s.lz[nd]}</text></g>`:""}</g>`; });
    s.a.forEach((x,i)=>{ const inq = s.q && i>=s.q[0] && i<=s.q[1], pt = s.pt===i;
      g += `<g class="rc ${inq?"win":pt?"cur":""}"><rect x="${X0 + i*UX + (UX-BW)/2}" y="${AY}" width="${BW}" height="26" rx="5"/><text x="${X0 + i*UX + UX/2}" y="${AY+17.5}" text-anchor="middle">${x}</text><text x="${X0 + i*UX + UX/2}" y="${AY+39}" text-anchor="middle" class="sub">${i}</text></g>`; });
    g += `<text x="${X0-6}" y="${AY+17.5}" text-anchor="end" class="rl">a</text>`;
    return wide(W, H, e + g, `Segment tree over ${s.n} values`, .85, "av-sg") + `<p class="av-aux av-key"><span><i class="cur"></i>current node</span><span><i class="cmp"></i>partly inside: go down</span><span><i class="done"></i>used / updated</span><span><i class="prn"></i>outside: skipped</span><span><i class="swp"></i>lazy note</span></p>${s.res!==undefined ? `<p class="av-aux mono">answer: ${fmtInf(s.res)}</p>` : ""}`; } });

/* ---- fast and slow pointers ---- */
def({ id:"fastslow", group:"Arrays & strings", title:"Fast and slow pointers: cycle and middle", concepts:["proofs","bigo","numbertheory"],
  text:v=>v.mode==="middle" ? "Move slow one node and fast two nodes at a time. When fast reaches the end, slow has gone exactly half as far: it is at the middle. One pass, O(1) extra memory, and you never need the length." :
    "Move slow one node and fast two nodes per step (Floyd's cycle finding). Without a cycle fast falls off the end. With one, both end up going round the cycle and fast gains one node per step, so it catches slow within one lap. Then start one pointer again from the head and move both one step at a time: they meet exactly where the cycle starts, because the tail length equals the distance from the meeting point to the start, plus whole laps. O(n) time, O(1) memory.",
  inputs:[{k:"mode", label:"Problem", def:"cycle", opts:[{v:"cycle", label:"Find the cycle and where it starts", set:{pos:"3"}},{v:"middle", label:"Middle of the list", set:{pos:"-1"}}]},
    {k:"a", label:"List values (up to 12)", def:"3, 8, 5, 1, 9, 4, 7, 2, 6"},{k:"pos", label:"The last node links back to index (-1 = no cycle)", def:"3", w:4, when:v=>v.mode!=="middle"}],
  random:v=>{ const n = rint(6,11); return {a:randArr(n, 1, 9), pos:v.mode==="middle" ? "-1" : String(Math.random()<.85 ? rint(0, n-2) : -1)}; },
  counters:["steps"],
  code:v=>v.mode==="middle" ? ["slow = fast = head","while fast and fast.next:","  slow = slow.next; fast = fast.next.next","slow is the middle (fast went twice as far)"]
    : ["slow = fast = head","while fast and fast.next:","  slow = slow.next; fast = fast.next.next","  if slow == fast: they meet inside the cycle","no cycle: fast reached the end","phase 2: p = head; q = meeting point","while p != q: p = p.next; q = q.next","p is where the cycle starts"],
  run(v, R){ const mode = v.mode==="middle" ? "middle" : "cycle", a = nums(v.a, -99, 99, 12), n = a.length;
    if(n < 2) throw new Error("Use at least 2 values.");
    const pos = mode==="middle" ? -1 : nums(v.pos, -1, n-1, 1)[0], nx = i => i===null ? null : i < n-1 ? i+1 : (pos>=0 ? pos : null);
    const S = o => Object.assign({a, pos, mode}, o);
    let s = 0, f = 0;
    R.step(0, mode==="middle" ? `Find the middle of ${n} nodes in one pass. Both pointers start at the head.` : `Is there a cycle in this list${pos>=0 ? "" : ""}? Both pointers start at the head.`, S({s, f}));
    if(mode==="middle"){
      while(f!==null && nx(f)!==null){ s = nx(s); f = nx(nx(f)); R.inc("steps", 3);
        R.step(2, `slow moves 1 to index ${s}; fast moves 2 to ${f===null ? "the end (null)" : "index " + f}.`, S({s, f})); }
      R.step(3, `fast ${f===null ? "fell off the end" : "is on the last node"}, so slow (index ${s}, value ${a[s]}) is the middle${n%2===0 ? " (the second of the two middle nodes)" : ""}.`, S({s, f, end:true})); return; }
    let k = 0;
    for(;;){
      if(f===null || nx(f)===null){ R.step(4, `fast ${f===null ? "fell off the end" : "is on the last node and has no next"}: there is no cycle. ${k} steps.`, S({s, f, end:true})); return; }
      s = nx(s); f = nx(nx(f)); k++; R.inc("steps", 3);
      if(s===f){ R.step(3, `slow moves to index ${s}, fast jumps 2 to index ${f}: they meet after ${k} steps. Fast went ${2*k} nodes, slow ${k}; the difference ${k} is a whole number of laps.`, S({s, f, meet:s})); break; }
      R.step(2, `slow moves to index ${s}; fast jumps 2 to index ${f}.${pos>=0 && s>=pos ? ` Both are in the cycle now; fast is ${((s - f) % (n-pos) + (n-pos)) % (n-pos)} node${((s - f) % (n-pos) + (n-pos)) % (n-pos)===1?"":"s"} behind slow and gains 1 per step.` : ""}`, S({s, f})); }
    const meet = s; let p = 0, q = meet;
    R.step(5, `Phase 2: p starts again at the head; q stays at the meeting point (index ${meet}). Both now move 1 step at a time.`, S({p, q, meet}));
    while(p!==q){ p = nx(p); q = nx(q); R.inc("steps", 2); R.step(6, `p moves to index ${p}; q moves to index ${q}.`, S({p, q, meet})); }
    R.step(7, `p and q meet at index ${p} (value ${a[p]}): the cycle starts here. The tail has ${pos} node${pos===1?"":"s"} and the cycle ${n-pos}.`, S({p, q, meet, start:p, end:true})); },
  draw(s){ const a = s.a, n = a.length, cyc = s.pos >= 0, tail = cyc ? s.pos : n, c = n - tail, PX = 46, X0 = 26, R0 = 15;
    const Rc = cyc ? Math.max(46, c*56/(2*Math.PI)) : 0, CY = cyc ? Rc + 40 : 40, P = [];
    for(let i=0;i<tail;i++) P[i] = [X0 + i*PX, CY];
    const cx = X0 + tail*PX + Rc - (cyc ? 0 : 0);
    for(let j=0;j<c;j++){ const t = Math.PI + j*2*Math.PI/c; P[tail+j] = [cx + Rc*Math.cos(t), CY - Rc*Math.sin(t)]; }
    const W = Math.round((cyc ? cx + Rc : X0 + (n-1)*PX) + 34), H = Math.round(cyc ? CY + Rc + 42 : 92);
    let e = ARROW, g = "";
    for(let i=0;i<n;i++){ const j = i < n-1 ? i+1 : (cyc ? s.pos : -1); if(j<0) continue;
      const [x1,y1] = P[i], [x2,y2] = P[j], L = Math.hypot(x2-x1, y2-y1) || 1, ux = (x2-x1)/L, uy = (y2-y1)/L;
      e += `<line x1="${(x1+ux*R0).toFixed(1)}" y1="${(y1+uy*R0).toFixed(1)}" x2="${(x2-ux*(R0+3)).toFixed(1)}" y2="${(y2-uy*(R0+3)).toFixed(1)}" class="${i===n-1?"back":""}" marker-end="url(#av-arr)"/>`; }
    if(!cyc) g += `<text x="${P[n-1][0] + R0 + 6}" y="${CY+4}" class="sub">null</text>`;
    const tags = {}; const tag = (i, t) => { if(i===null || i===undefined) return; (tags[i] = tags[i] || []).push(t); };
    if(s.p!==undefined){ tag(s.p, "p"); tag(s.q, "q"); } else { tag(s.s, "slow"); tag(s.f, "fast"); }
    a.forEach((x,i)=>{ const [px,py] = P[i], tg = tags[i] || [];
      // pointer names sit above a tail node, and outside the circle for a cycle node
      let tx = px, ty = py - R0 - 6, anc = "middle";
      if(i >= tail && i !== tail){ const dx = px - cx, dy = py - CY, L = Math.hypot(dx, dy) || 1; tx = px + dx/L*(R0+8); ty = py + dy/L*(R0+8) + 4; anc = Math.abs(dx/L) < .35 ? "middle" : dx > 0 ? "start" : "end"; if(dy > 0 && Math.abs(dx/L) < .35) ty += 8; }
      const cls = i===s.start ? "done" : tg.length===2 ? "cur" : tg.includes("fast") || tg.includes("q") ? "cmp" : tg.length ? "sel" : i===s.meet ? "meet" : "";
      g += `<g class="tn ${cls}"${tg.length?" data-focus":""}><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${R0}"/><text x="${px.toFixed(1)}" y="${(py+4).toFixed(1)}" text-anchor="middle">${x}</text><text x="${px.toFixed(1)}" y="${(py+R0+12).toFixed(1)}" text-anchor="middle" class="sub">${i}</text>${tg.length?`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anc}" class="ptr">${tg.join(" + ")}</text>`:""}</g>`; });
    const f = s.p===undefined && s.f===null ? `<p class="av-aux mono">fast = null (past the end)</p>` : "";
    return wide(W, H, e + g, `Linked list of ${n} nodes${cyc ? `; the last links back to index ${s.pos}` : ""}`, .85, "av-fs") + f + `<p class="av-aux av-key"><span><i class="win"></i>${s.p===undefined?"slow":"p"}</span><span><i class="cmp"></i>${s.p===undefined?"fast":"q"}</span><span><i class="cur"></i>both</span>${cyc ? `<span><i class="done"></i>cycle start</span>` : ""}</p>`; } });

/* ---- binary search on the answer ---- */
const BA_MODES = [{v:"ship", label:"Ship packages within D days", set:{a:"1, 2, 3, 4, 5, 6, 7, 8, 9, 10", d:"5"}},{v:"koko", label:"Eating speed: finish the piles in H hours", set:{a:"3, 6, 7, 11", d:"8"}}];
def({ id:"bsanswer", group:"Searching", title:"Binary search on the answer", concepts:["bigo","greedydc","proofs"],
  text:"Some problems ask for the smallest value that works (the lowest ship capacity, the slowest eating speed) where any bigger value also works. Then the answers form a line of 'no' followed by 'yes', and you can binary search on that line: test the middle value with a quick simulation, and throw away the half that cannot hold the first 'yes'. O(n log(range)) instead of trying every value.",
  inputs:[{k:"mode", label:"Problem", def:"ship", opts:BA_MODES},{k:"a", label:v=>v.mode==="koko"?"Banana piles (up to 10, from 1 to 30)":"Package weights, in order (up to 12, from 1 to 30)", def:"1, 2, 3, 4, 5, 6, 7, 8, 9, 10"},
    {k:"d", label:v=>v.mode==="koko"?"Hours H":"Days D", def:"5", w:4}],
  random:v=>v.mode==="koko" ? (()=>{ const a = randArr(rint(3,6), 2, 30); return {a, d:String(a.split(",").length + rint(1,5))}; })() : {a:randArr(rint(6,10), 1, 12), d:String(rint(2,5))},
  counters:["check","steps"], clabel:{steps:"simulation steps"},
  code:v=>[v.mode==="koko" ? "lo = 1; hi = max(piles)   (the answer is in [lo, hi])" : "lo = max(weights); hi = sum(weights)   (the answer is in [lo, hi])","while lo < hi:","  mid = (lo + hi) / 2, rounded down","  if feasible(mid): hi = mid   (mid works; maybe smaller works too)","  else: lo = mid + 1   (mid fails, and so does everything below it)","return lo   (the smallest value that works)",
    v.mode==="koko" ? "feasible(k): sum of ceil(pile / k) hours <= H" : "feasible(cap): fill each day in order; days needed <= D"],
  run(v, R){ const mode = v.mode==="koko" ? "koko" : "ship", a = nums(v.a, 1, 30, mode==="koko"?10:12), D = nums(v.d, 1, 99, 1)[0];
    if(mode==="koko" && D < a.length) throw new Error(`Koko eats from one pile per hour, so H must be at least the number of piles (${a.length}).`);
    let lo = mode==="koko" ? 1 : Math.max(...a), hi = mode==="koko" ? Math.max(...a) : a.reduce((x,y)=>x+y, 0); const L0 = lo, H0 = hi, tried = [];
    const sim = x => { R.inc("check"); if(mode==="koko"){ const hrs = a.map(p=>Math.ceil(p/x)); R.inc("steps", a.length); return {groups:hrs, used:hrs.reduce((p,q)=>p+q, 0)}; }
      const groups = []; let cur = [], load = 0; a.forEach(w=>{ R.inc("steps"); if(load + w > x){ groups.push(cur); cur = []; load = 0; } cur.push(w); load += w; }); groups.push(cur); return {groups, used:groups.length}; };
    const S = o => Object.assign({mode, a, D, lo, hi, L0, H0, tried:tried.slice()}, o);
    const unit = mode==="koko" ? "hours" : "days", what = mode==="koko" ? "speed" : "capacity";
    R.step(0, mode==="koko" ? `The speed is at least 1 and at most ${H0} (the biggest pile: faster never helps). Find the slowest speed that finishes ${a.length} piles in ${D} hours.` : `The capacity is at least ${L0} (the heaviest package) and at most ${H0} (everything in one day). Find the smallest that ships everything in ${D} days.`, S({}));
    while(lo < hi){ const mid = (lo + hi) >> 1;
      R.step(2, `The answer is in [${lo}, ${hi}]. Try the middle: ${what} ${mid}.`, S({mid}));
      const r = sim(mid), ok = r.used <= D; tried.push([mid, ok]);
      R.step(6, mode==="koko" ? `At speed ${mid}: ${a.map((p,i)=>`${p}→${r.groups[i]}h`).join(", ")} = ${r.used} hours. ${ok ? `That is within ${D}` : `That is more than ${D}`}.` : `With capacity ${mid}: ${r.groups.map(g=>`[${g.join(" ")}]`).join(" ")}, ${r.used} days. ${ok ? `That is within ${D}` : `That is more than ${D}`}.`, S({mid, sim:r, ok}));
      if(ok){ hi = mid; R.step(3, `${mid} works, so every ${what} above it works too. Keep ${mid} and search below: hi = ${mid}.`, S({mid, sim:r, ok})); }
      else { lo = mid + 1; R.step(4, `${mid} fails, so every ${what} below it fails too. lo = ${mid + 1}.`, S({mid, sim:r, ok})); } }
    const r = sim(lo);
    R.step(5, `lo = hi = ${lo}: the smallest ${what} that works (${r.used} ${unit}). ${R.c.check} feasibility checks instead of up to ${H0 - L0 + 1}.`, S({mid:lo, sim:r, ok:true, end:true})); },
  draw(s){ const W = 360, X0 = 22, X1 = W - 22, span = Math.max(1, s.H0 - s.L0), x = v => X0 + (X1 - X0)*(v - s.L0)/span, Y = 46;
    let g = `<line x1="${X0}" y1="${Y}" x2="${X1}" y2="${Y}" class="axis"/>`;
    if(s.lo > s.L0) g += `<rect x="${X0}" y="${Y-9}" width="${Math.max(2, x(s.lo) - X0 - (span?((X1-X0)/span)/2:0))}" height="18" class="ba-no"/>`;
    if(s.hi < s.H0 || (s.end)) g += `<rect x="${x(s.hi)}" y="${Y-9}" width="${Math.max(2, X1 - x(s.hi))}" height="18" class="ba-yes"/>`;
    s.tried.forEach(([m, ok])=>{ g += `<circle cx="${x(m)}" cy="${Y}" r="4" class="${ok?"yes":"no"}"/>`; });
    const mk = (v, lab, cls, up) => `<g class="ba-m ${cls}"><path d="M${x(v)},${up?Y-11:Y+11} l-5,${up?-8:8} h10 z"/><text x="${x(v)}" y="${up?Y-23:Y+31}" text-anchor="middle">${esc(lab)}</text></g>`;
    g += mk(s.lo, "lo " + s.lo, "lo", false) + (s.hi!==s.lo ? mk(s.hi, "hi " + s.hi, "hi", false) : "");
    if(s.mid!==undefined && !s.end) g += mk(s.mid, "mid " + s.mid, "mid", true);
    if(s.end) g += mk(s.lo, "answer " + s.lo, "mid", true);
    g += `<text x="${X0}" y="${Y+52}" text-anchor="start" class="sub">${s.L0}</text><text x="${X1}" y="${Y+52}" text-anchor="end" class="sub">${s.H0}</text>`;
    let sim = "";
    if(s.sim) sim = s.mode==="koko" ? `<div class="av-kvs">${s.a.map((p,i)=>`<span class="kv">${p} → ${s.sim.groups[i]} h</span>`).join("")}</div>`
      : `<div class="av-kvs">${s.sim.groups.map((g2,d)=>`<span class="kv" style="border-color:${SCOL[d%SCOL.length]}"><span class="sw" style="background:${SCOL[d%SCOL.length]}"></span>day ${d+1}: ${g2.join(" ")} <b>(${g2.reduce((p,q)=>p+q,0)})</b></span>`).join("")}</div>`;
    return `<svg class="av-svg av-ba" viewBox="0 0 ${W} 108" style="max-width:520px" role="img" aria-label="Candidate answers from ${s.L0} to ${s.H0}; the answer is in [${s.lo}, ${s.hi}]">${g}</svg>
      <p class="av-aux av-key"><span><i class="ba-n"></i>known to fail</span><span><i class="done"></i>known to work</span></p>
      ${s.sim ? `<div class="av-h mono" style="margin-top:8px">simulation with ${s.mode==="koko"?"speed":"capacity"} ${s.mid}: ${s.sim.used} ${s.mode==="koko"?"hours":"days"} ${s.ok ? "≤" : ">"} ${s.D} ${s.ok ? "✓" : "✗"}</div>${sim}` : ""}`; } });

/* ---- minimum spanning tree ---- */
const MST_E = "A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 3";
def({ id:"mst", group:"Graphs", title:"Minimum spanning tree: Kruskal and Prim", concepts:["mst","graphsalgo","unionfind","greedydc"],
  text:v=>v.mode==="prim" ? "Prim grows one tree from a start node. A min-heap holds the edges that leave the tree; take the lightest, and if its far end is new, add that node and push its edges. An edge whose ends are both in the tree already is stale and skipped. O(E log V). Both algorithms are correct because of the cut property: the lightest edge across any split of the nodes is safe to take."
    : "Kruskal looks at the edges from lightest to heaviest and keeps an edge unless its two ends are already connected, which union–find answers in almost O(1). A kept edge joins two separate trees; a rejected one would close a cycle. It stops after n − 1 edges. O(E log E) for the sort. The lightest edge joining two different trees is always safe (the cut property).",
  inputs:[{k:"mode", label:"Algorithm", def:"kruskal", opts:[{v:"kruskal", label:"Kruskal (sort edges + union–find)"},{v:"prim", label:"Prim (grow from a node + heap)"}]},
    {k:"e", label:"Edges (A-B weight)", def:MST_E},{k:"src", label:"Start node", def:"A", w:4, when:v=>v.mode==="prim"}],
  random:()=>({e:MST_E.replace(/\d+/g, ()=>rint(1,12))}), counters:["cmp","w"], clabel:{cmp:"edges checked"},
  code:v=>v.mode==="prim" ? ["tree = {start}; heap = edges of start","while heap is not empty and the tree misses nodes:","  (w, u, v) = heap.pop_min()","  if v is already in the tree: skip it   (stale)","  add v and the edge (u, v) to the tree","  push every edge from v to a node not in the tree","done: the tree spans every node it can reach"]
    : ["sort the edges by weight","for each edge (u, v, w), lightest first:","  if find(u) == find(v): skip   (it would close a cycle)","  union(u, v); keep the edge","  stop when n - 1 edges are kept","done: the kept edges form a minimum spanning tree"],
  run(v, R){ const {E, ids} = parseEdges(v.e, false), mode = v.mode==="prim" ? "prim" : "kruskal", keep = [], rej = [];
    const S = o => Object.assign({E, ids, mode, keep:keep.slice(), rej:rej.slice()}, o);
    if(mode==="kruskal"){ const order = E.map((e,k)=>k).sort((x,y)=>E[x].w - E[y].w || x - y), par = {}; ids.forEach(i=>par[i] = i);
      const find = x => { while(par[x]!==x) x = par[x]; return x; };
      const T = o => S(Object.assign({order, par:Object.assign({}, par)}, o));
      R.step(0, `Sort the ${E.length} edges by weight: ${order.map(k=>`${E[k].a}${E[k].b} ${E[k].w}`).join(", ")}. Each node starts as its own tree.`, T({}));
      for(const k of order){ const e = E[k], ra = find(e.a), rb = find(e.b); R.inc("cmp");
        if(ra===rb){ rej.push(k); R.step(2, `${e.a}–${e.b} (${e.w}): ${e.a} and ${e.b} are already in the same tree (root ${ra}). Keeping it would close a cycle: skip.`, T({ek:k, no:true})); continue; }
        par[rb] = ra; keep.push(k); R.inc("w", e.w);
        R.step(3, `${e.a}–${e.b} (${e.w}): ${e.a} is in tree ${ra} and ${e.b} in tree ${rb}, so keep it and join the trees. It is the lightest edge between them, so it is safe.`, T({ek:k}));
        if(keep.length === ids.length - 1){ R.step(4, `${keep.length} edges for ${ids.length} nodes: the tree is complete. The heavier edges are not needed.`, T({})); break; } }
      R.step(5, keep.length===ids.length-1 ? `Minimum spanning tree: ${keep.map(k=>E[k].a+E[k].b).join(", ")}, total weight ${R.c.w}.` : `The graph is not connected: this is a minimum spanning forest of weight ${R.c.w}.`, T({end:true})); return; }
    const src = String(v.src||"").trim(); if(!ids.includes(src)) throw new Error(`The start node "${src}" is not in the graph.`);
    const inT = [src]; let heap = [];
    const pushFrom = u => E.forEach((e,k)=>{ if(e.a===u && !inT.includes(e.b)) heap.push([e.w, u, e.b, k]); else if(e.b===u && !inT.includes(e.a)) heap.push([e.w, u, e.a, k]); });
    const T = o => S(Object.assign({inT:inT.slice(), heap:heap.slice().sort((x,y)=>x[0]-y[0])}, o));
    pushFrom(src); R.step(0, `Start the tree at ${src}. Push its ${heap.length} edges into the heap.`, T({u:src}));
    while(heap.length && inT.length < ids.length){ heap.sort((x,y)=>x[0]-y[0] || x[3]-y[3]); const [w, u, x, k] = heap.shift(); R.inc("cmp");
      if(inT.includes(x)){ rej.push(k); R.step(3, `Pop ${u}–${x} (${w}): ${x} is already in the tree, so this edge is stale. Skip it.`, T({ek:k, no:true})); continue; }
      inT.push(x); keep.push(k); R.inc("w", w);
      R.step(4, `Pop ${u}–${x} (${w}), the lightest edge leaving the tree. Add ${x} to the tree.`, T({ek:k, u:x}));
      const before = heap.length; pushFrom(x);
      if(heap.length > before) R.step(5, `Push the ${heap.length - before} edge${heap.length-before===1?"":"s"} from ${x} to nodes outside the tree.`, T({u:x})); }
    R.step(6, inT.length===ids.length ? `Every node is in the tree: ${keep.map(k=>E[k].a+E[k].b).join(", ")}, total weight ${R.c.w}.` : `The heap is empty but ${ids.filter(i=>!inT.includes(i)).join(", ")} cannot be reached: the graph is not connected.`, T({end:true})); },
  draw(s){ const pos = s.ids.every(i=>DPOS[i]) ? DPOS : circlePos(s.ids, 250, 135, 105), kp = new Set(s.keep), rj = new Set(s.rej);
    const inT = s.inT ? new Set(s.inT) : null;
    const nodes = s.ids.map(i=>({id:i, x:pos[i][0], y:pos[i][1], cls:(i===s.u?"cur ":"") + (inT ? (inT.has(i)?"done":"") : ""), sub:s.par ? (s.par[i]===i ? "root" : "→" + s.par[i]) : undefined}));
    const edges = s.E.map((e,k)=>({a:e.a, b:e.b, w:e.w, cls:k===s.ek ? (s.no ? "try" : "hot") : kp.has(k) ? "tree" : rj.has(k) ? "gone" : ""}));
    let side;
    if(s.order) side = `<div class="av-h mono" style="margin-top:6px">edges, lightest first</div><div class="av-kvs">${s.order.map(k=>`<span class="kv${k===s.ek?(s.no?" miss":" cmp"):kp.has(k)?" done":rj.has(k)?" gone":""}">${esc(s.E[k].a+s.E[k].b)} ${s.E[k].w}${kp.has(k)?" ✓":rj.has(k)?" ✗":""}</span>`).join("")}</div><p class="av-aux">Small text under each node: its parent in union–find ("root" = the name of its tree).</p>`;
    else side = `<div class="av-h mono" style="margin-top:6px">heap of edges leaving the tree (lightest first)</div><div class="av-kvs">${s.heap.map(h=>`<span class="kv${inT.has(h[2])?" gone":""}">${esc(h[1]+h[2])} ${h[0]}</span>`).join("") || '<span class="nil mono">empty</span>'}</div>`;
    return graphSVG(nodes, edges, {label:"Weighted graph"}) + side + `<p class="av-aux mono">tree edges: ${esc(s.keep.map(k=>s.E[k].a+s.E[k].b).join(", ") || "none yet")}</p>`; } });

/* ---- line sweep ---- */
function parseIntervals(str){
  const out = String(str||"").split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).map(t=>{
    const m = t.match(/^(\d+)\s*-\s*(\d+)(?:\s*[x×*]\s*(\d+))?$/); if(!m) throw new Error(`Write intervals like "5-10" (start-end), or "5-10 x3" with a weight. Could not read "${t}".`);
    const s = +m[1], e = +m[2], w = m[3] ? +m[3] : 1; if(e <= s) throw new Error(`An interval must end after it starts: "${t}".`); if(e > 100) throw new Error("Use times from 0 to 100.");
    if(w < 1 || w > 9) throw new Error("Weights go from 1 to 9."); return {s, e, w}; });
  if(!out.length) throw new Error("Type some intervals."); if(out.length > 9) throw new Error("At most 9 intervals, so every row stays readable.");
  return out;
}
def({ id:"sweep", group:"Arrays & strings", title:"Line sweep: the busiest moment", concepts:["compgeom","sorting","prefixsums"],
  text:"Turn every interval into two events: +1 (or + its weight) when it starts and −1 when it ends. Sort the events by time and sweep a line across them, keeping a running total of what is active; its maximum is the number of meeting rooms you need (or the peak load of a car). When an end and a start share a time, the end goes first, because [start, end) intervals that only touch do not overlap. O(n log n) for the sort.",
  inputs:[{k:"iv", label:"Intervals start-end (end not included), optional weight: 5-10 x3", def:"0-30, 5-10, 15-20, 12-25, 25-35, 31-40"},{k:"cap", label:"Capacity (0 = none)", def:"0", w:4}],
  presets:[{name:"Meeting rooms", v:{iv:"0-30, 5-10, 15-20, 12-25, 25-35, 31-40", cap:"0"}},{name:"Car pooling (capacity 4)", v:{iv:"1-5 x2, 3-7 x3, 8-12 x2, 9-11 x1", cap:"4"}},{name:"Touching ends", v:{iv:"0-10, 10-20, 20-30", cap:"0"}}],
  random:()=>{ const n = rint(4,7); return {iv:Array.from({length:n},()=>{ const s = rint(0,40); return `${s}-${s+rint(4,20)}`; }).join(", "), cap:"0"}; },
  counters:["ev"],
  code:["events = (start, +w) and (end, -w) for every interval","sort by time; at the same time, ends (-) go first","active = 0; best = 0","for each event (time, d) in order:","  active = active + d","  best = max(best, active)   (if capacity: active > capacity fails)","return best"],
  run(v, R){ const iv = parseIntervals(v.iv), cap = nums(v.cap, 0, 99, 1)[0];
    const ev = []; iv.forEach((x,i)=>{ ev.push({t:x.s, d:x.w, i}); ev.push({t:x.e, d:-x.w, i}); });
    ev.sort((a,b)=>a.t-b.t || a.d-b.d);
    let active = 0, best = 0, bt = null; const on = new Set(), done = new Set();
    const S = o => Object.assign({iv, ev, cap, active, best, bt, on:[...on], done:[...done]}, o);
    R.step(0, `${iv.length} intervals become ${ev.length} events: +${iv.some(x=>x.w>1)?"weight":"1"} at each start, − at each end.`, S({}));
    R.step(1, `Sort the events by time: ${ev.map(e=>`${e.t}${e.d>0?"+":"−"}${Math.abs(e.d)}`).join(", ")}. At equal times an end comes before a start.`, S({}));
    for(let k=0;k<ev.length;k++){ const e = ev[k]; active += e.d; R.inc("ev");
      if(e.d>0) on.add(e.i); else { on.delete(e.i); done.add(e.i); }
      const nb = active > best; if(nb){ best = active; bt = e.t; }
      const what = e.d > 0 ? `interval ${e.i+1} (${iv[e.i].s}–${iv[e.i].e}) starts: +${e.d}` : `interval ${e.i+1} ends: −${-e.d}`;
      const over = cap && active > cap;
      R.step(nb ? 5 : 4, `At time ${e.t}, ${what}. Active: ${active}.${nb ? ` A new maximum: ${best}.` : ""}${over ? ` That is more than the capacity ${cap}: it does not fit.` : ""}`, S({k, t:e.t, over})); }
    R.step(6, cap ? (best > cap ? `The load reaches ${best} at time ${bt}, more than the capacity ${cap}: the trips do not fit.` : `The load never goes above ${best}, within the capacity ${cap}: everything fits.`) : `The busiest moment has ${best} intervals at once (first at time ${bt}): you need ${best} room${best===1?"":"s"}. ${ev.length} events, sorted once: O(n log n).`, S({end:true})); },
  draw(s){ const W = 360, X0 = 30, X1 = W - 12, T0 = Math.min(...s.iv.map(x=>x.s)), T1 = Math.max(...s.iv.map(x=>x.e)), x = t => X0 + (X1-X0)*(t-T0)/Math.max(1, T1-T0), RH = 22, top = 16;
    const H = top + s.iv.length*RH + 34, on = new Set(s.on), done = new Set(s.done);
    let g = "";
    s.iv.forEach((iv,i)=>{ const y = top + i*RH, cls = on.has(i) ? (s.over ? "over" : "on") : done.has(i) ? "done" : "";
      g += `<g class="sw-iv ${cls}"><text x="${X0-6}" y="${y+12}" text-anchor="end" class="sub">${i+1}</text><rect x="${x(iv.s)}" y="${y+2}" width="${Math.max(2, x(iv.e)-x(iv.s))}" height="${RH-7}" rx="4"/>${iv.w>1?`<text x="${x(iv.s)+4}" y="${y+13}" class="w">×${iv.w}</text>`:""}</g>`; });
    const ay = top + s.iv.length*RH + 4;
    g += `<line x1="${X0}" y1="${ay}" x2="${X1}" y2="${ay}" class="axis"/><text x="${X0}" y="${ay+14}" class="sub" text-anchor="middle">${T0}</text><text x="${X1}" y="${ay+14}" class="sub" text-anchor="middle">${T1}</text>`;
    if(s.t!==undefined) g += `<line x1="${x(s.t)}" y1="${top-8}" x2="${x(s.t)}" y2="${ay+4}" class="sw-line"/><text x="${x(s.t)}" y="${ay+26}" text-anchor="middle" class="sw-t">t = ${s.t}</text>`;
    const evs = s.ev.map((e,k)=>`<span class="kv${k===s.k?" cmp":k<(s.k===undefined?(s.end?s.ev.length:0):s.k)?" gone":""}">${e.t} ${e.d>0?"+":"−"}${Math.abs(e.d)}</span>`).join("");
    return `<svg class="av-svg av-sw" viewBox="0 0 ${W} ${H}" style="max-width:560px" role="img" aria-label="${s.iv.length} intervals on a time line${s.t!==undefined?`; the sweep line is at ${s.t}`:""}">${g}</svg>
      <div class="av-h mono" style="margin-top:6px">events in sweep order</div><div class="av-kvs">${evs}</div>
      <p class="av-aux mono">active now: ${s.active} · maximum so far: ${s.best}${s.cap?` · capacity ${s.cap}`:""}</p>`; } });

/* ---- KMP string matching ---- */
def({ id:"kmp", group:"Arrays & strings", title:"KMP string matching", concepts:["stringmatch","bigo","amortized"],
  text:"First build lps for the pattern: lps[i] is the length of the longest proper prefix of pattern[0..i] that is also a suffix of it. Then scan the text. On a mismatch after j matched letters, do not move back in the text: slide the pattern so that its first lps[j−1] letters line up with what was just matched, because they are known to be equal. The text pointer never goes back, so the search is O(n + m) instead of O(n·m).",
  inputs:[{k:"t", label:"Text (up to 24 letters)", def:"abxabcabcabyabcaby"},{k:"p", label:"Pattern (up to 8 letters)", def:"abcaby", w:10}],
  presets:[{name:"Many partial matches", v:{t:"aaaaaaaaab", p:"aaab"}},{name:"Overlapping matches", v:{t:"abababab", p:"abab"}}],
  random:()=>{ const t = Array.from({length:rint(14,20)},()=>"ab"[rint(0,1)]).join(""); return {t, p:t.slice(rint(0,8)).slice(0,rint(3,5))}; },
  counters:["cmp","shift"],
  code:["build lps: k = 0","  for i from 1 to m-1: while k > 0 and p[i] != p[k]: k = lps[k-1]","    if p[i] == p[k]: k += 1;  lps[i] = k","search: j = 0   (letters of p matched)","for i from 0 to n-1:","  while j > 0 and t[i] != p[j]: j = lps[j-1]   (slide)","  if t[i] == p[j]: j += 1","  if j == m: found at i - m + 1; j = lps[j-1]"],
  run(v, R){ const t = String(v.t||"").replace(/\s/g,""), p = String(v.p||"").replace(/\s/g,"");
    if(!t || !p) throw new Error("Type a text and a pattern."); if(t.length > 24) throw new Error("At most 24 letters of text."); if(p.length > 8) throw new Error("At most 8 letters of pattern.");
    const m = p.length, lps = Array(m).fill(null); lps[0] = 0; const found = [];
    const S = o => Object.assign({t, p, lps:lps.slice(), found:found.slice()}, o);
    R.step(0, `Build the lps table for "${p}". lps[0] = 0: one letter has no proper prefix.`, S({phase:"build", i:0, k:0}));
    let k = 0;
    for(let i=1;i<m;i++){
      while(k > 0 && p[i] !== p[k]){ R.inc("cmp"); const nk = lps[k-1]; R.step(1, `p[${i}] = '${p[i]}' ≠ p[${k}] = '${p[k]}': fall back to the next shorter border, k = lps[${k-1}] = ${nk}.`, S({phase:"build", i, k, miss:true})); k = nk; }
      R.inc("cmp");
      if(p[i] === p[k]){ k++; lps[i] = k; R.step(2, `p[${i}] = '${p[i]}' matches p[${k-1}]: the border grows to ${k}. lps[${i}] = ${k} ("${p.slice(0,k)}" is both a prefix and a suffix of "${p.slice(0,i+1)}").`, S({phase:"build", i, k})); }
      else { lps[i] = 0; R.step(2, `p[${i}] = '${p[i]}' ≠ p[0]: no border. lps[${i}] = 0.`, S({phase:"build", i, k:0, miss:true})); } }
    R.step(3, `lps = [${lps.join(", ")}]. Now search the text; the text pointer i only moves forward.`, S({phase:"search", i:0, j:0}));
    let j = 0;
    for(let i=0;i<t.length;i++){
      while(j > 0 && t[i] !== p[j]){ R.inc("cmp"); R.inc("shift"); const nj = lps[j-1];
        R.step(5, `t[${i}] = '${t[i]}' ≠ p[${j}] = '${p[j]}'. Keep i and slide the pattern: the last ${nj} matched letters are already a prefix of p, so j = lps[${j-1}] = ${nj}.`, S({phase:"search", i, j, miss:true}));
        j = nj; R.step(5, `The pattern now starts at ${i - j} in the text.`, S({phase:"search", i, j})); }
      R.inc("cmp");
      if(t[i] === p[j]){ j++; R.step(6, `t[${i}] = '${t[i]}' = p[${j-1}]: ${j} letter${j===1?"":"s"} matched.`, S({phase:"search", i, j, hit:true})); }
      else R.step(6, `t[${i}] = '${t[i]}' ≠ p[0]: move on.`, S({phase:"search", i, j, miss:true}));
      if(j === m){ found.push(i-m+1); R.step(7, `All ${m} letters match: "${p}" found at ${i-m+1}. Continue with j = lps[${m-1}] = ${lps[m-1]} to find overlapping matches.`, S({phase:"search", i, j, match:true})); j = lps[m-1]; } }
    R.step(7, found.length ? `Done: "${p}" occurs at ${found.join(", ")}. ${R.c.cmp} letter comparisons for ${t.length} + ${m} letters.` : `Done: "${p}" does not occur. ${R.c.cmp} comparisons.`, S({phase:"search", end:true})); },
  draw(s){ const m = s.p.length;
    if(s.phase==="build"){ const k = s.k||0, matched = !s.miss && s.i>0, sufFrom = matched ? s.i-k+1 : s.i-k, sufTo = matched ? s.i : s.i-1;
      const cells = s.p.split("").map((c,i)=>({v:c, cls:i===s.i ? (s.miss?"miss":"cur") : k>0 && i<k && i<sufFrom ? "done" : k>0 && i>=sufFrom && i<=sufTo ? "win" : ""}));
      return rowsSVG([{label:"p", cells}, {label:"lps", cells:s.lps.map((x,i)=>({v:x===null?"":x, cls:i===s.i?"cur":x===null?"nil":""}))}], {lx:40, label:"Pattern and its lps table"}) + `<p class="av-aux">Green: the border (a prefix that is also a suffix). Blue: the same letters at the end. Orange: the letter being tested.</p>`; }
    if(s.end || s.i===undefined) return rowsSVG([{label:"text", cells:s.t.split("").map((c,i)=>({v:c, cls:s.found.some(f=>i>=f && i<f+m) ? "done" : ""}))}], {lx:40, label:"Text"}) + `<p class="av-aux mono">found at: ${s.found.join(", ") || "none"}</p>`;
    const hit = s.hit || s.match, start = hit ? s.i - s.j + 1 : s.i - s.j, at = hit ? s.j - 1 : s.j;   // where the pattern starts in the text; which pattern letter is at t[i]
    const T = s.t.split("").map((c,i)=>({v:c, cls:i===s.i ? (s.miss ? "miss" : hit ? "done" : "cur") : i>=start && i<s.i ? "win" : "", focus:i===s.i}));
    const P = s.p.split("").map((c,k)=>({v:c, cls:s.match ? "done" : k < at ? "win" : k === at ? (s.miss ? "miss" : hit ? "done" : "cur") : ""}));
    return rowsSVG([{label:"text", cells:T}, {label:"p", cells:P, off:start}, {label:"lps", cells:s.lps.map(x=>({v:x})), off:start}], {lx:40, label:"Text with the pattern lined up under it"}) + `<p class="av-aux mono">pattern starts at ${start} · ${s.j} letter${s.j===1?"":"s"} matched · found at: ${s.found.join(", ") || "none yet"}</p>`; } });

/* ---- heaps: top-K and the running median ---- */
def({ id:"topk", group:"Data structures", title:"Heaps: top K and the running median", concepts:["trees","queuesbuf","bigo"],
  text:v=>v.mode==="median" ? "Keep the smaller half of the numbers in a max-heap and the larger half in a min-heap, with sizes equal or the low half one bigger. Each new number goes to one side; if the sizes drift apart, move one top across. The median is then the top of the low half, or the average of both tops. Each number costs O(log n)." :
    "To keep the K largest numbers of a stream, use a min-heap of size K: push each number, and when the heap has K + 1 items, pop the smallest. The heap then holds the K largest seen so far, and its top is the K-th largest. O(n log K) time and O(K) memory, instead of sorting everything.",
  inputs:[{k:"mode", label:"Problem", def:"topk", opts:[{v:"topk", label:"K largest with a size-K min-heap", set:{a:"5, 1, 9, 3, 12, 7, 4, 15, 8", k:"3"}},{v:"median", label:"Running median with two heaps", set:{a:"5, 15, 1, 3, 8, 7, 9, 10"}}]},
    {k:"a", label:"Stream of numbers (up to 12)", def:"5, 1, 9, 3, 12, 7, 4, 15, 8"},{k:"k", label:"K", def:"3", w:4, when:v=>v.mode!=="median"}],
  random:()=>({a:randArr(rint(7,10), 1, 40)}), counters:["push","pop"],
  code:v=>v.mode==="median" ? ["low = max-heap (smaller half); high = min-heap (larger half)","add(x): if low is empty or x <= low.top: low.push(x) else high.push(x)","  if len(low) > len(high) + 1: high.push(low.pop())","  if len(high) > len(low): low.push(high.pop())","median: odd count: low.top; even: (low.top + high.top) / 2"]
    : ["heap = empty min-heap","for x in stream:","  heap.push(x)","  if len(heap) > K: heap.pop()   (drop the smallest)","heap holds the K largest; heap.top is the K-th largest"],
  run(v, R){ const a = nums(v.a, -99, 99, 12), mode = v.mode==="median" ? "median" : "topk";
    const up = (h, less) => { let i = h.length-1; while(i>0){ const p = (i-1)>>1; if(!less(h[i], h[p])) break; [h[i],h[p]] = [h[p],h[i]]; i = p; } };
    const down = (h, less) => { let i = 0; for(;;){ const l = 2*i+1, r = l+1; let m = i; if(l<h.length && less(h[l],h[m])) m = l; if(r<h.length && less(h[r],h[m])) m = r; if(m===i) return; [h[i],h[m]] = [h[m],h[i]]; i = m; } };
    const push = (h, x, less) => { h.push(x); up(h, less); R.inc("push"); }, pop = (h, less) => { const top = h[0], last = h.pop(); if(h.length){ h[0] = last; down(h, less); } R.inc("pop"); return top; };
    const minL = (x,y)=>x<y, maxL = (x,y)=>x>y;
    if(mode==="topk"){ const K = nums(v.k, 1, 8, 1)[0], h = []; const S = o => Object.assign({mode, h:h.slice(), K, a}, o);
      R.step(0, `Keep the ${K} largest numbers of the stream in a min-heap of size ${K}. Its top is always the smallest of them.`, S({}));
      a.forEach((x,i)=>{ push(h, x, minL); R.step(2, `Push ${x}. The heap has ${h.length} item${h.length===1?"":"s"}; its top (the smallest) is ${h[0]}.`, S({at:i, nw:x}));
        if(h.length > K){ const y = pop(h, minL); R.step(3, `${K+1} items is one too many: pop the smallest, ${y}. It cannot be among the ${K} largest.`, S({at:i, out:y})); } });
      R.step(4, `The ${K} largest are ${h.slice().sort((x,y)=>y-x).join(", ")}; the ${K===1?"1st":K===2?"2nd":K===3?"3rd":K+"th"} largest is the top, ${h[0]}. ${R.c.push} pushes and ${R.c.pop||0} pops, each O(log ${K}).`, S({end:true})); return; }
    const lo = [], hi = [], meds = []; const S = o => Object.assign({mode, lo:lo.slice(), hi:hi.slice(), a, meds:meds.slice()}, o);
    const med = () => lo.length > hi.length ? lo[0] : (lo[0] + hi[0]) / 2;
    R.step(0, "Two heaps: low (a max-heap with the smaller half) and high (a min-heap with the larger half).", S({}));
    a.forEach((x,i)=>{
      if(!lo.length || x <= lo[0]){ push(lo, x, maxL); R.step(1, `${x} ${lo.length>1 ? `≤ ${lo[0]===x && lo.length>1 ? "the top of low" : "low's top " + lo[0]}` : "is the first number"}: push it into low.`, S({at:i, nw:x, side:"lo"})); }
      else { push(hi, x, minL); R.step(1, `${x} > low's top ${lo[0]}: push it into high.`, S({at:i, nw:x, side:"hi"})); }
      if(lo.length > hi.length + 1){ const y = pop(lo, maxL); push(hi, y, minL); R.step(2, `low has 2 more than high: move its top ${y} to high.`, S({at:i, nw:y, side:"hi"})); }
      else if(hi.length > lo.length){ const y = pop(hi, minL); push(lo, y, maxL); R.step(3, `high is bigger than low: move its top ${y} to low.`, S({at:i, nw:y, side:"lo"})); }
      meds.push(med());
      R.step(4, `${i+1} number${i===0?"":"s"}: the median is ${lo.length > hi.length ? `low's top, ${lo[0]}` : `(${lo[0]} + ${hi[0]}) / 2 = ${med()}`}.`, S({at:i})); });
    R.step(4, `Medians after each number: ${meds.join(", ")}. Each step is O(log n).`, S({end:true})); },
  draw(s){ const tree = (h, label, cls) => { const nodes = {}; h.forEach((x,i)=>nodes[i] = {label:String(x), kids:[2*i+1,2*i+2].filter(k=>k<h.length), cls:(i===0?"cur":"")}); return `<div class="hp-side ${cls||""}"><div class="av-h mono">${esc(label)}</div>${treeSVG(nodes, h.length?["0"]:[], {label, empty:"empty", ux:38, uy:48, r:15})}</div>`; };
    const stream = s.a.map((x,i)=>({v:x, cls:i===s.at ? "cur" : s.at!==undefined && i<s.at || s.end ? "dim" : ""}));
    const head = rowsSVG([{label:"stream", cells:stream}], {lx:52, label:"The input stream", min:.85});
    if(s.mode==="median") return head + `<div class="av-hp">${tree(s.lo, "low: max-heap (smaller half)", s.side==="lo"?"act":"")}${tree(s.hi, "high: min-heap (larger half)", s.side==="hi"?"act":"")}</div><p class="av-aux mono">medians: ${s.meds.join(", ") || "none yet"}</p>`;
    return head + `<div class="av-hp">${tree(s.h, `min-heap of the ${s.K} largest so far`, "act")}</div>${s.out!==undefined?`<p class="av-aux">popped ${s.out}</p>`:""}<p class="av-aux mono">kept: ${s.h.slice().sort((x,y)=>y-x).join(", ") || "none"}</p>`; } });

/* ---- sieve of Eratosthenes ---- */
def({ id:"sieve", group:"Searching", title:"Sieve of Eratosthenes", concepts:["numbertheory","bigo"],
  text:"List the numbers from 2 to N. The smallest number not crossed out is prime; cross out its multiples, starting at p × p (smaller multiples were already crossed out by smaller primes). Once p × p is bigger than N, every number left is prime. It costs O(N log log N), almost linear, and is the standard way to find all primes up to a few million.",
  inputs:[{k:"n", label:"N (10 to 120)", def:"60", w:5}], random:()=>({n:String(rint(30,100))}), counters:["cross"],
  code:["mark 2..N as maybe prime","for p from 2 while p * p <= N:","  if p is still marked: it is prime","    for m from p * p to N step p: cross out m","every number still marked is prime"],
  run(v, R){ const N = nums(v.n, 10, 120, 1)[0], st = Array(N+1).fill(0);   // 0 unknown, 1 crossed, 2 prime
    const S = o => Object.assign({N, st:st.slice()}, o);
    R.step(0, `Numbers 2 to ${N}; none crossed out yet.`, S({}));
    for(let p=2; p*p<=N; p++){
      if(st[p]===1){ R.step(2, `${p} is crossed out (a multiple of a smaller prime): skip it.`, S({p})); continue; }
      st[p] = 2; R.step(2, `${p} is not crossed out, so it is prime. Cross out its multiples from ${p} × ${p} = ${p*p}.`, S({p}));
      const hit = [];
      for(let m=p*p; m<=N; m+=p){ if(st[m]!==1){ st[m] = 1; R.inc("cross"); } hit.push(m); }
      R.step(3, `Crossed out ${hit.join(", ")}.`, S({p, hit})); }
    let c = 0; for(let i=2;i<=N;i++) if(st[i]!==1){ st[i] = 2; c++; }
    R.step(4, `The next p has p × p > ${N}, so everything left is prime: ${c} primes up to ${N}. Only ${R.c.cross||0} cross-outs.`, S({end:true})); },
  draw(s){ const hit = new Set(s.hit||[]);
    let h = `<div class="av-sieve" role="img" aria-label="Numbers 2 to ${s.N}: primes and crossed-out numbers">`;
    for(let i=2;i<=s.N;i++) h += `<span class="sv${s.st[i]===2?" pr":s.st[i]===1?" x":""}${i===s.p?" cur":""}${hit.has(i)?" hit":""}">${i}</span>`;
    return h + `</div><p class="av-aux av-key"><span><i class="done"></i>prime</span><span><i class="cur"></i>current p</span><span><i class="swp"></i>just crossed out</span><span><i class="prn"></i>crossed out</span></p>`; } });

/* ---- 2-D DP: grid DP and interval DP, as a table or as memoized recursion ---- */
const D2_MODES = [{v:"minpath", label:"Grid: minimum path sum (right / down)", set:{g:"1 3 1 2; 1 5 1 3; 4 2 1 1; 2 6 3 1"}},{v:"paths", label:"Grid: count paths around obstacles", set:{g:"0 0 0 0; 0 1 0 0; 0 0 0 1; 1 0 0 0"}},
  {v:"lps", label:"Interval: longest palindromic subsequence", set:{s:"bbabcbcab"}}];
function d2Problem(v){
  const mode = D2_MODES.some(m=>m.v===v.mode) ? v.mode : "minpath";
  if(mode==="lps"){ const s = String(v.s||"").replace(/\s/g,""); if(!s || s.length > 9) throw new Error("Use a word of 1 to 9 letters.");
    const n = s.length;
    return {mode, n, R:n, C:n, s, valid:(i,j)=>j>=i, goal:[0, n-1], rows:s.split(""), cols:s.split(""),
      what:"f(i, j) = the longest palindromic subsequence inside s[i..j]",
      order:(()=>{ const o = []; for(let len=1;len<=n;len++) for(let i=0;i+len-1<n;i++) o.push([i, i+len-1]); return o; })(),
      base:(i,j)=>i===j ? 1 : undefined, deps:(i,j)=>s[i]===s[j] ? (i+1<=j-1 ? [[i+1, j-1]] : []) : [[i+1, j],[i, j-1]],
      calc:(i,j,g)=>s[i]===s[j] ? 2 + (i+1<=j-1 ? g(i+1, j-1) : 0) : Math.max(g(i+1, j), g(i, j-1)),
      expl:(i,j,g,r)=>s[i]===s[j] ? `s[${i}] = s[${j}] = '${s[i]}': both ends join the palindrome inside, f(${i}, ${j}) = 2 + ${i+1<=j-1 ? `f(${i+1}, ${j-1}) = 2 + ${g(i+1, j-1)}` : "0"} = ${r}.` : `'${s[i]}' ≠ '${s[j]}': drop one end, f(${i}, ${j}) = max(f(${i+1}, ${j}) = ${g(i+1, j)}, f(${i}, ${j-1}) = ${g(i, j-1)}) = ${r}.`,
      rec:"s[i] == s[j] ? 2 + f(i+1, j-1) : max(f(i+1, j), f(i, j-1))", baseStr:"f(i, i) = 1", fill:"by length: all ranges of length 1, then 2, ...", intro:`Find the longest palindromic subsequence of "${s}".`}; }
  const rows = String(v.g||"").split(/[;\n]+/).map(r=>r.trim()).filter(Boolean).map(r=>r.split(/[\s,]+/).map(Number));
  if(!rows.length || rows.some(r=>r.length!==rows[0].length || r.some(x=>!Number.isInteger(x)))) throw new Error('Write the grid row by row, rows separated by ";", like "1 3 1; 1 5 1".');
  const R = rows.length, C = rows[0].length; if(R > 6 || C > 6) throw new Error("At most 6 × 6 cells.");
  const G = rows, rl = Array.from({length:R},(x,i)=>i), cl = Array.from({length:C},(x,j)=>j);
  if(mode==="paths"){ if(G.flat().some(x=>x!==0 && x!==1)) throw new Error("Use 0 for an open cell and 1 for an obstacle.");
    return {mode, R, C, G, valid:()=>true, goal:[R-1, C-1], rows:rl, cols:cl, what:"f(i, j) = the number of paths from the top-left corner to cell (i, j)",
      order:rl.flatMap(i=>cl.map(j=>[i,j])), base:(i,j)=>G[i][j]===1 ? 0 : i===0 && j===0 ? 1 : undefined,
      deps:(i,j)=>[[i-1,j],[i,j-1]].filter(([a,b])=>a>=0&&b>=0), calc:(i,j,g)=>(i>0?g(i-1,j):0) + (j>0?g(i,j-1):0),
      expl:(i,j,g,r)=>`Paths into (${i}, ${j}) come from above (${i>0?g(i-1,j):"none"}) or from the left (${j>0?g(i,j-1):"none"}): f = ${r}.`,
      rec:"0 if blocked, else f(i-1, j) + f(i, j-1)", baseStr:"f(0, 0) = 1; an obstacle has 0 paths", fill:"row by row", intro:"Count the paths from the top-left to the bottom-right corner, moving right or down and avoiding obstacles (1)."}; }
  if(G.flat().some(x=>x<0 || x>9)) throw new Error("Use costs from 0 to 9.");
  return {mode, R, C, G, valid:()=>true, goal:[R-1, C-1], rows:rl, cols:cl, what:"f(i, j) = the cheapest path cost from the top-left corner to cell (i, j)",
    order:rl.flatMap(i=>cl.map(j=>[i,j])), base:(i,j)=>i===0 && j===0 ? G[0][0] : undefined,
    deps:(i,j)=>[[i-1,j],[i,j-1]].filter(([a,b])=>a>=0&&b>=0), calc:(i,j,g)=>G[i][j] + Math.min(i>0?g(i-1,j):INF, j>0?g(i,j-1):INF),
    expl:(i,j,g,r)=>`f(${i}, ${j}) = cost ${G[i][j]} + the cheaper way in (${[i>0?`from above ${g(i-1,j)}`:"", j>0?`from the left ${g(i,j-1)}`:""].filter(Boolean).join(", ")}) = ${r}.`,
    rec:"grid[i][j] + min(f(i-1, j), f(i, j-1))", baseStr:"f(0, 0) = grid[0][0]", fill:"row by row", intro:"Find the cheapest path from the top-left to the bottom-right corner, moving only right or down."};
}
def({ id:"dp2d", group:"Dynamic programming", title:"2-D DP: grid and interval tables, filled or memoized", concepts:["dp","callstack","bigo"],
  text:"A 2-D state needs two numbers: a cell (i, j) of a grid, or a range s[i..j]. The table method fills the cells in an order where every cell it reads is already done: row by row for a grid, by increasing length for ranges. The memo method starts from the answer cell and asks for what it needs, storing each result; it fills the same cells in a different order and only the ones it actually needs. Both cost O(number of cells × work per cell).",
  inputs:[{k:"mode", label:"Problem", def:"minpath", opts:D2_MODES},{k:"method", label:"Method", def:"table", opts:[{v:"table", label:"Bottom-up table", set:{}},{v:"memo", label:"Top-down recursion with a memo", set:{}}]},
    {k:"g", label:v=>v.mode==="paths"?"Grid: 0 = open, 1 = obstacle; rows split by ;":"Grid of costs, rows split by ;", def:"1 3 1 2; 1 5 1 3; 4 2 1 1; 2 6 3 1", when:v=>v.mode!=="lps"},
    {k:"s", label:"Word (up to 9 letters)", def:"bbabcbcab", w:12, when:v=>v.mode==="lps"}],
  random:v=>v.mode==="lps" ? {s:Array.from({length:rint(6,9)},()=>"abc"[rint(0,2)]).join("")} : v.mode==="paths" ? {g:Array.from({length:4},(x,i)=>Array.from({length:4},(y,j)=>(i+j===0||i+j===6)?0:Math.random()<.2?1:0).join(" ")).join("; ")} : {g:Array.from({length:4},()=>randArr(4,1,9).replace(/,/g,"")).join("; ")},
  counters:v=>v.method==="memo" ? ["calls","memo","cells"] : ["cells"],
  code:v=>{ let p; try{ p = d2Problem(v); }catch(e){ p = d2Problem({mode:"minpath", g:"1 2; 3 4"}); }
    return v.method==="memo" ? ["memo = {}", `f(i, j): base case: ${p.baseStr}`, "  if (i, j) is in memo: return it   (cache hit)", `  memo[i, j] = ${p.rec}`, "  return memo[i, j]"]
      : [`${p.baseStr}   (base cases)`, `fill the other cells ${p.fill}:`, `  f(i, j) = ${p.rec}`, `return f(${p.mode==="lps" ? "0, n-1" : "R-1, C-1"})`]; },
  run(v, R){ const p = d2Problem(v), method = v.method==="memo" ? "memo" : "table", f = Array.from({length:p.R},()=>Array(p.C).fill(null)), stack = [];
    const S = o => Object.assign({p:{mode:p.mode, R:p.R, C:p.C, G:p.G, rows:p.rows, cols:p.cols, what:p.what, goal:p.goal, s:p.s}, method, f:f.map(r=>r.slice()), stack:stack.map(x=>x.slice())}, o);
    const get = (i,j) => f[i][j];
    if(method==="table"){
      p.order.forEach(([i,j])=>{ const b = p.base(i,j); if(b!==undefined){ f[i][j] = b; R.inc("cells"); } });
      R.step(0, `${p.intro} ${p.what}. Base cases first: ${p.baseStr}.`, S({}));
      for(const [i,j] of p.order){ if(f[i][j]!==null) continue; const ds = p.deps(i,j), r = p.calc(i,j,get); f[i][j] = r; R.inc("cells");
        R.step(2, p.expl(i,j,get,r), S({cur:[i,j], dep:ds})); }
      const [gi, gj] = p.goal;
      R.step(3, `The answer is f(${gi}, ${gj}) = ${f[gi][gj]}. ${R.c.cells} cells, each filled once.`, S({cur:[gi,gj], end:true})); return; }
    R.step(0, `${p.intro} ${p.what}. Start with the call for the answer cell and let it ask for what it needs.`, S({}));
    const call = (i, j, from) => { R.inc("calls"); stack.push([i, j]);
      const b = p.base(i,j);
      if(b!==undefined){ if(f[i][j]===null){ f[i][j] = b; R.inc("cells"); } R.step(1, `f(${i}, ${j}) is a base case: ${b}.`, S({cur:[i,j]})); stack.pop(); return b; }
      if(f[i][j]!==null){ R.inc("memo"); R.step(2, `f(${i}, ${j}) is already in the memo: ${f[i][j]} (a cache hit).`, S({cur:[i,j], hit:true})); stack.pop(); return f[i][j]; }
      const ds = p.deps(i,j);
      R.step(3, `Call f(${i}, ${j})${from ? ` (asked by f(${from[0]}, ${from[1]}))` : ""}: it needs ${ds.length ? ds.map(([a,c])=>`f(${a}, ${c})`).join(" and ") : "nothing more"}.`, S({cur:[i,j], dep:ds}));
      ds.forEach(([a,c])=>call(a, c, [i,j]));
      const r = p.calc(i,j,get); f[i][j] = r; R.inc("cells");
      R.step(4, p.expl(i,j,get,r) + " Store it in the memo.", S({cur:[i,j], dep:ds})); stack.pop(); return r; };
    const [gi, gj] = p.goal, r = call(gi, gj);
    const total = p.order.length, used = f.flat().filter(x=>x!==null).length;
    R.step(4, `f(${gi}, ${gj}) = ${r}. ${R.c.calls} calls, ${R.c.memo||0} cache hits; ${used} of ${total} cells were needed${used<total?" (the table fills them all)":""}.`, S({cur:[gi,gj], end:true})); },
  draw(s){ const P = s.p, dep = new Set((s.dep||[]).map(x=>x.join(","))), cur = s.cur ? s.cur.join(",") : "";
    const head = [{v:""}].concat(P.cols.map(c=>({v:c})));
    const rows = [head].concat(P.rows.map((rl,i)=>[{v:rl}].concat(P.cols.map((c,j)=>{ const k = i+","+j, x = s.f[i][j];
      if(P.mode==="lps" && j<i) return {v:"", cls:"na"};
      return {v:x===null?"":x, cls:k===cur ? (s.hit ? "done" : "cur") : dep.has(k) ? "cmp" : s.end && k===P.goal.join(",") ? "done" : ""}; }))));
    let grid = "";
    if(P.G) grid = `<div><div class="av-h mono">${P.mode==="paths" ? "grid (1 = obstacle)" : "grid of costs"}</div>${table([[{v:""}].concat(P.cols.map(c=>({v:c})))].concat(P.G.map((r,i)=>[{v:i}].concat(r.map((x,j)=>({v:x, cls:(i+","+j)===cur ? "cur" : P.mode==="paths" && x===1 ? "blk" : ""}))))), {head:true, side:true, cls:"dp"})}</div>`;
    const st = s.method==="memo" ? stackHTML("call stack", s.stack.map((x,k)=>({t:`<b>f(${x[0]}, ${x[1]})</b>`, cls:k===s.stack.length-1 ? (s.hit ? "hit" : "cur") : ""})), "empty") : "";
    return `<div class="av-bk">${grid}<div><div class="av-h mono">f table${P.mode==="lps" ? " (rows i, columns j)" : ""}</div><div class="av-dpwrap">${table(rows, {head:true, side:true, cls:"dp"})}</div></div>${st}</div><p class="av-aux">${esc(P.what)}. Orange: the cell being filled; purple: the cells it reads.</p>`; } });

const GROUPS = ["Sorting","Searching","Arrays & strings","Recursion & trees","Graphs","Data structures","Probabilistic & distributed","Dynamic programming"];
const NOTE = {Sorting:"Bars are values. Orange: being compared. Purple: just moved. Faded: outside the part being worked on. Green: in final place."};

/* ---------------- player ---------------- */
const SPEEDS = [1600, 1000, 650, 380, 170];
const P = { id:null, vals:null, frames:[], k:0, t:null, speed:2, err:"", live:{}, shown:-1 };
const reducedMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const byId = id => V.find(x=>x.id===id);
function initVals(v){ const o = {}; (v.inputs||[]).forEach(i=>o[i.k] = i.def); return Object.assign(o, v.init ? JSON.parse(JSON.stringify(v.init)) : {}); }
function runViz(v, vals){
  const R = new Rec();
  try { v.run(vals, R); } catch(e){ return {err:e.message || String(e)}; }
  return {frames:R.frames};
}
function load(id, vals){
  const v = byId(id) || V[0]; stop();
  const r = runViz(v, vals || initVals(v));
  if(r.err){ P.err = r.err; if(P.id!==v.id){ P.id = v.id; P.vals = initVals(v); P.frames = runViz(v, P.vals).frames || []; P.k = 0; } return; }
  if(P.id!==v.id) P.live = {};
  P.id = v.id; P.vals = vals || initVals(v); P.frames = r.frames; P.k = 0; P.err = ""; P.shown = -1;
}
function stop(){ clearInterval(P.t); P.t = null; const b = document.querySelector('[data-aact="play"]'); if(b){ b.textContent = "Play"; b.setAttribute("aria-pressed","false"); } }
function play(){
  stop(); if(P.k >= P.frames.length-1) P.k = 0;
  const b = document.querySelector('[data-aact="play"]'); if(b){ b.textContent = "Pause"; b.setAttribute("aria-pressed","true"); }
  P.t = setInterval(()=>{ const stage = $("av-stage"), view = $("v-algorithms");
    if(!stage || !view || view.hidden){ stop(); return; }
    if(P.k >= P.frames.length-1){ stop(); return; }
    P.k++; showFrame(); }, SPEEDS[P.speed]);
  showFrame();
}
/* moving parts: an SVG element with data-flip="key" glides from where the same key was in the previous frame (one step forward only) */
function flipGrab(stage){ const m = {}; stage.querySelectorAll("[data-flip]").forEach(el=>{ const r = el.getBoundingClientRect(); m[el.dataset.flip] = [r.left + r.width/2, r.top + r.height/2]; }); return m; }
function flipPlay(stage, old){
  const dur = Math.min(520, SPEEDS[P.speed]*.75);
  stage.querySelectorAll("[data-flip]").forEach(el=>{ const o = old[el.dataset.flip], svg = el.ownerSVGElement; if(!o || !svg || !el.animate) return;
    const r = el.getBoundingClientRect(), sr = svg.getBoundingClientRect(), vb = svg.viewBox && svg.viewBox.baseVal, k = vb && vb.width ? sr.width / vb.width : 1;
    const dx = (o[0] - r.left - r.width/2)/k, dy = (o[1] - r.top - r.height/2)/k; if(Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    el.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"translate(0px,0px)"}], {duration:dur, easing:"cubic-bezier(.3,.7,.3,1)"}); });
}
/* a wide drawing scrolls inside its .av-scroll frame; the element marked data-focus (the current node) is kept in view */
function keepInView(el){
  const box = el.closest(".av-scroll"); if(!box || box.scrollWidth <= box.clientWidth + 1) return;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if(r.left < b.left + 12 || r.right > b.right - 12) box.scrollLeft += (r.left + r.width/2) - (b.left + b.width/2);
}
function showFrame(){
  const v = byId(P.id), f = P.frames[P.k], stage = $("av-stage"); if(!v || !stage) return;
  if(!f){ stage.innerHTML = ""; return; }
  const old = P.k===P.shown+1 && !reducedMotion() ? flipGrab(stage) : null;
  const scr = Array.from(stage.querySelectorAll(".av-scroll")).map(x=>x.scrollLeft);   // wide drawings keep their scroll position from step to step
  stage.innerHTML = v.draw(f.s, P.vals, f); P.shown = P.k;
  stage.querySelectorAll(".av-scroll").forEach((x,i)=>{ if(scr[i]) x.scrollLeft = scr[i]; });
  if(old) flipPlay(stage, old);
  if(v.after) v.after(stage, f.s);
  else { const c = stage.querySelector(".av-scroll [data-focus]"); if(c) keepInView(c); }
  if(v.liveState) Object.entries(v.liveState(f.s)).forEach(([id,o])=>{ const b = document.querySelector(`[data-alive="${id}"]`); if(!b) return;
    if(o.label!==undefined && b.textContent!==o.label) b.textContent = o.label; b.disabled = !!o.disabled; });
  $("av-msg").textContent = f.msg;
  $("av-k").textContent = `step ${P.k+1} of ${P.frames.length}`;
  $("av-count").innerHTML = (fv(v,"counters")||[]).map(k=>`<span><b>${f.c[k]||0}</b> ${(v.clabel&&v.clabel[k])||COUNT[k]||k}</span>`).join("");
  document.querySelectorAll("#av-code li").forEach((li,i)=>{ li.classList.toggle("on", i===f.line); if(i===f.line) li.setAttribute("aria-current","step"); else li.removeAttribute("aria-current"); });
  const back = document.querySelector('[data-aact="back"]'), next = document.querySelector('[data-aact="next"]');
  if(back) back.disabled = P.k===0; if(next) next.disabled = P.k>=P.frames.length-1;
}
function chipsHTML(ids){
  const N = app().N;
  return `<div class="chips">${ids.filter(id=>N[id]).map(id=>`<button type="button" class="chip" style="--c:var(--l${N[id].l})" data-read="${id}"><span class="sw"></span>${esc(N[id].label)}</button>`).join("")}</div>`;
}
/* live controls: act on the running animation (insert a key, crash a server); the visualizer re-runs and jumps to the new part */
function liveHTML(v){
  if(!v.live) return "";
  const L = v.live, fields = (L.fields||[]).map(i=>`<label class="av-f short"><span>${esc(i.label)}</span><input type="text" data-alin="${i.k}" value="${esc(P.live[i.k]===undefined?i.def:P.live[i.k])}" spellcheck="false" autocomplete="off" inputmode="${i.mode||"text"}" style="width:${i.w+3}ch"></label>`).join("");
  const btns = (L.buttons||[]).map(b=>typeof b==="string" ? `<span class="av-lab">${esc(b)}</span>` : `<button type="button" class="btn${b.primary?" primary":""}" data-alive="${b.id}">${esc(b.label)}</button>`).join("");
  return `<div class="av-live" role="group" aria-label="${esc(L.title)}"><div class="av-h mono">${esc(L.title)}</div><div class="av-livein">${fields}<div class="btnrow">${btns}</div></div>${L.note?`<p class="av-aux">${esc(L.note)}</p>`:""}</div>`;
}
/* an input is a text box, or a choice when it has opts: [{v, label, set:{other inputs to fill when it is picked}}];
   when(vals) hides an input that the current choice does not use */
const fv = (v, k) => typeof v[k]==="function" ? v[k](P.vals) : v[k];
function inputHTML(i){
  const val = P.vals[i.k]===undefined ? i.def : P.vals[i.k];
  if(i.opts) return `<label class="av-f short"><span>${esc(i.label)}</span><select data-ain="${i.k}">${i.opts.map(o=>`<option value="${esc(o.v)}"${String(o.v)===String(val)?" selected":""}>${esc(o.label)}</option>`).join("")}</select></label>`;
  return `<label class="av-f${i.w?" short":""}"><span>${esc(typeof i.label==="function"?i.label(P.vals):i.label)}</span><input type="text" data-ain="${i.k}" value="${esc(val)}" spellcheck="false" autocomplete="off"${i.w?` style="width:${i.w+3}ch"`:""}></label>`;
}
function vizHTML(v){
  const ins = (v.inputs||[]).filter(i=>!i.when || i.when(P.vals)).map(inputHTML).join("");
  const pres = (v.presets||[]).map((p,i)=>`<button type="button" class="btn" data-apreset="${i}">${esc(p.name)}</button>`).join("");
  return `<div class="av" data-viz="${v.id}">
    <h2 class="vh">${esc(v.title)}</h2><p class="vsub">${esc(fv(v,"text"))}</p>${chipsHTML(v.concepts)}${(()=>{ const T = templates(), ns = Object.keys(T).filter(n=>T[n].viz===v.id || (T[n].viz_more||[]).includes(v.id));
      return ns.length ? `<p class="av-aux av-tpls">Pattern template${ns.length===1?"":"s"}: ${ns.map(n=>`<button type="button" class="linkish" data-aptjump="${esc(n)}">${esc(n)}</button>`).join(" · ")}</p>` : ""; })()}
    <div class="av-in">${ins}<div class="btnrow">${ins?`<button type="button" class="btn primary" data-aact="apply">Run with this input</button>`:""}${pres}${v.random?`<button type="button" class="btn" data-aact="random">Random input</button>`:""}</div></div>
    ${P.err?`<p class="av-err" role="alert">${esc(P.err)}</p>`:""}
    <div class="av-body">
      <div class="av-left">
        <div class="av-stage" id="av-stage" tabindex="0" aria-label="Animation stage. Left and right arrow keys step through it."></div>
        <p class="av-msg" id="av-msg" aria-live="polite"></p>
        <div class="av-ctl"><button type="button" class="btn" data-aact="back">← Back</button><button type="button" class="btn primary" data-aact="play" aria-pressed="false">Play</button><button type="button" class="btn" data-aact="next">Next →</button><button type="button" class="btn" data-aact="reset">Reset</button>
          <label class="av-speed"><span>Speed</span><input type="range" min="0" max="4" step="1" value="${P.speed}" id="av-speed" aria-label="Speed"></label><span class="mono av-k" id="av-k"></span></div>
        <div class="av-count" id="av-count"></div>
        ${liveHTML(v)}
        ${NOTE[v.group]?`<p class="av-aux">${esc(NOTE[v.group])}</p>`:""}
      </div>
      <div class="av-side"><div class="av-h mono">Pseudocode</div><ol class="av-code" id="av-code">${fv(v,"code").map(l=>`<li><code>${esc(l)}</code></li>`).join("")}</ol></div>
    </div></div>`;
}

/* ---------------- practice ---------------- */
const PKEY = "dts:practice:v1";
const PR = { saved:null, loadP:null, waiting:false, diff:"All", t:null, worker:null, results:null, out:"", shown:{} };
const problems = () => (app().DATA.practice || []);
function lsGet(){ try{ return JSON.parse(localStorage.getItem(PKEY)) || {}; }catch(e){ return {}; } }
function lsPut(){ try{ localStorage.setItem(PKEY, JSON.stringify(PR.saved)); }catch(e){} }
function loadSaved(){
  // one request, shared by every caller
  if(!PR.loadP) PR.loadP = (async () => {
    if(app().STANDALONE) PR.saved = lsGet();
    else { try{ PR.saved = await app().api("GET","/api/practice"); }catch(e){ PR.saved = {}; } }
  })();
  return PR.loadP;
}
async function savePractice(id, patch){
  const cur = PR.saved[id] || {code:"", solved:false}; Object.assign(cur, patch, {at:new Date().toISOString().slice(0,19)}); PR.saved[id] = cur;
  if(app().STANDALONE){ lsPut(); return; }
  await app().api("PUT", "/api/practice/"+encodeURIComponent(id), patch);
}
const solved = id => !!(PR.saved && PR.saved[id] && PR.saved[id].solved);
const DIFFS = ["All","Easy","Medium","Hard"];
function practiceListHTML(){
  const all = problems();
  if(!all.length) return `<h2 class="vh">Practice</h2><p class="vsub">No practice problems yet. Add JSON files to content/practice/ and run python3 tools/build.py.</p>`;
  const list = all.filter(p=>PR.diff==="All" || p.difficulty===PR.diff), pats = [...new Set(list.map(p=>p.pattern))];
  const done = all.filter(p=>solved(p.id)).length;
  return `<h2 class="vh">Practice</h2><p class="vsub">${all.length} problems grouped by pattern; ${done} solved. Learn the pattern, not the problem: each one has a hint, the approach and why it works, and follow-up questions an interviewer would ask. Your code runs in your browser with a 2-second limit.</p>
    <div class="filters" role="group" aria-label="Difficulty">${DIFFS.map(d=>`<button type="button" data-adiff="${d}" aria-pressed="${PR.diff===d}">${d} <span class="mono" style="opacity:.7">${d==="All"?all.length:all.filter(p=>p.difficulty===d).length}</span></button>`).join("")}</div>
    <p class="av-aux">Not sure which pattern a problem needs? <button type="button" class="linkish" data-atab="patterns">Open the "Which pattern?" cheat sheet</button>.</p>
    ${pats.map(pt=>{ const ps = list.filter(p=>p.pattern===pt), [tn, tt] = tplFor(pt), open = PR.tplOpen && PR.tplOpen[pt];
      return `<h3 class="ysec pr-pat" id="pat-${slug(pt)}">${esc(pt)} <span class="mono">${ps.filter(p=>solved(p.id)).length}/${ps.length}</span>${tt ? `<button type="button" class="btn tp-btn" data-atpl="${esc(pt)}" aria-expanded="${!!open}">${open ? "Hide" : "Show"} pattern template</button>` : ""}</h3>${tt && open ? `<div class="pr-tpl">${tplHTML(tn, tt)}</div>` : ""}<div class="pr-list">${ps.map(p=>`<button type="button" class="pr-row" data-aprob="${esc(p.id)}"><span class="pr-t">${esc(p.title)}</span><span class="pr-d ${esc(String(p.difficulty).toLowerCase())}">${esc(p.difficulty)}</span><span class="pr-s" title="${solved(p.id)?"Solved":"Not solved yet"}">${solved(p.id)?"✓ solved":""}</span></button>`).join("")}</div>`; }).join("") || `<p class="empty">No ${esc(PR.diff)} problems.</p>`}`;
}
function paras(t){ return String(t||"").split(/\n+/).filter(Boolean).map(x=>`<p>${esc(x)}</p>`).join(""); }
function problemHTML(p){
  const sv = PR.saved && PR.saved[p.id], code = sv && sv.code ? sv.code : p.starter;
  const rev = (k, label, body) => `<div class="pr-rev"><button type="button" class="btn" data-areveal="${k}" aria-expanded="${!!PR.shown[k]}">${PR.shown[k]?"Hide":"Show"} ${label}</button><div class="pr-revb" id="pr-${k}"${PR.shown[k]?"":" hidden"}>${body}</div></div>`;
  return `<div class="pr">
    <button type="button" class="btn" data-aprob="">← All problems</button>
    <h2 class="vh" style="margin-top:12px">${esc(p.title)}</h2>
    <p class="pr-meta"><span class="pr-d ${esc(String(p.difficulty).toLowerCase())}">${esc(p.difficulty)}</span> <span>${esc(p.pattern)}</span>${p.link?` · <a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">open the original ↗</a>`:""} <span class="pr-s" id="pr-solved">${solved(p.id)?"✓ solved":""}</span></p>
    ${p.concepts&&p.concepts.length?chipsHTML(p.concepts):""}
    <div class="pr-stmt">${paras(p.statement)}</div>
    ${(([tn, tt]) => tt ? rev("template", "pattern template", `<p class="av-aux">The general shape of <b>${esc(tn)}</b> problems, not this problem's answer.</p>` + tplHTML(tn, tt)) : "")(tplFor(p.pattern))}
    <p class="av-aux">Write <code>${esc(p.fn)}(${esc((p.params||[]).join(", "))})</code> in JavaScript. Tab inserts two spaces; press Esc, then Tab, to leave the editor.</p>
    <label for="pr-code" class="sr">Your code</label>
    <textarea id="pr-code" class="pr-code" spellcheck="false" autocomplete="off" autocapitalize="off" data-aprob-id="${esc(p.id)}">${esc(code)}</textarea>
    <div class="btnrow"><button type="button" class="btn primary" data-aact="run">Run tests</button><button type="button" class="btn" data-aact="starter">Reset to starter code</button><button type="button" class="btn" data-aact="togglesolved">${solved(p.id)?"Mark as not solved":"Mark as solved"}</button><span class="mono av-aux" id="pr-saved" aria-live="polite"></span></div>
    <div id="pr-out" aria-live="polite">${PR.out}</div>
    ${rev("hint","hint", paras(p.hint))}
    ${rev("approach","approach", paras(p.approach) + (p.complexity?`<p><b>Complexity:</b> ${esc(p.complexity)}</p>`:""))}
    ${rev("solution","solution", `<pre class="pr-sol">${esc(p.solution)}</pre>`)}
    ${p.followups&&p.followups.length?`<h3 class="ysec">Follow-up questions</h3><ol class="pr-fu">${p.followups.map(q=>`<li>${esc(q)}</li>`).join("")}</ol>`:""}
  </div>`;
}
const WORKER_SRC = `
var logs = [];
console.log = function(){ if (logs.length < 50) logs.push([].map.call(arguments, function(x){ try { return typeof x === "string" ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(" ")); };
onmessage = function(e){
  var d = e.data, f;
  try { f = (new Function(d.code + "\\n;return (typeof " + d.fn + " === 'function') ? " + d.fn + " : undefined;"))(); }
  catch (err) { postMessage({error: "Your code does not compile: " + (err && err.message || err)}); return; }
  if (typeof f !== "function") { postMessage({error: "Define a function named " + d.fn + "."}); return; }
  for (var i = 0; i < d.tests.length; i++) {
    logs = []; var t0 = Date.now();
    try { var got = f.apply(null, JSON.parse(d.tests[i])); postMessage({i: i, got: got === undefined ? "undefined" : JSON.stringify(got), ms: Date.now() - t0, logs: logs}); }
    catch (err) { postMessage({i: i, error: String(err && err.message || err), logs: logs}); }
  }
  postMessage({done: true});
};`;
const norm = (v, unordered) => { if(unordered && Array.isArray(v)) v = v.map(x=>JSON.stringify(Array.isArray(x)?[...x].sort():x)).sort(); return JSON.stringify(v); };
function runTests(p, code){
  return new Promise(resolve=>{
    const res = []; let w, timer;
    const finish = (extra) => { clearTimeout(timer); try{ w && w.terminate(); }catch(e){} resolve(Object.assign({res}, extra||{})); };
    const msg = d => { if(d.error && d.i===undefined) return finish({error:d.error}); if(d.done) return finish({}); res[d.i] = d; };
    const tests = p.tests.map(t=>JSON.stringify(t.args));
    try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], {type:"text/javascript"}))); }
    catch(e){
      // no workers here (some sandboxes): run in the page, without the time limit
      try { const f = new Function(code + "\n;return (typeof " + p.fn + " === 'function') ? " + p.fn + " : undefined;")();
        if(typeof f !== "function") return resolve({res, error:"Define a function named " + p.fn + "."});
        tests.forEach((a,i)=>{ try{ const g = f(...JSON.parse(a)); res[i] = {i, got:g===undefined?"undefined":JSON.stringify(g)}; }catch(err){ res[i] = {i, error:String(err.message||err)}; } });
        return resolve({res, nolimit:true}); } catch(err){ return resolve({res, error:"Your code does not compile: " + err.message}); }
    }
    w.onmessage = e => msg(e.data);
    w.onerror = e => { e.preventDefault(); finish({error:e.message || "Your code threw an error."}); };
    timer = setTimeout(()=>finish({timeout:true}), 2000);
    w.postMessage({code, fn:p.fn, tests});
  });
}
function resultsHTML(p, r){
  const short = (x, n) => { const s = String(x); return s.length > (n||160) ? s.slice(0, n||160) + "…" : s; };
  if(r.error && !r.res.length) return `<div class="pr-res bad"><b>Error.</b> ${esc(r.error)}</div>`;
  let pass = 0;
  const rows = p.tests.map((t,i)=>{ const d = r.res[i];
    let ok = false, got;
    if(!d){ got = r.timeout ? "(stopped: over 2 seconds)" : "(not run)"; }
    else if(d.error){ got = "Error: " + d.error; }
    else { got = d.got; const val = d.got==="undefined" ? undefined : JSON.parse(d.got); ok = norm(val, p.order_insensitive) === norm(t.expected, p.order_insensitive); }
    if(ok) pass++;
    return `<li class="${ok?"ok":"bad"}"><span class="pr-mark">${ok?"✓ pass":"✗ fail"}</span><span class="mono">input: ${esc(short(t.args.map(a=>JSON.stringify(a)).join(", ")))}</span><span class="mono">expected: ${esc(short(JSON.stringify(t.expected)))}${p.order_insensitive?" (any order)":""}</span><span class="mono">got: ${esc(short(got))}</span>${d&&d.logs&&d.logs.length?`<span class="mono pr-log">console: ${esc(short(d.logs.join(" | "), 240))}</span>`:""}</li>`; });
  const all = pass === p.tests.length;
  return `<div class="pr-res ${all?"good":"bad"}"><b>${pass} of ${p.tests.length} tests pass.</b> ${all?"Well done. Now read the approach and try the follow-ups.":r.timeout?"Stopped after 2 seconds: is there an infinite loop, or a slow algorithm?":"Look at the first failing test."}${r.nolimit?" (Ran without the time limit: workers are not available here.)":""}</div><ol class="pr-tests">${rows.join("")}</ol>`;
}

/* ---------------- pattern templates (content/practice/templates.json, keyed by practice pattern name) ---------------- */
/* The language choice is shared by every code panel and kept in this browser. Lang is reusable: Lang.get(), Lang.set(id),
   Lang.list(), Lang.selectHTML(current, available) renders buttons with data-codelang; a "dts:lang" event fires on window when it changes. */
const LANGS = [{id:"python", label:"Python", rich:"python"},{id:"javascript", label:"JavaScript", rich:"js"},{id:"go", label:"Go", rich:"go"},
  {id:"cpp", label:"C++", rich:"c"},{id:"rust", label:"Rust", rich:"rust"},{id:"scala", label:"Scala", rich:"scala"}];
const LKEY = "dts:lang:v1";
const Lang = {
  get(){ let v = null; try{ v = localStorage.getItem(LKEY); }catch(e){} return LANGS.some(l=>l.id===v) ? v : "python"; },
  set(v){ if(!LANGS.some(l=>l.id===v)) return; try{ localStorage.setItem(LKEY, v); }catch(e){} try{ window.dispatchEvent(new CustomEvent("dts:lang", {detail:v})); }catch(e){} },
  list:() => LANGS.map(l=>({id:l.id, label:l.label})),
  selectHTML(cur, avail){ const ok = avail ? LANGS.filter(l=>avail.includes(l.id)) : LANGS;
    return `<div class="lang-sel" role="group" aria-label="Code language">${ok.map(l=>`<button type="button" data-codelang="${l.id}" aria-pressed="${l.id===cur}">${l.label}</button>`).join("")}</div>`; }
};
const templates = () => (app().DATA.templates || {});
/* a template for a pattern name: the exact name, else the same name ignoring case and a "(...)" suffix */
function tplFor(name){
  const T = templates(); if(T[name]) return [name, T[name]];
  const k = s => String(s||"").toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim(), want = k(name), hit = Object.keys(T).find(x=>k(x)===want);
  return hit ? [hit, T[hit]] : [null, null];
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function tplCodeHTML(t, lang){
  const ids = LANGS.filter(l=>t.code && t.code[l.id]).map(l=>l.id), cur = ids.includes(lang) ? lang : ids[0], L = LANGS.find(l=>l.id===cur), src = t.code[cur];
  const note = "lines marked CHANGE are the parts to adapt";
  const block = window.DTSRich && window.DTSRich.codeBlock ? window.DTSRich.codeBlock(src, L.rich, note) : `<pre class="pr-sol"><code>${esc(src)}</code></pre>`;
  return Lang.selectHTML(cur, ids) + block;
}
function tplHTML(name, t){
  const vz = [t.viz].concat(t.viz_more||[]).filter(id=>id && byId(id));
  const used = problems().filter(p=>p.pattern===name).length;
  return `<section class="tp" data-tpl="${esc(name)}" aria-label="Pattern template: ${esc(name)}">
    <p class="tp-sum">${esc(t.summary||"")}</p>
    <div class="tp-grid"><div><div class="av-h mono">Use it when you see</div><ul class="tp-sig">${(t.signals||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><div class="av-h mono">The idea</div><p>${esc(t.idea||"")}</p>${t.example?`<p class="tp-ex"><b>Template problem:</b> ${esc(t.example)}</p>`:""}</div></div>
    <div class="tp-code">${tplCodeHTML(t, Lang.get())}</div>
    <p class="tp-cx"><b>Complexity:</b> ${esc(t.complexity||"")}</p>
    ${(t.bugs||[]).length ? `<div class="av-h mono">Common bugs</div><ul class="tp-bugs">${t.bugs.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="btnrow tp-links">${vz.map(id=>`<button type="button" class="btn" data-avizgo="${esc(id)}">Watch it step by step: ${esc(byId(id).title)}</button>`).join("")}${used ? `<button type="button" class="btn" data-apat="${esc(name)}">Practice it: ${used} problem${used===1?"":"s"}</button>` : ""}</div>
  </section>`;
}
/* the "Which pattern?" cheat sheet: every signal from every template, filterable, then all the templates */
const PT = { q:"", open:null };
function patternsHTML(){
  const T = templates(), names = Object.keys(T);
  if(!names.length) return `<h2 class="vh">Which pattern?</h2><p class="vsub">No pattern templates yet. Add content/practice/templates.json and run python3 tools/build.py.</p>`;
  const count = n => problems().filter(p=>p.pattern===n).length;
  const rows = names.flatMap(n=>(T[n].signals||[]).map(sig=>`<tr data-ptrow><td>${esc(sig)}</td><td><button type="button" class="pt-go" data-aptjump="${esc(n)}">${esc(n)}</button></td><td class="pt-n mono">${count(n)||""}</td></tr>`));
  return `<h2 class="vh">Which pattern?</h2><p class="vsub">Read the problem, find the phrase that matches it below, and open that pattern's template. Each template says when to use it, the idea, code in ${LANGS.length} languages, the complexity, the usual bugs, and a visualizer you can step through.</p>
    <label class="av-f pt-filter"><span>Filter: type a word from the problem (sorted, k largest, intervals, all subsets, shortest path…)</span><input type="search" id="pt-q" value="${esc(PT.q)}" autocomplete="off" spellcheck="false"></label>
    <p class="av-aux mono" id="pt-count" aria-live="polite"></p>
    <div class="pt-wrap"><table class="pt-table"><thead><tr><th scope="col">If the problem says…</th><th scope="col">Pattern</th><th scope="col" class="pt-n">problems</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <h3 class="ysec">All ${names.length} templates</h3>
    <div class="pt-all">${names.map(n=>`<details class="pt-d" id="tpl-${slug(n)}"${PT.open===n?" open":""}><summary><b>${esc(n)}</b> <span>${esc(T[n].summary||"")}</span></summary>${tplHTML(n, T[n])}</details>`).join("")}</div>`;
}
function ptFilter(){
  const box = $("pt-q"); if(!box || !EL) return; const q = box.value.trim().toLowerCase(); PT.q = box.value;
  let n = 0; EL.querySelectorAll("[data-ptrow]").forEach(tr=>{ const on = !q || tr.textContent.toLowerCase().includes(q); tr.hidden = !on; if(on) n++; });
  const c = $("pt-count"); if(c) c.textContent = q ? `${n} matching signal${n===1?"":"s"}` : `${n} signals across ${Object.keys(templates()).length} patterns`;
}
function refreshCode(){ if(!EL) return; const lang = Lang.get();
  EL.querySelectorAll(".tp[data-tpl]").forEach(box=>{ const t = templates()[box.dataset.tpl], c = box.querySelector(".tp-code"); if(t && c) c.innerHTML = tplCodeHTML(t, lang); }); }

/* ---------------- view ---------------- */
let EL = null;
function hash(st){ return st.tab==="practice" ? "#practice/" + (st.prob || "list") : st.tab==="anim" ? "#animations" : st.tab==="patterns" ? "#patterns" : "#algo/" + (byId(st.viz) ? st.viz : V[0].id); }
/* ---------------- animations gallery ---------------- */
const SC = { list:null, waiting:false, err:"" };
function galleryHTML(){
  const A = app(), N = A.N, all = (SC.list||[]).filter(s=>N[s.concept]);
  if(!all.length) return `<h2 class="vh">Animations</h2><p class="vsub">${SC.err ? "Could not load the animations: " + esc(SC.err) : "No animated scenes yet. Add files to content/anim/ (the format is in content/anim/README.md) and run python3 tools/build.py."}</p>`;
  const byL = [0,1,2,3,4,5].map(l=>all.filter(s=>N[s.concept].l===l).sort((a,b)=>N[a.concept].label.localeCompare(N[b.concept].label) || String(a.title).localeCompare(String(b.title))));
  return `<h2 class="vh">Animations</h2><p class="vsub">${all.length} step-by-step animations of how things work: messages between machines, data moving between memory and disk, structures changing shape. Each one opens in its concept's read, where you can step through it.</p>` +
    byL.map((list,l)=>list.length ? `<h3 class="ysec">L${l} · ${esc(A.LAYERS[l].n)} · ${list.length}</h3><div class="sc-gal">${list.map(s=>`<button type="button" class="sc-card" data-sceneopen="${esc(s.id)}" style="--c:${A.lc(l)}"><span class="sc-th" data-thumb="${esc(s.id)}" style="aspect-ratio:${+s.w||720}/${+s.h||400}"></span><span class="tt">${esc(s.title||s.id)}</span><span class="ts"><span class="sw"></span>${esc(N[s.concept].label)} · ${(s.steps||[]).length} steps</span></button>`).join("")}</div>` : "").join("");
}
function galleryThumbs(el){
  if(!window.DTSScene) return;
  const by = {}; (SC.list||[]).forEach(s=>by[s.id]=s);
  const boxes = Array.from(el.querySelectorAll("[data-thumb]"));
  // draw the thumbnails in small batches so a long gallery does not block the page
  let i = 0; const batch = () => { const end = Math.min(boxes.length, i+12); for(; i<end; i++){ const b = boxes[i], s = by[b.dataset.thumb]; if(s && b.isConnected && !b.firstChild) try{ b.appendChild(window.DTSScene.thumb(s)); }catch(e){} } if(i<boxes.length) requestAnimationFrame(batch); };
  batch();
}
function render(el, st){
  EL = el; bind(el);
  if(!byId(st.viz)) st.viz = V[0].id;
  try{ if(!app().R.open) history.replaceState(null, "", hash(st)); }catch(e){}
  const nprob = problems().length;
  const nscn = (app().SCENES||[]).length;
  const tabs = `<div class="filters alg-tabs" role="group" aria-label="Algorithms"><button type="button" data-atab="viz" aria-pressed="${!["practice","anim","patterns"].includes(st.tab)}">Visualizers · ${V.length}</button><button type="button" data-atab="practice" aria-pressed="${st.tab==="practice"}">Practice · ${nprob}</button><button type="button" data-atab="patterns" aria-pressed="${st.tab==="patterns"}">Which pattern?</button><button type="button" data-atab="anim" aria-pressed="${st.tab==="anim"}">Animations · ${nscn}</button></div>`;
  if(st.tab==="patterns"){
    el.innerHTML = tabs + `<div class="alg-pt">${patternsHTML()}</div>`; ptFilter();
    if(PT.open){ const d = $("tpl-" + slug(PT.open)); PT.open = null; if(d){ d.open = true; d.scrollIntoView({block:"start"}); const s = d.querySelector("summary"); if(s) s.focus(); } }
    return;
  }
  if(st.tab==="anim"){
    if(!SC.list){ el.innerHTML = tabs + `<p class="empty">Loading the animations…</p>`;
      if(!SC.waiting){ SC.waiting = true; app().Store.scenes().then(l=>{ SC.list = l||[]; }).catch(e=>{ SC.list = []; SC.err = e.message; }).then(()=>{ SC.waiting = false; const a = app(); if(a.state.view==="algorithms" && a.state.algo.tab==="anim" && !a.R.open) render(el, a.state.algo); }); }
      return; }
    el.innerHTML = tabs + `<div class="alg-anim">${galleryHTML()}</div>`;
    galleryThumbs(el);
    return;
  }
  if(st.tab==="practice"){
    if(!PR.saved){ el.innerHTML = tabs + `<p class="empty">Loading your practice…</p>`; if(!PR.waiting){ PR.waiting = true; loadSaved().then(()=>{ PR.waiting = false; if(app().state.view==="algorithms") render(el, app().state.algo); }); } return; }
    const p = problems().find(x=>x.id===st.prob);
    if(p && PR.cur !== p.id){ PR.cur = p.id; PR.out = ""; PR.shown = {}; }
    el.innerHTML = tabs + (p ? problemHTML(p) : practiceListHTML());
    if(!p) PR.cur = null;
    return;
  }
  if(P.id !== st.viz) load(st.viz);
  const v = byId(P.id);
  el.innerHTML = tabs + `<div class="alg-grid"><nav class="alg-list" aria-label="Visualizers">${GROUPS.map(g=>`<div class="cat alg-g">${esc(g)}</div>${V.filter(x=>x.group===g).map(x=>`<button type="button" class="alg-it" data-aviz="${x.id}" aria-pressed="${x.id===v.id}">${esc(x.title)}</button>`).join("")}`).join("")}</nav><section class="alg-main">${vizHTML(v)}</section></div>`;
  showFrame();
}
function readInputs(){ const o = Object.assign({}, P.vals); EL.querySelectorAll("[data-ain]").forEach(i=>o[i.dataset.ain] = i.value); return o; }
function rerun(vals){ const st = app().state.algo; load(P.id, vals); render(EL, st); }
function bind(el){
  if(el.__algoBound) return; el.__algoBound = true;
  el.addEventListener("click", async e=>{
    const b = e.target.closest("button"); if(!b || !el.contains(b)) return;
    const d = b.dataset, st = app().state.algo;
    try {
      if(d.atab){ stop(); st.tab = d.atab; render(el, st); if(d.atab==="patterns") el.scrollIntoView({block:"start"}); return; }
      if(d.codelang){ const box = b.closest(".tp"), same = box && box.dataset.tpl; Lang.set(d.codelang); refreshCode();
        const back = same ? Array.from(el.querySelectorAll(".tp[data-tpl]")).find(x=>x.dataset.tpl===same) : null, nb = back && back.querySelector(`[data-codelang="${d.codelang}"]`); if(nb) nb.focus(); return; }
      if(d.avizgo){ stop(); st.tab = "viz"; st.viz = d.avizgo; P.err = ""; render(el, st); el.scrollIntoView({block:"start"}); return; }
      if(d.aptjump){ stop(); st.tab = "patterns"; PT.open = d.aptjump; return render(el, st); }
      if(d.atpl){ PR.tplOpen = PR.tplOpen || {}; PR.tplOpen[d.atpl] = !PR.tplOpen[d.atpl]; render(el, st); const h = $("pat-" + slug(d.atpl)), again = h && h.querySelector("[data-atpl]"); if(again) again.focus(); return; }
      if(d.apat){ stop(); st.tab = "practice"; st.prob = null; PR.diff = "All"; render(el, st); const h = $("pat-" + slug(d.apat)); if(h) h.scrollIntoView({block:"start"}); return; }
      if(d.aviz){ stop(); st.viz = d.aviz; P.err = ""; render(el, st); const m = el.querySelector(".alg-main"); if(m && matchMedia("(max-width: 900px)").matches) m.scrollIntoView({block:"start"}); return; }
      if(d.acell!==undefined){ const v = byId(P.id); if(!v.click) return; const nv = v.click(P.vals, +d.acell); if(nv) rerun(Object.assign({}, P.vals, nv)); return; }
      if(d.alive){ const v = byId(P.id); if(!v.act) return; const fv = {};
        el.querySelectorAll("[data-alin]").forEach(i=>{ fv[i.dataset.alin] = P.live[i.dataset.alin] = i.value; });
        let r; try { r = v.act(P.vals, d.alive, fv, P.frames[P.k]); } catch(err){ P.err = err.message || String(err); stop(); return render(el, st); }
        if(!r) return;
        stop(); load(P.id, r.v);
        if(!P.err){ const i = P.frames.findIndex(f=>f.s.seek >= r.seek); P.k = i<0 ? P.frames.length-1 : i; }
        render(el, st); const again = el.querySelector(`[data-alive="${d.alive}"]`); if(again && !again.disabled) again.focus();
        if(!P.err && !reducedMotion()) play();
        return; }
      if(d.apreset!==undefined){ const v = byId(P.id); return rerun(Object.assign({}, P.vals, v.presets[+d.apreset].v)); }
      if(d.adiff){ PR.diff = d.adiff; return render(el, st); }
      if(d.aprob!==undefined){ st.prob = d.aprob || null; render(el, st); el.scrollIntoView({block:"start"}); return; }
      if(d.areveal){ PR.shown[d.areveal] = !PR.shown[d.areveal]; const box = $("pr-"+d.areveal); if(box) box.hidden = !PR.shown[d.areveal]; b.textContent = (PR.shown[d.areveal]?"Hide ":"Show ") + b.textContent.replace(/^(Hide|Show) /,""); b.setAttribute("aria-expanded", String(!!PR.shown[d.areveal])); return; }
      const act = d.aact; if(!act) return;
      if(act==="apply") return rerun(readInputs());
      if(act==="random"){ const v = byId(P.id); return rerun(Object.assign({}, P.vals, v.random(P.vals))); }
      if(act==="play") return P.t ? stop() : play();
      if(act==="back"){ stop(); P.k = Math.max(0, P.k-1); return showFrame(); }
      if(act==="next"){ stop(); P.k = Math.min(P.frames.length-1, P.k+1); return showFrame(); }
      if(act==="reset"){ stop(); P.k = 0; return showFrame(); }
      const p = problems().find(x=>x.id===st.prob); if(!p) return;
      const ta = $("pr-code");
      if(act==="run"){ b.disabled = true; $("pr-out").innerHTML = `<p class="av-aux">Running ${p.tests.length} tests…</p>`;
        const code = ta.value; savePractice(p.id, {code}).catch(()=>{});
        const r = await runTests(p, code); b.disabled = false;
        PR.out = resultsHTML(p, r); if($("pr-out")) $("pr-out").innerHTML = PR.out;
        const all = r.res.filter((x,i)=>x && !x.error && norm(x.got==="undefined"?undefined:JSON.parse(x.got), p.order_insensitive)===norm(p.tests[i].expected, p.order_insensitive)).length === p.tests.length;
        if(all && !solved(p.id)){ await savePractice(p.id, {solved:true}).catch(()=>{}); app().toast("All tests pass: marked as solved"); const sm = $("pr-solved"); if(sm) sm.textContent = "✓ solved"; const tb = el.querySelector('[data-aact="togglesolved"]'); if(tb) tb.textContent = "Mark as not solved"; }
        return; }
      if(act==="starter"){ if(ta.value!==p.starter && !confirm("Replace your code with the starter code?")) return; ta.value = p.starter; await savePractice(p.id, {code:p.starter}); $("pr-saved").textContent = "saved"; return; }
      if(act==="togglesolved"){ const on = !solved(p.id); await savePractice(p.id, {solved:on}); app().toast(on?"Marked as solved":"Marked as not solved"); return render(el, st); }
    } catch(err){ app().toast("Something went wrong: " + err.message); }
  });
  el.addEventListener("change", e=>{
    const s = e.target; if(!s.matches || !s.matches("select[data-ain]")) return;
    const v = byId(P.id), inp = (v.inputs||[]).find(i=>i.k===s.dataset.ain), o = inp && (inp.opts||[]).find(x=>String(x.v)===s.value);
    stop(); rerun(Object.assign(readInputs(), o && o.set || {}, {[s.dataset.ain]:s.value}));
    const again = EL.querySelector(`select[data-ain="${s.dataset.ain}"]`); if(again) again.focus();
  });
  el.addEventListener("input", e=>{
    if(e.target.id==="pt-q"){ ptFilter(); return; }
    if(e.target.id==="av-speed"){ P.speed = +e.target.value; if(P.t) play(); return; }
    if(e.target.id==="pr-code"){ const id = e.target.dataset.aprobId, ta = e.target; clearTimeout(PR.t); $("pr-saved").textContent = "…";
      PR.t = setTimeout(()=>{ savePractice(id, {code:ta.value}).then(()=>{ const s = $("pr-saved"); if(s) s.textContent = "saved"; }).catch(()=>{ const s = $("pr-saved"); if(s) s.textContent = "could not save"; }); }, 600); }
  });
  el.addEventListener("keydown", e=>{
    if(e.target.id==="pr-code"){
      if(e.key==="Escape"){ PR.esc = true; return; }
      if(e.key==="Tab" && !e.shiftKey && !PR.esc){ e.preventDefault(); const ta = e.target, a = ta.selectionStart, z = ta.selectionEnd;
        ta.setRangeText("  ", a, z, "end"); ta.dispatchEvent(new Event("input", {bubbles:true})); return; }
      PR.esc = false; return;
    }
    if(e.target.matches && e.target.matches("[data-ain]") && e.key==="Enter"){ e.preventDefault(); return rerun(readInputs()); }
    if(e.target.matches && e.target.matches("[data-alin]") && e.key==="Enter"){ e.preventDefault(); const b = el.querySelector(".av-live [data-alive]"); if(b) b.click(); return; }
    if(e.target.id==="av-stage" && (e.key==="ArrowLeft"||e.key==="ArrowRight")){ e.preventDefault(); stop(); P.k = Math.max(0, Math.min(P.frames.length-1, P.k + (e.key==="ArrowLeft"?-1:1))); showFrame(); }
  });
}

window.DTSAlgo = { render, hash, lang:Lang, templateFor:tplFor, list:()=>V.map(v=>v.id), forConcept:id=>V.filter(v=>(v.concepts||[]).includes(id)).map(v=>({id:v.id, title:v.title})), _P:P, _V:V, _run:runViz, _init:initVals };
if(window.__dts && window.__dts.algoReady) window.__dts.algoReady();
})();
