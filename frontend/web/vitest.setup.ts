/**
 * vitest global setup – polyfill localStorage for Node 22+/26 where the
 * built-in global is undefined unless --localstorage-file is provided.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      get length() { return store.size },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    },
    configurable: true,
    writable: true,
  })
}
