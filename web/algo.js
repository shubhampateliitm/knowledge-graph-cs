/* Down the Stack — Algorithms tab. Loaded after app.js (inlined after it in the standalone file).
   1. Visualizers: each algorithm runs once on your input and records every step as a frame, so Back works as well as Next.
   2. Practice: problems from DATA.practice; your code runs in a Web Worker with a 2-second limit.
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
               hit:"hits", miss:"misses", evict:"evictions", moved:"keys moved", steps:"pointer steps", set:"bits set", fp:"false positives"};

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

def({ id:"twoptr", group:"Searching", title:"Two pointers: pair with a target sum", concepts:["bigo","sorting"],
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

def({ id:"window", group:"Searching", title:"Sliding window: longest substring without repeats", concepts:["hashtables","bigo"],
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

def({ id:"trie", group:"Data structures", title:"Trie: insert and search", concepts:["trees","fst","invindex"],
  text:"A trie stores words letter by letter along paths from the root, so words with a common prefix share nodes. Insert and search cost O(length of the word), independent of how many words are stored, and \"all words starting with ca\" is one walk down. Autocomplete, routing tables (longest prefix match) and the term dictionaries in search engines build on it.",
  inputs:[{k:"ops", label:"Operations", def:"insert car, insert cat, insert cart, insert care, insert dog, insert do, search cat, search ca, prefix ca, search cow"}],
  counters:["steps"],
  code:["insert(w): node = root","  for each letter c in w:","    if node has no child c: create it","    node = node.child[c]","  mark node as the end of a word","search(w): node = root; follow each letter","  a letter is missing: not found","  found only if the last node ends a word"],
  run(v, R){ const T = {0:{c:"·", kids:{}, end:false}}; let nid = 1;
    const S = o => Object.assign({T}, o);
    R.step(0, "An empty trie: just the root.", S({}));
    for(const [cmd, w] of ops(v.ops)){ if(!w || !["insert","search","prefix"].includes(cmd) || !/^[a-z]{1,10}$/.test(w)) throw new Error('Write "insert word", "search word" or "prefix ab" (lowercase letters, up to 10).');
      if(nid > 40) throw new Error("The trie got too big to draw. Use fewer words.");
      let node = 0; const path = [0];
      if(cmd==="insert"){ R.step(0, `insert "${w}": start at the root.`, S({path:path.slice()}));
        for(const c of w){ R.inc("steps"); if(!T[node].kids[c]){ T[nid] = {c, kids:{}, end:false}; T[node].kids[c] = nid++; path.push(T[node].kids[c]); node = T[node].kids[c]; R.step(2, `No child '${c}': create it.`, S({path:path.slice(), cur:node, add:true})); }
          else { node = T[node].kids[c]; path.push(node); R.step(3, `Follow the existing child '${c}'.`, S({path:path.slice(), cur:node})); } }
        T[node].end = true; R.step(4, `Mark the last node: "${w}" is a word.`, S({path:path.slice(), cur:node, ok:true})); continue; }
      R.step(5, `${cmd} "${w}": start at the root.`, S({path:path.slice()}));
      let lost = false;
      for(const c of w){ R.inc("steps"); const nx = T[node].kids[c]; if(nx===undefined){ R.step(6, `No child '${c}': "${w}" is not ${cmd==="prefix"?"a prefix of any word":"in the trie"}.`, S({path:path.slice(), cur:node, miss:true})); lost = true; break; }
        node = nx; path.push(node); R.step(5, `Follow '${c}'.`, S({path:path.slice(), cur:node})); }
      if(lost) continue;
      if(cmd==="prefix"){ const words = []; const walk = (n, pre) => { if(T[n].end) words.push(pre); Object.keys(T[n].kids).sort().forEach(c=>walk(T[n].kids[c], pre+c)); }; walk(node, w);
        R.step(7, `Every word under this node starts with "${w}": ${words.join(", ")||"none"}.`, S({path:path.slice(), cur:node, ok:true})); }
      else R.step(7, T[node].end ? `The last node ends a word: "${w}" is found.` : `The path exists, but the last node does not end a word: "${w}" is only a prefix.`, S({path:path.slice(), cur:node, ok:T[node].end, miss:!T[node].end})); }
    R.step(4, "Done.", S({})); },
  draw(s){ const nodes = {}, on = new Set(s.path||[]);
    Object.entries(s.T).forEach(([id,n])=>{ nodes[id] = {label:n.c, end:n.end, kids:Object.keys(n.kids).sort().map(c=>String(n.kids[c])), cls:(+id===s.cur?(s.miss?"miss":s.ok?"done":"cur"):on.has(+id)?"cmp":""), ecls:on.has(+id)?"hot":""}; });
    return treeSVG(nodes, ["0"], {label:"Trie", ux:34, uy:50, r:14}) + `<p class="av-aux">A double circle marks the end of a word.</p>`; } });

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

const GROUPS = ["Sorting","Searching","Graphs","Data structures","Probabilistic & distributed","Dynamic programming"];
const NOTE = {Sorting:"Bars are values. Orange: being compared. Purple: just moved. Faded: outside the part being worked on. Green: in final place."};

/* ---------------- player ---------------- */
const SPEEDS = [1600, 1000, 650, 380, 170];
const P = { id:null, vals:null, frames:[], k:0, t:null, speed:2, err:"" };
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
  P.id = v.id; P.vals = vals || initVals(v); P.frames = r.frames; P.k = 0; P.err = "";
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
function showFrame(){
  const v = byId(P.id), f = P.frames[P.k], stage = $("av-stage"); if(!v || !stage) return;
  if(!f){ stage.innerHTML = ""; return; }
  stage.innerHTML = v.draw(f.s, P.vals, f);
  $("av-msg").textContent = f.msg;
  $("av-k").textContent = `step ${P.k+1} of ${P.frames.length}`;
  $("av-count").innerHTML = (v.counters||[]).map(k=>`<span><b>${f.c[k]||0}</b> ${COUNT[k]||k}</span>`).join("");
  document.querySelectorAll("#av-code li").forEach((li,i)=>{ li.classList.toggle("on", i===f.line); if(i===f.line) li.setAttribute("aria-current","step"); else li.removeAttribute("aria-current"); });
  const back = document.querySelector('[data-aact="back"]'), next = document.querySelector('[data-aact="next"]');
  if(back) back.disabled = P.k===0; if(next) next.disabled = P.k>=P.frames.length-1;
}
function chipsHTML(ids){
  const N = app().N;
  return `<div class="chips">${ids.filter(id=>N[id]).map(id=>`<button type="button" class="chip" style="--c:var(--l${N[id].l})" data-read="${id}"><span class="sw"></span>${esc(N[id].label)}</button>`).join("")}</div>`;
}
function vizHTML(v){
  const ins = (v.inputs||[]).map(i=>`<label class="av-f${i.w?" short":""}"><span>${esc(i.label)}</span><input type="text" data-ain="${i.k}" value="${esc(P.vals[i.k]===undefined?i.def:P.vals[i.k])}" spellcheck="false" autocomplete="off"${i.w?` style="width:${i.w+3}ch"`:""}></label>`).join("");
  const pres = (v.presets||[]).map((p,i)=>`<button type="button" class="btn" data-apreset="${i}">${esc(p.name)}</button>`).join("");
  return `<div class="av" data-viz="${v.id}">
    <h2 class="vh">${esc(v.title)}</h2><p class="vsub">${esc(v.text)}</p>${chipsHTML(v.concepts)}
    <div class="av-in">${ins}<div class="btnrow">${ins?`<button type="button" class="btn primary" data-aact="apply">Run with this input</button>`:""}${pres}${v.random?`<button type="button" class="btn" data-aact="random">Random input</button>`:""}</div></div>
    ${P.err?`<p class="av-err" role="alert">${esc(P.err)}</p>`:""}
    <div class="av-body">
      <div class="av-left">
        <div class="av-stage" id="av-stage" tabindex="0" aria-label="Animation stage. Left and right arrow keys step through it."></div>
        <p class="av-msg" id="av-msg" aria-live="polite"></p>
        <div class="av-ctl"><button type="button" class="btn" data-aact="back">← Back</button><button type="button" class="btn primary" data-aact="play" aria-pressed="false">Play</button><button type="button" class="btn" data-aact="next">Next →</button><button type="button" class="btn" data-aact="reset">Reset</button>
          <label class="av-speed"><span>Speed</span><input type="range" min="0" max="4" step="1" value="${P.speed}" id="av-speed" aria-label="Speed"></label><span class="mono av-k" id="av-k"></span></div>
        <div class="av-count" id="av-count"></div>
        ${NOTE[v.group]?`<p class="av-aux">${esc(NOTE[v.group])}</p>`:""}
      </div>
      <div class="av-side"><div class="av-h mono">Pseudocode</div><ol class="av-code" id="av-code">${v.code.map(l=>`<li><code>${esc(l)}</code></li>`).join("")}</ol></div>
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
    ${pats.map(pt=>{ const ps = list.filter(p=>p.pattern===pt); return `<h3 class="ysec pr-pat">${esc(pt)} <span class="mono">${ps.filter(p=>solved(p.id)).length}/${ps.length}</span></h3><div class="pr-list">${ps.map(p=>`<button type="button" class="pr-row" data-aprob="${esc(p.id)}"><span class="pr-t">${esc(p.title)}</span><span class="pr-d ${esc(String(p.difficulty).toLowerCase())}">${esc(p.difficulty)}</span><span class="pr-s" title="${solved(p.id)?"Solved":"Not solved yet"}">${solved(p.id)?"✓ solved":""}</span></button>`).join("")}</div>`; }).join("") || `<p class="empty">No ${esc(PR.diff)} problems.</p>`}`;
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

/* ---------------- view ---------------- */
let EL = null;
function hash(st){ return st.tab==="practice" ? "#practice/" + (st.prob || "list") : "#algo/" + (byId(st.viz) ? st.viz : V[0].id); }
function render(el, st){
  EL = el; bind(el);
  if(!byId(st.viz)) st.viz = V[0].id;
  try{ if(!app().R.open) history.replaceState(null, "", hash(st)); }catch(e){}
  const nprob = problems().length;
  const tabs = `<div class="filters alg-tabs" role="group" aria-label="Algorithms"><button type="button" data-atab="viz" aria-pressed="${st.tab!=="practice"}">Visualizers · ${V.length}</button><button type="button" data-atab="practice" aria-pressed="${st.tab==="practice"}">Practice · ${nprob}</button></div>`;
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
      if(d.atab){ stop(); st.tab = d.atab; return render(el, st); }
      if(d.aviz){ stop(); st.viz = d.aviz; P.err = ""; render(el, st); const m = el.querySelector(".alg-main"); if(m && matchMedia("(max-width: 900px)").matches) m.scrollIntoView({block:"start"}); return; }
      if(d.acell!==undefined){ const v = byId(P.id); if(!v.click) return; const nv = v.click(P.vals, +d.acell); if(nv) rerun(Object.assign({}, P.vals, nv)); return; }
      if(d.apreset!==undefined){ const v = byId(P.id); return rerun(Object.assign({}, P.vals, v.presets[+d.apreset].v)); }
      if(d.adiff){ PR.diff = d.adiff; return render(el, st); }
      if(d.aprob!==undefined){ st.prob = d.aprob || null; render(el, st); el.scrollIntoView({block:"start"}); return; }
      if(d.areveal){ PR.shown[d.areveal] = !PR.shown[d.areveal]; const box = $("pr-"+d.areveal); if(box) box.hidden = !PR.shown[d.areveal]; b.textContent = (PR.shown[d.areveal]?"Hide ":"Show ") + b.textContent.replace(/^(Hide|Show) /,""); b.setAttribute("aria-expanded", String(!!PR.shown[d.areveal])); return; }
      const act = d.aact; if(!act) return;
      if(act==="apply") return rerun(readInputs());
      if(act==="random"){ const v = byId(P.id); return rerun(Object.assign({}, P.vals, v.random())); }
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
  el.addEventListener("input", e=>{
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
    if(e.target.id==="av-stage" && (e.key==="ArrowLeft"||e.key==="ArrowRight")){ e.preventDefault(); stop(); P.k = Math.max(0, Math.min(P.frames.length-1, P.k + (e.key==="ArrowLeft"?-1:1))); showFrame(); }
  });
}

window.DTSAlgo = { render, hash, list:()=>V.map(v=>v.id), _P:P, _V:V, _run:runViz, _init:initVals };
if(window.__dts && window.__dts.algoReady) window.__dts.algoReady();
})();
