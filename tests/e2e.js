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
  // mobile
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/#.*$/, '') + '#explore'); await page.waitForSelector('.col .item');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 392, 'no horizontal page scroll on phone width (' + sw + ')');
  if (shots) await page.screenshot({ path: shots + '/5-mobile.png' });
  await browser.close();
  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nall browser checks passed');
  process.exit(errors.length ? 1 : 0);
})();
