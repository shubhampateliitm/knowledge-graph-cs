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
  // reduced motion in a visualizer: a live action jumps to its first step and does not play
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const vp = await vctx.newPage(); vp.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await vp.goto(base + '#algo/btree'); await vp.waitForSelector('#av-stage svg.av-bt');
  await vp.fill('[data-alin="key"]', '42'); await vp.press('[data-alin="key"]', 'Enter');
  ok(/^insert 42: start at the root/.test(await vp.textContent('#av-msg')) && (await vp.getAttribute('[data-aact="play"]', 'aria-pressed')) === 'false', 'reduced motion: Insert (Enter) jumps to the new key without playing');
  await vctx.close();
  // mobile
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '#explore'); await page.waitForSelector('.col .item');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 392, 'no horizontal page scroll on phone width (' + sw + ')');
  if (shots) await page.screenshot({ path: shots + '/5-mobile.png' });
  const sceneHashes = (await page.evaluate(() => (window.__dts.SCENES || []).some(s => s.id === 'sample-tcp-handshake'))) ? ['#animations', '#scene/sample-tcp-handshake', '#scene/sample-lru-eviction'] : [];
  for (const h of ['#design', '#algo/merge', '#algo/dijkstra', '#algo/btree', '#algo/raft', '#practice/list', '#design/url-shortener'].concat(sceneHashes)) {
    await page.goto(base + h); await page.waitForTimeout(350);
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('reader').hidden ? 0 : document.getElementById('reader').scrollWidth));
    ok(w <= 392, 'no horizontal page scroll on phone width at ' + h + ' (' + w + ')');
  }
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
