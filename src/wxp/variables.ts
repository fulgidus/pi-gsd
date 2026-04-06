import type { WxpVariable } from "./schema.js";

export interface VariableStore {
  set(name: string, value: string, owner?: string): void;
  get(name: string): string | undefined;
  has(name: string): boolean;
  entries(): IterableIterator<[string, WxpVariable]>;
  snapshot(): Record<string, string>;
}

export function createVariableStore(): VariableStore {
  const store = new Map<string, WxpVariable>();

  return {
    set(name, value, owner) {
      const existing = store.get(name);

      if (existing !== undefined && existing.owner && owner && existing.owner !== owner) {
        // Collision: rename existing entry to owner-prefixed key, add new as prefixed too
        const existingPrefixed = `${existing.owner}:${name}`;
        const newPrefixed = `${owner}:${name}`;

        store.delete(name);
        store.set(existingPrefixed, {
          name: existingPrefixed,
          value: existing.value,
          owner: existing.owner,
        });
        store.set(newPrefixed, { name: newPrefixed, value, owner });
      } else {
        store.set(name, { name, value, owner });
      }
    },

    get(name) {
      return store.get(name)?.value;
    },

    has(name) {
      return store.has(name);
    },

    entries() {
      return store.entries();
    },

    snapshot() {
      const out: Record<string, string> = {};
      for (const [k, v] of store) {
        out[k] = v.value;
      }
      return out;
    },
  };
}
