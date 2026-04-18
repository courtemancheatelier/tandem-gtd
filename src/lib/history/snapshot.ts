import { PrismaClient, Prisma, SnapshotReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diff } from "./diff";
import { writeTaskEvent, inferTaskEventType } from "./event-writer";

// Transaction client type for Prisma interactive transactions
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Fields captured in a task snapshot.
 * This represents the complete revertible state of a task.
 */
export interface TaskSnapshotState {
  title: string;
  notes: string | null;
  status: string;
  priority?: string | null;
  energyLevel: string | null;
  estimatedMins: number | null;
  contextId: string | null;
  projectId: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  isNextAction: boolean;
  isMilestone: boolean;
  percentComplete: number;
  predecessorIds: string[];
}

/**
 * The fields we extract from a task record to build a snapshot.
 */
const SNAPSHOT_FIELDS = [
  "title",
  "notes",
  "status",
  "energyLevel",
  "estimatedMins",
  "contextId",
  "projectId",
  "scheduledDate",
  "dueDate",
  "isNextAction",
  "isMilestone",
  "percentComplete",
] as const;

/**
 * Extract the snapshot-relevant state from a full task record.
 */
function extractSnapshotState(
  task: Record<string, unknown>,
  predecessorIds: string[] = []
): TaskSnapshotState {
  const state: Record<string, unknown> = {};

  for (const field of SNAPSHOT_FIELDS) {
    const value = task[field];
    // Serialize dates to ISO strings
    if (value instanceof Date) {
      state[field] = value.toISOString();
    } else {
      state[field] = value ?? null;
    }
  }

  state.predecessorIds = predecessorIds;

  return state as unknown as TaskSnapshotState;
}

// ─── Core Functions ─────────────────────────────────────────────────

/**
 * Take a snapshot of the current task state and save it to TaskSnapshot.
 * Call this BEFORE applying changes so the snapshot captures the "before" state.
 *
 * Can be called within or outside a transaction:
 * - Pass a transaction client (tx) for transactional consistency
 * - Or omit it to use the default prisma client
 */
export async function takeSnapshot(
  taskId: string,
  eventId: string | null,
  options?: {
    reason?: SnapshotReason;
    tx?: TxClient | PrismaClient;
  }
): Promise<{ id: string }> {
  const client = (options?.tx ?? prisma) as PrismaClient;
  const reason = options?.reason ?? "MANUAL";

  // Fetch the full task with dependencies
  const task = await client.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      predecessors: { select: { predecessorId: true } },
    },
  });

  const predecessorIds = task.predecessors.map(
    (d: { predecessorId: string }) => d.predecessorId
  );
  const state = extractSnapshotState(
    task as unknown as Record<string, unknown>,
    predecessorIds
  );

  const snapshot = await client.taskSnapshot.create({
    data: {
      taskId,
      state: state as unknown as Prisma.InputJsonValue,
      reason,
      eventId,
    },
    select: { id: true },
  });

  return snapshot;
}

/**
 * Revert a task to the state captured in a snapshot.
 * Creates a new TaskEvent with the appropriate event type and source MANUAL.
 * Returns the reverted task.
 */
export async function revertToSnapshot(
  snapshotId: string,
  userId: string
): Promise<{ taskId: string; eventId: string }> {
  // Load the snapshot
  const snapshot = await prisma.taskSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: {
      task: {
        include: {
          predecessors: { select: { predecessorId: true } },
        },
      },
    },
  });

  // Verify the task belongs to the user
  if (snapshot.task.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const snapshotState = snapshot.state as unknown as TaskSnapshotState;
  const currentTask = snapshot.task;
  const currentPredecessorIds = currentTask.predecessors.map(
    (d: { predecessorId: string }) => d.predecessorId
  );

  // Build the current state for diffing
  const currentState = extractSnapshotState(
    currentTask as unknown as Record<string, unknown>,
    currentPredecessorIds
  );

  // Compute the diff between current and snapshot (what will change)
  const changes = diff(
    currentState as unknown as Record<string, unknown>,
    snapshotState as unknown as Record<string, unknown>
  );

  if (Object.keys(changes).length === 0) {
    throw new Error("No changes to revert — task already matches snapshot");
  }

  // Apply the revert in a transaction
  const result = await prisma.$transaction(async (tx: TxClient) => {
    // Build the update data from the snapshot state
    const updateData: Record<string, unknown> = {};
    for (const field of SNAPSHOT_FIELDS) {
      const value = snapshotState[field as keyof TaskSnapshotState];
      // Convert ISO date strings back to Date objects for date fields
      if (
        (field === "scheduledDate" || field === "dueDate") &&
        typeof value === "string"
      ) {
        updateData[field] = new Date(value);
      } else {
        updateData[field] = value;
      }
    }

    // Update the task (always increment version on revert)
    await tx.task.update({
      where: { id: snapshot.taskId },
      data: { ...updateData, version: { increment: 1 } },
    });

    // Update dependencies if they changed
    const snapshotPredecessorIds = snapshotState.predecessorIds ?? [];
    const addedDeps = snapshotPredecessorIds.filter(
      (id: string) => !currentPredecessorIds.includes(id)
    );
    const removedDeps = currentPredecessorIds.filter(
      (id: string) => !snapshotPredecessorIds.includes(id)
    );

    if (addedDeps.length > 0) {
      await Promise.all(
        addedDeps.map((predId: string) =>
          tx.taskDependency.create({
            data: {
              predecessorId: predId,
              successorId: snapshot.taskId,
              type: "FINISH_TO_START",
              lagMinutes: 0,
            },
          })
        )
      );
    }

    if (removedDeps.length > 0) {
      await tx.taskDependency.deleteMany({
        where: {
          successorId: snapshot.taskId,
          predecessorId: { in: removedDeps },
        },
      });
    }

    // Infer the event type from the changes
    const eventType = inferTaskEventType(changes, false);

    // Write a RESTORED event (revert is conceptually a restore)
    const event = await writeTaskEvent(
      tx,
      snapshot.taskId,
      eventType,
      changes,
      {
        actorType: "USER",
        actorId: userId,
        source: "MANUAL",
        message: `Reverted to snapshot from ${new Date(snapshot.createdAt).toLocaleString()}`,
      }
    );

    // Take a new snapshot at the revert point (the state we just reverted to)
    // so there is always a "revert point" snapshot to go back to
    await takeSnapshot(snapshot.taskId, event?.id ?? null, {
      reason: "REVERT_POINT",
      tx,
    });

    return { taskId: snapshot.taskId, eventId: event?.id ?? "" };
  });

  return result;
}

/**
 * List all snapshots for a task, ordered newest first.
 * Includes the event that triggered each snapshot.
 */
export async function getSnapshots(
  taskId: string,
  options?: { limit?: number; offset?: number }
) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const [snapshots, total] = await Promise.all([
    prisma.taskSnapshot.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        task: {
          select: { id: true, title: true },
        },
      },
    }),
    prisma.taskSnapshot.count({ where: { taskId } }),
  ]);

  // Fetch associated events separately (eventId is optional)
  const eventIds = snapshots
    .map((s) => s.eventId)
    .filter((id): id is string => id !== null);

  const events =
    eventIds.length > 0
      ? await prisma.taskEvent.findMany({
          where: { id: { in: eventIds } },
          include: {
            actor: { select: { id: true, name: true } },
          },
        })
      : [];

  const eventMap = new Map(events.map((e) => [e.id, e]));

  return {
    snapshots: snapshots.map((s) => {
      const event = s.eventId ? eventMap.get(s.eventId) : null;
      return {
        id: s.id,
        taskId: s.taskId,
        state: s.state,
        reason: s.reason,
        eventId: s.eventId,
        createdAt: s.createdAt.toISOString(),
        event: event
          ? {
              id: event.id,
              eventType: event.eventType,
              actorType: event.actorType,
              actorName:
                event.actor?.name ??
                (event.actorType === "SYSTEM" ? "System" : "AI Assistant"),
              changes: event.changes,
              message: event.message,
              source: event.source,
              createdAt: event.createdAt.toISOString(),
            }
          : null,
      };
    }),
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Compare a snapshot's state with the current task state.
 * Returns the snapshot, current state, and a field-by-field diff.
 */
export async function diffSnapshot(snapshotId: string) {
  const snapshot = await prisma.taskSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: {
      task: {
        include: {
          predecessors: { select: { predecessorId: true } },
        },
      },
    },
  });

  const snapshotState = snapshot.state as unknown as TaskSnapshotState;
  const currentPredecessorIds = snapshot.task.predecessors.map(
    (d: { predecessorId: string }) => d.predecessorId
  );
  const currentState = extractSnapshotState(
    snapshot.task as unknown as Record<string, unknown>,
    currentPredecessorIds
  );

  // Compute diff: snapshot (old) vs current (new)
  const changes = diff(
    snapshotState as unknown as Record<string, unknown>,
    currentState as unknown as Record<string, unknown>
  );

  return {
    snapshotId: snapshot.id,
    taskId: snapshot.taskId,
    reason: snapshot.reason,
    createdAt: snapshot.createdAt.toISOString(),
    snapshotState,
    currentState,
    changes,
    hasChanges: Object.keys(changes).length > 0,
  };
}
