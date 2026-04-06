import type { WxpVariable } from "../schemas/wxp.zod.js";

export interface VariableStore {
  /** Set a string variable, with optional owner for collision detection */
  set(name: string, value: string, owner?: string): void;
  /** Get a string variable value (supports dot-notation: "item.prop") */
  get(name: string): string | undefined;
  /** Resolve a name — handles both plain variables and dot-notation property access on JSON items */
  resolve(name: string): string | undefined;
  /** Store an array of JSON strings for <for-each> iteration */
  setArray(name: string, items: string[], owner?: string): void;
  /** Retrieve an array variable */
  getArray(name: string): string[] | undefined;
  has(name: string): boolean;
  entries(): IterableIterator<[string, WxpVariable]>;
  snapshot(): Record<string, string>;
}

export function createVariableStore(): VariableStore {
  const scalars = new Map<string, WxpVariable>();
  const arrays  = new Map<string, string[]>();

  const resolveScalar = (name: string): string | undefined => {
    // Plain lookup first
    const direct = scalars.get(name)?.value;
    if (direct !== undefined) return direct;

    // Dot-notation: "item.prop.sub" → look up "item", parse JSON, traverse path
    const dotIdx = name.indexOf(".");
    if (dotIdx === -1) return undefined;

    const varPart  = name.slice(0, dotIdx);
    const pathPart = name.slice(dotIdx + 1);
    const jsonStr  = scalars.get(varPart)?.value;
    if (jsonStr === undefined) return undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON traversal requires dynamic access
      let obj: any = JSON.parse(jsonStr);
      for (const key of pathPart.split(".")) {
        if (obj === null || typeof obj !== "object") return undefined;
        obj = obj[key];
      }
      return obj === undefined || obj === null ? undefined : String(obj);
    } catch {
      return undefined;
    }
  };

  return {
    set(name, value, owner) {
      const existing = scalars.get(name);
      if (existing?.owner && owner && existing.owner !== owner) {
        scalars.delete(name);
        scalars.set(`${existing.owner}:${name}`, {
          name: `${existing.owner}:${name}`,
          value: existing.value,
          owner: existing.owner,
        });
        scalars.set(`${owner}:${name}`, { name: `${owner}:${name}`, value, owner });
      } else {
        scalars.set(name, { name, value, owner });
      }
    },

    get(name) {
      return scalars.get(name)?.value;
    },

    resolve(name) {
      return resolveScalar(name);
    },

    setArray(name, items, owner) {
      arrays.set(name, items);
      // Also store as a JSON string in scalars so it's accessible via get()
      scalars.set(name, { name, value: JSON.stringify(items), owner });
    },

    getArray(name) {
      // Try direct array store first
      if (arrays.has(name)) return arrays.get(name);
      // Fall back: try to parse the scalar as a JSON array
      const str = scalars.get(name)?.value;
      if (!str) return undefined;
      try {
        const parsed: unknown = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map((item) =>
          typeof item === "string" ? item : JSON.stringify(item)
        );
      } catch { /* not a JSON array */ }
      return undefined;
    },

    has(name) {
      return scalars.has(name) || arrays.has(name);
    },

    entries() {
      return scalars.entries();
    },

    snapshot() {
      const out: Record<string, string> = {};
      for (const [k, v] of scalars) out[k] = v.value;
      return out;
    },
  };
}
