// Minimal Node typings for vite.config.ts (keeps package.json unchanged).
declare module 'node:child_process' {
  export interface ChildProcess {
    stdout: { on(event: 'data', cb: (chunk: Uint8Array) => void): void };
    stderr: { on(event: 'data', cb: (chunk: Uint8Array) => void): void };
    on(event: 'error', cb: (err: Error) => void): void;
    on(event: 'close', cb: (code: number | null) => void): void;
  }
  export function spawn(command: string, args?: string[]): ChildProcess;
}

declare const Buffer: {
  concat(chunks: Uint8Array[]): Uint8Array;
};
