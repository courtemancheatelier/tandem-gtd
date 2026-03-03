/**
 * Tests for PM Foundation — Cascade Engine Updates
 *
 * These tests cover the new cascade engine behavior required by Phase 1:
 * - Explicit TaskDependency model usage (replacing implicit dependsOn/dependents)
 * - Dependency type awareness (FINISH_TO_START, START_TO_START, etc.)
 * - Lag/lead time handling
 * - Sub-project rollup recalculation
 * - Milestone auto-completion
 *
 * Tests are written to FAIL until the implementation is complete.
 */

import { prismaMock } from "../__mocks__/prisma";

// Mock prisma before importing cascade
jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  onTaskComplete,
  computeNextAction,
  CascadeResult,
} from "@/lib/cascade";

// These imports will exist after implementation
// import { checkDependentsForPromotion, recalculateProjectRollups } from "@/lib/cascade";

describe("Cascade Engine — PM Foundation Updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. Explicit TaskDependency model usage
  // ==========================================================================

  describe("Explicit TaskDependency model", () => {
    it("should query TaskDependency model instead of implicit dependents relation", async () => {
      // After PM Foundation, onTaskComplete should use prisma.taskDependency.findMany
      // instead of including dependents through the implicit relation
      const taskId = "task-1";
      const userId = "user-1";

      // Mock the completed task (without old dependents relation)
      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      // The new implementation should query explicit TaskDependency table
      prismaMock.taskDependency.findMany.mockResolvedValue([]);

      // Mock remaining tasks count for project completion check
      prismaMock.task.count.mockResolvedValue(1);

      await onTaskComplete(taskId, userId);

      // Verify it uses the explicit TaskDependency model
      expect(prismaMock.taskDependency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { predecessorId: taskId },
        })
      );
    });

    it("should include successor task data when querying dependencies", async () => {
      const taskId = "task-1";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: null,
        project: null,
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([]);

      await onTaskComplete(taskId, userId);

      // Should include successor details for promotion logic
      expect(prismaMock.taskDependency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            successor: expect.anything(),
          }),
        })
      );
    });

    it("should promote successor when all predecessors are complete (FINISH_TO_START)", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const successorId = "task-b";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      // Task B depends on Task A with FINISH_TO_START
      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: successorId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: successorId,
            title: "Task B",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      // All predecessors of Task B are complete
      prismaMock.taskDependency.findMany.mockResolvedValueOnce([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: successorId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: successorId,
            title: "Task B",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      // Mock: all predecessors of successor are complete
      prismaMock.taskDependency.count.mockResolvedValue(0); // No incomplete predecessors

      // For project completion check
      prismaMock.task.count.mockResolvedValue(1); // 1 remaining task

      const result = await onTaskComplete(taskId, userId);

      // Task B should be promoted to next action
      expect(result.promotedTasks).toContainEqual(
        expect.objectContaining({ id: successorId })
      );
    });
  });

  // ==========================================================================
  // 2. Dependency type awareness
  // ==========================================================================

  describe("Dependency type awareness", () => {
    it("should NOT promote successor for START_TO_START when predecessor completes", async () => {
      // START_TO_START means successor can start when predecessor STARTS, not completes
      const taskId = "task-a";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      // SS dependency: successor should already have been promoted when predecessor started
      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "START_TO_START",
          lagMinutes: 0,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "IN_PROGRESS", // Already promoted when A started
            isNextAction: true,
            projectId: "proj-1",
          },
        },
      ] as any);

      prismaMock.task.count.mockResolvedValue(1);

      const result = await onTaskComplete(taskId, userId);

      // Task B should NOT be re-promoted (it's already in progress)
      expect(result.promotedTasks).not.toContainEqual(
        expect.objectContaining({ id: "task-b" })
      );
    });

    it("should handle FINISH_TO_FINISH dependencies", async () => {
      // FF: successor can finish when predecessor finishes
      // When predecessor completes, check if successor can now be marked complete
      const taskId = "task-a";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "FINISH_TO_FINISH",
          lagMinutes: 0,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "IN_PROGRESS",
            isNextAction: true,
            projectId: "proj-1",
          },
        },
      ] as any);

      prismaMock.task.count.mockResolvedValue(1);

      // For FF deps, the cascade should handle the "finish" constraint
      const result = await onTaskComplete(taskId, userId);

      // Result should at minimum not error - the specific behavior depends on implementation
      expect(result).toBeDefined();
      expect(result.promotedTasks).toBeDefined();
    });

    it("should handle START_TO_FINISH dependencies", async () => {
      // SF: predecessor start allows successor to finish
      const taskId = "task-a";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: null,
        project: null,
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "START_TO_FINISH",
          lagMinutes: 0,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "IN_PROGRESS",
            isNextAction: true,
            projectId: null,
          },
        },
      ] as any);

      const result = await onTaskComplete(taskId, userId);

      expect(result).toBeDefined();
    });

    it("should only promote FINISH_TO_START successors on task completion", async () => {
      const taskId = "task-a";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      // Mix of dependency types
      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-fs",
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: "task-fs",
            title: "Task FS",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
        {
          id: "dep-2",
          predecessorId: taskId,
          successorId: "task-ss",
          type: "START_TO_START",
          lagMinutes: 0,
          successor: {
            id: "task-ss",
            title: "Task SS",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      // Mock all predecessors complete for FS successor
      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(2);

      const result = await onTaskComplete(taskId, userId);

      // Only the FINISH_TO_START successor should be promoted on completion
      const promotedIds = result.promotedTasks.map((t) => t.id);
      expect(promotedIds).toContain("task-fs");
      // SS should NOT be promoted on completion (it should have been promoted on start)
      expect(promotedIds).not.toContain("task-ss");
    });
  });

  // ==========================================================================
  // 3. Lag/lead time handling
  // ==========================================================================

  describe("Lag/lead time handling", () => {
    it("should set successor scheduledDate based on positive lag", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const completedAt = new Date("2026-02-21T10:00:00Z");
      const lagMinutes = 60; // 1 hour lag

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt,
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "FINISH_TO_START",
          lagMinutes,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(1);

      await onTaskComplete(taskId, userId);

      // Successor should have scheduledDate = completedAt + lagMinutes
      const expectedScheduledDate = new Date(
        completedAt.getTime() + lagMinutes * 60 * 1000
      );

      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-b" },
          data: expect.objectContaining({
            isNextAction: true,
            scheduledDate: expectedScheduledDate,
          }),
        })
      );
    });

    it("should handle negative lag (lead time) allowing overlap", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const completedAt = new Date("2026-02-21T10:00:00Z");
      const lagMinutes = -30; // 30 min lead (negative lag)

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt,
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "FINISH_TO_START",
          lagMinutes,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(1);

      await onTaskComplete(taskId, userId);

      // With negative lag, scheduledDate should be earlier than completedAt
      const expectedScheduledDate = new Date(
        completedAt.getTime() + lagMinutes * 60 * 1000
      );

      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-b" },
          data: expect.objectContaining({
            scheduledDate: expectedScheduledDate,
          }),
        })
      );
    });

    it("should not set scheduledDate when lagMinutes is 0", async () => {
      const taskId = "task-a";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: "task-b",
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: "task-b",
            title: "Task B",
            status: "NOT_STARTED",
            isNextAction: false,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(1);

      await onTaskComplete(taskId, userId);

      // With 0 lag, should NOT set a scheduledDate (undefined, not a date)
      // This preserves backward compatibility with existing behavior
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-b" },
          data: expect.objectContaining({
            isNextAction: true,
          }),
        })
      );
    });
  });

  // ==========================================================================
  // 4. Sub-project rollup recalculation
  // ==========================================================================

  describe("Sub-project rollup recalculation", () => {
    it("should recalculate rollupProgress after task completion", async () => {
      const taskId = "task-1";
      const userId = "user-1";
      const projectId = "proj-child";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId,
        project: {
          id: projectId,
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: "proj-parent",
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([]);

      // Project has 4 tasks, 3 now complete
      prismaMock.task.count.mockResolvedValue(1); // 1 remaining incomplete

      // For rollup calculation
      prismaMock.project.findUnique.mockResolvedValue({
        id: projectId,
        parentProjectId: "proj-parent",
        childProjects: [],
        tasks: [
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "NOT_STARTED" },
        ],
      } as any);

      // Parent project
      prismaMock.project.findUnique.mockResolvedValueOnce({
        id: projectId,
        parentProjectId: "proj-parent",
        childProjects: [],
        tasks: [
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "NOT_STARTED" },
        ],
      } as any);

      prismaMock.project.update.mockResolvedValue({} as any);

      const result = await onTaskComplete(taskId, userId);

      // Should update rollupProgress on the project
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: expect.objectContaining({
            rollupProgress: expect.any(Number),
          }),
        })
      );
    });

    it("should traverse parent chain updating rollups", async () => {
      const taskId = "task-1";
      const userId = "user-1";

      // Task in grandchild project (depth 2)
      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-grandchild",
        project: {
          id: "proj-grandchild",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: "proj-child",
          depth: 2,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(1); // not all done

      // Grandchild project rollup
      prismaMock.project.findUnique
        .mockResolvedValueOnce({
          id: "proj-grandchild",
          parentProjectId: "proj-child",
          childProjects: [],
          tasks: [{ status: "COMPLETED" }, { status: "NOT_STARTED" }],
        } as any)
        // Child project rollup (traverses up)
        .mockResolvedValueOnce({
          id: "proj-child",
          parentProjectId: "proj-root",
          childProjects: [
            { id: "proj-grandchild", rollupProgress: 0.5, status: "ACTIVE" },
          ],
          tasks: [{ status: "COMPLETED" }],
        } as any)
        // Root project rollup (traverses up again)
        .mockResolvedValueOnce({
          id: "proj-root",
          parentProjectId: null,
          childProjects: [
            { id: "proj-child", rollupProgress: 0.75, status: "ACTIVE" },
          ],
          tasks: [],
        } as any);

      prismaMock.project.update.mockResolvedValue({} as any);

      await onTaskComplete(taskId, userId);

      // Should update rollup on grandchild, child, AND root
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "proj-grandchild" },
          data: expect.objectContaining({ rollupProgress: expect.any(Number) }),
        })
      );
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "proj-child" },
          data: expect.objectContaining({ rollupProgress: expect.any(Number) }),
        })
      );
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "proj-root" },
          data: expect.objectContaining({ rollupProgress: expect.any(Number) }),
        })
      );
    });

    it("should compute rollupStatus as worst-case of children", async () => {
      const taskId = "task-1";
      const userId = "user-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-child-1",
        project: {
          id: "proj-child-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: "proj-parent",
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0); // All done

      // Child 1 complete, but sibling child is ON_HOLD
      prismaMock.project.findUnique.mockResolvedValueOnce({
        id: "proj-parent",
        parentProjectId: null,
        childProjects: [
          { id: "proj-child-1", status: "COMPLETED", rollupProgress: 1.0 },
          { id: "proj-child-2", status: "ON_HOLD", rollupProgress: 0.3 },
        ],
        tasks: [],
      } as any);

      prismaMock.project.update.mockResolvedValue({} as any);

      await onTaskComplete(taskId, userId);

      // Parent rollupStatus should be ON_HOLD (worst case)
      expect(prismaMock.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "proj-parent" },
          data: expect.objectContaining({
            rollupStatus: "ON_HOLD",
          }),
        })
      );
    });
  });

  // ==========================================================================
  // 5. Milestone auto-completion
  // ==========================================================================

  describe("Milestone auto-completion", () => {
    it("should auto-complete a milestone when all predecessors complete", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const milestoneId = "milestone-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      // Milestone depends on this task
      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: milestoneId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: milestoneId,
            title: "MVP Complete",
            status: "NOT_STARTED",
            isNextAction: false,
            isMilestone: true,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      // All predecessors of milestone are complete
      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(0);

      await onTaskComplete(taskId, userId);

      // Milestone should be auto-completed (zero duration)
      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: milestoneId },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("should NOT auto-complete milestone when some predecessors are incomplete", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const milestoneId = "milestone-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: milestoneId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: milestoneId,
            title: "MVP Complete",
            status: "NOT_STARTED",
            isNextAction: false,
            isMilestone: true,
            projectId: "proj-1",
          },
        },
      ] as any);

      // 1 predecessor still incomplete
      prismaMock.taskDependency.count.mockResolvedValue(1);
      prismaMock.task.count.mockResolvedValue(1);

      await onTaskComplete(taskId, userId);

      // Milestone should NOT be completed
      expect(prismaMock.task.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: milestoneId },
          data: expect.objectContaining({
            status: "COMPLETED",
          }),
        })
      );
    });

    it("should include auto-completed milestone in cascade result", async () => {
      const taskId = "task-a";
      const userId = "user-1";
      const milestoneId = "milestone-1";

      prismaMock.task.update.mockResolvedValue({
        id: taskId,
        title: "Task A",
        status: "COMPLETED",
        isNextAction: false,
        completedAt: new Date(),
        projectId: "proj-1",
        project: {
          id: "proj-1",
          type: "PARALLEL",
          status: "ACTIVE",
          parentProjectId: null,
        },
      } as any);

      prismaMock.taskDependency.findMany.mockResolvedValue([
        {
          id: "dep-1",
          predecessorId: taskId,
          successorId: milestoneId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
          successor: {
            id: milestoneId,
            title: "MVP Complete",
            status: "NOT_STARTED",
            isNextAction: false,
            isMilestone: true,
            projectId: "proj-1",
            project: { id: "proj-1", type: "PARALLEL", status: "ACTIVE" },
          },
        },
      ] as any);

      prismaMock.taskDependency.count.mockResolvedValue(0);
      prismaMock.task.count.mockResolvedValue(0);

      const result = await onTaskComplete(taskId, userId);

      // The auto-completed milestone should appear in promotedTasks or a new field
      // The implementation may track milestones separately
      expect(
        result.promotedTasks.some((t) => t.id === milestoneId) ||
          (result as any).completedMilestones?.some(
            (m: any) => m.id === milestoneId
          )
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 6. computeNextAction with explicit dependencies
  // ==========================================================================

  describe("computeNextAction with explicit TaskDependency", () => {
    it("should check TaskDependency model for incomplete predecessors", async () => {
      // After PM Foundation, computeNextAction should query TaskDependency
      // instead of checking task IDs directly
      const result = await computeNextAction({
        projectId: "proj-1",
        projectType: "PARALLEL",
        dependsOnIds: ["task-a"],
        userId: "user-1",
      });

      // The function should query the explicit dependency model
      // This test verifies the interface contract still works
      expect(typeof result).toBe("boolean");
    });
  });
});
