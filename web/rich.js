/* Down the Stack: rich text inside reads, designs and tours (content/FORMAT.md, v9).
   - maths: \( ... \) inline and \[ ... \] display, rendered to MathML with Temml (web/vendor/temml.min.js); LaTeX source as fallback
   - code: `inline`, ```lang fenced blocks with a small built-in highlighter, a language label and a copy button
   - SQL written in prose (SELECT ... FROM ..., UPDATE ... SET ...) is found, highlighted, and laid out as a block when long
   - un-marked formulas in prose ("C = B log₂(1 + S/N)", "T(n) = 2T(n/2) + O(n)") get the maths font, italic variables, spaced operators
   - **bold**, callouts (Key idea: / Rule of thumb: / Warning:)
   Works in the browser (window.DTSRich) and in Node (module.exports) so the heuristics can be tested on the whole corpus. */
(function(root){
"use strict";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const PH0 = "", PH1 = "", BLK = "";      // placeholders (private-use characters never appear in content)

/* ------------------------------------------------------------------ maths (Temml) */
let mathOK = null;
function mathSupported(){
  if(mathOK!==null) return mathOK;
  try{
    if(typeof document==="undefined"){ return mathOK=false; }
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;visibility:hidden;left:-999px;top:0";
    d.innerHTML = '<math><mspace height="23px" width="77px"></mspace></math>';
    document.body.appendChild(d);
    const r = d.firstChild.getBoundingClientRect(); d.remove();
    mathOK = Math.abs(r.height-23)<=2 && Math.abs(r.width-77)<=2;
  }catch(e){ mathOK = false; }
  return mathOK;
}
const texCache = new Map();
function tex(src, display){
  const key = (display?"D":"I")+src;
  if(texCache.has(key)) return texCache.get(key);
  let html = null;
  const T = root.temml;
  if(T && mathSupported()){
    try{ html = T.renderToString(src, {displayMode:!!display, throwOnError:true, annotate:true, trust:false}); }catch(e){ html = null; }
  }
  if(!html) html = `<code class="tex" title="Maths (LaTeX)">${esc(src)}</code>`;
  else if(display) html = `<div class="dmath" tabindex="0" role="group" aria-label="Formula">${html}</div>`;
  else html = `<span class="imath">${html}</span>`;
  if(texCache.size>4000) texCache.clear();
  texCache.set(key, html);
  return html;
}

/* ------------------------------------------------------------------ code highlighting */
const W = s => new Set(s.split(" "));
const SQLK = W("SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET FETCH FIRST NEXT ONLY JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING AS AND OR NOT IN IS NULL LIKE ILIKE BETWEEN EXISTS DISTINCT ALL ANY SOME UNION INTERSECT EXCEPT MINUS INSERT INTO VALUES UPDATE SET DELETE CREATE OR REPLACE TABLE VIEW MATERIALIZED INDEX UNIQUE PRIMARY KEY FOREIGN REFERENCES DEFAULT CONSTRAINT CHECK DROP ALTER ADD COLUMN RENAME TO IF MERGE WHEN MATCHED THEN ELSE END CASE WITH RECURSIVE OVER PARTITION ROWS RANGE UNBOUNDED PRECEDING FOLLOWING CURRENT ROW DESC ASC NULLS FOR SHARE SKIP LOCKED NOWAIT RETURNING LATERAL FILTER WITHIN TRUE FALSE DATE TIME TIMESTAMP INTERVAL AT ZONE QUALIFY WINDOW TABLESAMPLE BEGIN COMMIT ROLLBACK TRANSACTION ISOLATION LEVEL SERIALIZABLE REPEATABLE READ COMMITTED UNCOMMITTED EXPLAIN ANALYZE VACUUM GRANT REVOKE CLUSTER ZORDER OPTIMIZE TEMP TEMPORARY EXTERNAL LOCATION STORED PARTITIONED TBLPROPERTIES CAST TRY_CAST ASOF CUBE ROLLUP GROUPING SETS PIVOT UNPIVOT LOCK MODE EXCLUSIVE DO NOTHING CONFLICT COPY SHOW DESCRIBE USE");
const SQLT = W("INT INTEGER BIGINT SMALLINT TINYINT SERIAL BIGSERIAL TEXT VARCHAR CHAR STRING BOOLEAN BOOL FLOAT DOUBLE REAL DECIMAL NUMERIC JSON JSONB UUID BYTEA BLOB ARRAY MAP STRUCT PRECISION");
const SQLF = W("COUNT SUM AVG MIN MAX COALESCE NULLIF ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE NTILE APPROX_COUNT_DISTINCT APPROX_DISTINCT HLL_COUNT DATE_TRUNC DATE_ADD DATEDIFF EXTRACT NOW CURRENT_DATE CURRENT_TIMESTAMP LOWER UPPER LENGTH SUBSTR SUBSTRING CONCAT ARRAY_AGG STRING_AGG LISTAGG EXPLODE GREATEST LEAST ABS ROUND FLOOR CEIL HASH MD5 PERCENTILE_CONT PERCENTILE_DISC APPROX_PERCENTILE TO_DATE TO_TIMESTAMP JSON_EXTRACT GENERATE_SERIES UNNEST");
const KW = {
  python: W("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self"),
  js: W("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await null undefined true false static get set"),
  ts: W("break case catch class const continue default delete do else enum export extends finally for function if implements import in instanceof interface let new of private protected public readonly return super switch this throw try type typeof var void while async await null undefined true false keyof as declare namespace number string boolean any unknown never"),
  java: W("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while var true false null record sealed permits yield"),
  scala: W("abstract case catch class def do else extends false final finally for forSome if implicit import lazy match new null object override package private protected return sealed super this throw trait try true type val var while with yield given using then enum export extension"),
  go: W("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota"),
  rust: W("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err"),
  c: W("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL nullptr class public private protected template typename namespace using new delete virtual override std uint8_t uint32_t uint64_t int64_t size_t"),
  bash: W("if then else elif fi for while until do done case esac function in return export local readonly set unset echo cd exit source true false sudo"),
  yaml: W("true false null yes no on off"),
  json: W("true false null"),
};
KW.kotlin = KW.java;
const span = (cls, s) => cls ? `<span class="sx-${cls}">${esc(s)}</span>` : esc(s);

function hlSQL(code){
  let out = "", i = 0, m; const n = code.length;
  const re = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'?|"(?:[^"])*"?|`[^`]*`?|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|[A-Za-z_][\w$]*|<>|!=|<=|>=|::|\|\||[=<>+\-−*\/%,;().]|\s+|[\s\S]/gy;
  while(i<n){
    re.lastIndex = i; m = re.exec(code); if(!m) break; const t = m[0]; i = re.lastIndex;
    const c = t[0];
    if(t.startsWith("--")||t.startsWith("/*")) out += span("c", t);
    else if(c==="'") out += span("s", t);
    else if(c==='"'||c==="`") out += span("v", t);
    else if(/\d/.test(c)) out += span("n", t);
    else if(/[A-Za-z_]/.test(c)){
      const u = t.toUpperCase(), nx = code.slice(i).match(/^\s*\(/);
      if(SQLF.has(u) && nx) out += span("f", t);
      else if(SQLT.has(u)) out += span("ty", t);
      else if(SQLK.has(u) && (t===u || t===t.toLowerCase())) out += span("k", t);
      else if(nx) out += span("f", t);
      else out += esc(t);
    }
    else if(/\s/.test(c)) out += esc(t);
    else out += span(/[(),;.]/.test(c)?"p":"o", t);
  }
  return out;
}
function hlGeneric(code, lang){
  const kw = KW[lang] || new Set();
  const hash = /^(python|bash|yaml)$/.test(lang), slash = /^(js|ts|java|scala|go|rust|c|kotlin)$/.test(lang);
  let out = "", i = 0; const n = code.length;
  const parts = [];
  if(lang==="python") parts.push(`[rRbBfFuU]{0,2}(?:"""[\\s\\S]*?(?:"""|$)|'''[\\s\\S]*?(?:'''|$))`);
  if(hash) parts.push("#[^\\n]*");
  if(slash) parts.push("\\/\\/[^\\n]*", "\\/\\*[\\s\\S]*?(?:\\*\\/|$)");
  parts.push(`[rRbBfFuU]{0,2}"(?:\\\\.|[^"\\\\\\n])*"?`, `'(?:\\\\.|[^'\\\\\\n])*'?`);
  if(/^(js|ts|go)$/.test(lang)) parts.push("`(?:\\\\.|[^`\\\\])*`?");
  if(lang==="bash") parts.push("\\$\\{[^}]*\\}|\\$[A-Za-z_][\\w]*|\\$\\d|--?[A-Za-z][\\w-]*");
  if(/^(python|java|scala|kotlin|ts)$/.test(lang)) parts.push("@[A-Za-z_][\\w.]*");
  parts.push("0[xX][0-9a-fA-F_]+|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[a-zA-Z]{0,3}\\b", "[A-Za-z_][\\w]*!?", "\\s+", "[\\s\\S]");
  const re = new RegExp(parts.join("|"), "gy");
  let lineStart = true;
  while(i<n){
    re.lastIndex = i; const m = re.exec(code); if(!m) break; const t = m[0]; i = re.lastIndex; const c = t[0];
    if((hash && c==="#") || (slash && (t.startsWith("//")||t.startsWith("/*")))) out += span("c", t);
    else if(/["'`]/.test(c) || (/^[rRbBfFuU]{1,2}["']/.test(t))){
      // JSON / YAML keys: a string followed by ':'
      if((lang==="json"||lang==="yaml") && /^\s*:/.test(code.slice(i))) out += span("a", t); else out += span("s", t);
    }
    else if(c==="$" || (lang==="bash" && /^--?[A-Za-z]/.test(t))) out += span("v", t);
    else if(c==="@") out += span("d", t);
    else if(/\d/.test(c)) out += span("n", t);
    else if(/[A-Za-z_]/.test(c)){
      const after = code.slice(i);
      if(lang==="yaml" && lineStart && /^\s*:/.test(after)) out += span("a", t);
      else if(kw.has(t)) out += span("k", t);
      else if(lang==="bash" && lineStart) out += span("f", t);
      else if(/^\s*\(/.test(after) || (lang==="rust" && t.endsWith("!"))) out += span("f", t);
      else if(/^[A-Z][a-z0-9]+[A-Za-z0-9]*$/.test(t) && lang!=="bash" && lang!=="yaml") out += span("ty", t);
      else out += esc(t);
    }
    else if(/\s/.test(c)) out += esc(t);
    else out += span(/[{}()[\],;.:]/.test(c)?"p":"o", t);
    if(t.includes("\n")) lineStart = true; else if(!/^\s+$/.test(t) && !(lang==="yaml" && t==="-")) lineStart = false;
  }
  return out;
}
function highlight(code, lang){
  lang = (lang||"text").toLowerCase();
  if(lang==="sql") return hlSQL(code);
  if(lang==="text"||lang==="") return esc(code);
  return hlGeneric(code, lang);
}
const LANG_NAME = {sql:"SQL", python:"Python", scala:"Scala", java:"Java", kotlin:"Kotlin", js:"JavaScript", ts:"TypeScript", go:"Go", rust:"Rust", c:"C / C++", bash:"Shell", json:"JSON", yaml:"YAML", text:"Text"};
let codeSeq = 0;
function codeBlock(code, lang, note){
  const id = "cb" + (++codeSeq);
  return `<figure class="codeblock" data-lang="${esc(lang)}"><figcaption><span class="cb-lang">${esc(LANG_NAME[lang]||lang)}</span>${note?`<span class="cb-note">${esc(note)}</span>`:""}<button type="button" class="cb-copy" data-copy="${id}" aria-label="Copy ${esc(LANG_NAME[lang]||lang)} code">Copy</button></figcaption><pre tabindex="0" aria-label="${esc(LANG_NAME[lang]||lang)} code"><code id="${id}">${highlight(code, lang)}</code></pre></figure>`;
}

/* ------------------------------------------------------------------ SQL in prose */
const SQL_START = /\b(SELECT|INSERT\s+(?:OVERWRITE\s+)?INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP\s+|TEMPORARY\s+|EXTERNAL\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW|(?:UNIQUE\s+)?INDEX)|MERGE\s+INTO|WITH\s+[a-z_]\w*\s+AS\s*\()(?=[\s(])/g;
const STMT = W("SELECT INSERT UPDATE DELETE CREATE MERGE WITH BEGIN COMMIT ROLLBACK");
// English words that end a SQL run written inside a sentence ("... WHERE id = 7, then updates ...")
const STOP = W("then and or which that the a an is are was were be been to so but because while where when whose returns return gives give finds find reads read takes take runs run would will can could should must may might it its this these those of for by as on in at from into not only also even than if each every all one two three has have had does do did becomes become means mean costs cost keeps keep scans scan touches touch sees see lets let uses use works work stays stay shows show produces produce fails fail waits wait locks lock writes write blocks block looks look selects select matches match hits hit after before until unless though although with without per via like such same both either neither instead rather what how why who");
const CLAUSE = W("SELECT FROM WHERE GROUP ORDER HAVING LIMIT OFFSET JOIN ON USING SET VALUES INTO UNION INTERSECT EXCEPT FOR RETURNING WHEN THEN PARTITION QUALIFY WINDOW MATCHED UPDATE DELETE INSERT TABLE VIEW INDEX WITH");
const COMMA_OK = W("SELECT GROUP ORDER PARTITION SET VALUES WITH FROM BY RETURNING USING");
const TERMINAL = W("LOCKED NOWAIT DESC ASC CONCURRENTLY");      // after these, a lowercase word is prose again

function sqlRun(s, start, startLen){
  // scan forward from a SQL statement keyword; return the end index (exclusive) of the SQL run, or -1
  const re = /'(?:[^'\n]|''){0,80}'|\d+(?:\.\d+)?|[A-Za-z_][\w$]*(?:\.[A-Za-z_*][\w$]*)*(?:\.\*)?|\.\.\.|…|<>|!=|<=|>=|::|\|\||[=<>+\-−×*\/%,;()?]|\$\d+|\s+|[\s\S]/gy;
  const phraseEnd = start + startLen;
  let i = start, end = start, depth = 0, clause = "", prev = "kw", aliasUsed = false, lastSig = "", afterPhrase = 0, lastKw = "";
  while(i < s.length){
    re.lastIndex = i; const m = re.exec(s); if(!m) break; const t = m[0], j = re.lastIndex;
    if(/^\s+$/.test(t)){ i = j; continue; }
    const c = t[0], inPhrase = i < phraseEnd;
    if(/[A-Za-z_]/.test(c)){
      if(t===t.toUpperCase() && (SQLK.has(t) || SQLT.has(t) || SQLF.has(t)) && t.length>1){
        if(SQLF.has(t) && /^\s*\(/.test(s.slice(j))) prev = "fn";
        else { if(CLAUSE.has(t) && !(t==="UPDATE" && lastKw==="FOR")) clause = t; prev = (t==="NULL"||t==="TRUE"||t==="FALSE")?"val":"kw"; aliasUsed = false; lastKw = t; }
        if(!inPhrase) afterPhrase++;
        end = j; i = j; lastSig = t; continue;
      }
      if(depth===0 && STOP.has(t.toLowerCase()) && t===t.toLowerCase()) break;
      if(TERMINAL.has(lastSig) || (lastSig==="UPDATE" && clause==="FOR")) break;
      if(prev==="val" || (prev==="close" && !/SELECT|FROM/.test(clause))) break;      // "= 42 matches ...": a word after a value ends the run
      if(prev==="id"){ if(aliasUsed || !/FROM|JOIN|UPDATE|INTO|SELECT/.test(clause)) break; aliasUsed = true; }
      else aliasUsed = false;
      if(!inPhrase) afterPhrase++;
      prev = "id"; end = j; i = j; lastSig = t; continue;
    }
    if(c==="'"){ if(!/[\s(=,]/.test(s[i-1]||" ")) break; prev = "val"; end = j; i = j; afterPhrase++; continue; }   // "SELECT *'" : a closing quote of the sentence
    if(/\d/.test(c) || t==="?" || c==="$"){ if(prev==="id" || prev==="val") break; prev = "val"; end = j; i = j; afterPhrase++; continue; }
    if(t==="..."||t==="…"){ prev = "val"; end = j; i = j; afterPhrase++; continue; }
    if(t==="("){ depth++; prev = "kw"; end = j; i = j; afterPhrase++; continue; }
    if(t===")"){ if(depth===0) break; depth--; prev = "close"; end = j; i = j; continue; }
    if(t===","){ if(depth===0 && !COMMA_OK.has(clause)) break; prev = "kw"; i = j; continue; }
    if(t===";"){ end = j; i = j; const nx = s.slice(j).match(/^\s*([A-Z]+)\b/); if(nx && STMT.has(nx[1])){ clause=""; prev="kw"; afterPhrase++; continue; } break; }
    if(t==="*"){ prev = prev==="kw"||prev==="fn"?"val":"kw"; end = j; i = j; afterPhrase++; continue; }
    if(/^(=|<>|!=|<=|>=|<|>|\+|-|−|×|\/|%|::|\|\|)$/.test(t)){ prev = "kw"; i = j; afterPhrase++; continue; }
    break;
  }
  let text = s.slice(start, end);
  const tail = text.match(/,\s*[a-z_]\w*$/);                       // "... AS SELECT, usually into ..."
  if(tail && /^\s+[a-z]/.test(s.slice(end))){ end -= tail[0].length; text = s.slice(start, end); }
  if(!text.trim()) return -1;
  const multi = /\s/.test(s.slice(start, phraseEnd).trim());       // "MERGE INTO", "DELETE FROM", "UPDATE t SET"
  if(afterPhrase===0) return multi ? phraseEnd : -1;              // "SELECT becomes ..." is prose; "MERGE INTO" on its own is a statement name
  const rest = s.slice(phraseEnd, end);
  if(/^[\s\w.,]*$/.test(rest) && !/\b[A-Z]{2,}\b/.test(rest) && !/\d/.test(rest)){     // only plain words after it: "SELECT statement, dependencies ..."                                  // "CREATE INDEX sorts all keys": keep only the keywords
    return multi ? phraseEnd : -1;
  }
  if(depth!==0){
    let d = 0, cut = -1;
    for(let k=0;k<text.length;k++){ if(text[k]==="(") { if(d===0) cut = k; d++; } else if(text[k]===")") d--; }
    if(cut>0) return start + text.slice(0, cut).trimEnd().length;
    return -1;
  }
  return end;
}
function findSQL(s){
  const out = []; SQL_START.lastIndex = 0; let m;
  while((m = SQL_START.exec(s))){
    const a = m.index;
    if(out.length && a < out[out.length-1][1]) continue;
    const b = sqlRun(s, a, m[0].length);
    if(b > a){ out.push([a, b]); SQL_START.lastIndex = b; }
  }
  return out;
}
const BREAK_BEFORE = /\s+(?=(?:FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|UNION(?: ALL)?|INTERSECT|EXCEPT|(?:(?:LEFT|RIGHT|FULL|INNER|CROSS)(?: OUTER)? )?JOIN|VALUES|WHEN (?:NOT )?MATCHED|RETURNING|QUALIFY|WINDOW|SET)\b)/g;
function formatSQL(q){
  // line breaks before the main clauses (only outside parentheses), a statement per line after ';'
  let out = "", depth = 0, buf = "", inStr = false;
  for(let k=0;k<q.length;k++){
    const ch = q[k];
    if(ch==="'" ) inStr = !inStr;
    if(!inStr){ if(ch==="(") depth++; else if(ch===")") depth--; }
    buf += ch;
    if(!inStr && depth===0 && ch===";" ){ out += fmtTop(buf.trim()) + "\n"; buf = ""; }
  }
  if(buf.trim()) out += fmtTop(buf.trim());
  return out.trim();
}
function fmtTop(stmt){
  // split at depth 0 only
  let res = "", depth = 0, inStr = false, i = 0;
  while(i < stmt.length){
    const ch = stmt[i];
    if(ch==="'") inStr = !inStr;
    if(!inStr){ if(ch==="(") depth++; else if(ch===")") depth--; }
    if(!inStr && depth===0 && /\s/.test(ch)){
      BREAK_BEFORE.lastIndex = i; const m = BREAK_BEFORE.exec(stmt);
      if(m && m.index===i){
        const kw = stmt.slice(i).trim().split(/\s+/)[0];
        // SET stays on the UPDATE line
        if(!(kw==="SET" && /^UPDATE\b/.test(stmt) && !/\bWHERE\b|\bFROM\b/.test(res.slice(res.lastIndexOf("\n")+1)) && res.indexOf("\n")<0)){ res += "\n"; i += m[0].length; continue; }
      }
    }
    res += ch; i++;
  }
  // long WHERE lines: break before AND / OR at depth 0
  return res.split("\n").map(line=>{
    if(line.length<=60 || !/^(WHERE|HAVING|ON|JOIN|LEFT|INNER)\b/.test(line)) return line;
    let r = "", d = 0, st = false;
    for(let k=0;k<line.length;k++){
      const ch = line[k]; if(ch==="'") st=!st; if(!st){ if(ch==="(") d++; else if(ch===")") d--; }
      if(!st && d===0 && line.startsWith(" AND ",k)){ r += "\n  AND "; k += 4; continue; }
      if(!st && d===0 && line.startsWith(" OR ",k)){ r += "\n  OR "; k += 3; continue; }
      r += ch;
    }
    return r;
  }).join("\n");
}
function sqlHTML(q, allowBlock){
  q = q.trim();
  if(allowBlock && q.length > 70) return BLK + codeBlock(formatSQL(q), "sql", "") + BLK;
  return `<code class="sql">${hlSQL(q)}</code>`;
}

/* ------------------------------------------------------------------ formulas written in prose */
const GREEK = "αβγδεζηθικλμνξοπρστυφχψωϵϑϕΓΔΘΛΞΠΣΦΨΩ";
const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵀᵏˣʲᵐᵗ", SUBS = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ᵢⱼₖₙₘₜₓₐₑₒᵤᵥₚᵣₛ";
const FUNCS = W("log ln exp sin cos tan tanh sigmoid max min argmax argmin sqrt lim mod det tr Pr Var Cov sup inf gcd lcm poly polylog sign sgn softmax ReLU erf");
const RELS = "=≈≤≥≠<>∝∈∉≡≅≪≫⊆⊂";
const STRONG = /[∑Σ√∫∏∞∂∇∀∃]/;     // symbols that make a run mathematical on their own
const OPS = "+−-×·/÷^±∘⊕∪∩∧∨¬|‖";
const ALLOWED = new RegExp("^[A-Za-z0-9" + GREEK + SUPS + SUBS + "\\u0302\\u0304\\u0303\\u0307\\u0308=≈≤≥≠<>∝∈∉≡≅≪≫⊆⊂+−\\-×·/÷^±∘⊕∪∩∧∨¬|‖∑√∫∏∞∂∇∀∃()\\[\\]{}⌈⌉⌊⌋⟨⟩,.!′'%ŷᾱℝℕℤħ]+$");
const unitAfterNum = W("B b s m h d g W V A J K M G T x k ms");
function tokClass(core, prevCore){
  // "m": maths token, "": not maths
  if(!core) return "";
  if(!ALLOWED.test(core) || /<\/|\/>|^<?\/?[a-z]+>$/.test(core)) return "";
  if(/^\d+(?:\.\d+)?e[+-]?\d+$/.test(core)) return "m";                                         // 50e6 is a number
  if(/^(req|reqs|ops|op|km|mi|rps|tx|txn|msg|msgs|ev|evt|kb|mb|gb|b|w)\/(s|h|ms|min|sec|day|d|yr)$/i.test(core)) return "";   // req/s, km/h: units
  if(/[A-Za-z]\.[A-Za-z]/.test(core) || /^\.|\.$/.test(core)) return "";           // e.g., c.city, i.e.
  const cz = core.replace(/\^[0-9]/g,"");
  if(/[A-Za-z][0-9]{2,}|[A-Z][0-9]|[A-Za-z]{2,}[0-9]/.test(cz) || /[a-z][0-9][A-Za-z]/.test(cz)) return "";   // L1, p99, H100, fp32 (w1, x2 stay)
  if(/[μµ][A-Za-z]/.test(core)) return "";                                          // μs (a unit)
  const runs = core.match(/[A-Za-z]+/g) || [];
  const hasOp = new RegExp("[" + RELS + OPS.replace("-","\\-") + "]").test(core);
  for(const r of runs){
    if(r.length===1) continue;
    if(FUNCS.has(r)) continue;
    if(r.length<=3 && r===r.toLowerCase() && /[\/^·×]/.test(core)) continue;         // kn/m, e^(−kn/m)
    if(/^[OΘΩ]$/.test(r)) continue;
    return "";
  }
  const pc = (prevCore||"").replace(/^[(\[]+/,"").replace(/^(\d+(?:\.\d+)?)e[+-]?\d+$/,"$1");
  if(core==="x" && /^[\d.,]+[KMBG]?$/.test(pc)) return "m";                                      // "3 x 256": a times sign
  if(core.length===1 && /[A-Za-z]/.test(core) && /^[\d.,]+[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*$/.test(pc) && unitAfterNum.has(core)) return "";   // "64 B", "10 s", "10⁻¹⁰ s"
  return "m";
}
const isRel = t => t.length===1 ? RELS.includes(t) : /^(<=|>=|!=)$/.test(t);
function hasVar(text){
  text = text.replace(/\b\d+(?:\.\d+)?e[+-]?\d+\b/g, "1").replace(/(^|[\s(])\d[\d.,]*[KMBGTkx](?=$|[\s)])/g, "$1 1").replace(/(\d) x (?=\d)/g, "$1 * ");   // 50M, 3x and "4 x 8" are quantities
  const letters = text.replace(new RegExp("\\b(" + [...FUNCS].join("|") + ")\\b","g"), "F").match(new RegExp("[A-Za-z" + GREEK + "]", "g")) || [];
  return letters.length > 0;
}
function findFormulas(s){
  // returns [start, end] ranges of formula-like runs (conservative)
  const out = [], toks = []; let m; const re = /\S+/g;
  while((m = re.exec(s))){
    let t = m[0], a = m.index, b = a + t.length;
    let core = t, lead = 0, trail = 0;
    while(core && /^[“"‘`]/.test(core)){ core = core.slice(1); lead++; }
    let endPunct = false;
    while(core && /[,;:.!?”"’`]$/.test(core) && !/\d\.$/.test(core.slice(-2)) ){ core = core.slice(0,-1); trail++; endPunct = true; }
    if(core.endsWith(".") && /\d\.$/.test(core) ){ core = core.slice(0,-1); trail++; endPunct = true; }
    const quoted = lead>0 || /[”"’`]/.test(t.slice(t.length-trail));
    toks.push({t, a:a+lead, b:b-trail, core, endPunct, quoted});
  }
  let i = 0;
  while(i < toks.length){
    const prev = toks[i-1];
    if(toks[i].quoted || !tokClass(toks[i].core, prev && prev.core)){ i++; continue; }
    let j = i, depth = bal(toks[i].core);
    while(j+1 < toks.length && (!toks[j].endPunct || (depth>0 && s[toks[j].b]==="," && s.slice(toks[j].b, toks[j].b+2).trim()===",")) && !toks[j+1].quoted && tokClass(toks[j+1].core, toks[j].core)){ j++; depth += bal(toks[j].core); }
    const run = toks.slice(i, j+1);
    const ok = qualify(run, toks[i-1], toks[j+1], s);
    if(ok) out.push([ok[0], ok[1]]);
    i = j + 1;
  }
  return out;
}
const bal = t => { let d = 0; for(const ch of t){ if("([{⌈⌊⟨".includes(ch)) d++; else if(")]}⌉⌋⟩".includes(ch)) d--; } return d; };
const CODEY = /[_@*`=]|\(\)|\.\w|==|->|=>|:=|^(True|False|None|null|true|false)$/;
function qualify(run, before, after, s){
  // trim leading/trailing operators and unmatched brackets
  let a = 0, b = run.length - 1;
  while(a < b && /^(a|A|x)$/.test(run[a].core) && /^[\d(]/.test(run[a+1].core)) a++;     // "a 64×64 = ...", "docs x 1.3 = 13"
  if(a > 0 && run[a-1].core === "x") return null;
  const isOpTok = c => new RegExp("^[" + OPS.replace("-","\\-") + RELS + "]+$").test(c);
  if(isOpTok(run[a].core) || isOpTok(run[b].core)) return null;          // the formula continues into words: leave it alone
  const text = s.slice(run[a].a, run[b].b);
  if(((text.match(/\|/g)||[]).length % 2) || ((text.match(/‖/g)||[]).length % 2)) return null;   // |A ∖ B| written across words
  // code nearby ("y = x @ w", "z = x * y", "n_jobs = 4") means this is code, not maths
  if(before && !before.endPunct && CODEY.test(before.core) && !/^[(\[]/.test(before.core)) return null;
  if(after && !run[b].endPunct && CODEY.test(after.core)) return null;
  // the formula goes on in symbols we do not handle ("∃u (HasUser(r, u) ∧ ...)", "x → y"): leave the whole thing alone
  const MATHY = /[→←⇒⇔↦∀∃∧∨¬⊢⊨∖⋈⊗\\]|[A-Z][a-z]+\(/;
  if(before && !before.endPunct && MATHY.test(before.t)) return null;
  if(after && !run[b].endPunct && MATHY.test(after.t)) return null;
  if(before && !before.endPunct && /^[A-Z]{2,}$/.test(before.core) && !FUNCS.has(before.core)) return null;      // "SET y=7", "XOR (n >> 31)"
  if(after && !run[b].endPunct && /^[A-Z]{2,}$/.test(after.core) && !FUNCS.has(after.core)) return null;         // "i₂ = i₁ XOR hash(fp)"
  if(/<<|>>/.test(s.slice(run[a].a, run[b].b))) return null;
  const relCount = run.filter(x=>[...x.core].some(ch=>RELS.includes(ch))).length;
  const bigO = /^[OΘΩ]\(/.test(text);
  const strong = STRONG.test(text);
  if(!relCount && !bigO && !strong) return null;
  if(!hasVar(text) && !strong) return null;
  // a relation needs something on both sides
  if(relCount){
    const relIdx = run.findIndex(x=>[...x.core].some(ch=>RELS.includes(ch)));
    const tokR = run[relIdx].core;
    const standalone = isOpTok(tokR);
    if(standalone && (relIdx===0 || relIdx===run.length-1)) return null;
  }
  // brackets must balance
  let d = 0; for(const ch of text){ if("([{⌈⌊⟨".includes(ch)) d++; else if(")]}⌉⌋⟩".includes(ch)) d--; if(d<0) break; }
  while(a < b && /^[\d.,]+$/.test(run[a].core) && /^\(/.test(run[a+1].core)) a++;
  let start = run[a].a, end = run[b].b;
  if(d!==0){
    // drop one unmatched outer bracket: "(n = 10)" written as part of a parenthesis
    const first = run[a].core, last = run[b].core;
    if(d>0 && first[0]==="(") start += 1;
    else if(d<0 && last.endsWith(")")) end -= 1;
    else return null;
    let dd = 0; for(const ch of (d>0?text.slice(1):text.slice(0,-1))){ if("([{⌈⌊⟨".includes(ch)) dd++; else if(")]}⌉⌋⟩".includes(ch)) dd--; if(dd<0) return null; }
    if(dd!==0) return null;
  }
  // "A/B testing", "I/O": a lone slash between two capitals is not maths
  if(/^[A-Z]\/[A-Z]$/.test(text)) return null;
  // a single letter alone on one side of "=" with prose-like article "a" is unusual: "a = b" stays, but "is a" was filtered earlier
  return [start, end];
}
// render a formula run: italic single-letter variables, upright numbers and function names, spaced operators, ^(…) as superscript
function fxHTML(src){
  let out = "", i = 0;
  const n = src.length;
  const opSp = new Set([..."=≈≤≥≠<>∝∈∉≡≅≪≫⊆⊂±×÷→"]);
  while(i < n){
    const ch = src[i];
    if(ch==="^"){
      // superscript: ^(…) or ^token
      if(src[i+1]==="("){ let d=0, k=i+1; for(; k<n; k++){ if(src[k]==="(") d++; else if(src[k]===")"){ d--; if(d===0) break; } } out += `<sup>${fxHTML(src.slice(i+2,k))}</sup>`; i = k+1; continue; }
      const mm = src.slice(i+1).match(/^[−-]?[A-Za-z0-9.]+/); if(mm){ out += `<sup>${fxHTML(mm[0])}</sup>`; i += 1 + mm[0].length; continue; }
    }
    if(ch==="x" && /\d[KMBG]? $/.test(src.slice(0,i)) && /^ \d/.test(src.slice(i+1))){ out = out.replace(/\s+$/,""); out += `<span class="op">×</span>`; i++; while(src[i]===" ") i++; continue; }
    const w = src.slice(i).match(/^[A-Za-z]+/);
    if(w){
      const t = w[0];
      if(FUNCS.has(t) || (t.length>1 && !/^[a-z]{2,3}$/.test(t))) out += `<span class="fn">${esc(t)}</span>`;
      else out += [...t].map(c=>`<i>${c}</i>`).join("");
      i += t.length; continue;
    }
    if(GREEK.includes(ch)){ out += ch === ch.toLowerCase() ? `<i>${ch}</i>` : ch; i++; continue; }   // capital Greek (Σ, Δ) stays upright
    if(opSp.has(ch)){
      // spaced relation; collapse the spaces around it
      out = out.replace(/\s+$/,""); out += `<span class="op">${esc(ch)}</span>`; i++; while(src[i]===" ") i++; continue;
    }
    if(ch==="-" && /[\s(]/.test(src[i-1]||" ") && /\d|[A-Za-z(]/.test(src[i+1]||"")) { out += "−"; i++; continue; }
    out += esc(ch); i++;
  }
  return out;
}

/* ------------------------------------------------------------------ inline text */
const UNIT_NBSP = /(\d) (ms|µs|μs|us|ns|s|min|h|KB|MB|GB|TB|PB|EB|KiB|MiB|GiB|TiB|Kb|Mb|Gb|kB|B|bits?|bytes?|GHz|MHz|kHz|Hz|W|kW|MW|V|nm|mm|cm|km|°C|x|×|%|rps|QPS|IOPS)(?![\w])/g;
function inline(text, opt){
  opt = opt || {};
  const blocks = opt.blocks !== false, heur = opt.heuristics !== false;
  const store = [];
  const put = html => { store.push(html); return PH0 + (store.length-1) + PH1; };
  let s = String(text==null?"":text);
  // 1. inline maths and inline code
  s = s.replace(/\\\((.+?)\\\)|`([^`\n]+)`/g, (all, math, code) => {
    if(math !== undefined) return put(tex(math.trim(), false));
    const c = code;
    if(/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|MERGE|select|with|insert|update|delete|create|merge)\b/.test(c) && /\b(FROM|SET|INTO|TABLE|VALUES|WHERE|from|set|into|table|values|where)\b/.test(c))
      return put(sqlHTML(c, blocks));
    return put(`<code>${esc(c)}</code>`);
  });
  // 2. SQL written in prose
  if(heur){
    const ranges = findSQL(s);
    for(let k = ranges.length-1; k>=0; k--){ const [a,b] = ranges[k]; const q = s.slice(a,b); if(q.includes(PH0)) continue; s = s.slice(0,a) + put(sqlHTML(q, blocks)) + s.slice(b); }
    // 3. formulas in prose
    const fr = findFormulas(s);
    for(let k = fr.length-1; k>=0; k--){ const [a,b] = fr[k]; const f = s.slice(a,b); if(f.includes(PH0)) continue; s = s.slice(0,a) + put(`<span class="fx">${fxHTML(f)}</span>`) + s.slice(b); }
  }
  // 4. escape the rest, then **bold** and keep numbers with their units
  s = esc(s).replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>").replace(UNIT_NBSP, "$1 $2");
  // 5. put the protected pieces back
  return s.replace(new RegExp(PH0 + "(\\d+)" + PH1, "g"), (a, k) => store[+k]);
}
// strip the marks for places that show plain text (titles, search snippets, aria labels)
function plain(text){
  return String(text==null?"":text).replace(/```\w*\n?/g,"").replace(/\\\(|\\\)|\\\[|\\\]/g,"").replace(/`([^`]*)`/g,"$1").replace(/\*\*(.+?)\*\*/g,"$1");
}

/* ------------------------------------------------------------------ paragraphs */
const CALLOUT = /^(Key idea|Rule of thumb|Warning|Note|Tip):\s+/;
// one content paragraph -> HTML (may be several block elements: a long SQL run becomes its own block)
function para(text, opt){
  opt = opt || {};
  const tag = opt.tag || "p", cls = opt.cls ? ` class="${opt.cls}"` : "";
  const t = String(text==null?"":text);
  const fm = t.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
  if(fm) return codeBlock(fm[2], (fm[1]||"text").toLowerCase(), "");
  const dm = t.match(/^\\\[([\s\S]+)\\\]$/);
  if(dm) return tex(dm[1].trim(), true);
  const cm = t.match(CALLOUT);
  if(cm && !opt.noCallout){
    const kind = cm[1]==="Warning" ? "warn" : cm[1]==="Rule of thumb" ? "rule" : "key";
    const body = t.slice(cm[0].length);
    return `<div class="callout co-${kind}" role="note"><span class="co-l">${esc(cm[1])}</span>${para(body.charAt(0).toUpperCase() + body.slice(1), {noCallout:true})}</div>`;
  }
  const html = inline(t, opt);
  if(!html.includes(BLK)) return `<${tag}${cls}>${opt.pre||""}${html}</${tag}>`;
  // split around block pieces
  const parts = html.split(BLK); let out = "", first = true;
  parts.forEach((p, k) => {
    if(k % 2 === 1){ out += p; return; }
    const tx = p.trim().replace(/^[,;:]\s*/,"");
    if(tx && tx!=="." ){ out += `<${tag}${first?cls:""}>${first?(opt.pre||""):""}${tx}</${tag}>`; first = false; }
  });
  return out;
}
function paras(list, opt){ return (list||[]).map((p,i)=>para(p, i===0 ? opt : Object.assign({}, opt, {cls:""}))).join(""); }

/* ------------------------------------------------------------------ copy buttons */
function copyText(text){
  if(typeof navigator!=="undefined" && navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((res, rej)=>{ try{ const ta=document.createElement("textarea"); ta.value=text; ta.setAttribute("readonly",""); ta.style.cssText="position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); const ok=document.execCommand("copy"); ta.remove(); ok?res():rej(new Error("copy failed")); }catch(e){ rej(e); } });
}
if(typeof document!=="undefined"){
  document.addEventListener("click", e=>{
    const b = e.target.closest && e.target.closest("[data-copy]"); if(!b) return;
    const el = document.getElementById(b.dataset.copy); if(!el) return;
    copyText(el.textContent).then(()=>{ b.textContent = "Copied"; b.classList.add("done"); setTimeout(()=>{ b.textContent = "Copy"; b.classList.remove("done"); }, 1600); }, ()=>{ b.textContent = "Select and copy"; });
  });
}

const API = { esc, tex, inline, para, paras, plain, highlight, codeBlock, findSQL, formatSQL, findFormulas, fxHTML, mathSupported, version: 9 };
if(typeof module!=="undefined" && module.exports) module.exports = API;
root.DTSRich = API;
})(typeof window!=="undefined" ? window : globalThis);
