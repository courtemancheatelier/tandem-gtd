import { Prisma } from "@prisma/client";

interface DriftFilterParams {
  areaId?: string;
  goalId?: string;
  routineId?: string;
}

/**
 * Build Prisma where conditions for filtering drift tasks.
 *
 * Area filter matches tasks via project.areaId OR routine.areaId
 * (Card File tasks have no project — they link to area through the routine).
 * Goal filter only matches project-linked tasks (routines don't have goals).
 * Routine filter matches by routineId directly.
 *
 * Returns a partial TaskWhereInput to spread or AND into a query.
 * When area-only, returns { OR: [...] } — callers with their own top-level
 * OR must wrap both in AND to avoid key collision.
 */
export function buildDriftTaskFilter({
  areaId,
  goalId,
  routineId,
}: DriftFilterParams): Prisma.TaskWhereInput {
  if (routineId) {
    return {
      routineId,
      ...(areaId && { routine: { areaId } }),
    };
  }

  if (areaId && goalId) {
    // Goals only exist on projects, so this narrows to project tasks only
    return { project: { areaId, goalId } };
  }

  if (areaId) {
    // Match via either project or routine
    return {
      OR: [
        { project: { areaId } },
        { routine: { areaId } },
      ],
    };
  }

  if (goalId) {
    return { project: { goalId } };
  }

  return {};
}
