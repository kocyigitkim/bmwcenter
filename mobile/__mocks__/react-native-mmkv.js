// In-memory stand-in for the native MMKV module so unit tests can import modules that
// reach settings storage without pulling in Nitro/JSI native bindings.
function createMMKV() {
  const store = new Map();
  return {
    set: (key, value) => store.set(key, value),
    getString: (key) => (store.has(key) ? String(store.get(key)) : undefined),
    getNumber: (key) => (store.has(key) ? Number(store.get(key)) : undefined),
    getBoolean: (key) => (store.has(key) ? Boolean(store.get(key)) : undefined),
    contains: (key) => store.has(key),
    delete: (key) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    clearAll: () => store.clear(),
    addOnValueChangedListener: () => ({ remove: () => {} }),
  };
}

module.exports = { createMMKV, deleteMMKV: () => {}, existsMMKV: () => false };
