// Run every practice solution against its tests: node tools/check_practice.js [file]
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'content', 'practice', 'problems.json');
const P = JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = (v, unordered) => { if (unordered && Array.isArray(v)) v = v.map(x => JSON.stringify(Array.isArray(x) ? [...x].sort() : x)).sort(); return JSON.stringify(v); };
let bad = 0, ids = new Set();
for (const p of P) {
  if (ids.has(p.id)) { console.log('duplicate id', p.id); bad++; } ids.add(p.id);
  for (const k of ['id','title','pattern','difficulty','statement','hint','approach','complexity','fn','params','tests','starter','solution']) if (!(k in p)) { console.log(p.id, 'missing', k); bad++; }
  let fn; try { fn = new Function(p.solution + '\nreturn ' + p.fn + ';')(); } catch (e) { console.log(p.id, 'solution does not compile:', e.message); bad++; continue; }
  p.tests.forEach((t, i) => { let got; try { got = fn(...JSON.parse(JSON.stringify(t.args))); } catch (e) { got = 'THROW ' + e.message; }
    if (norm(got, p.order_insensitive) !== norm(t.expected, p.order_insensitive)) { console.log(`${p.id} test ${i} expected ${JSON.stringify(t.expected)} got ${JSON.stringify(got)}`); bad++; } });
}
console.log(`${P.length} problems, ${bad} problems found`); process.exit(bad ? 1 : 0);
