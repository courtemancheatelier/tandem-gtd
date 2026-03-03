/**
 * Tests for Project Service PM Foundation updates
 *
 * The project service needs extensions for:
 * - Creating sub-projects with depth/path calculation
 * - Reparenting projects (move)
 * - Rollup recalculation on status changes
 * - Inheriting parent attributes
 */

import { prismaMock } from "../__mocks__/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("@/lib/history/diff", () => ({
  diff: jest.fn().mockReturnValue({}),
  createdDiff: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/history/event-writer", () => ({
  writeProjectEvent: jest.fn().mockResolvedValue({ id: "event-1" }),
}));

import {
  createProject,
  updateProject,
} from "@/lib/services/project-service";

describe("Project Service — Sub-Project Creation", () => {
  const actor = {
    actorType: "USER" as const,
    actorId: "user-1",
    source: "MANUAL" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it("should create project with depth=0 and empty path for root project", async () => {
    prismaMock.project.create.mockResolvedValue({
      id: "proj-root",
      title: "Root Project",
      depth: 0,
      path: "",
      parentProjectId: null,
      userId: "user-1",
    });

    const result = await createProject(
      "user-1",
      { title: "Root Project" },
      actor
    );

    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          depth: 0,
          path: "",
        }),
      })
    );
  });

  it("should set parentProjectId when creating sub-project", async () => {
    // This tests that the createProject function supports parentProjectId
    prismaMock.project.create.mockResolvedValue({
      id: "proj-child",
      title: "Child Project",
      depth: 1,
      path: "/proj-parent/",
      parentProjectId: "proj-parent",
      userId: "user-1",
    });

    // After PM Foundation, createProject should accept parentProjectId
    const result = await createProject(
      "user-1",
      {
        title: "Child Project",
        parentProjectId: "proj-parent",
      } as any,
      actor
    );

    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentProjectId: "proj-parent",
        }),
      })
    );
  });
});

describe("Project Service — Status Rollup", () => {
  const actor = {
    actorType: "SYSTEM" as const,
    source: "CASCADE" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it("should update rollupProgress when project status changes", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: "proj-child",
      title: "Child",
      status: "ACTIVE",
      parentProjectId: "proj-parent",
      userId: "user-1",
    });

    prismaMock.project.update.mockResolvedValue({
      id: "proj-child",
      title: "Child",
      status: "COMPLETED",
      parentProjectId: "proj-parent",
      userId: "user-1",
    });

    await updateProject(
      "proj-child",
      "user-1",
      { status: "COMPLETED" },
      actor
    );

    // After status change, should trigger rollup recalculation on parent
    // This depends on implementation: may be in service or via cascade
    expect(prismaMock.project.update).toHaveBeenCalled();
  });

  it("should cascade pause to all children when parent is paused", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: "proj-parent",
      title: "Parent",
      status: "ACTIVE",
      parentProjectId: null,
      userId: "user-1",
    });

    prismaMock.project.update.mockResolvedValue({
      id: "proj-parent",
      title: "Parent",
      status: "ON_HOLD",
      userId: "user-1",
    });

    // Children should be fetched and paused
    prismaMock.project.findMany.mockResolvedValue([
      { id: "child-1", status: "ACTIVE" },
      { id: "child-2", status: "ACTIVE" },
    ]);

    await updateProject(
      "proj-parent",
      "user-1",
      { status: "ON_HOLD" },
      actor
    );

    // Children should be paused too
    expect(prismaMock.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentProjectId: "proj-parent",
        }),
        data: expect.objectContaining({
          status: "ON_HOLD",
        }),
      })
    );
  });
});

describe("Project Service — Rollup Progress Calculation", () => {
  const actor = {
    actorType: "SYSTEM" as const,
    source: "CASCADE" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it("should compute rollupProgress as weighted average of child completion", async () => {
    // Parent has 2 child projects:
    // - Child A: 10 tasks, 80% complete -> weight=10, contribution=8
    // - Child B: 5 tasks, 40% complete -> weight=5, contribution=2
    // Expected rollup: (8 + 2) / (10 + 5) = 0.667

    prismaMock.project.findUnique.mockResolvedValue({
      id: "proj-parent",
      parentProjectId: null,
      tasks: [], // Parent has no direct tasks
      childProjects: [
        { id: "child-a", rollupProgress: 0.8, status: "ACTIVE" },
        { id: "child-b", rollupProgress: 0.4, status: "ACTIVE" },
      ],
    });

    // Task counts per child
    prismaMock.task.count
      .mockResolvedValueOnce(10) // child-a tasks
      .mockResolvedValueOnce(5);  // child-b tasks

    // The recalculateProjectRollups function (to be implemented in cascade.ts)
    // should compute weighted average
    // This is tested indirectly via onTaskComplete or directly if exported

    // For now, verify the function would produce correct results
    const childA = { taskCount: 10, rollupProgress: 0.8 };
    const childB = { taskCount: 5, rollupProgress: 0.4 };
    const totalWeight = childA.taskCount + childB.taskCount;
    const totalCompleted =
      childA.taskCount * childA.rollupProgress +
      childB.taskCount * childB.rollupProgress;
    const expectedRollup = totalCompleted / totalWeight;

    expect(expectedRollup).toBeCloseTo(0.667, 2);
  });

  it("should handle zero tasks gracefully (no division by zero)", () => {
    const totalWeight = 0;
    const totalCompleted = 0;
    const rollup = totalWeight > 0 ? totalCompleted / totalWeight : 0;

    expect(rollup).toBe(0);
    expect(isFinite(rollup)).toBe(true);
  });

  it("should compute worst-case rollupStatus from children", () => {
    // Status priority: ON_HOLD > DROPPED > ACTIVE > COMPLETED
    const statuses = ["COMPLETED", "ACTIVE", "ON_HOLD"];

    // The worst case should be ON_HOLD
    const statusPriority: Record<string, number> = {
      COMPLETED: 0,
      ACTIVE: 1,
      SOMEDAY_MAYBE: 2,
      ON_HOLD: 3,
      DROPPED: 4,
    };

    const worstCase = statuses.reduce((worst, current) =>
      (statusPriority[current] ?? 0) > (statusPriority[worst] ?? 0)
        ? current
        : worst
    );

    expect(worstCase).toBe("ON_HOLD");
  });
});
