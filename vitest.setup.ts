const globalWithTestShims = globalThis as typeof globalThis & Record<string, unknown>;

globalWithTestShims.__DEV__ = false;

if (typeof globalThis.self === "undefined") {
  globalWithTestShims.self = globalThis;
}
