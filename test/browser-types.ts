import { StrategyRuntimeController, type StrategyRuntimeConfig, type StrategyRuntimeEvent,
  type StrategyFailureReason, type StrategyRuntimeStatus } from '../browser.js';

declare const frame: HTMLIFrameElement;
declare const config: StrategyRuntimeConfig;
const ready: Extract<StrategyRuntimeEvent, { type: 'ready' }> = {
  channel: 'strategy-kill/v1', session: '0123456789abcdef0123456789abcdef', type: 'ready',
};
void ready;
const controller = new StrategyRuntimeController({
  frame, runtimeUrl: new URL('/runtime/sandbox.html', location.href),
  provideConfig: async (signal: AbortSignal) => { signal.throwIfAborted(); return config; },
  onEvent: (event: StrategyRuntimeEvent) => {
    switch (event.type) {
      case 'running': {
        const players: 3 | 4 | 5 | 6 = event.players;
        const roster: 31 = event.rosterCount;
        void players; void roster;
        break;
      }
      case 'finished': {
        const result: 'win' | 'loss' | 'draw' = event.result;
        void result;
        break;
      }
      case 'failed': {
        const code: 'INVALID_CONFIG' | 'BOOT_FAILED' | 'RUNTIME_FAILED' = event.code;
        void code;
        break;
      }
      case 'ready': case 'paused': case 'resumed':
        // @ts-expect-error Ready/pause acknowledgements do not expose game state.
        void event.players;
    }
  },
  onStatusChange: (status: StrategyRuntimeStatus) => { void status; },
  onFailure: (reason: StrategyFailureReason) => { void reason; },
});
controller.start(); controller.setPaused(true); controller.dispose();
// @ts-expect-error Pause cannot accept a string.
controller.setPaused('false');
// @ts-expect-error The status is readonly.
controller.status = 'running';
// @ts-expect-error The native approved setup does not accept unsupported counts.
const invalid: StrategyRuntimeConfig = { setup: { ...config.setup, playerCount: 7 } };
void invalid;
