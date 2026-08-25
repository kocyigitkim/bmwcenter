import { Buffer } from "buffer";

const globalScope = globalThis as unknown as { Buffer?: typeof Buffer };
if (typeof globalScope.Buffer === "undefined") {
  globalScope.Buffer = Buffer;
}
