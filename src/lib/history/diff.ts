/**
 * Compute a structured diff between two states of the same record.
 * Returns { field: { old: value, new: value } } for each changed field.
 * Ignores `updatedAt` and internal fields.
 */

const IGNORED_FIELDS = new Set(["updatedAt", "createdAt", "id", "version"]);

export type ChangeDiff = Record<
  string,
  { old: unknown; new: unknown }
>;

export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ChangeDiff {
  const changes: ChangeDiff = {};

  const allKeys = Array.from(new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]));

  for (const key of allKeys) {
    if (IGNORED_FIELDS.has(key)) continue;

    const oldVal = before[key] ?? null;
    const newVal = after[key] ?? null;

    // Deep compare for dates, arrays, objects
    if (!deepEqual(oldVal, newVal)) {
      changes[key] = {
        old: serialize(oldVal),
        new: serialize(newVal),
      };
    }
  }

  return changes;
}

/**
 * Create a "created" diff where all fields are new.
 */
export function createdDiff(
  record: Record<string, unknown>
): ChangeDiff {
  const changes: ChangeDiff = {};
  for (const [key, value] of Object.entries(record)) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    changes[key] = { old: null, new: serialize(value) };
  }
  return changes;
}

function serialize(val: unknown): unknown {
  if (val instanceof Date) return val.toISOString();
  return val;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}
