// Browser test: drives the real app in Chromium against a running server (or the standalone file).
// usage: node tests/e2e.js http://localhost:8787/   |   node tests/e2e.js file:///.../dist/down-the-stack.html
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8787/';
const shots = process.argv[3] || null;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_NAME|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  const ok = (c, m) => { if (!c) { errors.push('FAIL: ' + m); console.log('  ✗', m); } else console.log('  ✓', m); };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.col .item');
  ok(await page.locator('.col').count() === 4, 'explore opens with 4 columns');
  if (shots) await page.screenshot({ path: shots + '/1-explore.png' });
  await page.click('.item[data-col="3"]');
  ok(await page.locator('.col').count() >= 5, 'drilling down adds a column');
  ok(await page.locator('#panel svg.ego').count() === 1, 'panel shows neighbourhood graph');
  await page.waitForSelector('#panel .minirefs a');
  ok(true, 'panel loads sources');
  await page.click('#panel [data-read]');
  await page.waitForSelector('#reader:not([hidden]) h1');
  const h1 = await page.textContent('#reader h1');
  ok(h1.length > 2, 'reader opens: ' + h1);
  ok(await page.locator('#reader .rd-sec').count() >= 6, 'reader has sections');
  if (shots) await page.screenshot({ path: shots + '/2-reader.png' });
  await page.click('#reader [data-bookmark]'); await page.waitForTimeout(150);
  ok((await page.textContent('#reader [data-bookmark]')).includes('Saved'), 'bookmark toggles on');
  await page.click('#reader [data-markread]');
  await page.waitForFunction(() => (document.querySelector('#reader [data-markread]')||{}).textContent?.includes('Read'), null, {timeout: 3000}).catch(()=>{});
  ok((await page.textContent('#reader [data-markread]')).includes('Read'), 'mark as read');
  await page.fill('#nt', 'Test note: the page cache is why Kafka barely needs its own cache.');
  await page.click('#reader [data-addnote]'); await page.waitForSelector('#notes .note');
  ok(await page.locator('#notes .note').count() === 1, 'note saved and listed');
  await page.click('#reader .ncard'); await page.waitForTimeout(200);
  ok((await page.textContent('#reader [data-rback]')).includes('Back'), 'navigate one layer down inside reader');
  await page.click('#reader [data-rclose]');
  ok(await page.locator('#reader').isHidden(), 'reader closes');
  // search
  await page.fill('#q', 'write skew'); await page.waitForSelector('#sres button');
  const first = await page.textContent('#sres button');
  ok(/isolation|snapshot/i.test(first), 'full-text search finds a body match: ' + first.slice(0, 60));
  await page.keyboard.press('Escape');
  // tours
  await page.click('[data-view="tours"]'); await page.click('[data-tour="3"]'); await page.click('[data-rtour]');
  await page.waitForSelector('#reader .rd-ctx'); ok(true, 'tour reader shows step context');
  await page.click('#reader .seqnav .nx'); await page.waitForTimeout(150);
  ok((await page.textContent('#reader .rd-ctx')).includes('step 2'), 'tour next step');
  await page.click('#reader [data-rclose]');
  // essay
  await page.click('[data-view="atlas"]'); await page.click('[data-essay="3"]');
  await page.waitForSelector('#reader h1'); ok((await page.textContent('#reader h1')) === 'CS foundations', 'layer essay opens');
  await page.click('#reader [data-rclose]');
  // courses
  await page.click('[data-view="courses"]'); await page.waitForSelector('#v-courses .tcard');
  await page.click('#v-courses [data-course="CS244B"]'); await page.waitForTimeout(100);
  ok((await page.textContent('#v-courses .tsteps h2')).includes('Distributed Systems'), 'course view shows CS 244B');
  ok(await page.locator('#v-courses .sch-row').count() >= 3 && await page.locator('#v-courses .sch-row:has-text("MIT") [data-program="mit-63"]').count() === 1, 'program buttons are grouped by school (Stanford, MIT, Caltech)');
  await page.click('[data-program="mit-63"]'); await page.waitForTimeout(100);
  ok(/MIT 6\.1210/.test(await page.textContent('#v-courses .tlist')), 'MIT 6-3 lists MIT subjects');
  await page.click('[data-program="ms"]'); await page.waitForTimeout(100);
  ok(await page.locator('#v-courses .tcard').count() > 10, 'MS program lists course groups');
  await page.click('#v-courses [data-rcourse]'); await page.waitForSelector('#reader:not([hidden]) .seqnav');
  ok((await page.textContent('#reader .seqnav')).includes('CS 103') || (await page.textContent('#reader .seqnav')).length > 0, 'study a course in the reader');
  if (shots) await page.screenshot({ path: shots + '/6-course-reader.png' });
  await page.click('#reader [data-rclose]');
  if (shots) { await page.click('[data-view="courses"]'); await page.screenshot({ path: shots + '/7-courses.png' }); }
  // library
  await page.click('[data-view="library"]'); await page.waitForSelector('.lib li');
  ok(await page.locator('.lib li').count() > 50, 'library lists works');
  await page.click('[data-libkind="book"]'); await page.waitForTimeout(100);
  ok((await page.locator('.lib li .rk').first().textContent()) === 'Book', 'library filters by kind');
  if (shots) await page.screenshot({ path: shots + '/3-library.png' });
  // you
  await page.click('[data-view="you"]'); await page.waitForSelector('.cards');
  ok((await page.textContent('.cards .big')).startsWith('1'), 'you view counts the read concept');
  if (shots) await page.screenshot({ path: shots + '/4-you.png' });
  // persistence across reload
  await page.reload(); await page.waitForSelector('.tabs');
  await page.click('[data-view="you"]'); await page.waitForSelector('.cards');
  ok((await page.textContent('.cards .big')).startsWith('1'), 'progress persists after reload');
  // deep link
  await page.goto(url.replace(/#.*$/, '') + '#read/raft'); await page.waitForSelector('#reader h1');
  ok((await page.textContent('#reader h1')) === 'Raft', 'deep link #read/raft');
  // learning aids + spaced review
  await page.goto(url.replace(/#.*$/, '') + '#read/bloom'); await page.waitForSelector('#reader .quiz');
  ok((await page.$$('#reader .terms dt')).length >= 6, 'key terms render');
  ok(!!(await page.$('#reader .diagram pre')), 'diagram renders');
  ok((await page.$$('#reader #rs-quiz .quiz details')).length === 5, 'five self-check questions');
  await page.click('#reader #rs-quiz .quiz summary'); ok(await page.isVisible('#reader #rs-quiz .quiz details[open] p'), 'answer opens');
  await page.click('[data-markread="bloom"]'); await page.waitForTimeout(300);
  await page.click('[data-rclose]').catch(()=>{}); await page.click('[data-view="you"]'); await page.waitForSelector('#review');
  ok(/due today/.test(await page.textContent('#review')), 'marking a deep read as read fills the review deck');
  await page.click('[data-revstart]'); await page.waitForSelector('[data-revshow]');
  const leftOf = async () => +((await page.textContent('#review')).match(/(\d+) left/)||[])[1];
  const revBefore = await leftOf();
  await page.click('[data-revshow]'); await page.waitForSelector('.rev-ans');
  await page.click('[data-revgrade="1"]');
  await page.waitForFunction(b => { const m = document.querySelector('#review').textContent.match(/(\d+) left/); return m && +m[1] === b - 1; }, revBefore, {timeout: 3000}).catch(()=>{});
  ok((await leftOf()) === revBefore - 1, 'grading moves to the next question (' + revBefore + ' -> ' + (await leftOf()) + ')');
  if (shots) await page.screenshot({ path: shots + '/6-review.png' });
  const base = url.replace(/#.*$/, '');
  // journeys come first in the tours list
  await page.goto(base + '#tours'); await page.waitForSelector('#v-tours .tcard');
  const hasJourneys = await page.evaluate(() => window.__dts.DATA.tours.some(t => /^what happens when/i.test(t.title)));
  if (hasJourneys) ok((await page.textContent('#v-tours .tlist > :first-child')).includes('Journeys') && /^What happens when/i.test(await page.textContent('#v-tours .tcard .tt')), 'tours: journeys group first');
  else ok(await page.locator('#v-tours .tgrp').count() === 0, 'tours: no journeys group without journeys');
  // system design: list, reader, animation, concepts
  await page.click('[data-view="design"]'); await page.waitForSelector('#v-design .dcard');
  ok(await page.locator('#v-design .dcard').count() >= 1, 'design tab lists questions');
  await page.click('#v-design [data-design="url-shortener"]'); await page.waitForSelector('#reader:not([hidden]) #rs-followups');
  ok((await page.textContent('#reader h1')) === 'Design a URL shortener', 'design opens in the reader');
  for (const sec of ['summary', 'requirements', 'estimates', 'api', 'datamodel', 'design', 'deepdive', 'tradeoffs', 'failures', 'evolution', 'followups', 'concepts', 'deeper'])
    if (!(await page.$('#reader #rs-' + sec))) ok(false, 'design section ' + sec);
  ok(true, 'design has all sections');
  ok(!!(await page.$('#reader #rs-design .diagram pre')) && !!(await page.$('#reader .cmap svg .nd')), 'design diagram and concept map render');
  const an = page.locator('#reader .anim').first();
  await an.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  await an.locator('[data-anim="restart"]').click();
  ok((await an.locator('.an-k').textContent()) === 'frame 1 of 6', 'animation restart shows frame 1');
  await an.locator('[data-anim="next"]').click();
  ok((await an.locator('.an-k').textContent()) === 'frame 2 of 6', 'animation steps to frame 2');
  const cap2 = await an.locator('.an-cap').textContent();
  await an.focus(); await page.keyboard.press('ArrowRight');
  ok((await an.locator('.an-k').textContent()) === 'frame 3 of 6' && (await an.locator('.an-cap').textContent()) !== cap2, 'arrow key steps the animation');
  await an.locator('[data-anim="prev"]').click();
  ok((await an.locator('.an-cap').textContent()) === cap2, 'animation steps back');
  await page.click('#reader #rs-concepts [data-read="conshash"]'); await page.waitForSelector('#reader h1:text("Consistent hashing")');
  ok(/Appears in design questions:.*URL shortener/.test(await page.textContent('#reader .rd-wrap')), 'concept read lists the design questions that use it');
  await page.click('#reader [data-rback]'); await page.waitForSelector('#reader #rs-followups');
  ok((await page.textContent('#reader h1')) === 'Design a URL shortener', 'back returns to the design');
  await page.click('#reader [data-dstudy]'); await page.waitForSelector('#reader .seqnav');
  ok((await page.textContent('#reader .seqnav')).includes('Design a URL shortener'), 'study these concepts opens a reading sequence');
  await page.click('#reader [data-rclose]');
  await page.fill('#q', 'shortener'); await page.waitForSelector('#sres [data-pick^="design/"]');
  ok(true, 'search finds the design question');
  await page.keyboard.press('Escape');
  // new read sections, with an in-page fixture (no content read has them yet)
  await page.evaluate(async () => { const r = await window.__dts.Store.read('raft');
    r.rd.tradeoffs = ['Choose Raft when you build it yourself; choose a managed store when you only need a lock.'];
    r.rd.interview = ['What happens when the leader is partitioned? || It cannot commit: no majority. A new leader is elected on the majority side.'];
    r.rd.animation = ['== Followers wait for heartbeats.', '  F1   F2   F3', '== F2 times out and asks for votes.', '  F1 <-vote? F2 vote?-> F3']; });
  await page.goto(base + '#read/raft'); await page.waitForSelector('#reader #rs-interview');
  const order = await page.evaluate(() => [...document.querySelectorAll('#reader .rd-sec')].map(x => x.id));
  ok(order.indexOf('rs-tradeoffs') > order.indexOf('rs-intuition') && order.indexOf('rs-tradeoffs') < order.indexOf('rs-friction') && order.indexOf('rs-interview') > order.indexOf('rs-friction'), 'trade-offs and interview sections render in place');
  ok((await page.textContent('#reader #rs-tradeoffs h2')).includes('It depends') && (await page.textContent('#reader #rs-interview h2')).includes('In the interview'), 'new section titles');
  ok(!!(await page.$('#reader #rs-how .anim')) && (await page.textContent('#reader #rs-how .an-k')) === 'frame 1 of 2', 'animation renders inside How it works');
  await page.click('#reader #rs-interview summary'); ok(await page.isVisible('#reader #rs-interview details[open] p'), 'interview answer opens');
  ok(await page.locator('#reader .toc a[data-jump="rs-interview"]').count() === 1, 'TOC links the interview section');
  await page.click('#reader [data-rclose]');
  // algorithms: a visualizer, step by step
  await page.click('[data-view="algorithms"]'); await page.waitForSelector('#av-stage');
  await page.click('[data-aviz="bubble"]'); await page.waitForSelector('#av-stage .av-bar');
  const total = +(await page.textContent('#av-k')).match(/of (\d+)/)[1];
  ok(total > 10 && (await page.textContent('#av-k')).startsWith('step 1 of'), 'bubble sort recorded ' + total + ' steps');
  await page.click('[data-aact="next"]');
  ok((await page.textContent('#av-k')).startsWith('step 2 of') && (await page.textContent('#av-code li.on')).includes('a[j] > a[j+1]'), 'next steps and highlights the pseudocode line');
  await page.click('[data-aact="next"]'); ok((await page.textContent('#av-k')).startsWith('step 3 of'), 'next again');
  ok(/1\s*comparisons/.test(await page.textContent('#av-count')), 'counters update');
  await page.click('[data-aact="back"]'); ok((await page.textContent('#av-k')).startsWith('step 2 of'), 'back steps backwards');
  await page.fill('[data-ain="a"]', '5, 1, 4'); await page.click('[data-aact="apply"]');
  ok(await page.locator('#av-stage .av-bar').count() === 3, 'custom input re-runs the visualizer');
  await page.click('[data-aviz="bfs"]'); await page.waitForSelector('#av-stage .gc');
  const before = await page.textContent('#av-k'); await page.click('#av-stage .gc[data-acell="2"]');
  ok(await page.locator('#av-stage .gc.wall[data-acell="2"]').count() === 1 && before !== null, 'clicking a grid cell toggles a wall');
  await page.goto(base + '#algo/dijkstra'); await page.waitForSelector('#av-stage svg .gn');
  for (let i = 0; i < 4; i++) await page.click('[data-aact="next"]');
  ok(/\d/.test(await page.textContent('#av-stage .av-table')), 'deep link #algo/dijkstra steps with a distance table');
  // B-tree: descent, splits, a root split, search, and keys typed by the reader
  const goFrame = async re => { const i = await page.evaluate(src => window.DTSAlgo._P.frames.findIndex(f => new RegExp(src).test(f.msg)), re.source);
    if (i > 0) { await page.evaluate(i => { window.DTSAlgo._P.k = i - 1; }, i); await page.click('[data-aact="next"]'); } return i; };
  await page.goto(base + '#algo/btree'); await page.waitForSelector('#av-stage svg.av-bt .bn');
  const btm = await page.evaluate(() => window.DTSAlgo._P.frames.map(f => f.msg));
  ok(btm.length > 30 && /empty B-tree/.test(await page.textContent('#av-msg')) && await page.locator('[data-aviz="btree"][aria-pressed="true"]').count() === 1, 'B-tree: #algo/btree records ' + btm.length + ' steps from an empty tree');
  ok(btm.some(m => /^Leaf is full: with \d+ it has 4 keys/.test(m)) && btm.some(m => /Split the leaf at median \d+: .*Push \d+ up into the parent/.test(m)), 'B-tree: a full leaf splits at its median and pushes it up');
  ok(btm.some(m => /^Split the root at median \d+.*grows one level taller \(height 3\)/.test(m)), 'B-tree: a root split grows the tree');
  ok(btm.some(m => /holds 17: found after 3 node visits/.test(m)) && btm.some(m => /no 13.*not found \(3 node visits\)/.test(m)), 'B-tree: search finds 17 and misses 13, counting node visits');
  await goFrame(/^Split the root/);
  ok(await page.locator('#av-stage .bn.split').count() === 2 && await page.locator('#av-stage .bk.up').count() === 1 && (await page.textContent('#av-code li.on')).includes('new root'), 'B-tree: the split step marks both halves, the median and the pseudocode line');
  await goFrame(/go down to child/);
  ok(await page.locator('#av-stage .btok').count() === 1 && await page.locator('#av-stage line.hot').count() === 1 && /\d+ node visits/.test(await page.textContent('#av-count')), 'B-tree: the descent shows the key travelling down the highlighted edge');
  await page.fill('[data-alin="key"]', '42'); await page.click('[data-alive="ins"]');
  ok((await page.inputValue('[data-ain="ops"]')).endsWith('insert 42') && /^insert 42: start at the root/.test(await page.evaluate(() => { const P = window.DTSAlgo._P; return P.frames.find(f => f.s.seek === P.frames[P.frames.length - 1].s.seek - 1).msg; })), 'B-tree: Insert adds the typed key to the operations');
  const jump = await page.evaluate(() => { const P = window.DTSAlgo._P, i = P.frames.findIndex(f => f.s.seek === 17); return [i, P.k]; });
  ok(jump[0] > 0 && jump[1] >= jump[0] && jump[1] <= jump[0] + 2, 'B-tree: the player jumps to the new insert (' + jump.join(' / ') + ')');
  ok((await page.getAttribute('[data-aact="play"]', 'aria-pressed')) === 'true', 'B-tree: the new insert plays on its own');
  await page.click('[data-aact="play"]');
  await page.fill('[data-alin="key"]', 'abc'); await page.click('[data-alive="ins"]');
  ok(/Type a key/.test(await page.textContent('.av-err')), 'B-tree: a bad key shows a plain error');
  // Raft: elections, votes, replication, commit, crash, repair; same seed, same run
  await page.goto(base + '#algo/raft'); await page.waitForSelector('#av-stage svg.rf-ring .rf-s');
  const rf = await page.evaluate(() => window.DTSAlgo._P.frames.map(f => ({ m: f.msg, t: f.s.t, lead: f.s.lead, n: f.s.M.length, term: f.s.lead >= 0 ? f.s.S[f.s.lead].term : 0 })));
  const sig = await page.evaluate(() => { const V = window.DTSAlgo._V.find(v => v.id === 'raft'), a = window.DTSAlgo._run(V, window.DTSAlgo._init(V)), b = window.DTSAlgo._run(V, window.DTSAlgo._init(V)); return [JSON.stringify(a.frames) === JSON.stringify(b.frames), a.frames.length]; });
  ok(sig[0] && sig[1] === rf.length, 'Raft: the seed makes every run identical (' + rf.length + ' steps)');
  ok(rf.some(f => /timer ran out\. It becomes a candidate for term 1/.test(f.m)) && rf.some(f => /votes? for S\d in term 1/.test(f.m)) && rf.some(f => /3 of 5 votes, a majority: it is the leader for term 1/.test(f.m)), 'Raft: timeout, candidate, votes, leader by majority');
  ok(rf.some(f => /stored on 3 of 5 servers, a majority: it is committed/.test(f.m)) && rf.some(f => /learn that entries up to \d are committed/.test(f.m)), 'Raft: an entry commits once a majority stores it');
  const rcrash = rf.findIndex(f => /crashes \(it was the leader\)/.test(f.m));
  ok(rcrash > 0 && rf.slice(rcrash).some(f => /it is the leader for term [2-9]/.test(f.m)), 'Raft: a new leader is elected after the leader crashes');
  ok(rf.some(f => /drops x=4: it conflicts/.test(f.m)) && rf.some(f => /does not match the leader's at index/.test(f.m)) && rf.some(f => /steps back to index \d for S\d/.test(f.m)), 'Raft: out-of-date and conflicting logs are repaired');
  const fly = rf.findIndex(f => f.n >= 4);
  await page.evaluate(i => { window.DTSAlgo._P.k = i - 1; }, fly); await page.click('[data-aact="next"]');
  ok(await page.locator('#av-stage .rf-m').count() >= 4 && await page.locator('#av-stage .rf-tm').count() >= 1, 'Raft: messages travel as dots and election timers show as rings');
  const li = rf.findIndex(f => f.lead >= 0 && f.t > 40);
  await page.evaluate(i => { window.DTSAlgo._P.k = i - 1; }, li); await page.click('[data-aact="next"]');
  const lead = rf[li].lead, t0 = rf[li].t;
  ok((await page.textContent(`[data-alive="s${lead}"]`)) === `Crash S${lead + 1}`, 'Raft: crash buttons follow the shown step');
  await page.click(`[data-alive="s${lead}"]`); await page.click('[data-aact="play"]');
  const rf2 = await page.evaluate(() => window.DTSAlgo._P.frames.map(f => ({ m: f.msg, t: f.s.t })));
  ok((await page.inputValue('[data-ain="ev"]')).endsWith(`${t0 + 1} crash S${lead + 1}`) && rf2.some(f => f.t === t0 + 1 && /crashes \(it was the leader\)/.test(f.m)) && rf2.slice(0, li + 1).every((f, i) => f.m === rf[i].m), 'Raft: "Crash" adds an event right after the current step and keeps the past');
  ok(rf2.some(f => f.t > t0 + 1 && /it is the leader for term/.test(f.m)), 'Raft: the crash leads to a new election');
  await page.fill('[data-alin="x"]', '42'); await page.click('[data-alive="write"]'); await page.click('[data-aact="play"]');
  ok(/write x=42$/.test(await page.inputValue('[data-ain="ev"]')) && await page.evaluate(() => window.DTSAlgo._P.frames.some(f => /Client writes x=42/.test(f.msg))), 'Raft: "Client writes x" adds a write');
  const li2 = await page.evaluate(() => { const P = window.DTSAlgo._P; for (let i = P.frames.length - 2; i > 0; i--) if (P.frames[i].s.lead >= 0 && P.frames[i].s.part === null) return i; return -1; });
  await page.evaluate(i => { window.DTSAlgo._P.k = i - 1; }, li2); await page.click('[data-aact="next"]');
  ok(!(await page.isDisabled('[data-alive="part"]')) && (await page.textContent('[data-alive="part"]')) === 'Partition leader', 'Raft: "Partition leader" is offered while there is a leader');
  await page.click('[data-alive="part"]'); await page.click('[data-aact="play"]');
  ok(/partition leader$/.test(await page.inputValue('[data-ain="ev"]')) && await page.evaluate(() => window.DTSAlgo._P.frames.some(f => /cut off from the other four/.test(f.msg))), 'Raft: "Partition leader" cuts the leader off');
  await page.click('[data-apreset="1"]');
  const pr = await page.evaluate(() => window.DTSAlgo._P.frames.map(f => f.msg).join(' | '));
  ok(/cut off/.test(pr) && /Lost|lost|✕/.test(pr) && /heals/.test(pr) && /steps down to follower|back to follower/.test(pr), 'Raft: the partition preset loses messages, elects a new leader and heals');
  // interview-pattern visualizers: each one is checked on its default input and on its other modes (picked in the Problem menu)
  const msgs = () => page.evaluate(() => window.DTSAlgo._P.frames.map(f => f.msg));
  const lastMsg = async () => (await msgs()).slice(-1)[0];
  const atEnd = async () => { await page.evaluate(() => { const P = window.DTSAlgo._P; P.k = P.frames.length - 2; }); await page.click('[data-aact="next"]'); };
  const pick = async (k, v) => { await page.selectOption(`select[data-ain="${k}"]`, v); await page.waitForFunction(([k, v]) => window.DTSAlgo._P.vals[k] === v, [k, v]); };
  const viz = async id => { await page.goto(base + '#algo/' + id); await page.waitForSelector('#av-stage > *'); };
  const mid = async () => { await page.evaluate(() => { const P = window.DTSAlgo._P; P.k = Math.floor(P.frames.length / 2) - 1; }); await page.click('[data-aact="next"]'); };
  await viz('monostack');
  ok(/next greater element of a\[\d\]/.test((await msgs()).join('|')) && /Index(es)? .* never met a bigger value/.test(await lastMsg()), 'monotonic stack: values are answered by the next greater one, the rest stay -1');
  await mid(); ok(await page.locator('#av-stage .ms-arc').count() >= 1 && await page.locator('#av-stage .av-stack .sti').count() >= 1, 'monotonic stack: arcs link answers, the stack is drawn beside the bars');
  await pick('mode', 'hist');
  ok((await page.inputValue('[data-ain="a"]')) === '2, 1, 5, 6, 2, 3' && /largest rectangle has area 10/.test(await lastMsg()) && (await page.textContent('#av-code')).includes('h[top] >= h[i]'), 'monotonic stack: the histogram mode fills its own input and finds area 10');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('select[data-ain="mode"]')), 'a mode switch keeps the keyboard focus on the menu');
  await viz('window2');
  ok(/longest is "ecee" \(length 4\)/.test(await lastMsg()) && /Too many different letters/.test((await msgs()).join('|')), 'sliding window: at most K distinct shrinks when invalid and records "ecee"');
  await pick('mode', 'minwin'); ok(/shortest window is "BANC"/.test(await lastMsg()), 'sliding window: the shortest window that covers T is "BANC"');
  await pick('mode', 'anagram'); ok(/anagrams of "abc" start at 0, 6/.test(await lastMsg()), 'sliding window: the fixed window finds anagrams at 0 and 6');
  await mid(); ok(await page.locator('#av-stage .av-table').count() === 1, 'sliding window: the count table is drawn');
  await viz('backtrack');
  ok(/^Done: 12 answers/.test(await lastMsg()) && /Skip 2 here/.test((await msgs()).join('|')), 'backtracking: 12 distinct subsets of 1, 2, 2, 3, duplicates pruned');
  await mid(); ok(await page.locator('#av-stage .av-rt .rt.cur').count() === 1 && await page.locator('#av-stage .av-rt .rt.path').count() >= 1, 'backtracking: the tree marks the current call and its path');
  await pick('mode', 'queens'); ok(/^Done: 2 answers/.test(await lastMsg()) && /attacks it/.test((await msgs()).join('|')), 'backtracking: 4-queens has 2 answers and prunes attacked squares');
  await mid(); ok(await page.locator('#av-stage .av-board .sq').count() === 16 && await page.locator('#av-stage .rt.prn').count() >= 1, 'backtracking: the board and the pruned branches are drawn');
  await pick('mode', 'perms'); ok(/^Done: 6 answers/.test(await lastMsg()), 'backtracking: 3 items have 6 permutations');
  await viz('treedfs');
  ok(/the diameter is 5, on the path that bends at 1/.test(await lastMsg()), 'tree DFS: the diameter is 5');
  await mid(); ok(await page.locator('#av-stage .av-stack .sti').count() >= 1 && /\d+\s*calls/.test(await page.textContent('#av-count')), 'tree DFS: the call stack is drawn and calls are counted');
  await pick('mode', 'maxpath'); ok(/maximum path sum is 45/.test(await lastMsg()) && /negative/.test((await msgs()).join('|')), 'tree DFS: max path sum 45 drops negative branches');
  await pick('mode', 'in'); ok(/inorder is 7, 4, 2, 5, 8, 1, 3, 6/.test(await lastMsg()), 'tree DFS: inorder visit order');
  await viz('dp1d');
  ok(/f\(7\) = 21/.test(await lastMsg()), 'DP 1-D: 21 ways to climb 7 steps (table)');
  await pick('method', 'memo'); ok(/13 calls and 4 cache hits/.test(await lastMsg()) && /cache hit/.test((await msgs()).join('|')), 'DP 1-D: memoized recursion flags cache hits');
  await mid(); ok(await page.locator('#av-stage .av-stack .sti').count() >= 1 && await page.locator('#av-stage .ms-arc.hot').count() >= 0, 'DP 1-D: memo mode draws the call stack');
  await pick('mode', 'coins'); await pick('method', 'plain');
  ok(/^Stopped after 70 calls\. Plain recursion makes 168 calls/.test(await lastMsg()), 'DP 1-D: plain recursion is stopped and its call count reported');
  await pick('method', 'table'); ok(/f\(10\) = 3/.test(await lastMsg()), 'DP 1-D: coin change 10 with 1, 3, 4 needs 3 coins');
  await viz('prefix');
  ok((await msgs()).some(m => /^sum\(a\[0\.\.3\]\) = P\[4\] − P\[0\] = 7 − 0 = 7/.test(m)), 'prefix sums: a range sum is one subtraction');
  await pick('mode', 'subk');
  const sk = await page.evaluate(() => { const a = [1, 2, 1, -1, 3, -2, 2, 1]; let n = 0; for (let i = 0; i < a.length; i++) { let s = 0; for (let j = i; j < a.length; j++) { s += a[j]; if (s === 3) n++; } } return n; });
  ok(new RegExp('^Done: ' + sk + ' subarrays sum to 3').test(await lastMsg()), 'prefix sums: the hash map counts ' + sk + ' subarrays with sum K (same as brute force)');
  await pick('mode', 'diff'); await atEnd();
  ok((await page.locator('#av-stage text').allTextContents()).join(' ').includes('new a') && /3 range updates with 6 writes/.test(await lastMsg()), 'prefix sums: the difference array takes two writes per update');
  await viz('segtree');
  const sg = await msgs();
  ok(sg.some(m => /sum of a\[2\.\.6\] is .* = 26/.test(m)) && sg.some(m => /sum of a\[2\.\.6\] is .* = 30/.test(m)) && sg.some(m => /sum of a\[3\.\.5\] is .*19/.test(m)), 'segment tree: queries give 26, 30 after set, 19 after the lazy add');
  const lzAt = sg.findIndex(m => /lazy note/.test(m));
  await page.evaluate(i => { window.DTSAlgo._P.k = i - 1; }, lzAt); await page.click('[data-aact="next"]');
  ok(await page.locator('#av-stage .av-sg .lz').count() >= 1, 'segment tree: a fully covered node keeps a lazy note');
  await viz('fastslow');
  ok(/meet at index 3 .*the cycle starts here/.test(await lastMsg()), 'fast and slow pointers: the cycle starts at index 3');
  await pick('mode', 'middle'); ok(/slow \(index 4, value 9\) is the middle/.test(await lastMsg()), 'fast and slow pointers: the middle of 9 nodes');
  await viz('bsanswer');
  ok(/lo = hi = 15: the smallest capacity that works/.test(await lastMsg()), 'binary search on the answer: capacity 15');
  await mid(); ok(await page.locator('#av-stage .av-ba').count() === 1, 'binary search on the answer: the number line is drawn');
  await pick('mode', 'koko'); ok(/lo = hi = 4: the smallest speed/.test(await lastMsg()), 'binary search on the answer: Koko eats at speed 4');
  await viz('mst');
  ok(/total weight 13/.test(await lastMsg()) && /close a cycle: skip/.test((await msgs()).join('|')), 'MST: Kruskal keeps weight 13 and rejects a cycle edge');
  await pick('mode', 'prim'); ok(/total weight 13/.test(await lastMsg()), 'MST: Prim finds the same weight');
  await viz('dp2d');
  ok(/The answer is f\(3, 3\) = 9/.test(await lastMsg()), 'DP 2-D: the cheapest grid path costs 9 (table)');
  await pick('mode', 'lps'); await pick('method', 'memo');
  ok(/f\(0, 8\) = 7\. .*17 of 45 cells were needed/.test(await lastMsg()) && /cache hit/.test((await msgs()).join('|')), 'DP 2-D: memoized interval DP fills only the 17 cells it needs');
  await mid(); ok(await page.locator('#av-stage .av-table td.na').count() > 0 && await page.locator('#av-stage .av-stack .sti').count() >= 1, 'DP 2-D: the triangle table and the call stack are drawn');
  await viz('sweep');
  ok(/you need 3 rooms/.test(await lastMsg()), 'line sweep: 3 rooms at the busiest moment');
  await page.click('[data-apreset="2"]'); ok(/you need 1 room\./.test(await lastMsg()), 'line sweep: touching intervals do not overlap (ends sort first)');
  await page.click('[data-apreset="1"]'); ok(/more than the capacity 4: the trips do not fit/.test(await lastMsg()), 'line sweep: car pooling over capacity');
  await mid(); ok(await page.locator('#av-stage .sw-line').count() === 1, 'line sweep: the sweep line is drawn');
  await viz('kmp');
  ok(/occurs at 6, 12/.test(await lastMsg()) && /slide the pattern/.test((await msgs()).join('|')), 'KMP: finds both matches and slides with lps');
  await viz('topk');
  ok(/The 3 largest are 15, 12, 9; the 3rd largest is the top, 9/.test(await lastMsg()), 'heaps: a size-3 min-heap keeps 15, 12, 9');
  await pick('mode', 'median'); ok(/Medians after each number: 5, 10, 5, 4, 5, 6, 7, 7\.5/.test(await lastMsg()), 'heaps: two heaps give the running median');
  await mid(); ok(await page.locator('#av-stage .av-hp .hp-side').count() === 2, 'heaps: both heaps are drawn');
  await viz('sieve');
  ok(/17 primes up to 60/.test(await lastMsg()), 'sieve: 17 primes up to 60');
  await viz('trie');
  ok((await msgs()).some(m => /has count 4: 4 words start with "ca"/.test(m)), 'trie: prefix count without visiting the words');
  for (const id of ['monostack', 'window2', 'backtrack', 'treedfs', 'dp1d', 'dp2d', 'prefix', 'segtree', 'fastslow', 'bsanswer', 'mst', 'sweep', 'kmp', 'topk', 'sieve']) {
    await viz(id);
    const info = await page.evaluate(id => { const v = window.DTSAlgo._V.find(x => x.id === id); return [v.concepts.length, document.querySelectorAll('.av .chips .chip').length, document.querySelectorAll('#av-code li').length]; }, id);
    if (!(info[0] >= 2 && info[1] >= 1 && info[2] >= 3)) ok(false, id + ': concepts, chips and pseudocode ' + info);
  }
  ok(true, 'every new visualizer links concepts and shows pseudocode');
  // pattern templates: the cheat sheet, the panel on a problem and on the pattern list, the language choice
  const T = await page.evaluate(() => window.__dts.DATA.templates || {});
  const tnames = Object.keys(T);
  if (tnames.length) {
    const vids = await page.evaluate(() => window.DTSAlgo.list());
    ok(tnames.every(n => (!T[n].viz || vids.includes(T[n].viz)) && (T[n].viz_more || []).every(x => vids.includes(x))), 'templates: every linked visualizer exists');
    await page.evaluate(() => { try { localStorage.removeItem('dts:lang:v1'); } catch (e) {} });
    await page.goto(base + '#patterns'); await page.waitForSelector('.pt-table');
    const nsig = tnames.reduce((s, n) => s + T[n].signals.length, 0);
    ok(await page.locator('.pt-table tr[data-ptrow]').count() === nsig && await page.locator('.pt-d').count() === tnames.length && /#patterns$/.test(page.url()), 'cheat sheet: ' + nsig + ' signals and ' + tnames.length + ' templates at #patterns');
    await page.fill('#pt-q', 'k largest');
    const vis = await page.locator('.pt-table tr[data-ptrow]:not([hidden])').count();
    ok(vis >= 1 && vis < nsig && /matching signal/.test(await page.textContent('#pt-count')), 'cheat sheet: the filter narrows the signals (' + vis + ')');
    const tgt = await page.textContent('.pt-table tr[data-ptrow]:not([hidden]) .pt-go');
    await page.click('.pt-table tr[data-ptrow]:not([hidden]) .pt-go');
    const open = page.locator('.pt-d[open]');
    ok(await open.count() === 1 && (await open.getAttribute('id')) === 'tpl-' + tgt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'cheat sheet: a pattern opens its template (' + tgt + ')');
    ok(await open.locator('.tp-sig li').count() >= 2 && await open.locator('.tp-bugs li').count() >= 1 && (await open.locator('.codeblock').getAttribute('data-lang')) === 'python', 'template: signals, bugs, and Python code first');
    await open.locator('[data-codelang="go"]').click();
    ok((await open.locator('.codeblock').getAttribute('data-lang')) === 'go' && (await open.locator('[data-codelang="go"]').getAttribute('aria-pressed')) === 'true' && await page.evaluate(() => localStorage.getItem('dts:lang:v1')) === 'go', 'template: the language buttons switch the code and remember the choice');
    await page.goto(base + '#practice/list'); await page.waitForSelector('.pr-row');
    const pat = await page.getAttribute('[data-atpl]', 'data-atpl');
    await page.click('[data-atpl]');
    ok(await page.locator('.pr-tpl .tp').count() === 1 && (await page.getAttribute('.pr-tpl .tp', 'data-tpl')) === pat && (await page.locator('.pr-tpl .codeblock').getAttribute('data-lang')) === 'go', 'pattern list: "Show pattern template" opens the panel in the remembered language');
    const pid = await page.evaluate(() => (window.__dts.DATA.practice.find(p => (window.__dts.DATA.templates || {})[p.pattern] && !p.id.startsWith('sample-')) || {}).id);
    await page.goto(base + '#practice/' + pid); await page.waitForSelector('[data-areveal="template"]');
    ok(await page.isHidden('#pr-template'), 'problem: the template panel starts closed');
    await page.click('[data-areveal="template"]');
    ok(await page.isVisible('#pr-template .tp') && (await page.getAttribute('[data-areveal="template"]', 'aria-expanded')) === 'true', 'problem: "Show pattern template" opens it');
    await page.click('#pr-template [data-codelang="python"]');
    ok((await page.locator('#pr-template .codeblock').getAttribute('data-lang')) === 'python' && await page.evaluate(() => localStorage.getItem('dts:lang:v1')) === 'python', 'problem: switching back to Python');
    const watch = page.locator('#pr-template [data-avizgo]').first();
    if (await watch.count()) { const vid = await watch.getAttribute('data-avizgo'); await watch.click(); await page.waitForSelector('#av-stage');
      ok(await page.locator(`[data-aviz="${vid}"][aria-pressed="true"]`).count() === 1 && (await page.textContent('.av-tpls')).length > 0, 'template: "Watch it step by step" opens the visualizer, which links back to its templates'); }
  } else console.log('  - no templates.json built in; skipped template checks');
  // practice with the sample problems (build with DTS_PRACTICE_FIXTURE=1)
  await page.goto(base + '#practice/list'); await page.waitForSelector('.pr-row, .alg .vsub');
  if (await page.$('[data-aprob="sample-valid-brackets"]')) {
    await page.click('[data-adiff="Easy"]'); ok(!(await page.$('[data-aprob="sample-merge-intervals"]')), 'difficulty filter');
    await page.click('[data-aprob="sample-valid-brackets"]'); await page.waitForSelector('#pr-code');
    const sol = await page.evaluate(() => window.__dts.DATA.practice.find(p => p.id === 'sample-valid-brackets').solution);
    await page.fill('#pr-code', 'function validBrackets(s) {\n  return s.length % 2 === 0;\n}\n');
    await page.click('[data-aact="run"]'); await page.waitForSelector('.pr-res');
    ok(/of 6 tests pass/.test(await page.textContent('.pr-res')) && await page.locator('.pr-tests li.bad').count() > 0, 'wrong code fails some tests');
    await page.fill('#pr-code', sol); await page.click('[data-aact="run"]'); await page.waitForSelector('.pr-res.good');
    ok((await page.textContent('.pr-res')).includes('6 of 6 tests pass'), 'correct code passes all tests');
    await page.waitForTimeout(300);
    ok((await page.textContent('#pr-solved')).includes('solved'), 'passing all tests marks the problem solved');
    await page.click('[data-areveal="hint"]'); ok(await page.isVisible('#pr-hint'), 'hint reveals');
    await page.click('#pr-code'); await page.keyboard.press('Control+End'); await page.keyboard.press('Tab');
    ok((await page.inputValue('#pr-code')).endsWith('  '), 'Tab inserts two spaces');
    await page.fill('#pr-code', 'function validBrackets(s) { while (true) {} }'); await page.click('[data-aact="run"]');
    await page.waitForSelector('.pr-res', { timeout: 6000 }); await page.waitForFunction(() => /2 seconds/.test(document.querySelector('#pr-out').textContent), null, { timeout: 6000 });
    ok(true, 'an infinite loop is stopped after 2 seconds');
    await page.fill('#pr-code', sol); await page.waitForTimeout(900);
    await page.reload(); await page.waitForSelector('#pr-code');
    ok((await page.inputValue('#pr-code')).includes('const open'), 'code is saved across reloads');
    await page.click('[data-aprob=""]'); await page.waitForSelector('.pr-row');
    ok((await page.textContent('[data-aprob="sample-valid-brackets"]')).includes('solved'), 'solved mark shows in the list');
  } else console.log('  - practice fixture not built in (set DTS_PRACTICE_FIXTURE=1); skipped practice checks');
  // practice in other languages: the selector, Python by default, Copy test program for Go, Python run with Pyodide
  const lp = await page.evaluate(() => (window.__dts.DATA.practice.find(p => p.sig && p.langs && p.langs.python && p.langs.go && !p.sig.design) || {}).id);
  if (lp) {
    await page.evaluate(() => { try { localStorage.removeItem('dts:lang:v1'); } catch (e) {} });
    await page.goto(base + '#practice/' + lp); await page.waitForSelector('#pr-code');
    const P = await page.evaluate(id => window.__dts.DATA.practice.find(p => p.id === id), lp);
    const order = await page.$$eval('.pr-langs [data-codelang]', bs => bs.map(b => b.dataset.codelang).join(','));
    ok(order === 'python,go,cpp,rust,scala,javascript', 'languages: selector in order Python, Go, C++, Rust, Scala, JavaScript (' + order + ')');
    ok(await page.getAttribute('#pr-code', 'data-lang') === 'python' && await page.getAttribute('.pr-langs [data-codelang="python"]', 'aria-pressed') === 'true'
       && (await page.inputValue('#pr-code')) === P.langs.python.starter && !!(await page.$('[data-aact="run"]')), 'languages: Python is the default, with its starter and Run tests');
    ok(/Write .*\(.*\) -> /.test(await page.textContent('.pr-sig')) && /Pyodide/.test(await page.textContent('.pr-sig')), 'languages: the Python signature line says where the code runs');
    await page.click('.pr-langs [data-codelang="go"]');
    const cmd = await page.evaluate(id => window.DTSHarness.command(window.__dts.DATA.practice.find(p => p.id === id), 'go'), lp);
    ok(await page.getAttribute('#pr-code', 'data-lang') === 'go' && (await page.inputValue('#pr-code')) === P.langs.go.starter && !(await page.$('[data-aact="run"]'))
       && (await page.textContent('.pr-sig')).includes('not run inside the app') && (await page.textContent('.pr-sig')).includes(cmd), 'languages: Go shows its starter and the go run command, and no Run button');
    await page.fill('#pr-code', P.langs.go.solution);
    await page.click('[data-aact="copyprog"]'); await page.waitForSelector('#pr-prog', { state: 'attached' });
    const prog = await page.inputValue('#pr-prog');
    const want = await page.evaluate(([id, code]) => window.DTSHarness.program(window.__dts.DATA.practice.find(p => p.id === id), 'go', code), [lp, P.langs.go.solution]);
    ok(prog === want && prog.startsWith('// Down the Stack practice') && prog.includes(P.langs.go.solution.trim().split('\n')[0]) && prog.includes('func main()')
       && (await page.textContent('.pr-cmdline')).trim() === cmd, 'languages: Copy test program gives your code plus the tests, and the command (' + prog.split('\n').length + ' lines)');
    await page.click('[data-areveal="solution"]');
    ok((await page.textContent('#pr-solution')).trim() === P.langs.go.solution.trim() && /\(Go\)/.test(await page.textContent('[data-areveal="solution"]')), 'languages: Show solution shows the Go solution');
    await page.click('[data-areveal="solution"]');
    await page.click('.pr-langs [data-codelang="python"]');
    ok(await page.evaluate(() => localStorage.getItem('dts:lang:v1')) === 'python' && (await page.inputValue('#pr-code')) === P.langs.python.starter, 'languages: back to Python, the choice is remembered');
    await page.click('.pr-langs [data-codelang="go"]');
    ok((await page.inputValue('#pr-code')) === P.langs.go.solution, 'languages: code is kept per language');
    await page.click('.pr-langs [data-codelang="python"]');
    // Python in the browser: the pinned Pyodide from cdn.jsdelivr.net when it can be reached, else an offline stub of it
    const pyBase = await page.evaluate(() => window.DTSAlgo.python.base);
    const online = !process.env.DTS_E2E_PY_STUB && await page.evaluate(async u => { try { const r = await fetch(u + 'pyodide.js', { cache: 'no-store' }); return r.ok; } catch (e) { return false; } }, pyBase);
    if (!online) {
      const stub = "self.loadPyodide = async function(){ await new Promise(function(r){ setTimeout(r, 400); }); var out = function(){};\n" +
        "  return { setStdout: function(o){ out = o.batched; }, setStderr: function(){}, globals: { v: {}, set: function(k, x){ this.v[k] = x; } },\n" +
        "    runPython: function(){ var g = this.globals.v; if (/while True/.test(g._dts_user)) { for (;;) {} }\n" +
        "      var n = (g._dts_prog.match(/^    \\(\\[/mg) || []).length, good = !/pass\\s*$/.test(g._dts_user);\n" +
        "      out('DTS-RESULT ' + JSON.stringify({lang: 'python', pass: good ? n : 0, total: n, error: null, results: Array.from({length: n}, function(){ return {ok: good, got: good ? '\"stub\"' : 'null', ms: 0}; })})); } }; };\n//";
      await page.evaluate(s => { const P = window.DTSAlgo.python; if (P.w) P.w.terminate(); P.w = null; P.ready = false; P.base = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(s); }, stub);
      console.log('  - ' + (process.env.DTS_E2E_PY_STUB ? 'DTS_E2E_PY_STUB is set' : 'cdn.jsdelivr.net is not reachable from this browser') + ': Python checks run against an offline stub of Pyodide');
    }
    const label = online ? 'Pyodide' : 'Pyodide stub';
    await page.click('[data-aact="run"]');
    const loadingText = await page.waitForSelector('#pr-out .pr-loading', { timeout: 5000 }).then(h => h.textContent()).catch(() => '');
    ok(/Loading Python \(~10 MB, once\)/.test(loadingText), 'python: the first run shows "Loading Python (~10 MB, once)"');
    await page.waitForSelector('#pr-out .pr-res', { timeout: 150000 });
    ok(/0 of \d+ tests pass/.test(await page.textContent('.pr-res')) && await page.locator('.pr-tests li.bad').count() === P.tests.length, label + ': the starter fails every test');
    await page.fill('#pr-code', P.langs.python.solution); await page.click('[data-aact="run"]');
    await page.waitForSelector('#pr-out .pr-res.good', { timeout: 60000 }).catch(() => {});
    ok((await page.textContent('.pr-res')).includes(P.tests.length + ' of ' + P.tests.length + ' tests pass') && !(await page.$('#pr-out .pr-loading')), label + ': the solution passes every test, without loading again');
    await page.waitForTimeout(300);
    ok((await page.textContent('#pr-solved')).includes('solved'), label + ': passing all tests marks the problem solved');
    if (online) {
      await page.fill('#pr-code', 'def ' + P.sig.name + '(*args):\n    return 1 // 0\n'); await page.click('[data-aact="run"]');
      await page.waitForSelector('#pr-out .pr-res', { timeout: 60000 });
      ok(/ZeroDivisionError: integer division or modulo by zero \(line 2 of your code\)/.test(await page.textContent('.pr-tests')), 'python: an exception shows its type and the line of your code');
      await page.fill('#pr-code', 'def ' + P.sig.name + '(:\n'); await page.click('[data-aact="run"]');
      await page.waitForFunction(() => /SyntaxError/.test(document.querySelector('#pr-out').textContent), null, { timeout: 60000 });
      ok(/line 1 of your code/.test(await page.textContent('#pr-out')), 'python: a syntax error names the line');
    }
    await page.fill('#pr-code', 'def ' + P.sig.name + '(*args):\n    while True:\n        pass\n'); const t0 = Date.now(); await page.click('[data-aact="run"]');
    await page.waitForFunction(() => /Stopped after 5 seconds/.test(document.querySelector('#pr-out').textContent), null, { timeout: 20000 }).catch(() => {});
    const took = (Date.now() - t0) / 1000;
    ok(/Stopped after 5 seconds/.test(await page.textContent('#pr-out')) && took < 12, label + ': an infinite loop is stopped after 5 seconds (' + took.toFixed(1) + ' s)');
    await page.fill('#pr-code', P.langs.python.solution); await page.click('[data-aact="run"]');
    await page.waitForSelector('#pr-out .pr-res.good', { timeout: 150000 }).catch(() => {});
    ok(!!(await page.$('#pr-out .pr-res.good')), label + ': Python runs again after a stopped run (a new worker)');
    if (shots) { await page.screenshot({ path: shots + '/9-practice-python.png' }); }
  } else console.log('  - no practice problem with sig and langs yet; skipped language checks');
  // animated scenes (build with DTS_ANIM_FIXTURE=1 for the two samples in tests/fixtures/anim_sample.json)
  if (await page.evaluate(() => (window.__dts.SCENES || []).some(s => s.id === 'sample-tcp-handshake'))) {
    await page.goto(base + '#scene/sample-tcp-handshake'); await page.waitForSelector('#reader #rs-watch .scene svg .sc-a');
    const secs = await page.evaluate(() => [...document.querySelectorAll('#reader .rd-sec')].map(x => x.id));
    ok(secs.indexOf('rs-watch') === secs.indexOf('rs-how') + 1, '"Watch it work" comes right after How it works');
    const ntcp = await page.evaluate(() => window.__dts.SCENES.filter(s => s.concept === 'tcp').length);
    ok(await page.locator('#rs-watch .sc-tab').count() === (ntcp > 1 ? ntcp : 0), 'one tab per scene when a concept has several (' + ntcp + ')');
    const fig = page.locator('#rs-watch .scene[data-scene="sample-tcp-handshake"]');
    ok(await fig.count() === 1 && (await page.getAttribute('#rs-watch .sc-tab[aria-selected="true"]', 'data-sctab').catch(() => '0')) !== null, 'deep link #scene/... opens the read at that scene');
    ok(await fig.locator('.sc-a').count() === 4 && await fig.locator('.sc-g').count() === 3 && await fig.locator('.sc-l').count() === 1, 'scene draws actors, groups and links');
    const sig = () => fig.evaluate(f => [...f.querySelectorAll('.sc-a')].map(g => [g.dataset.id, g.dataset.label, g.dataset.sub, g.getAttribute('class').replace(/ (chg|recv|pop)\b/g, ''), g.getAttribute('transform'), g.style.opacity].join('|')).join(';')
      + '#' + f.querySelectorAll('.sc-l').length + '#' + f.querySelectorAll('.sc-gh').length + '#' + f.querySelectorAll('.sc-ring').length + '#' + f.querySelectorAll('.sc-fx > *').length);
    const kOf = async () => (await fig.locator('.sc-k').textContent()).trim();
    const sig1 = await sig(), cap1 = await fig.locator('.sc-cap').textContent();
    ok(await kOf() === 'step 1 of 7' && cap1.includes('listen()'), 'scene starts at step 1 with its caption');
    await fig.locator('[data-sc="next"]').click();
    ok(await kOf() === 'step 2 of 7' && (await fig.locator('.sc-cap').textContent()) !== cap1, 'Next changes the step and the caption');
    ok(await fig.locator('.sc-fx .sc-dot').count() === 1 && await fig.locator('.sc-fx .sc-pill').count() === 1, 'a message dot with its label travels');
    await page.waitForSelector('#rs-watch .scene:not(.animating) .sc-a[data-id="rto"]', { timeout: 8000 });
    const sig2 = await sig();
    ok(sig2 !== sig1 && /rto\|Retransmit timer/.test(sig2) && /c\|Client socket\|SYN_SENT/.test(sig2), 'step 2 adds the timer and changes the client');
    await fig.locator('[data-sc="next"]').click(); await page.waitForTimeout(150);
    await fig.locator('[data-sc="back"]').click();
    ok(await kOf() === 'step 2 of 7' && await sig() === sig2, 'Back in the middle of an animation restores the exact previous state');
    await fig.locator('[data-sc="back"]').click();
    ok(await kOf() === 'step 1 of 7' && await sig() === sig1 && (await fig.locator('.sc-cap').textContent()) === cap1, 'Back to step 1 restores the exact first state');
    await fig.locator('.sc-dots span[data-i="3"]').click();
    ok(await kOf() === 'step 3 of 7' && await fig.locator('.sc-gh.lost .sc-x').count() === 1, 'a lost message ends halfway with an X');
    await fig.locator('.sc-dots span[data-i="1"]').click();
    await fig.focus(); await page.keyboard.press('ArrowRight');
    ok(await kOf() === 'step 2 of 7', 'Right arrow steps forward');
    await page.keyboard.press('ArrowLeft');
    ok(await kOf() === 'step 1 of 7' && await sig() === sig1, 'Left arrow steps back');
    await fig.locator('[data-sc="speed"][data-v="2"]').click();
    ok((await fig.locator('[data-sc="speed"][data-v="2"]').getAttribute('aria-pressed')) === 'true', 'speed 2x selected');
    await fig.locator('[data-sc="play"]').click();
    ok((await fig.locator('[data-sc="play"]').getAttribute('aria-pressed')) === 'true' && (await fig.locator('[data-sc="play"]').textContent()) === 'Pause', 'Play starts playing');
    await page.waitForFunction(() => /step [3-7] of 7/.test(document.querySelector('#rs-watch .scene .sc-k').textContent), null, { timeout: 15000 });
    ok(true, 'Play advances through the steps on its own');
    await fig.locator('[data-sc="play"]').click(); const kp = await kOf(); await page.waitForTimeout(3000);
    ok(await kOf() === kp && (await fig.locator('[data-sc="play"]').getAttribute('aria-pressed')) === 'false', 'Pause stops on the current step');
    await fig.locator('[data-sc="restart"]').click();
    ok(await kOf() === 'step 1 of 7' && (await fig.locator('[data-sc="play"]').getAttribute('aria-pressed')) === 'true', 'Restart plays from step 1');
    await fig.focus(); await page.keyboard.press(' ');
    ok((await fig.locator('[data-sc="play"]').getAttribute('aria-pressed')) === 'false', 'Space pauses');
    // visualizer link, tabs, gallery
    await page.goto(base + '#read/eviction'); await page.waitForSelector('#reader #rs-watch .scene');
    ok(/Try it yourself: LRU cache/.test(await page.textContent('#rs-watch .sc-try')), 'read links the visualizer that lists this concept');
    const evIds = await page.evaluate(() => window.__dts.SCENES.filter(s => s.concept === 'eviction').map(s => s.id));
    if (evIds.length > 1) {
      await page.click('#rs-watch .sc-tab[data-sctab="1"]');
      ok((await page.getAttribute('#rs-watch .scene', 'data-scene')) === evIds[1] && (await page.getAttribute('#rs-watch .sc-tab[data-sctab="1"]', 'aria-selected')) === 'true', 'tabs switch between a concept\'s scenes');
    }
    await page.click('#rs-watch [data-tryviz="lru"]'); await page.waitForSelector('#av-stage');
    ok(await page.locator('[data-aviz="lru"][aria-pressed="true"]').count() === 1 && await page.locator('#reader').isHidden(), '"Try it yourself" opens the visualizer');
    await page.click('[data-atab="anim"]'); await page.waitForSelector('.sc-card svg .sc-a');
    const ncard = await page.locator('.sc-card').count(), nsc = await page.evaluate(() => window.__dts.SCENES.length);
    ok(ncard === nsc && await page.locator('.alg-anim .ysec').count() >= 1 && /#animations$/.test(page.url()), 'Animations gallery lists every scene by layer (' + ncard + ')');
    await page.click('.sc-card[data-sceneopen="sample-lru-eviction"]'); await page.waitForSelector('#reader:not([hidden]) #rs-watch .scene[data-scene="sample-lru-eviction"]');
    ok((await page.textContent('#reader h1')).length > 2, 'a gallery card opens its concept read at the scene');
    await page.click('#reader [data-rclose]');
    // reduced motion: no travelling dot, the step's end state at once
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const rp = await rctx.newPage(); rp.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await rp.goto(base + '#scene/sample-tcp-handshake'); await rp.waitForSelector('#rs-watch .scene .sc-a');
    await rp.click('#rs-watch .scene [data-sc="next"]');
    ok(await rp.locator('#rs-watch .scene .sc-fx > *').count() === 0 && await rp.locator('#rs-watch .sc-a[data-id="rto"]').count() === 1 && await rp.locator('#rs-watch .scene .sc-gh').count() === 1, 'reduced motion jumps to the end state without travel');
    await rctx.close();
  } else console.log('  - scene fixture not built in (set DTS_ANIM_FIXTURE=1); skipped scene checks');
  // problem map (a build with content/problemmap/map.json, or DTS_PROBLEMMAP=tests/fixtures/problemmap_sample.json)
  const hasPM = await page.evaluate(() => { const D = window.__dts.DATA; return !!(D.pm_summary || (D.problemmap && D.problemmap.concepts)); });
  if (hasPM) {
    await page.goto(base + '#problems'); await page.waitForSelector('#pm-road .pm-fcard .pm-ir', { timeout: 20000 });
    // roadmap (default): progress card with a next problem, families in dependency order, ideas in stages with a status
    const rm = await page.evaluate(() => { const I = window.DTSPM._I(); const fams = [...document.querySelectorAll('#pm-road .pm-fcard')];
      const firstStage = document.querySelector('#pm-road .pm-fcard.open .pm-stage-l .pm-ir'); const d = firstStage && I.byId[firstStage.dataset.pmidea];
      return { fams: fams.length, nf: I.fams.length, open: document.querySelectorAll('#pm-road .pm-fcard.open').length, next: !!document.querySelector('#pm-road .pm-nextbig[data-pmprob]'), lvl0: d ? d.l : -1,
        locked: [...document.querySelectorAll('#pm-road .pm-ideas .pm-ir.locked')].every(b => b.querySelector('.pm-need')), mapHidden: document.getElementById('pm-mapw').hidden }; });
    ok(rm.fams === rm.nf && rm.open >= 1 && rm.next && rm.lvl0 === 0 && rm.locked && rm.mapHidden, `problem map opens as a roadmap: ${rm.fams} family cards, a next problem, stage 1 = level 0, locked ideas say what they need`);
    const fid = await page.getAttribute('#pm-road .pm-fcard:not(.open) [data-pmopen]', 'data-pmopen');
    await page.click(`#pm-road [data-pmopen="${fid}"]`); await page.waitForTimeout(100);
    ok(await page.locator(`#pm-road .pm-fcard.open [data-pmopen="${fid}"]`).count() === 1, 'roadmap: a family card opens on tap');
    const rid = await page.getAttribute('#pm-road .pm-fcard.open .pm-ir', 'data-pmidea');
    await page.click(`#pm-road .pm-ir[data-pmidea="${rid}"]`); await page.waitForSelector('#panel .pm-ladder .pm-row');
    ok(await page.locator(`#pm-road .pm-ir.sel[data-pmidea="${rid}"]`).count() === 1, 'roadmap: an idea opens its ladder and stays marked');
    await page.click('#panel [data-pmclose]'); await page.waitForTimeout(100);
    // lesson: an idea's panel starts with "Learn it first" (what, signals, Python template, walk-through, bugs, cost)
    const lesIdea = await page.evaluate(() => { const L = window.DTSPM._raw && window.DTSPM._raw().lessons; return L ? Object.keys(L)[0] : null; });
    if (lesIdea) {
      await page.evaluate(id => location.hash = '#problems/idea/' + id, lesIdea); await page.waitForSelector('#panel .pm-lesson');
      ok(await page.locator('#panel .pm-lesson[open] .codeblock').count() === 1 && await page.locator('#panel .pm-lesson .pm-walk li').count() >= 3 && await page.locator('#panel .pm-lesson .pm-sig li').count() >= 3, 'idea panel: "Learn it first" lesson with signals, a Python template and a walk-through (' + lesIdea + ')');
      await page.click('#panel [data-pmclose]'); await page.waitForTimeout(100);
    }
    await page.click('[data-pmmode="map"]'); await page.waitForSelector('#pm-svg .pm-n');
    const pm = await page.evaluate(() => { const I = window.DTSPM._I(); return { ideas: I.ideas.length, probs: I.P.length, nodes: document.querySelectorAll('#pm-svg .pm-n').length, allG: document.querySelectorAll('#pm-svg g').length }; });
    ok(pm.nodes === pm.ideas && pm.allG < pm.ideas + 40, `problem map draws its ${pm.ideas} ideas as SVG nodes, not its ${pm.probs} problems (${pm.allG} groups)`);
    const lv = await page.evaluate(() => { const y = id => +document.querySelector(`.pm-n[data-pmidea="${id}"] rect`).getAttribute('y'); const I = window.DTSPM._I(); const lo = I.ideas.find(d => d.l === 0), hi = I.ideas.find(d => d.l === I.maxL); return y(lo.id) > y(hi.id); });
    ok(lv, 'problem map: level 0 is drawn at the bottom');
    ok((await page.locator('#tab-problems').isVisible()) && (await page.locator('#strip .pmband').count()) === 1, 'problem map: tab and a band below L5 in the layer strip');
    if (shots) await page.screenshot({ path: shots + '/10-problem-map.png' });
    const idea = await page.evaluate(() => { const I = window.DTSPM._I(); return (I.byId.hashmap && I.byId.hashmap.probs.length ? I.byId.hashmap : I.ideas.slice().sort((a, b) => b.probs.length - a.probs.length)[0]).id; });
    await page.locator(`.pm-n[data-pmidea="${idea}"]`).dispatchEvent('click'); await page.waitForSelector('#panel .pm-ladder .pm-row');
    ok((await page.locator(`.pm-n.sel[data-pmidea="${idea}"]`).count()) === 1 && (await page.locator('#pm-svg .pm-e.hot').count()) > 0, 'problem map: clicking an idea selects it and lights the lines it builds on');
    ok((await page.textContent('#panel .pm-steph')).startsWith('Start here') && await page.evaluate(() => { const d = [...document.querySelectorAll('#panel .pm-step .pm-steph .mono')].map(x => +x.textContent.replace(/\D/g, '')); return d.every((x, i) => !i || x > d[i - 1]); }), 'idea panel: a ladder of problems, shallowest step first');
    ok((await page.locator('#panel .pm-row a[href*="leetcode.com/problems/"]').count()) > 0, 'idea panel: LeetCode links');
    ok(/#problems\/idea\//.test(await page.evaluate(() => location.hash)), 'idea selection is in the address (#problems/idea/...)');
    await page.click('[data-pmdiff="2"]'); await page.waitForTimeout(100);
    const hard = await page.evaluate(() => [document.querySelectorAll('.pm-n.off').length, [...document.querySelectorAll('#panel .pm-row .pr-d')].every(x => x.textContent === 'Hard')]);
    ok(hard[0] > 0 && hard[1], 'difficulty filter dims ideas with no Hard problems and filters the ladder (' + hard[0] + ' dimmed)');
    await page.click('[data-pmdiff="-1"]'); await page.selectOption('#pm-fam', '0'); await page.waitForTimeout(100);
    const fam = await page.evaluate(() => { const I = window.DTSPM._I(); return [...document.querySelectorAll('.pm-n:not(.off)')].every(g => I.byId[g.dataset.pmidea].f === 0); });
    ok(fam, 'family filter keeps one family lit');
    await page.selectOption('#pm-fam', '-1');
    await page.click('[data-pmworked]'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => { const I = window.DTSPM._I(); return [...document.querySelectorAll('.pm-n:not(.off)')].every(g => I.byId[g.dataset.pmidea].worked > 0) && document.querySelectorAll('.pm-n:not(.off)').length > 0; }), '"Has a worked problem" keeps only ideas with a practice problem');
    await page.click('[data-pmworked]');
    await page.fill('#pm-q', 'two sum'); await page.waitForSelector('#pm-sres [data-pmprob="1"]');
    ok(true, 'search finds a problem by title');
    await page.click('#pm-sres [data-pmprob="1"]'); await page.waitForSelector('#panel svg.pm-mini');
    ok((await page.textContent('#panel h2')).includes('Two Sum') && (await page.locator('#panel .pm-mn.me').count()) === 1 && (await page.locator('#panel .pm-mn[data-pmprob]').count()) >= 2, 'problem view: a mini-DAG with prerequisites below and unlocks above');
    const mini = await page.evaluate(() => { const me = document.querySelector('#panel .pm-mn.me rect'), y = +me.getAttribute('y'); const ns = [...document.querySelectorAll('#panel .pm-mn[data-pmprob]')]; const pre = window.DTSPM._I().byN[1].p; return ns.every(g => pre.includes(+g.dataset.pmprob) ? +g.querySelector('rect').getAttribute('y') > y : +g.querySelector('rect').getAttribute('y') < y); });
    ok(mini, 'problem view: prerequisites drawn below, unlocks above');
    ok((await page.locator('#panel .pm-path li').count()) >= 2 && !(await page.locator('#panel .pm-path li').first().locator('.pm-pdot').count() === 0), 'problem view: learning path from a root');
    ok((await page.locator('#panel [data-pmpractice="two-sum"]').count()) > 0, 'problem view: link to the worked practice problem');
    await page.fill('#pm-q', '');
    await page.click('#panel .btnrow [data-pmdone="1"]'); await page.waitForTimeout(250);
    ok((await page.getAttribute('#panel .btnrow [data-pmdone="1"]', 'aria-pressed')) === 'true', 'mark a problem as solved');
    await page.reload(); await page.waitForSelector('#panel .btnrow [data-pmdone="1"]', { timeout: 20000 });
    ok((await page.getAttribute('#panel .btnrow [data-pmdone="1"]', 'aria-pressed')) === 'true', 'solved mark survives a reload (deep link #problems/1)');
    ok(/^1 of /.test((await page.textContent('#pm-road .pm-yt')).trim()) && (await page.locator('#pm-road .pm-nextbig').textContent()).includes('Your next problem'), 'roadmap: progress counts the solved problem and suggests the next one');
    await page.click('[data-view="you"]'); await page.waitForSelector('#pm-next .pm-row');
    const nx = await page.evaluate(() => { const I = window.DTSPM._I(), done = window.DTSPM.done(); return [...document.querySelectorAll('#pm-next .pm-pt')].map(b => +b.dataset.pmprob).filter(n => I.byN[n].p.length).every(n => I.byN[n].p.every(m => done.has(m))); });
    ok(nx, 'You: next problems have all their prerequisites solved');
    await page.click('[data-view="problems"]'); await page.waitForSelector('#panel .btnrow [data-pmdone="1"]');
    await page.click('#panel .btnrow [data-pmdone="1"]'); await page.waitForTimeout(200);
    // keyboard: arrow keys move between ideas, Enter opens one (full map)
    await page.click('[data-pmmode="map"]'); await page.waitForSelector('#pm-svg .pm-n');
    await page.locator('.pm-n[tabindex="0"]').focus(); const before = await page.evaluate(() => document.activeElement.dataset.pmidea);
    await page.keyboard.press('ArrowUp'); const after = await page.evaluate(() => document.activeElement.dataset.pmidea);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    ok(before && after && before !== after && (await page.locator(`.pm-n.sel[data-pmidea="${after}"]`).count()) === 1, 'keyboard: arrows move between ideas, Enter selects');
    // pins: a concept read lists the problems that use it
    const cid = await page.evaluate(() => { const N = window.__dts.N, c = (window.__dts.DATA.pm_summary || window.__dts.DATA.problemmap).concepts; return N.hashtables && c.hashtables ? 'hashtables' : Object.keys(c).find(k => N[k]); });
    await page.goto(base + '#read/' + cid); await page.waitForSelector('#rs-problems .pm-row', { timeout: 20000 });
    ok((await page.locator('#rs-problems .pm-row').count()) >= 1 && (await page.locator('#reader .toc a[data-jump="rs-problems"]').count()) === 1, 'concept read: "Problems that use this" with rows and a TOC entry');
    if (await page.locator('#rs-problems [data-pmpinmore]').count()) { const n0 = await page.locator('#rs-problems .pm-row').count(); await page.click('#rs-problems [data-pmpinmore]'); ok((await page.locator('#rs-problems .pm-row').count()) > n0, 'concept read: Show all'); }
    const pin = await page.getAttribute('#rs-problems .pm-row .pm-pt', 'data-pmprob');
    await page.click('#rs-problems .pm-row .pm-pt'); await page.waitForSelector('#panel svg.pm-mini');
    ok(await page.locator('#reader').isHidden() && (await page.textContent('#panel h2')).startsWith('#' + pin), 'concept pin opens the problem in the map');
    await page.goto(base + '#practice/two-sum'); await page.waitForSelector('.pm-links [data-pmidea]', { timeout: 20000 });
    ok(true, 'practice problem links to its idea in the map');
    await page.goto(base + '#algo/twoptr'); await page.waitForSelector('.av .pm-links [data-pmidea]', { timeout: 20000 });
    ok(true, 'visualizer links to its ideas in the map');
    await page.goto(base + '#patterns'); await page.waitForTimeout(400);
    ok((await page.locator('.pt-all .pm-links [data-pmidea]').count()) > 0, 'pattern templates link to ideas in the map');
    // reduced motion: picking an idea does not animate the scroll
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'dark' });
    const pp = await pctx.newPage(); pp.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await pp.goto(base + '#problems'); await pp.waitForSelector('#pm-road .pm-ir', { timeout: 20000 });
    const tb = await pp.evaluate(() => { const t = document.querySelector('.tabs'), r = t.getBoundingClientRect(), b = t.querySelector('[aria-pressed="true"]').getBoundingClientRect(); return [getComputedStyle(t).position, Math.round(innerHeight - r.bottom), b.left >= r.left - 1 && b.right <= r.right + 1, Math.round(b.height)]; });
    ok(tb[0] === 'fixed' && tb[1] <= 1 && tb[2] && tb[3] >= 44, 'phone: view tabs are a bottom bar, the current tab is in view and 44 px tall (' + tb.join(',') + ')');
    await pp.click('[data-pmmode="map"]'); await pp.waitForSelector('#pm-svg .pm-n');
    const ph = await pp.evaluate(() => { const f = document.getElementById('pm-frame'); return [document.documentElement.scrollWidth, f.scrollWidth > f.clientWidth, f.scrollTop > 0]; });
    ok(ph[0] <= 392 && ph[1], 'phone: the map scrolls inside its frame, no horizontal page scroll (' + ph[0] + ')');
    ok(ph[2], 'phone: the map opens at the foundations (scrolled to the bottom)');
    await pp.locator('.pm-n').first().dispatchEvent('click'); await pp.waitForSelector('#panel .pm-steph');
    await pp.click('#panel .pm-row .pm-pt'); await pp.waitForSelector('#panel svg.pm-mini');
    ok(await pp.evaluate(() => document.documentElement.scrollWidth) <= 392, 'phone: idea ladder and problem view fit the width');
    if (shots) await pp.screenshot({ path: shots + '/11-problem-phone.png' });
    await pctx.close();
  } else console.log('  - no problem map in this build; skipped problem map checks');
  // reduced motion in a visualizer: a live action jumps to its first step and does not play
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const vp = await vctx.newPage(); vp.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await vp.goto(base + '#algo/btree'); await vp.waitForSelector('#av-stage svg.av-bt');
  await vp.fill('[data-alin="key"]', '42'); await vp.press('[data-alin="key"]', 'Enter');
  ok(/^insert 42: start at the root/.test(await vp.textContent('#av-msg')) && (await vp.getAttribute('[data-aact="play"]', 'aria-pressed')) === 'false', 'reduced motion: Insert (Enter) jumps to the new key without playing');
  await vctx.close();
  // hands-on practice links: a section near the end of a read, each link opens in a new tab
  await page.goto(base + '#read/dimmodel'); await page.waitForSelector('#reader #rs-handson .ho');
  const ho = await page.evaluate(() => [...document.querySelectorAll('#rs-handson a.ho')].map(a => [a.target, a.rel, /^https?:/.test(a.href), !!a.querySelector('.ho-a')]));
  ok(ho.length >= 2 && ho.every(x => x[0] === '_blank' && /noopener/.test(x[1]) && x[2] && x[3]) && await page.locator('#reader .toc a[data-jump="rs-handson"]').count() === 1, 'read: "Practice it yourself" lists ' + ho.length + ' links (new tab, access label) with a TOC entry');
  // "Taught in" names each school: Raft is taught at Stanford and at MIT (6.5840)
  await page.goto(base + '#read/raft'); await page.waitForSelector('#reader .ladder-cap');
  const taught = await page.$$eval('#reader .ladder-cap', ps => ps.map(p => p.textContent).find(t => /^Taught in/.test(t)) || '');
  ok(/Stanford/.test(taught) && /MIT 6\.5840/.test(taught), 'read: "Taught in" groups courses by school (' + taught.slice(0, 80) + ')');
  await page.click('#reader [data-course="MIT 6.5840"]'); await page.waitForTimeout(200);
  ok(await page.locator('#v-courses [data-program="mit-meng"][aria-pressed="true"]').count() === 1 && /Distributed Computer Systems Engineering/.test(await page.textContent('#v-courses .tsteps h2')), 'a course link opens its own school\'s program');
  // architecture patterns: a read section with one tab and one animated diagram per pattern, and the catalog view
  await page.goto(base + '#pattern/kafka/2'); await page.waitForSelector('#reader #rs-apat .ap-panel:not([hidden]) svg');
  const npat = await page.evaluate(() => window.__dts.DATA.patterns.filter(x => x.concept === 'kafka').length);
  ok(npat >= 3 && await page.locator('#rs-apat .ap-tab').count() === npat && await page.locator('#rs-apat .ap-panel').count() === npat, 'kafka read: one tab and one panel per pattern (' + npat + ')');
  ok(await page.locator('#rs-apat .ap-panel:not([hidden])').count() === 1 && (await page.getAttribute('#rs-apat .ap-tab[data-aptab="1"]', 'aria-selected')) === 'true', 'deep link #pattern/kafka/2 opens the second pattern');
  ok(await page.locator('#reader .toc a[data-jump="rs-apat"]').count() === 1, 'contents list has "Architecture patterns"');
  ok(await page.locator('#rs-apat .ap-panel:not([hidden]) .ap-scene .scene').count() === 1 && await page.locator('#rs-apat .ap-scene .scene').count() === 1, 'only the open pattern mounts a scene player');
  await page.focus('#rs-apat .ap-tab[data-aptab="1"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  ok((await page.getAttribute('#rs-apat .ap-tab[data-aptab="2"]', 'aria-selected')) === 'true' && /#pattern\/kafka\/3$/.test(page.url()), 'arrow keys move between pattern tabs and update the address');
  await page.click('#rs-apat .ap-panel:not([hidden]) .ap-scene [data-sc="next"]'); await page.waitForTimeout(100);
  ok(/step 2 of/.test(await page.textContent('#rs-apat .ap-panel:not([hidden]) .sc-k')), 'pattern diagram steps with Next');
  const kind = await page.getAttribute('#rs-apat .ap-panel:not([hidden]) .ap-kind', 'data-pkind');
  await page.click('#rs-apat .ap-panel:not([hidden]) .ap-kind'); await page.waitForSelector('#v-architecture .ap-cat.on');
  ok(await page.locator('#reader').isHidden() && (await page.getAttribute('#v-architecture .ap-cat.on', 'id')) === 'apc-' + kind && page.url().endsWith('#architecture/' + kind), 'pattern chip opens the catalog at ' + kind);
  const ncat = await page.evaluate(() => window.__dts.DATA.pcatalog.length);
  ok(await page.locator('#v-architecture .ap-cat').count() === ncat && await page.locator('.tabs [data-view="architecture"][aria-pressed="true"]').count() === 1, 'Patterns view lists the whole catalog (' + ncat + ')');
  await page.click('#v-architecture [data-pfam="Resilience & reliability"]');
  const fams = await page.$$eval('#v-architecture .ysec', h => h.map(x => x.textContent));
  ok(fams.length === 1 && /resilience/i.test(fams[0]), 'family filter shows one family');
  await page.click('#v-architecture [data-pfam=""]');
  await page.click('#apc-' + kind + ' [data-patopen^="kafka/"]'); await page.waitForSelector('#reader #rs-apat .ap-panel:not([hidden]) svg');
  ok(/#pattern\/kafka\/\d$/.test(page.url()), 'a concept in the catalog opens its read at that pattern');
  await page.click('#reader [data-rclose]');
  if (shots) await page.screenshot({ path: shots + '/9-patterns.png' });
  // mobile
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '#explore'); await page.waitForSelector('.col .item');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 392, 'no horizontal page scroll on phone width (' + sw + ')');
  if (shots) await page.screenshot({ path: shots + '/5-mobile.png' });
  const sceneHashes = (await page.evaluate(() => (window.__dts.SCENES || []).some(s => s.id === 'sample-tcp-handshake'))) ? ['#animations', '#scene/sample-tcp-handshake', '#scene/sample-lru-eviction'] : [];
  for (const h of ['#design', '#algo/merge', '#algo/dijkstra', '#algo/btree', '#algo/raft', '#practice/list', '#design/url-shortener',
                   '#algo/monostack', '#algo/window2', '#algo/backtrack', '#algo/treedfs', '#algo/dp1d', '#algo/prefix', '#algo/segtree', '#algo/fastslow', '#algo/bsanswer', '#algo/mst', '#algo/dp2d', '#algo/sweep', '#algo/kmp', '#algo/topk', '#algo/sieve', '#patterns', '#practice/two-sum', '#architecture', '#pattern/kafka/1'].concat(sceneHashes)) {
    await page.goto(base + h); await page.waitForTimeout(350);
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('reader').hidden ? 0 : document.getElementById('reader').scrollWidth));
    ok(w <= 392, 'no horizontal page scroll on phone width at ' + h + ' (' + w + ')');
  }
  // touch: a horizontal swipe on a drawing steps it forward, a swipe the other way steps back
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const tp = await tctx.newPage(); tp.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await tp.goto(base + '#algo/merge'); await tp.waitForSelector('#av-stage');
  const swipe = (sel, dx) => tp.evaluate(([sel, dx]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(80, r.height / 2);
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(x)], changedTouches: [t(x)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(x + dx)] })); }, [sel, dx]);
  const k0 = await tp.textContent('.av-k'); await swipe('#av-stage', -120); await tp.waitForTimeout(150); const k1 = await tp.textContent('.av-k');
  await swipe('#av-stage', 120); await tp.waitForTimeout(150); const k2 = await tp.textContent('.av-k');
  ok(k1 !== k0 && k2 === k0, 'touch: swipe left steps a visualizer forward, swipe right steps back (' + [k0, k1, k2].join(' / ') + ')');
  await tctx.close();
  if (sceneHashes.length) {
    await page.goto(base + '#scene/sample-tcp-handshake'); await page.waitForSelector('#rs-watch .scene .sc-a');
    const z = page.locator('#rs-watch .scene .sc-zoom');
    const auto = (await z.getAttribute('aria-pressed')) === 'true';
    ok(await z.isVisible(), 'phone: zoom button offered for a small drawing' + (auto ? ' (it opens zoomed: the labels need the room)' : ''));
    if (!auto) { await z.click(); await page.waitForTimeout(200); }
    const minPx = await page.evaluate(() => { const svg = document.querySelector('#rs-watch .sc-stage svg'), a = svg.getScreenCTM().a; return Math.min(...[...svg.querySelectorAll('.sc-pill text, .sc-lt, .sc-gl')].filter(t => t.textContent.trim()).map(t => +t.getAttribute('font-size') * a)); });
    ok(minPx >= 9.9, 'phone: zoomed labels are at least 10 px (' + minPx.toFixed(1) + ')');
    const zw = await page.evaluate(() => { const b = document.querySelector('#rs-watch .sc-stage'); return [b.scrollWidth > b.clientWidth, document.documentElement.scrollWidth, document.getElementById('reader').scrollWidth]; });
    ok(zw[0] && zw[1] <= 392 && zw[2] <= 392, 'phone: zoomed drawing scrolls inside its frame, not the page (' + zw.join(',') + ')');
    await z.click(); await page.waitForTimeout(200);
    ok((await z.textContent()) === 'Zoom in' && await page.evaluate(() => { const b = document.querySelector('#rs-watch .sc-stage'); return b.scrollWidth <= b.clientWidth + 1; }), 'phone: Fit shows the whole drawing');
    await page.click('#rs-watch .scene [data-sc="next"]'); await page.waitForTimeout(100);
    ok((await page.textContent('#rs-watch .scene .sc-k')).trim() === 'step 2 of 7', 'phone: Next works');
    if (shots) await page.screenshot({ path: shots + '/8-scene-phone.png' });
  }
  await browser.close();
  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nall browser checks passed');
  process.exit(errors.length ? 1 : 0);
})();
