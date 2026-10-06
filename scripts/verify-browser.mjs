import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.ok(process.env.STRATEGY_BROWSER_TOOLS, 'Set STRATEGY_BROWSER_TOOLS to an existing package.json resolving playwright-core and typescript');
const tools = createRequire(resolve(process.env.STRATEGY_BROWSER_TOOLS));
const { chromium } = tools('playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(process.argv[2] || '.browser-evidence');
mkdirSync(evidence, { recursive: true });
const report = { node: process.version, tests: [], errors: [], externalRequests: [], types: false };
const temporary = mkdtempSync(join(tmpdir(), 'strategy-browser-types-'));
try {
  const tsconfig = join(temporary, 'tsconfig.json');
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, allowJs: true, checkJs: true, target: 'ES2022', module: 'NodeNext', lib: ['ES2022', 'DOM'], types: [] },
    files: [join(root, 'browser.js'), join(root, 'browser.d.ts'), join(root, 'test/browser-types.ts')],
  }));
  const typescriptPackage = tools.resolve('typescript/package.json');
  const typescript = JSON.parse(readFileSync(typescriptPackage));
  const tsc = resolve(dirname(typescriptPackage), typescript.bin.tsc);
  execFileSync(process.execPath, [tsc, '-p', tsconfig], { encoding: 'utf8', stdio: 'inherit' });
  report.types = true;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
const approved = JSON.parse(readFileSync(join(root, 'vendor/strategy-kill/runtime/approved-setup.json')));
const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Browser API contract</title><script type="importmap">{"imports":{"@kaiwu-ai/strategy-kill-runtime/browser":"/browser.js"}}</script>`);
  } else if (req.url === '/browser.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(readFileSync(join(root, 'browser.js')));
  } else if (req.url === '/fixture/sandbox.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Opaque protocol fixture</title><script>
      const hash=new URLSearchParams(location.hash.slice(1)),session=hash.get('session');
      window.commands=[];
      window.emit=(type,extra={})=>parent.postMessage({channel:'strategy-kill/v1',session,type,...extra},hash.get('parentOrigin'));
      addEventListener('message',event=>{if(event.source===parent)window.commands.push(event.data)});
    </script>`);
  } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin)) report.externalRequests.push(request.url()); });
  await page.goto(origin);
  report.tests = await page.evaluate(async approved => {
    const { StrategyRuntimeController } = await import('@kaiwu-ai/strategy-kill-runtime/browser');
    const tests = [], check = (condition, name) => { if (!condition) throw new Error(name); tests.push(name); };
    const wait = () => new Promise(resolve => setTimeout(resolve, 30));
    const config = () => ({ setup: structuredClone(approved) });
    let events = [], statuses = [], failures = [], calls = 0, signal;
    const frame = document.createElement('iframe'); frame.title = 'Host keeps title'; frame.style.width = '900px';
    document.body.append(frame);
    let controller = new StrategyRuntimeController({
      frame, runtimeUrl: '/fixture/sandbox.html',
      provideConfig: s => { signal = s; calls++; return config(); },
      onEvent: event => events.push(event), onStatusChange: status => statuses.push(status), onFailure: reason => failures.push(reason),
    });
    controller.start();
    await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    const session = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('session');
    const inject = (type, extra = {}, source = frame.contentWindow, origin = 'null') => {
      window.dispatchEvent(new MessageEvent('message', { source, origin, data: { channel: 'strategy-kill/v1', session, type, ...extra } }));
    };
    inject('ready', {}, window); inject('ready', {}, frame.contentWindow, location.origin);
    inject('ready', { session: 'f'.repeat(32) }); inject('ready', { extra: true });
    await wait(); check(calls === 0, 'forged source/origin/session/extra fields rejected in browser');
    check(frame.sandbox.value === 'allow-scripts' && frame.referrerPolicy === 'no-referrer'
      && frame.title === 'Host keeps title' && frame.style.width === '900px', 'host DOM preserved and opaque sandbox enforced');
    inject('ready'); inject('ready'); await wait();
    check(calls === 1 && events.filter(e => e.type === 'ready').length === 1, 'ready and provider exactly once');
    check(controller.status === 'loading', 'ready is not running');
    controller.setPaused(true); await wait();
    inject('paused'); inject('resumed');
    check(controller.status === 'loading', 'pre-running acknowledgements do not start match');
    inject('running', { selectedCharacter: approved.selectedCharacter, players: approved.playerCount, rosterCount: 31 });
    check(controller.status === 'running', 'configured running confirmation');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange')); controller.setPaused(false);
    inject('paused'); check(controller.status === 'paused', 'browser visibility blocks explicit resume');
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    inject('resumed'); check(controller.status === 'running', 'visible resume acknowledgement');
    inject('finished', { result: 'draw' }); inject('paused'); inject('resumed');
    check(controller.status === 'finished' && signal.aborted, 'finished is terminal and aborts');
    const competing = new StrategyRuntimeController({ frame, runtimeUrl: '/fixture/sandbox.html', provideConfig: config });
    let rejected = false; try { competing.start(); } catch (e) { rejected = e.message === 'FRAME_IN_USE'; }
    check(rejected, 'competing frame ownership rejected');
    controller.dispose(); competing.start(); const replacement = frame.src; controller.dispose();
    check(frame.src === replacement && competing.status === 'loading', 'double disposal cannot unload replacement');
    competing.dispose();
    let resolveConfig;
    controller = new StrategyRuntimeController({
      frame, runtimeUrl: '/fixture/sandbox.html',
      provideConfig: s => { signal = s; return new Promise(resolve => { resolveConfig = resolve; }); },
    });
    controller.start();
    const newSession = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('session');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel: 'strategy-kill/v1', session: newSession, type: 'ready' } }));
    controller.dispose(); resolveConfig(config()); await wait();
    check(controller.status === 'disposed' && signal.aborted && frame.src === 'about:blank', 'awaiting config disposed and late result discarded');
    const realSetTimeout = window.setTimeout, realClearTimeout = window.clearTimeout;
    let deadline;
    window.setTimeout = (callback, delay, ...args) => delay === 45_000 ? (deadline = callback, 987654321) : realSetTimeout(callback, delay, ...args);
    window.clearTimeout = id => { if (id !== 987654321) realClearTimeout(id); };
    try {
      controller = new StrategyRuntimeController({ frame, runtimeUrl: '/fixture/sandbox.html', provideConfig: config, onFailure: reason => failures.push(reason) });
      controller.start(); deadline();
      check(controller.status === 'failed' && failures.at(-1) === 'START_TIMEOUT', 'real browser controller with controllable 45s deadline');
      controller.dispose();
    } finally { window.setTimeout = realSetTimeout; window.clearTimeout = realClearTimeout; }
    frame.remove();
    return tests;
  }, approved);
  // Exercise actual opaque postMessage, not only dispatched MessageEvent fixtures.
  const opaqueNavigation = page.waitForEvent('framenavigated', { predicate: frame => frame.url().includes('/fixture/sandbox.html') });
  await page.evaluate(approved => {
    window.actual = { events: [], calls: 0, failures: [] };
    window.actualFrame = document.createElement('iframe'); document.body.append(window.actualFrame);
    return import('@kaiwu-ai/strategy-kill-runtime/browser').then(({ StrategyRuntimeController }) => {
      window.actual.controller = new StrategyRuntimeController({
        frame: window.actualFrame, runtimeUrl: '/fixture/sandbox.html',
        provideConfig: () => { window.actual.calls++; return { setup: approved }; },
        onEvent: event => window.actual.events.push(event),
        onFailure: reason => window.actual.failures.push(reason),
      });
      window.actual.controller.start();
    });
  }, approved);
  const opaque = await opaqueNavigation;
  await opaque.waitForFunction(() => typeof window.emit === 'function');
  await opaque.evaluate(() => { window.emit('ready'); window.emit('ready'); });
  await opaque.waitForFunction(() => window.commands.some(command => command.type === 'configure'));
  assert.deepEqual(await opaque.evaluate(() => window.commands.map(command => command.type)), ['configure', 'resume']);
  await opaque.evaluate(approved => window.emit('running', { selectedCharacter: approved.selectedCharacter, players: approved.playerCount, rosterCount: 31 }), approved);
  await page.waitForFunction(() => window.actual.controller.status === 'running');
  assert.equal(await page.evaluate(() => window.actual.calls), 1);
  assert.equal(await opaque.evaluate(() => location.origin), origin); // Event origin is nevertheless opaque "null".
  assert.deepEqual(await page.evaluate(() => window.actual.failures), []);
  await page.evaluate(() => window.actual.controller.dispose());
  report.tests.push('actual opaque iframe postMessage accepts one configure and confirmed running');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.browser = browser.version();
  console.log(JSON.stringify({ types: report.types, browser: report.browser, tests: report.tests.length, errors: report.errors }, null, 2));
} finally {
  writeFileSync(join(evidence, 'browser-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
