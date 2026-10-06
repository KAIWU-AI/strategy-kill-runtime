// @ts-check
/** @typedef {import('./browser.d.ts').StrategyRuntimeOptions} Options */
/** @typedef {import('./browser.d.ts').StrategyRuntimeEvent} RuntimeEvent */
/** @typedef {import('./browser.d.ts').StrategyRuntimeStatus} Status */
/** @typedef {import('./browser.d.ts').StrategyFailureReason} Failure */

const channel = 'strategy-kill/v1';
/** @type {WeakMap<HTMLIFrameElement, StrategyRuntimeController>} */
const owners = new WeakMap();
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @param {string[]} required @param {string[]} [optional] @returns {value is Record<string, unknown>} */
const fields = (value, required, optional = []) => record(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
/** @param {unknown} value @returns {value is string} */
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 60;
/** @param {unknown} value @returns {value is 3 | 4 | 5 | 6} */
const players = value => value === 3 || value === 4 || value === 5 || value === 6;
/** @param {unknown} value @returns {value is string} */
const raster = value => typeof value === 'string' && value.length <= 3_000_000
  && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

/** @param {unknown} data @param {string} session @returns {data is RuntimeEvent} */
function validEvent(data, session) {
  if (!record(data) || data.channel !== channel || data.session !== session) return false;
  const envelope = ['channel', 'session', 'type'];
  switch (data.type) {
    case 'ready': case 'paused': case 'resumed': return fields(data, envelope);
    case 'running': return fields(data, [...envelope, 'selectedCharacter', 'players', 'rosterCount'])
      && typeof data.selectedCharacter === 'string' && data.selectedCharacter.length <= 60
      && players(data.players) && data.rosterCount === 31;
    case 'finished': return fields(data, [...envelope, 'result'])
      && typeof data.result === 'string' && ['win', 'loss', 'draw'].includes(data.result);
    case 'failed': return fields(data, [...envelope, 'code'])
      && typeof data.code === 'string' && ['INVALID_CONFIG', 'BOOT_FAILED', 'RUNTIME_FAILED'].includes(data.code);
    default: return false;
  }
}

/** @param {unknown} config @returns {config is import('./browser.d.ts').StrategyRuntimeConfig} */
function validConfig(config) {
  if (!fields(config, ['setup'], ['portraits', 'cardBack'])) return false;
  const setup = config.setup;
  if (!fields(setup, ['selectedCharacter', 'playerCount', 'characters', 'translations'])
    || !text(setup.selectedCharacter) || !players(setup.playerCount)
    || !Array.isArray(setup.characters) || setup.characters.length !== 31 || !record(setup.translations)) return false;
  const ids = new Set(), heroes = new Set();
  for (const character of setup.characters) {
    if (!fields(character, ['heroId', 'id', 'name', 'group', 'sex', 'hp', 'skills'])
      || !text(character.heroId) || !text(character.id) || !text(character.name) || !text(character.group)
      || typeof character.sex !== 'string' || !['male', 'female'].includes(character.sex)
      || typeof character.hp !== 'number' || !Number.isInteger(character.hp) || character.hp <= 0
      || !Array.isArray(character.skills) || !character.skills.every(text)
      || ids.has(character.id) || heroes.has(character.heroId)) return false;
    ids.add(character.id); heroes.add(character.heroId);
  }
  return ids.has(setup.selectedCharacter) && Object.values(setup.translations).every(value => typeof value === 'string')
    && (config.portraits === undefined || (record(config.portraits)
      && Object.entries(config.portraits).every(([key, value]) => heroes.has(key) && raster(value))))
    && (config.cardBack === undefined || raster(config.cardBack));
}

export class StrategyRuntimeController {
  /** @type {Options} */ #options;
  /** @type {Window} */ #window;
  /** @type {Document} */ #document;
  /** @type {URL} */ #url;
  /** @type {Status} */ #status = 'idle';
  #session = '';
  #paused;
  #started = false;
  #ready = false;
  #configured = false;
  /** @type {import('./browser.d.ts').StrategySetup | undefined} */ #setup;
  /** @type {AbortController | undefined} */ #abort;
  /** @type {number | undefined} */ #timer;

  /** @param {Options} options */
  constructor(options) {
    const view = options?.frame?.ownerDocument?.defaultView;
    if (!view || options.frame.tagName !== 'IFRAME' || typeof options.provideConfig !== 'function'
      || (options.paused !== undefined && typeof options.paused !== 'boolean')
      || ['onEvent', 'onStatusChange', 'onFailure'].some(key => {
        const value = Reflect.get(options, key);
        return value !== undefined && typeof value !== 'function';
      })) throw new TypeError('INVALID_OPTIONS');
    let url;
    try { url = new URL(options.runtimeUrl, view.location.href); } catch { throw new TypeError('INVALID_OPTIONS'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== view.location.origin
      || !url.pathname.endsWith('/sandbox.html') || url.username || url.password || url.search || url.hash) {
      throw new TypeError('INVALID_OPTIONS');
    }
    this.#options = { ...options };
    this.#window = view;
    this.#document = options.frame.ownerDocument;
    this.#url = url;
    this.#paused = options.paused ?? false;
  }

  get status() { return this.#status; }

  start() {
    if (this.#status === 'disposed') throw new Error('CONTROLLER_DISPOSED');
    if (this.#status !== 'idle') return;
    const frame = this.#options.frame;
    if (owners.has(frame)) throw new Error('FRAME_IN_USE');
    owners.set(frame, this);
    this.#abort = new AbortController();
    this.#status = 'loading';
    this.#window.addEventListener('message', this.#receive);
    this.#document.addEventListener('visibilitychange', this.#activity);
    this.#timer = this.#window.setTimeout(() => this.#fail('START_TIMEOUT'), 45_000);
    if (!this.#notify(() => this.#options.onStatusChange?.('loading'))) return;
    try {
      this.#session = Array.from(this.#window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      const url = new URL(this.#url);
      url.hash = new URLSearchParams({ session: this.#session, parentOrigin: this.#window.location.origin }).toString();
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.removeAttribute('srcdoc');
      frame.src = url.href;
    } catch { this.#fail('START_FAILED'); }
  }

  /** @param {boolean} paused */
  setPaused(paused) {
    if (typeof paused !== 'boolean') throw new TypeError('INVALID_PAUSED');
    this.#paused = paused;
    this.#activity();
  }

  dispose() {
    if (this.#status === 'disposed') return;
    this.#status = 'disposed';
    this.#stop();
    const frame = this.#options.frame;
    if (owners.get(frame) === this) {
      owners.delete(frame);
      frame.src = 'about:blank';
    }
    try { this.#options.onStatusChange?.('disposed'); } catch { throw new Error('CALLBACK_FAILED'); }
  }

  #active() { return !['idle', 'finished', 'failed', 'disposed'].includes(this.#status); }
  #disposed() { return this.#status === 'disposed'; }
  #undeliverable() { return this.#status === 'disposed' || this.#status === 'failed'; }

  #stop() {
    this.#window.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#abort?.abort();
    this.#window.removeEventListener('message', this.#receive);
    this.#document.removeEventListener('visibilitychange', this.#activity);
  }

  /** @param {() => void} callback */
  #notify(callback) {
    try { callback(); } catch {
      if (this.#status === 'disposed' || this.#status === 'failed') throw new Error('CALLBACK_FAILED');
      this.#fail('CALLBACK_FAILED'); return false;
    }
    return this.#active();
  }

  /** @param {Failure} reason @param {RuntimeEvent} [event] */
  #fail(reason, event) {
    if (this.#status === 'disposed' || this.#status === 'failed') return;
    this.#status = 'failed';
    this.#stop();
    if (this.#disposed()) return;
    try { this.#options.onStatusChange?.('failed'); } catch {
      if (this.#disposed()) throw new Error('CALLBACK_FAILED');
      reason = 'CALLBACK_FAILED';
    }
    if (this.#disposed()) return;
    try { if (event) this.#options.onEvent?.(event); } catch {
      if (this.#disposed()) throw new Error('CALLBACK_FAILED');
      reason = 'CALLBACK_FAILED';
    }
    if (this.#disposed()) return;
    try { this.#options.onFailure?.(reason); } catch { throw new Error('CALLBACK_FAILED'); }
  }

  /** @param {Record<string, unknown>} payload */
  #send(payload) {
    const target = this.#options.frame.contentWindow;
    if (!target) { this.#fail('MESSAGE_FAILED'); return false; }
    try {
      target.postMessage({ channel, session: this.#session, ...payload }, '*');
      return true;
    } catch { this.#fail('MESSAGE_FAILED'); return false; }
  }

  #activity = () => {
    if (this.#configured && this.#active()) this.#send({ type: this.#paused || this.#document.hidden ? 'pause' : 'resume' });
  };

  async #configure() {
    let config;
    try { config = await this.#options.provideConfig(/** @type {AbortController} */ (this.#abort).signal); }
    catch { if (this.#active()) this.#fail('CONFIG_FAILED'); return; }
    if (!this.#active()) return;
    try { config = structuredClone(config); } catch { this.#fail('INVALID_CONFIG'); return; }
    if (!this.#active()) return;
    if (!validConfig(config)) { this.#fail('INVALID_CONFIG'); return; }
    this.#setup = config.setup;
    this.#configured = true;
    if (this.#send({ type: 'configure', ...config }) && this.#active()) this.#activity();
  }

  /** @param {MessageEvent<unknown>} event */
  #receive = event => {
    if (!this.#active() || event.source !== this.#options.frame.contentWindow || event.origin !== 'null'
      || !validEvent(event.data, this.#session)) return;
    const message = Object.freeze(event.data);
    if (message.type === 'ready') {
      if (this.#ready) return;
      this.#ready = true;
      if (this.#notify(() => this.#options.onEvent?.(message))) void this.#configure();
      return;
    }
    if (message.type === 'failed') { this.#fail(message.code, message); return; }
    if (!this.#configured) return;
    const previous = this.#status;
    if (message.type === 'running') {
      if (message.selectedCharacter !== this.#setup?.selectedCharacter || message.players !== this.#setup.playerCount) {
        this.#fail('CONFIG_MISMATCH'); return;
      }
      if (this.#started) return;
      this.#started = true;
      this.#window.clearTimeout(this.#timer);
      this.#timer = undefined;
      this.#status = 'running';
    } else if (message.type === 'finished') {
      this.#status = 'finished';
      this.#stop();
    } else {
      this.#status = this.#started ? (message.type === 'paused' ? 'paused' : 'running') : 'loading';
    }
    if (this.#undeliverable()) return;
    const status = this.#status;
    if (status !== previous) this.#notify(() => this.#options.onStatusChange?.(status));
    if (this.#undeliverable()) return;
    this.#notify(() => this.#options.onEvent?.(message));
    if (message.type === 'running') this.#activity();
  };
}
