export function createFakeStorageArea(initial = {}) {
  const data = structuredClone(initial);
  const writes = [];

  return {
    data,
    writes,
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(data);
      const list = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(values) {
      writes.push(structuredClone(values));
      Object.assign(data, structuredClone(values));
    },
  };
}
