import { PrismaClient } from "@prisma/client";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Thrown when an optimistic concurrency version check fails.
 * The client sent a stale version — another write happened in between.
 */
export class VersionConflictError extends Error {
  public readonly currentVersion: number;
  public readonly currentState: Record<string, unknown>;

  constructor(
    currentVersion: number,
    currentState: Record<string, unknown>,
    message = "Version conflict: the record was modified by another user."
  ) {
    super(message);
    this.name = "VersionConflictError";
    this.currentVersion = currentVersion;
    this.currentState = currentState;
  }
}

/**
 * Atomically update a record only if the version matches.
 * Uses `updateMany` with a WHERE on id + version so Prisma doesn't
 * throw on zero matches (unlike `update` which throws on missing unique).
 *
 * Returns the number of rows updated (0 = version mismatch, 1 = success).
 */
export async function atomicVersionUpdate(
  tx: TxClient,
  model: "task" | "project" | "wikiArticle",
  id: string,
  expectedVersion: number,
  data: Record<string, unknown>
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic model access
  const result = await (tx[model] as any).updateMany({
    where: { id, version: expectedVersion },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  return result.count;
}

/**
 * Unconditionally increment the version on a record.
 * Used by cascade/system operations that always operate on server-side truth.
 * Optionally accepts additional data to write alongside the version bump.
 */
export async function incrementVersion(
  tx: TxClient | PrismaClient,
  model: "task" | "project" | "wikiArticle",
  id: string,
  data?: Record<string, unknown>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic model access
  await (tx[model] as any).update({
    where: { id },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });
}
