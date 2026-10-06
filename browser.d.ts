export type StrategyPlayerCount = 3 | 4 | 5 | 6;
export interface StrategyCharacter {
  readonly heroId: string;
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly sex: 'male' | 'female';
  readonly hp: number;
  readonly skills: readonly string[];
}
/** Must match the runtime's approved-setup.json; the native adapter validates it independently. */
export interface StrategySetup {
  readonly selectedCharacter: string;
  readonly playerCount: StrategyPlayerCount;
  readonly characters: readonly StrategyCharacter[];
  readonly translations: Readonly<Record<string, string>>;
}
export interface StrategyRuntimeConfig {
  readonly setup: StrategySetup;
  /** Approved heroId keys and raster data URLs only. No remote URLs. */
  readonly portraits?: Readonly<Record<string, string>>;
  readonly cardBack?: string;
}
export type StrategyRuntimeCode = 'INVALID_CONFIG' | 'BOOT_FAILED' | 'RUNTIME_FAILED';
export type StrategyFailureReason = StrategyRuntimeCode | 'CONFIG_FAILED' | 'CONFIG_MISMATCH'
  | 'START_TIMEOUT' | 'START_FAILED' | 'MESSAGE_FAILED' | 'CALLBACK_FAILED';
export type StrategyRuntimeStatus = 'idle' | 'loading' | 'running' | 'paused' | 'finished' | 'failed' | 'disposed';
export type StrategyResult = 'win' | 'loss' | 'draw';
export interface StrategyEventEnvelope {
  readonly channel: 'strategy-kill/v1';
  readonly session: string;
}
export type StrategyRuntimeEvent = StrategyEventEnvelope & (
  | { readonly type: 'ready' }
  | { readonly type: 'paused' }
  | { readonly type: 'resumed' }
  | { readonly type: 'running'; readonly selectedCharacter: string; readonly players: StrategyPlayerCount; readonly rosterCount: 31 }
  | { readonly type: 'finished'; readonly result: StrategyResult }
  | { readonly type: 'failed'; readonly code: StrategyRuntimeCode }
);
export interface StrategyRuntimeOptions {
  readonly frame: HTMLIFrameElement;
  /** Same-origin HTTP(S) URL ending in /sandbox.html, without query, fragment, or credentials. */
  readonly runtimeUrl: string | URL;
  /** Called once after ready. Honor signal; late results are discarded even if you ignore it. */
  readonly provideConfig: (signal: AbortSignal) => StrategyRuntimeConfig | Promise<StrategyRuntimeConfig>;
  readonly paused?: boolean;
  readonly onEvent?: (event: StrategyRuntimeEvent) => void;
  readonly onStatusChange?: (status: StrategyRuntimeStatus) => void;
  readonly onFailure?: (reason: StrategyFailureReason) => void;
}
export declare class StrategyRuntimeController {
  constructor(options: StrategyRuntimeOptions);
  readonly status: StrategyRuntimeStatus;
  /** Idempotent; throws FRAME_IN_USE or CONTROLLER_DISPOSED for lifecycle misuse. */
  start(): void;
  /** Host pause OR document.hidden; does not override native help/finished/inherited pause. */
  setPaused(paused: boolean): void;
  /** Idempotent. Aborts work, removes listeners/timer, releases and unloads only its own frame. */
  dispose(): void;
}
