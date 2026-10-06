import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { StrategyRuntimeController } from '../browser.js';

const approved = JSON.parse(readFileSync(new URL('../vendor/strategy-kill/runtime/approved-setup.json', import.meta.url)));
const config = () => ({ setup: structuredClone(approved), portraits: { H01: 'data:image/webp;base64,AA==' }, cardBack: 'data:image/png;base64,AA==' });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(t, overrides = {}) {
  const timers = new Map(), messages = [], events = [], statuses = [], failures = [];
  let now = 0, nextTimer = 0;
  const advance = milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.deadline <= now) { timers.delete(id); timer.fn(); }
  };
  const view = new EventTarget(), doc = new EventTarget();
  Object.assign(view, {
    location: new URL('https://host.example/game'), crypto: webcrypto,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay, deadline: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  Object.assign(doc, { defaultView: view, hidden: false });
  const attributes = new Map([['srcdoc', 'old host markup']]);
  const frame = {
    ownerDocument: doc, tagName: 'IFRAME', src: '', title: 'Host title', style: { width: '100%' },
    contentWindow: { postMessage: (message, origin) => messages.push({ ...message, targetOrigin: origin }) },
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
  };
  const options = {
    frame, runtimeUrl: 'https://host.example/runtime/sandbox.html', provideConfig: config,
    onEvent: event => events.push(event), onStatusChange: status => statuses.push(status),
    onFailure: reason => failures.push(reason), ...overrides,
  };
  const controller = new StrategyRuntimeController(options);
  t.after(() => controller.dispose());
  const session = () => new URL(frame.src).hash && new URLSearchParams(new URL(frame.src).hash.slice(1)).get('session');
  const emit = (type, extra = {}, envelope = {}) => {
    const event = new Event('message');
    Object.assign(event, {
      source: frame.contentWindow, origin: 'null',
      data: { channel: 'strategy-kill/v1', session: session(), type, ...extra }, ...envelope,
    });
    // Direct dispatch preserves thrown callback errors instead of EventTarget's asynchronous rethrow.
    for (const listener of listeners) listener(event);
  };
  const listeners = new Set(), visibility = new Set();
  view.addEventListener = (name, fn) => { if (name === 'message') listeners.add(fn); };
  view.removeEventListener = (name, fn) => { if (name === 'message') listeners.delete(fn); };
  doc.addEventListener = (name, fn) => { if (name === 'visibilitychange') visibility.add(fn); };
  doc.removeEventListener = (name, fn) => { if (name === 'visibilitychange') visibility.delete(fn); };
  return {
    controller, options, frame, doc, messages, timers, statuses, failures, events, attributes, listeners, visibility, session, emit,
    ready: async () => { emit('ready'); await flush(); },
    running: () => emit('running', { selectedCharacter: approved.selectedCharacter, players: approved.playerCount, rosterCount: 31 }),
    tick: () => advance(45_000), advance,
    hide: hidden => { doc.hidden = hidden; for (const listener of visibility) listener(); },
  };
}

test('independent browser entry retains root Node types and exports without dependencies', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, '0.2.0');
  assert.deepEqual(pkg.exports['.'], { types: './index.d.ts', default: './index.js' });
  assert.deepEqual(pkg.exports['./browser'], { types: './browser.d.ts', default: './browser.js' });
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) assert.deepEqual(pkg[key] ?? {}, {});
  assert.match(readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8'), /Buffer/);
  assert.doesNotMatch(readFileSync(new URL('../browser.js', import.meta.url), 'utf8'), /^import\s/m);
  assert.doesNotMatch(readFileSync(new URL('../browser.d.ts', import.meta.url), 'utf8'), /node|Buffer|React/);
});

test('start owns navigation/security only and is idempotent; ready is not running; configure once', async t => {
  let calls = 0;
  const f = fixture(t, { provideConfig: signal => { calls++; assert.equal(signal.aborted, false); return config(); } });
  assert.equal(f.controller.status, 'idle');
  f.controller.start(); const src = f.frame.src; f.controller.start();
  assert.equal(f.frame.src, src);
  assert.match(f.session(), /^[a-f0-9]{32}$/);
  assert.equal(new URLSearchParams(new URL(src).hash.slice(1)).get('parentOrigin'), 'https://host.example');
  assert.equal(f.attributes.get('sandbox'), 'allow-scripts');
  assert.equal(f.attributes.get('referrerpolicy'), 'no-referrer');
  assert.equal(f.attributes.has('srcdoc'), false);
  assert.equal(f.frame.title, 'Host title'); assert.deepEqual(f.frame.style, { width: '100%' });
  assert.equal([...f.timers.values()][0].delay, 45_000);
  await f.ready(); await f.ready();
  assert.equal(calls, 1);
  assert.equal(f.events.filter(event => event.type === 'ready').length, 1);
  assert.equal(f.controller.status, 'loading');
  assert.equal(f.timers.size, 1);
  assert.deepEqual(f.messages.map(message => message.type), ['configure', 'resume']);
  assert.ok(f.messages.every(message => message.targetOrigin === '*'));
  f.running();
  assert.equal(f.controller.status, 'running'); assert.equal(f.timers.size, 0);
  f.running(); assert.equal(f.events.filter(event => event.type === 'running').length, 1);
});

for (const [name, envelope, extra] of [
  ['forged source', { source: {} }, {}],
  ['host origin', { origin: 'https://host.example' }, {}],
  ['old session', {}, { session: 'f'.repeat(32) }],
  ['wrong channel', {}, { channel: 'strategy-kill/v2' }],
  ['extra field', {}, { secret: 'not allowed' }],
  ['missing type', { data: { channel: 'strategy-kill/v1' } }, {}],
  ['null payload', { data: null }, {}],
  ['array payload', { data: [] }, {}],
]) {
  test(`rejects ${name} before invoking provider`, async t => {
    let calls = 0;
    const f = fixture(t, { provideConfig: () => { calls++; return config(); } });
    f.controller.start(); f.emit('ready', extra, envelope); await flush();
    assert.equal(calls, 0); assert.deepEqual(f.events, []); assert.deepEqual(f.messages, []);
    assert.equal(f.controller.status, 'loading');
  });
}

for (const [name, extra] of [
  ['extra running field', { selectedCharacter: approved.selectedCharacter, players: 5, rosterCount: 31, extra: true }],
  ['wrong roster count', { selectedCharacter: approved.selectedCharacter, players: 5, rosterCount: 30 }],
  ['unsupported player count', { selectedCharacter: approved.selectedCharacter, players: 7, rosterCount: 31 }],
  ['long selected character', { selectedCharacter: 'x'.repeat(61), players: 5, rosterCount: 31 }],
  ['missing running field', { players: 5, rosterCount: 31 }],
]) {
  test(`ignores ${name} and keeps startup deadline`, async t => {
    const f = fixture(t); f.controller.start(); await f.ready(); f.emit('running', extra);
    assert.equal(f.controller.status, 'loading'); assert.equal(f.timers.size, 1);
    assert.deepEqual(f.failures, []);
  });
}

for (const extra of [{ selectedCharacter: 'guanyu' }, { players: 3 }]) {
  test(`fails configured running mismatch ${JSON.stringify(extra)}`, async t => {
    const f = fixture(t); f.controller.start(); await f.ready();
    f.emit('running', { selectedCharacter: approved.selectedCharacter, players: 5, rosterCount: 31, ...extra });
    assert.equal(f.controller.status, 'failed'); assert.deepEqual(f.failures, ['CONFIG_MISMATCH']);
    assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
  });
}

test('pause before ready and pre-running acknowledgements do not start the match', async t => {
  const f = fixture(t, { paused: true }); f.controller.setPaused(true); f.controller.start();
  f.emit('paused'); assert.equal(f.controller.status, 'loading');
  await f.ready(); assert.deepEqual(f.messages.map(message => message.type), ['configure', 'pause']);
  f.emit('paused'); assert.equal(f.controller.status, 'loading');
  f.emit('resumed'); assert.equal(f.controller.status, 'loading');
  assert.equal(f.timers.size, 1);
  f.tick(); assert.equal(f.controller.status, 'failed'); assert.deepEqual(f.failures, ['START_TIMEOUT']);
});

test('deadline is exactly 45s from start, not from ready or pre-running acknowledgements', async t => {
  const f = fixture(t); f.controller.start(); f.advance(30_000); await f.ready();
  f.emit('paused'); f.advance(14_999); f.emit('resumed');
  assert.equal(f.controller.status, 'loading'); assert.equal(f.timers.size, 1);
  f.advance(1); assert.equal(f.controller.status, 'failed'); assert.deepEqual(f.failures, ['START_TIMEOUT']);
});

test('status callbacks only observe transitions, so callback pause acknowledgements cannot loop', async t => {
  let f, pausedCalls = 0;
  f = fixture(t, { onStatusChange: status => {
    if (status === 'paused') { pausedCalls++; f.controller.setPaused(true); }
  } });
  f.controller.start(); await f.ready(); f.emit('paused'); f.emit('resumed');
  assert.equal(pausedCalls, 0);
  f.running(); f.emit('paused'); const sent = f.messages.length; f.emit('paused');
  assert.equal(pausedCalls, 1); assert.equal(f.messages.length, sent);
});

test('visibility and explicit host pause compose; running gets current pause rather than a captured value', async t => {
  const f = fixture(t); f.controller.start(); await f.ready(); f.running();
  f.hide(true); assert.equal(f.messages.at(-1).type, 'pause');
  f.controller.setPaused(true); f.hide(false); assert.equal(f.messages.at(-1).type, 'pause');
  f.controller.setPaused(false); assert.equal(f.messages.at(-1).type, 'resume');
  f.emit('paused'); assert.equal(f.controller.status, 'paused');
  f.emit('resumed'); assert.equal(f.controller.status, 'running');
});

for (const result of ['win', 'loss', 'draw']) {
  test(`finished ${result} is terminal and aborts provider signal`, async t => {
    let signal;
    const f = fixture(t, { provideConfig: s => { signal = s; return config(); } });
    f.controller.start(); await f.ready(); f.running(); f.emit('finished', { result });
    assert.equal(f.controller.status, 'finished'); assert.equal(signal.aborted, true);
    const before = f.messages.length, events = f.events.length;
    f.emit('paused'); f.emit('resumed'); f.running(); f.emit('failed', { code: 'RUNTIME_FAILED' });
    f.controller.setPaused(true); f.hide(true); f.tick();
    assert.equal(f.controller.status, 'finished'); assert.equal(f.events.length, events); assert.equal(f.messages.length, before);
    assert.equal(f.events.at(-1).result, result);
  });
}

for (const code of ['INVALID_CONFIG', 'BOOT_FAILED', 'RUNTIME_FAILED']) {
  test(`native ${code} reports exact typed event and fixed failure, then ignores late events`, t => {
    const f = fixture(t); f.controller.start(); f.emit('failed', { code });
    assert.equal(f.controller.status, 'failed'); assert.deepEqual(f.failures, [code]);
    assert.equal(f.events.at(-1).code, code);
    f.emit('ready'); f.tick(); assert.deepEqual(f.messages, []); assert.deepEqual(f.failures, [code]);
  });
}

test('invalid finished/failed values or extra fields cannot terminate a match', async t => {
  const f = fixture(t); f.controller.start(); await f.ready(); f.running();
  f.emit('finished', { result: 'unknown' }); f.emit('failed', { code: 'private exception' });
  f.emit('finished', { result: 'win', extra: true }); f.emit('paused', { extra: true });
  assert.equal(f.controller.status, 'running'); assert.deepEqual(f.failures, []);
});

test('dispose while provider awaits aborts, discards late result, removes listeners, and never unloads replacement', async t => {
  let resolve, signal;
  const f = fixture(t, { provideConfig: s => { signal = s; return new Promise(r => { resolve = r; }); } });
  f.controller.start(); f.emit('ready'); await flush(); const oldSession = f.session();
  f.controller.dispose(); assert.equal(signal.aborted, true); assert.equal(f.frame.src, 'about:blank');
  assert.equal(f.listeners.size, 0); assert.equal(f.visibility.size, 0); assert.equal(f.timers.size, 0);
  const replacement = new StrategyRuntimeController(f.options); replacement.start();
  t.after(() => replacement.dispose()); const newSrc = f.frame.src;
  assert.notEqual(f.session(), oldSession);
  resolve(config()); await flush(); f.controller.dispose();
  assert.equal(f.frame.src, newSrc); assert.deepEqual(f.messages, []);
  assert.throws(() => f.controller.start(), { message: 'CONTROLLER_DISPOSED' });
});

test('timeout aborts pending config; ready, paused and resumed cannot extend deadline', async t => {
  let signal, resolve;
  const f = fixture(t, { provideConfig: s => { signal = s; return new Promise(r => { resolve = r; }); } });
  f.controller.start(); f.emit('ready'); f.emit('paused'); f.emit('resumed'); f.tick();
  assert.equal(f.controller.status, 'failed'); assert.equal(signal.aborted, true);
  resolve(config()); await flush(); assert.deepEqual(f.messages, []); assert.deepEqual(f.failures, ['START_TIMEOUT']);
});

test('provider rejection is sanitized; invalid configuration is rejected without postMessage', async t => {
  const f = fixture(t, { provideConfig: () => Promise.reject(new Error('private payload')) });
  f.controller.start(); await f.ready();
  assert.deepEqual(f.failures, ['CONFIG_FAILED']); assert.deepEqual(f.messages, []);
});

for (const [name, mutate] of [
  ['unknown config field', c => { c.extra = true; }],
  ['missing setup', c => { delete c.setup; }],
  ['wrong count', c => { c.setup.playerCount = 2; }],
  ['short roster', c => { c.setup.characters.pop(); }],
  ['duplicate hero', c => { c.setup.characters[1] = c.setup.characters[0]; }],
  ['missing selected character', c => { c.setup.selectedCharacter = 'unknown'; }],
  ['bad character field', c => { c.setup.characters[0].hp = '4'; }],
  ['remote portrait', c => { c.portraits.H01 = 'https://example.test/image.webp'; }],
  ['unknown portrait hero', c => { c.portraits.other = c.portraits.H01; }],
  ['executable cardBack', c => { c.cardBack = 'data:image/svg+xml;base64,AA=='; }],
  ['uncloneable value', c => { c.setup.translations.function = () => {}; }],
]) {
  test(`invalid config: ${name}`, async t => {
    const f = fixture(t, { provideConfig: () => { const c = config(); mutate(c); return c; } });
    f.controller.start(); await f.ready();
    assert.deepEqual(f.failures, ['INVALID_CONFIG']); assert.deepEqual(f.messages, []);
  });
}

test('config is snapshotted so provider cannot mutate running confirmation after sending', async t => {
  const c = config(), f = fixture(t, { provideConfig: () => c });
  f.controller.start(); await f.ready(); c.setup.selectedCharacter = 'guanyu'; c.setup.playerCount = 3;
  f.running(); assert.equal(f.controller.status, 'running');
});

test('ready callback can dispose or pause synchronously before provider/configuration', async t => {
  let f = fixture(t, { onEvent: event => { if (event.type === 'ready') f.controller.dispose(); } });
  f.controller.start(); await f.ready(); assert.equal(f.controller.status, 'disposed'); assert.deepEqual(f.messages, []);
  f = fixture(t, { onEvent: event => { if (event.type === 'ready') f.controller.setPaused(true); } });
  f.controller.start(); await f.ready(); assert.equal(f.messages.at(-1).type, 'pause');
});

test('loading callback can dispose, and committed running callback can pause/dispose without later sends', async t => {
  let f = fixture(t, { onStatusChange: status => { if (status === 'loading') f.controller.dispose(); } });
  f.controller.start(); assert.equal(f.controller.status, 'disposed'); assert.equal(f.frame.src, 'about:blank');
  f = fixture(t, { onEvent: event => {
    if (event.type === 'running') {
      assert.equal(f.controller.status, 'running'); f.controller.setPaused(true); f.controller.dispose();
    }
  } });
  f.controller.start(); await f.ready(); f.running();
  assert.equal(f.controller.status, 'disposed'); assert.equal(f.messages.at(-1).type, 'pause');
});

for (const where of ['ready', 'running', 'finished', 'loading', 'failed']) {
  test(`callback exception in ${where} reports only CALLBACK_FAILED`, async t => {
    const f = fixture(t, {
      onEvent: event => { if (event.type === where) throw new Error('private event content'); },
      onStatusChange: status => { if (status === where) throw new Error('private status content'); },
    });
    f.controller.start();
    if (where === 'failed') f.emit('failed', { code: 'BOOT_FAILED' });
    else if (where !== 'loading') {
      await f.ready();
      if (where !== 'ready') { f.running(); if (where === 'finished') f.emit('finished', { result: 'win' }); }
    }
    assert.equal(f.controller.status, 'failed'); assert.deepEqual(f.failures, ['CALLBACK_FAILED']);
    assert.equal(f.timers.size, 0);
  });
}

test('failure callback exceptions do not recurse and escape only as sanitized Error', t => {
  let calls = 0;
  const f = fixture(t, { onFailure: () => { calls++; throw new Error('private details'); } });
  f.controller.start();
  assert.throws(() => f.emit('failed', { code: 'BOOT_FAILED' }), { message: 'CALLBACK_FAILED' });
  assert.equal(calls, 1); assert.equal(f.controller.status, 'failed'); assert.equal(f.timers.size, 0);
});

test('message failure callback throws are not swallowed inside send', async t => {
  let calls = 0;
  const f = fixture(t, { onFailure: () => { calls++; throw new Error('private data'); } });
  f.controller.start(); await f.ready(); f.frame.contentWindow = null;
  assert.throws(() => f.controller.setPaused(true), { message: 'CALLBACK_FAILED' });
  assert.equal(calls, 1); assert.equal(f.controller.status, 'failed');
});

test('callbacks that dispose before throwing still surface a sanitized error', t => {
  const f = fixture(t, { onEvent: () => { f.controller.dispose(); throw new Error('private data'); } });
  f.controller.start();
  assert.throws(() => f.emit('ready'), { message: 'CALLBACK_FAILED' });
  assert.equal(f.controller.status, 'disposed');
});

for (const callback of ['onStatusChange', 'onEvent']) {
  test(`${callback} can dispose during failure but its exception is still surfaced`, t => {
    const f = fixture(t, { [callback]: value => {
      if (value === 'failed' || value.type === 'failed') { f.controller.dispose(); throw new Error('private data'); }
    } });
    f.controller.start();
    assert.throws(() => f.emit('failed', { code: 'BOOT_FAILED' }), { message: 'CALLBACK_FAILED' });
    assert.equal(f.controller.status, 'disposed');
  });
}

test('abort listeners can dispose at finish without duplicate disposed callbacks or later events', async t => {
  let f;
  f = fixture(t, { provideConfig: signal => {
    signal.addEventListener('abort', () => f.controller.dispose(), { once: true }); return config();
  } });
  f.controller.start(); await f.ready(); f.running(); f.emit('finished', { result: 'win' });
  assert.equal(f.controller.status, 'disposed');
  assert.equal(f.statuses.filter(status => status === 'disposed').length, 1);
  assert.equal(f.events.some(event => event.type === 'finished'), false);
});

test('exclusive frame owner rejects competitors until disposal, including terminal states', async t => {
  const f = fixture(t); f.controller.start();
  const competitor = new StrategyRuntimeController(f.options); t.after(() => competitor.dispose());
  assert.throws(() => competitor.start(), { message: 'FRAME_IN_USE' });
  await f.ready(); f.running(); f.emit('finished', { result: 'win' });
  assert.throws(() => competitor.start(), { message: 'FRAME_IN_USE' });
  f.controller.dispose(); competitor.start(); const src = f.frame.src; f.controller.dispose();
  assert.equal(f.frame.src, src); assert.equal(competitor.status, 'loading');
});

test('disposed status callback may synchronously replace the controller without old navigation', t => {
  let replacement;
  const f = fixture(t, { onStatusChange: status => {
    if (status === 'disposed' && !replacement) {
      replacement = new StrategyRuntimeController({ ...f.options, onStatusChange: undefined }); replacement.start();
    }
  } });
  f.controller.start(); f.controller.dispose(); const src = f.frame.src; f.controller.dispose();
  assert.equal(f.frame.src, src); assert.equal(replacement.status, 'loading');
  t.after(() => replacement.dispose());
});

test('missing target and postMessage exceptions are fixed MESSAGE_FAILED', async t => {
  const f = fixture(t); f.controller.start(); await f.ready(); f.running();
  f.frame.contentWindow = null; f.controller.setPaused(true);
  assert.deepEqual(f.failures, ['MESSAGE_FAILED']);
  const g = fixture(t); g.controller.start(); await g.ready();
  g.frame.contentWindow.postMessage = () => { throw new Error('private data'); };
  g.controller.setPaused(true); assert.deepEqual(g.failures, ['MESSAGE_FAILED']);
});

for (const runtimeUrl of ['https://elsewhere.test/sandbox.html', 'file:///sandbox.html', '/runtime/engine.js', '/runtime/sandbox.html?x', '/runtime/sandbox.html#old', 'https://user:password@host.example/sandbox.html']) {
  test(`rejects unsafe runtime URL ${runtimeUrl}`, t => {
    const f = fixture(t);
    assert.throws(() => new StrategyRuntimeController({ ...f.options, runtimeUrl }), { message: 'INVALID_OPTIONS' });
  });
}

test('invalid pause/options and disposed status callback failures are sanitized', t => {
  const f = fixture(t);
  assert.throws(() => f.controller.setPaused('false'), { message: 'INVALID_PAUSED' });
  assert.throws(() => new StrategyRuntimeController({ ...f.options, paused: 1 }), { message: 'INVALID_OPTIONS' });
  const g = fixture(t, { onStatusChange: status => { if (status === 'disposed') throw new Error('private details'); } });
  g.controller.start(); assert.throws(() => g.controller.dispose(), { message: 'CALLBACK_FAILED' });
  assert.equal(g.controller.status, 'disposed'); assert.equal(g.frame.src, 'about:blank');
  g.controller.dispose();
});
