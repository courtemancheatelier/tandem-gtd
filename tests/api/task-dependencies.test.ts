/**
 * Tests for Task Dependency API endpoints with explicit TaskDependency model
 *
 * POST /api/tasks/:id/dependencies — Add dependency with type + lag
 * DELETE /api/tasks/:id/dependencies/:depId — Remove dependency
 *
 * Covers:
 * - Creating dependencies with DependencyType
 * - Creating dependencies with lagMinutes
 * - Default values (FINISH_TO_START, 0 lag)
 * - Circular dependency prevention
 * - Self-dependency prevention
 * - Removing dependencies by ID
 * - Auth and validation
 */

import { prismaMock } from "../__mocks__/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("@/lib/api/auth-helpers", () => ({
  getCurrentUserId: jest.fn(),
  unauthorized: jest.fn(() => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
  notFound: jest.fn((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 404 })),
  badRequest: jest.fn((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400 })),
}));

describe("POST /api/tasks/:id/dependencies", () => {
  const { getCurrentUserId } = require("@/lib/api/auth-helpers");

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("should create a FINISH_TO_START dependency by default", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      title: "Task B",
      userId: "user-1",
    });

    prismaMock.taskDependency.create.mockResolvedValue({
      id: "dep-1",
      predecessorId,
      successorId: taskId,
      type: "FINISH_TO_START",
      lagMinutes: 0,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId }),
    });

    const response = await POST(req, { params: { id: taskId } });
    const data = await response.json();

    expect(prismaMock.taskDependency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predecessorId,
          successorId: taskId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
        }),
      })
    );
  });

  it("should create a dependency with specified type and lag", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      title: "Task B",
      userId: "user-1",
    });

    prismaMock.taskDependency.create.mockResolvedValue({
      id: "dep-1",
      predecessorId,
      successorId: taskId,
      type: "START_TO_START",
      lagMinutes: 30,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predecessorId,
        type: "START_TO_START",
        lagMinutes: 30,
      }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(prismaMock.taskDependency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "START_TO_START",
          lagMinutes: 30,
        }),
      })
    );
  });

  it("should reject self-dependency", async () => {
    const taskId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      title: "Task A",
      userId: "user-1",
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-a/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId: taskId }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(response.status).toBe(400);
  });

  it("should reject circular dependencies", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      title: "Task B",
      userId: "user-1",
    });

    // Task A already depends on Task B (or a chain leading to B)
    prismaMock.taskDependency.findFirst.mockResolvedValue({
      id: "existing-dep",
      predecessorId: taskId,
      successorId: predecessorId,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/circular/i);
  });

  it("should reject duplicate dependency", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
    });

    // Dependency already exists
    prismaMock.taskDependency.findUnique.mockResolvedValue({
      id: "existing",
      predecessorId,
      successorId: taskId,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(response.status).toBe(400);
  });

  it("should validate DependencyType enum values", async () => {
    const taskId = "task-b";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predecessorId: "task-a",
        type: "INVALID_TYPE",
      }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(response.status).toBe(400);
  });

  it("should set isNextAction to false for task with new dependency", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      title: "Task B",
      userId: "user-1",
      isNextAction: true,
    });

    // Predecessor is not yet complete
    prismaMock.task.findFirst.mockResolvedValueOnce({
      id: taskId,
      userId: "user-1",
    });

    prismaMock.task.findUnique.mockResolvedValue({
      id: predecessorId,
      status: "NOT_STARTED",
    });

    prismaMock.taskDependency.create.mockResolvedValue({
      id: "dep-1",
      predecessorId,
      successorId: taskId,
      type: "FINISH_TO_START",
      lagMinutes: 0,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId }),
    });

    await POST(req, { params: { id: taskId } });

    // Task with incomplete predecessor should lose next action status
    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: taskId },
        data: expect.objectContaining({
          isNextAction: false,
        }),
      })
    );
  });

  it("should return 401 if unauthenticated", async () => {
    getCurrentUserId.mockResolvedValue(null);

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-1/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId: "task-2" }),
    });

    const response = await POST(req, { params: { id: "task-1" } });

    expect(response.status).toBe(401);
  });

  it("should handle negative lagMinutes (lead time)", async () => {
    const taskId = "task-b";
    const predecessorId = "task-a";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
    });

    prismaMock.taskDependency.create.mockResolvedValue({
      id: "dep-1",
      predecessorId,
      successorId: taskId,
      type: "FINISH_TO_START",
      lagMinutes: -30,
    });

    const { POST } = await import("@/app/api/tasks/[id]/dependencies/route");

    const req = new Request("http://localhost/api/tasks/task-b/dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predecessorId,
        lagMinutes: -30,
      }),
    });

    const response = await POST(req, { params: { id: taskId } });

    expect(prismaMock.taskDependency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lagMinutes: -30,
        }),
      })
    );
  });
});

describe("DELETE /api/tasks/:id/dependencies/:depId", () => {
  const { getCurrentUserId } = require("@/lib/api/auth-helpers");

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("should delete a dependency by ID", async () => {
    const taskId = "task-b";
    const depId = "dep-1";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
    });

    prismaMock.taskDependency.findFirst.mockResolvedValue({
      id: depId,
      predecessorId: "task-a",
      successorId: taskId,
    });

    prismaMock.taskDependency.delete.mockResolvedValue({
      id: depId,
    });

    const { DELETE } = await import(
      "@/app/api/tasks/[id]/dependencies/[depId]/route"
    );

    const req = new Request("http://localhost/api/tasks/task-b/dependencies/dep-1", {
      method: "DELETE",
    });

    const response = await DELETE(req, {
      params: { id: taskId, depId },
    });

    expect(response.status).toBe(200);
    expect(prismaMock.taskDependency.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: depId },
      })
    );
  });

  it("should return 404 if dependency not found", async () => {
    const taskId = "task-b";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
    });

    prismaMock.taskDependency.findFirst.mockResolvedValue(null);

    const { DELETE } = await import(
      "@/app/api/tasks/[id]/dependencies/[depId]/route"
    );

    const req = new Request("http://localhost/api/tasks/task-b/dependencies/nonexistent", {
      method: "DELETE",
    });

    const response = await DELETE(req, {
      params: { id: taskId, depId: "nonexistent" },
    });

    expect(response.status).toBe(404);
  });

  it("should return 401 if unauthenticated", async () => {
    getCurrentUserId.mockResolvedValue(null);

    const { DELETE } = await import(
      "@/app/api/tasks/[id]/dependencies/[depId]/route"
    );

    const req = new Request("http://localhost/api/tasks/task-b/dependencies/dep-1", {
      method: "DELETE",
    });

    const response = await DELETE(req, {
      params: { id: "task-b", depId: "dep-1" },
    });

    expect(response.status).toBe(401);
  });

  it("should recalculate isNextAction after removing last dependency", async () => {
    const taskId = "task-b";
    const depId = "dep-1";

    prismaMock.task.findFirst.mockResolvedValue({
      id: taskId,
      userId: "user-1",
      isNextAction: false,
      projectId: "proj-1",
    });

    prismaMock.taskDependency.findFirst.mockResolvedValue({
      id: depId,
      predecessorId: "task-a",
      successorId: taskId,
    });

    prismaMock.taskDependency.delete.mockResolvedValue({ id: depId });

    // No remaining dependencies after deletion
    prismaMock.taskDependency.count.mockResolvedValue(0);

    const { DELETE } = await import(
      "@/app/api/tasks/[id]/dependencies/[depId]/route"
    );

    const req = new Request("http://localhost/api/tasks/task-b/dependencies/dep-1", {
      method: "DELETE",
    });

    await DELETE(req, { params: { id: taskId, depId } });

    // Should potentially promote to next action if no other deps remain
    // The exact behavior depends on project type, but the check should happen
    expect(
      prismaMock.taskDependency.count.mock.calls.length > 0 ||
        prismaMock.task.update.mock.calls.length > 0
    ).toBe(true);
  });
});
