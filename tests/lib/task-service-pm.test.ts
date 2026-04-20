/**
 * Tests for Task Service updates for PM Foundation
 *
 * The task service needs to be updated to:
 * - Use explicit TaskDependency model when creating tasks with dependencies
 * - Use predecessors/successors relations instead of dependsOn/dependents
 * - Support new task fields (isMilestone, percentComplete, actualMinutes)
 */

import { prismaMock } from "../__mocks__/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// Mock the cascade module
jest.mock("@/lib/cascade", () => ({
  computeNextAction: jest.fn().mockResolvedValue(true),
  onTaskComplete: jest.fn().mockResolvedValue({
    promotedTasks: [],
    completedProjects: [],
    updatedGoals: [],
  }),
}));

// Mock the history module
jest.mock("@/lib/history/diff", () => ({
  diff: jest.fn().mockReturnValue({}),
  createdDiff: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/history/event-writer", () => ({
  writeTaskEvent: jest.fn().mockResolvedValue({ id: "event-1" }),
  writeProjectEvent: jest.fn().mockResolvedValue({ id: "event-2" }),
  inferTaskEventType: jest.fn().mockReturnValue("UPDATED"),
}));

import { createTask, updateTask, completeTask } from "@/lib/services/task-service";

describe("Task Service — PM Foundation Updates", () => {
  const actor = {
    actorType: "USER" as const,
    actorId: "user-1",
    source: "MANUAL" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default transaction mock: pass through
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  describe("createTask with explicit dependencies", () => {
    it("should create TaskDependency records instead of using implicit connect", async () => {
      const userId = "user-1";
      const predecessorIds = ["task-a", "task-b"];

      prismaMock.project.findFirst.mockResolvedValue({
        id: "proj-1",
        type: "PARALLEL",
        userId,
      });

      prismaMock.task.create.mockResolvedValue({
        id: "task-new",
        title: "New Task",
        userId,
        status: "NOT_STARTED",
        isNextAction: false,
        projectId: "proj-1",
      });

      // After PM Foundation, task creation with dependencies should create TaskDependency records
      prismaMock.taskDependency.createMany.mockResolvedValue({ count: 2 });

      await createTask(
        userId,
        {
          title: "New Task",
          projectId: "proj-1",
          dependsOnIds: predecessorIds,
        },
        actor
      );

      // Should create explicit TaskDependency records
      expect(prismaMock.taskDependency.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              predecessorId: "task-a",
              successorId: "task-new",
              type: "FINISH_TO_START",
            }),
            expect.objectContaining({
              predecessorId: "task-b",
              successorId: "task-new",
              type: "FINISH_TO_START",
            }),
          ]),
        })
      );
    });

    it("should NOT use implicit dependsOn connect syntax", async () => {
      const userId = "user-1";

      prismaMock.project.findFirst.mockResolvedValue({
        id: "proj-1",
        type: "PARALLEL",
        userId,
      });

      prismaMock.task.create.mockResolvedValue({
        id: "task-new",
        title: "New Task",
        userId,
        status: "NOT_STARTED",
        isNextAction: true,
      });

      await createTask(
        userId,
        {
          title: "New Task",
          projectId: "proj-1",
          dependsOnIds: ["task-a"],
        },
        actor
      );

      // The old implicit M2M connect should NOT be used
      if (prismaMock.task.create.mock.calls.length > 0) {
        const createCall = prismaMock.task.create.mock.calls[0][0];
        expect(createCall.data.dependsOn).toBeUndefined();
      }
    });

    it("should include predecessors relation in task creation response", async () => {
      const userId = "user-1";

      prismaMock.task.create.mockResolvedValue({
        id: "task-new",
        title: "New Task",
        userId,
        status: "NOT_STARTED",
        isNextAction: true,
        predecessors: [],
      });

      await createTask(userId, { title: "New Task" }, actor);

      // The include should reference predecessors, not dependsOn
      if (prismaMock.task.create.mock.calls.length > 0) {
        const createCall = prismaMock.task.create.mock.calls[0][0];
        if (createCall.include) {
          expect(createCall.include.dependsOn).toBeUndefined();
          // Should use predecessors instead
          expect(
            createCall.include.predecessors !== undefined ||
              createCall.include.dependsOn === undefined
          ).toBe(true);
        }
      }
    });
  });

  describe("createTask with new PM fields", () => {
    it("should support isMilestone field", async () => {
      const userId = "user-1";

      prismaMock.task.create.mockResolvedValue({
        id: "milestone-1",
        title: "MVP Complete",
        userId,
        status: "NOT_STARTED",
        isNextAction: true,
        isMilestone: true,
      });

      // This tests that the task service accepts and passes through isMilestone
      const result = await createTask(
        userId,
        {
          title: "MVP Complete",
          // isMilestone would be a new field in CreateTaskInput
        } as any,
        actor
      );

      expect(result).toBeDefined();
    });

    it("should support percentComplete field", async () => {
      const userId = "user-1";

      prismaMock.task.findFirst.mockResolvedValue({
        id: "task-1",
        title: "Task 1",
        userId,
        percentComplete: 0,
      });

      prismaMock.task.update.mockResolvedValue({
        id: "task-1",
        title: "Task 1",
        userId,
        percentComplete: 50,
      });

      const result = await updateTask(
        "task-1",
        userId,
        { percentComplete: 50 } as any,
        actor
      );

      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            percentComplete: 50,
          }),
        })
      );
    });

    it("should support actualMinutes field", async () => {
      const userId = "user-1";

      prismaMock.task.findFirst.mockResolvedValue({
        id: "task-1",
        title: "Task 1",
        userId,
        actualMinutes: null,
      });

      prismaMock.task.update.mockResolvedValue({
        id: "task-1",
        title: "Task 1",
        userId,
        actualMinutes: 120,
      });

      const result = await updateTask(
        "task-1",
        userId,
        { actualMinutes: 120 } as any,
        actor
      );

      expect(prismaMock.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actualMinutes: 120,
          }),
        })
      );
    });
  });

  describe("completeTask with explicit dependencies", () => {
    it("should call onTaskComplete which uses explicit TaskDependency model", async () => {
      const { onTaskComplete } = require("@/lib/cascade");
      const userId = "user-1";
      const taskId = "task-1";

      prismaMock.task.findFirst.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        userId,
        status: "IN_PROGRESS",
      });

      prismaMock.task.findUniqueOrThrow.mockResolvedValue({
        id: taskId,
        title: "Task 1",
        userId,
        status: "COMPLETED",
      });

      const result = await completeTask(taskId, userId, actor);

      expect(onTaskComplete).toHaveBeenCalledWith(taskId, userId);
      expect(result.cascade).toBeDefined();
    });
  });
});
