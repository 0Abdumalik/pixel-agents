import { isBrowserRuntime } from './runtime';
import { send } from './wsClient';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? { postMessage: (msg: unknown) => send(msg) }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
