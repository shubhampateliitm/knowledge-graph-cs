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
  await page.click('#reader [data-markread]'); await page.waitForTimeout(150);
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
  ok((await page.$$('#reader .quiz details')).length === 5, 'five self-check questions');
  await page.click('#reader .quiz summary'); ok(await page.isVisible('#reader .quiz details[open] p'), 'answer opens');
  await page.click('[data-markread="bloom"]'); await page.waitForTimeout(300);
  await page.click('[data-rclose]').catch(()=>{}); await page.click('[data-view="you"]'); await page.waitForSelector('#review');
  ok(/due today/.test(await page.textContent('#review')), 'marking a deep read as read fills the review deck');
  await page.click('[data-revstart]'); await page.waitForSelector('[data-revshow]');
  await page.click('[data-revshow]'); await page.waitForSelector('.rev-ans');
  await page.click('[data-revgrade="1"]'); await page.waitForTimeout(200);
  ok(/4 left/.test(await page.textContent('#review')), 'grading moves to the next question');
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
  // mobile
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '#explore'); await page.waitForSelector('.col .item');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 392, 'no horizontal page scroll on phone width (' + sw + ')');
  if (shots) await page.screenshot({ path: shots + '/5-mobile.png' });
  for (const h of ['#design', '#algo/merge', '#algo/dijkstra', '#practice/list', '#design/url-shortener']) {
    await page.goto(base + h); await page.waitForTimeout(350);
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('reader').hidden ? 0 : document.getElementById('reader').scrollWidth));
    ok(w <= 392, 'no horizontal page scroll on phone width at ' + h + ' (' + w + ')');
  }
  await browser.close();
  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nall browser checks passed');
  process.exit(errors.length ? 1 : 0);
})();
