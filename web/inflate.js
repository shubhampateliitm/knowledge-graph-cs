/* Down the Stack: decode the embedded content of the standalone page (tools/build.py writes it as gzip + base64).
   Uses the browser's DecompressionStream when there is one, else the small inflate (RFC 1951) below.
   Sets window.DTS_DATA to a promise of the content object; web/app.js waits for it. */
(function(root){
"use strict";
function inflate(src){
  // raw DEFLATE decoder (stored, fixed and dynamic Huffman blocks)
  let pos = 0, bit = 0, out = new Uint8Array(src.length * 4 + 1024), olen = 0;
  const need = n => { if(olen + n > out.length){ let m = out.length * 2; while(m < olen + n) m *= 2; const o = new Uint8Array(m); o.set(out.subarray(0, olen)); out = o; } };
  const bits = n => { let v = 0; for(let i = 0; i < n; i++){ if(pos >= src.length) throw new Error("inflate: truncated"); v |= ((src[pos] >> bit) & 1) << i; if(++bit === 8){ bit = 0; pos++; } } return v; };
  function table(lengths){
    const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lengths.length);
    for(const l of lengths) count[l]++;
    count[0] = 0;
    for(let i = 1; i < 16; i++) offs[i] = offs[i-1] + count[i-1];
    lengths.forEach((l, s) => { if(l) sym[offs[l]++] = s; });
    return {count, sym};
  }
  function decode(t){
    let code = 0, first = 0, index = 0;
    for(let len = 1; len < 16; len++){
      code |= bits(1); const c = t.count[len];
      if(code - c < first) return t.sym[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error("inflate: bad code");
  }
  const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  let fixedL = null, fixedD = null;
  let last = 0;
  do {
    last = bits(1); const type = bits(2);
    if(type === 0){
      if(bit){ bit = 0; pos++; }
      const len = src[pos] | (src[pos+1] << 8); pos += 4;
      need(len); out.set(src.subarray(pos, pos + len), olen); olen += len; pos += len;
      continue;
    }
    let lt, dt;
    if(type === 1){
      if(!fixedL){ const l = new Array(288); for(let i=0;i<288;i++) l[i] = i<144?8:i<256?9:i<280?7:8; fixedL = table(l); fixedD = table(new Array(30).fill(5)); }
      lt = fixedL; dt = fixedD;
    } else if(type === 2){
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const ORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15], cl = new Array(19).fill(0);
      for(let i = 0; i < hclen; i++) cl[ORD[i]] = bits(3);
      const ct = table(cl), lens = [];
      while(lens.length < hlit + hdist){
        const s = decode(ct);
        if(s < 16) lens.push(s);
        else if(s === 16){ const p = lens[lens.length-1], r = 3 + bits(2); for(let i=0;i<r;i++) lens.push(p); }
        else if(s === 17){ const r = 3 + bits(3); for(let i=0;i<r;i++) lens.push(0); }
        else { const r = 11 + bits(7); for(let i=0;i<r;i++) lens.push(0); }
      }
      lt = table(lens.slice(0, hlit)); dt = table(lens.slice(hlit));
    } else throw new Error("inflate: bad block type");
    for(;;){
      const s = decode(lt);
      if(s < 256){ need(1); out[olen++] = s; continue; }
      if(s === 256) break;
      const li = s - 257, len = LBASE[li] + bits(LEXT[li]);
      const di = decode(dt), dist = DBASE[di] + bits(DEXT[di]);
      need(len);
      for(let i = 0; i < len; i++){ out[olen] = out[olen - dist]; olen++; }
    }
  } while(!last);
  return out.subarray(0, olen);
}
function gunzip(b){
  if(b[0] !== 0x1f || b[1] !== 0x8b) throw new Error("not gzip");
  const flg = b[3]; let p = 10;
  if(flg & 4){ p += 2 + (b[p] | (b[p+1] << 8)); }
  if(flg & 8){ while(b[p++]); }
  if(flg & 16){ while(b[p++]); }
  if(flg & 2) p += 2;
  return inflate(b.subarray(p));
}
function b64bytes(s){
  const bin = atob(s), n = bin.length, out = new Uint8Array(n);
  for(let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function decodeData(b64){
  const bytes = b64bytes(b64);
  if(typeof DecompressionStream === "function" && typeof Response === "function" && typeof Blob === "function"){
    try{
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    }catch(e){ /* fall through to the JS decoder */ }
  }
  return JSON.parse(new TextDecoder("utf-8").decode(gunzip(bytes)));
}
root.DTSInflate = {inflate, gunzip, decodeData};
if(typeof document !== "undefined"){
  const el = document.getElementById("dts-data");
  if(el && !root.DATA){ root.DTS_DATA = decodeData(el.textContent.trim()); root.DTS_DATA.then(()=>{ el.textContent = ""; }, ()=>{}); }
}
if(typeof module !== "undefined" && module.exports) module.exports = root.DTSInflate;
})(typeof window !== "undefined" ? window : globalThis);
