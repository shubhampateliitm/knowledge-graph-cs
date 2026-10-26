// Browser test for rich text (content/FORMAT.md, v9) and the compressed standalone page.
// Build the sample content first (it adds tests/fixtures/format_sample.txt and format_design.txt), then serve it:
//   DTS_FORMAT_FIXTURE=1 DTS_CONTENT_DB=/tmp/fmt.db DTS_DIST=/tmp/fmt.html python3 tools/build.py
//   DTS_CONTENT_DB=/tmp/fmt.db DTS_USER_DB=/tmp/fmt_user.db python3 server/server.py --port 8790 &
//   node tests/e2e_format.js http://localhost:8790/ /tmp/fmt.html [screenshot-dir]
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:8790/';
const standalone = process.argv[3] || null;
const shots = process.argv[4] || null;
const errors = [];
const ok = (c, m) => { if (!c) { errors.push('FAIL: ' + m); console.log('  ✗', m); } else console.log('  ✓', m); };

async function openPage(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, colorScheme: opts.scheme || 'light' });
  if (opts.clip) { try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin }); } catch (e) {} }
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_NAME|net::|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}
const openRead = async (page, hash) => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForSelector('#reader:not([hidden]) .rd-sec', { timeout: 20000 });
  await page.waitForTimeout(250);
};

(async () => {
  const browser = await chromium.launch();

  console.log('heuristics (web/rich.js in the page)');
  {
    const { ctx, page } = await openPage(browser, base);
    await page.waitForSelector('.col .item');
    const r = await page.evaluate(() => {
      const R = window.DTSRich, f = t => R.findFormulas(t).map(([a, b]) => t.slice(a, b)), q = t => R.findSQL(t).map(([a, b]) => t.slice(a, b));
      return {
        cap: f('The capacity is C = B log₂(1 + S/N) bits per second.'),
        bloom: f('so p = (1 − e^(−kn/m))^k for a full filter'),
        rec: f('Merge sort has T(n) = 2T(n/2) + O(n), so it is fast.'),
        bigo: f('Search costs O(log n) per lookup.'),
        neg: [f('It costs $0.023 per GB on 2026-10-20 with v1.2.3 and A/B testing.'), f('Kafka 3.7 = latest?'), f('y = x @ w runs at once'), f('the 4 x 8 grid at p99 < 200 ms'), f('a 64 B header = 512 bits'), f('n_jobs = 4 workers'), f('newest is n e w es t </w>')],
        sql: q('Take UPDATE accounts SET balance = balance - 10 WHERE id = 7, then updates id 9.'),
        sqlStop: q('The query SELECT * FROM orders WHERE customer_id = 42 matches 50 orders.'),
        sqlNeg: [q('SELECT has a fixed clause order'), q('a column alias defined in SELECT aliases, and why'), q('SELECT, UPDATE and DELETE and checks')],
        fmt: R.formatSQL("SELECT c.city, COUNT(*) AS n FROM orders o JOIN customers c ON o.cid = c.id WHERE o.amount > 1000 GROUP BY c.city ORDER BY n DESC LIMIT 5;"),
        plain: R.plain('Use `x` and \\( a^2 \\) and **bold**'),
      };
    });
    ok(r.cap[0] === 'C = B log₂(1 + S/N)', 'Shannon capacity formula found: ' + r.cap);
    ok(r.bloom[0] === 'p = (1 − e^(−kn/m))^k', 'Bloom filter formula found');
    ok(r.rec[0] === 'T(n) = 2T(n/2) + O(n)', 'recurrence found');
    ok(r.bigo[0] === 'O(log n)', 'big-O found');
    ok(r.neg.every(x => x.length === 0), 'no formula in prices, dates, versions, A/B, code, units, BPE tokens: ' + JSON.stringify(r.neg));
    ok(r.sql[0] === 'UPDATE accounts SET balance = balance - 10 WHERE id = 7', 'prose SQL ends at ", then": ' + r.sql[0]);
    ok(r.sqlStop[0] === 'SELECT * FROM orders WHERE customer_id = 42', 'prose SQL ends before "matches"');
    ok(r.sqlNeg.every(x => x.length === 0), 'SQL keywords used as words are not code: ' + JSON.stringify(r.sqlNeg));
    ok(r.fmt.split('\n').length === 7 && /^FROM orders o$/m.test(r.fmt) && /^JOIN customers c ON/m.test(r.fmt), 'long SQL is laid out one clause per line');
    ok(r.plain === 'Use x and  a^2  and bold', 'marks are stripped for plain text');
    await ctx.close();
  }

  console.log('reads: maths, code, callouts, steps (server mode, 1440 px)');
  {
    const { ctx, page } = await openPage(browser, base, { clip: true });
    await page.waitForSelector('.col .item');
    await openRead(page, '#read/infotheory');
    const m = await page.evaluate(() => {
      const how = document.getElementById('rs-how');
      const d = how.querySelector('.dmath math');
      return {
        inline: !!how.querySelector('.imath math'), display: !!d, displayMode: d && d.getAttribute('display'),
        msub: !!how.querySelector('.imath msub, .imath msubsup'), annot: !!how.querySelector('annotation'),
        fallback: (how.querySelector('code.tex') || {}).textContent || '',
        key: !!how.querySelector('.callout.co-key strong'), warn: !!how.querySelector('.callout.co-warn'),
        center: d ? getComputedStyle(d.parentElement).textAlign : '',
        font: d ? getComputedStyle(d).fontFamily : '',
      };
    });
    ok(m.inline && m.msub, 'inline \\( \\) maths renders as MathML (with a subscript)');
    ok(m.display && m.displayMode === 'block' && m.center === 'center', 'display \\[ \\] maths is a centred block');
    ok(m.annot, 'MathML keeps the LaTeX source as an annotation');
    ok(/frac/.test(m.fallback), 'a formula that does not parse falls back to its LaTeX source');
    ok(/STIX Two Math|Cambria Math|Latin Modern Math/.test(m.font), 'maths font stack: ' + m.font.slice(0, 60));
    ok(m.key && m.warn, 'Key idea and Warning callouts, with bold');
    const ex = await page.evaluate(() => {
      const e = document.getElementById('rs-example');
      const cb = e.querySelector('.codeblock[data-lang="python"]');
      return {
        cb: !!cb, label: cb && cb.querySelector('.cb-lang').textContent, kw: cb ? cb.querySelectorAll('.sx-k').length : 0,
        cmt: cb && (cb.querySelector('.sx-c') || {}).textContent, indent: cb && /\n {4}# bits/.test(cb.querySelector('code').textContent),
        steps: e.querySelectorAll('.ex-step .ex-n').length, stepSr: (e.querySelector('.ex-step .sr') || {}).textContent,
        fx: [...e.querySelectorAll('.fx')].map(x => x.textContent), price: [...e.querySelectorAll('.ex-step p')].map(p => p.textContent).find(t => /0\.023/.test(t)) || '',
        priceFx: [...e.querySelectorAll('.ex-step .fx')].some(x => /0\.023|2026/.test(x.textContent)),
        italic: e.querySelector('.fx i') ? getComputedStyle(e.querySelector('.fx i')).fontStyle : '',
      };
    });
    ok(ex.cb && ex.label === 'Python' && ex.kw >= 4, 'python block highlighted with a language label (' + ex.kw + ' keywords)');
    ok(ex.cmt === '# bits per symbol' && ex.indent, 'comments highlighted and indentation kept');
    ok(ex.steps === 2 && ex.stepSr === 'Step 1: ', 'Step N paragraphs get numbered markers (and "Step 1" for screen readers)');
    ok(ex.fx.some(t => t.replace(/\s/g, '') === 'T(n)=2T(n/2)+O(n)') && ex.italic === 'italic', 'un-marked formula gets the maths font with italic variables');
    ok(ex.price && !ex.priceFx, 'prices and dates stay as text');
    // copy button
    await page.click('#rs-example .codeblock .cb-copy');
    await page.waitForTimeout(200);
    const copied = await page.evaluate(async () => { const b = document.querySelector('#rs-example .cb-copy'); let clip = ''; try { clip = await navigator.clipboard.readText(); } catch (e) {} return [b.textContent, clip]; });
    ok(copied[0] === 'Copied' && (copied[1] === '' || /def entropy/.test(copied[1])), 'copy button copies the code: ' + copied[0]);
    if (shots) await page.screenshot({ path: shots + '/fmt-maths-1440.png' });

    await openRead(page, '#read/sql');
    const sq = await page.evaluate(() => {
      const e = document.getElementById('rs-example');
      const blocks = [...e.querySelectorAll('.codeblock[data-lang="sql"] code')].map(c => c.textContent);
      return {
        fenced: blocks.some(t => /^SELECT campaign_id/.test(t) && /-- per campaign/.test(t)),
        formatted: blocks.some(t => /^SELECT c\.city, COUNT\(\*\) AS n\nFROM orders o\nJOIN customers c ON o\.cid = c\.id\nWHERE/.test(t)),
        kw: e.querySelectorAll('.codeblock .sx-k').length, str: e.querySelectorAll('.codeblock .sx-s').length, fn: e.querySelectorAll('.codeblock .sx-f').length,
        inline: [...e.querySelectorAll('code.sql')].map(c => c.textContent).includes('SELECT * FROM t WHERE id = 7'),
        noPinP: !e.querySelector('p .codeblock, p pre'),
      };
    });
    ok(sq.fenced && sq.kw > 10 && sq.str >= 1 && sq.fn >= 2, 'fenced SQL highlighted: keywords, strings, functions, comments');
    ok(sq.formatted, 'a long SQL query in prose becomes a formatted block');
    ok(sq.inline, 'a short SQL query in prose stays inline, highlighted');
    ok(sq.noPinP, 'code blocks are never inside a paragraph');
    if (shots) await page.screenshot({ path: shots + '/fmt-sql-1440.png' });

    console.log('cards, terms, contents');
    await openRead(page, '#read/bloom');
    const c = await page.evaluate(() => ({
      mf: document.querySelectorAll('#rs-mistakes .mf').length, myth: (document.querySelector('#rs-mistakes .mf-myth p') || {}).textContent || '',
      fact: (document.querySelector('#rs-mistakes .mf-fact .mf-l') || {}).textContent,
      dc: document.querySelectorAll('#rs-tradeoffs .dc').length, opt: document.querySelectorAll('#rs-tradeoffs .dc-opts li strong').length,
      qa: document.querySelectorAll('#rs-interview .qa-card details').length, tag: (document.querySelector('#rs-interview .h2-tag') || {}).textContent,
      tm: document.querySelectorAll('.rd-wrap .tm').length, tmTerms: document.querySelectorAll('#rs-terms .tm').length,
      side: !!document.querySelector('.rd-side a') && getComputedStyle(document.querySelector('.rd-side')).display !== 'none',
    }));
    ok(c.mf >= 3 && /^People/.test(c.myth) && !/In fact/.test(c.myth) && c.fact === 'In fact', 'misunderstandings are myth → fact cards');
    ok(c.dc >= 3 && c.opt >= 3, 'trade-offs are decision cards with the options in bold');
    ok(c.qa >= 4 && c.tag === 'Staff level', 'interview questions are expandable cards with a staff-level cue');
    ok(c.tm >= 3 && c.tmTerms === 0, 'key terms are marked in the text (' + c.tm + '), not in the terms list');
    ok(c.side, 'sticky "On this page" contents on wide screens');
    await page.click('#rs-interview .qa-card summary');
    ok(await page.evaluate(() => document.querySelector('#rs-interview details').open), 'a question card opens on click');
    // tooltip on keyboard focus; Escape closes it and keeps the reader open
    await page.evaluate(() => document.querySelector('.rd-wrap .tm').focus());
    await page.waitForTimeout(100);
    const tip = await page.evaluate(() => { const t = document.getElementById('tm-tip'); const b = document.activeElement; return [t && !t.hidden, t && t.textContent, b.getAttribute('aria-describedby')]; });
    ok(tip[0] && tip[1].length > 10 && tip[2] === 'tm-tip', 'term definition shows on focus: ' + (tip[1] || '').slice(0, 50) + ' / ' + tip[2]);
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.getElementById('tm-tip').hidden && !document.getElementById('reader').hidden), 'Escape closes the definition, not the reader');
    await page.evaluate(() => document.getElementById('rs-tradeoffs').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => (document.querySelector('.rd-side a[aria-current]') || {}).dataset?.jump === 'rs-tradeoffs'), 'contents follow the section being read');
    if (shots) await page.screenshot({ path: shots + '/fmt-cards-1440.png' });

    console.log('design question');
    await openRead(page, '#design/fmt-sample');
    const d = await page.evaluate(() => ({
      json: !!document.querySelector('#rs-datamodel .codeblock[data-lang="json"] .sx-a'),
      fc: (document.querySelector('#rs-failures .fc-t') || {}).textContent,
      dc: (document.querySelector('#rs-tradeoffs .dc-t') || {}).textContent, opts: document.querySelectorAll('#rs-tradeoffs .dc-opts li').length,
      est: !!document.querySelector('#rs-estimates .imath math'), ri: (document.querySelector('#rs-estimates .ri') || {}).textContent,
      fu: !!document.querySelector('#rs-followups .qa-card code.sql'),
    }));
    ok(d.json, 'JSON block with highlighted keys in the data model');
    ok(d.fc === 'A broker fails', 'failure modes are cards headed by the failure');
    ok(d.dc === 'Batch versus streaming' && d.opts === 2, 'design trade-off is a decision card');
    ok(d.est && d.ri === 'Average load.', 'estimates: run-in head and inline maths');
    ok(d.fu, 'follow-up answers highlight SQL');
    await ctx.close();
  }

  console.log('phone (390 px), dark mode');
  {
    const { ctx, page } = await openPage(browser, base, { w: 390, h: 844, scheme: 'dark' });
    await page.waitForSelector('.col .item');
    for (const h of ['#read/infotheory', '#read/sql', '#read/bloom', '#design/fmt-sample']) {
      await openRead(page, h);
      const w = await page.evaluate(() => { const r = document.getElementById('reader'); return [r.scrollWidth, r.clientWidth, document.documentElement.scrollWidth]; });
      ok(w[0] <= w[1] + 1 && w[2] <= 391, `no horizontal page scroll on ${h} (${w.join('/')})`);
      if (shots) { await page.evaluate(() => (document.querySelector('.dmath, .codeblock, .mf') || document.body).scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); await page.screenshot({ path: `${shots}/fmt-390-dark-${h.split('/')[1]}.png` }); }
    }
    await openRead(page, '#read/infotheory');
    const s = await page.evaluate(() => { const d = document.querySelector('.dmath'); const k = document.querySelector('.codeblock .sx-k'); return [getComputedStyle(d).overflowX, d.scrollWidth <= document.getElementById('reader').clientWidth + 1 || getComputedStyle(d).overflowX === 'auto', getComputedStyle(k).color]; });
    ok(s[0] === 'auto' && s[1], 'display maths scrolls inside its own box on a phone');
    ok(s[2] !== 'rgb(75, 59, 184)', 'dark theme has its own code colours: ' + s[2]);
    const rc = await page.evaluate(async () => { document.getElementById('rs-example').scrollIntoView({ block: 'start' }); await new Promise(r => setTimeout(r, 200)); return document.getElementById('rcur').textContent; });
    ok(rc === 'A worked example', 'reader bar shows the current section on a phone: ' + rc);
    await ctx.close();
  }

  console.log('reduced motion');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); await page.goto(base); await page.waitForSelector('.col .item'); await openRead(page, '#read/bloom');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.qa-tg')).transitionDuration === '0s'), 'no transitions with reduced motion');
    await ctx.close();
  }

  if (standalone) {
    console.log('standalone page (compressed content)');
    const size = fs.statSync(standalone).size;
    const head = fs.readFileSync(standalone, 'utf8');
    ok(size < 12 * 1024 * 1024, `standalone file is ${(size / 1048576).toFixed(1)} MB (well under 16 MB)`);
    ok(/<script id="dts-data" type="application\/gzip-base64">H4sI/.test(head) && !/window\.DATA=\{/.test(head), 'content is embedded as gzip + base64');
    const url = 'file://' + require('path').resolve(standalone);
    for (const [name, init] of [['DecompressionStream', null], ['JS inflate fallback', () => { delete window.DecompressionStream; }]]) {
      const { ctx, page } = await openPage(browser, url + '#read/infotheory', { init });
      await page.waitForSelector('#reader:not([hidden]) .rd-sec', { timeout: 30000 });
      const r = await page.evaluate(() => ({ nodes: window.__dts && window.__dts.DATA.nodes.length, math: !!document.querySelector('#rs-how .dmath math'), code: !!document.querySelector('.codeblock .sx-k'), mode: document.getElementById('mode').textContent, ds: typeof window.DecompressionStream }));
      ok(r.nodes > 500 && r.math && r.code && r.mode === 'standalone', `standalone from file:// with ${name}: ${r.nodes} concepts, maths and code render (DecompressionStream: ${r.ds})`);
      if (shots && !init) await page.screenshot({ path: shots + '/fmt-standalone.png' });
      await ctx.close();
    }
  }

  await browser.close();
  if (errors.length) { console.log('\n' + errors.length + ' problem(s):\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('\nall rich-text checks passed');
})().catch(e => { console.error(e); process.exit(1); });
