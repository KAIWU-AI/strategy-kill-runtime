/// <reference types="node" />
export interface RuntimeFile {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}
export interface RuntimeManifest {
  readonly version: 1;
  readonly entry: 'sandbox.html';
  readonly files: readonly RuntimeFile[];
}
export declare const runtimeManifest: RuntimeManifest;
/** Exact manifest paths only; verifies file type, size and SHA-256 on every read. */
export declare function readRuntimeAsset(path: string): Buffer;
