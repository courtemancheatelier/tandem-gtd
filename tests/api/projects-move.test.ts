/**
 * Tests for PATCH /api/projects/:id/move — Reparent a project
 *
 * Covers:
 * - Moving a project to a new parent
 * - Updating depth and path after move
 * - Enforcing max depth after move
 * - Moving to root (null parent)
 * - Preventing circular reparenting
 * - Cascading depth/path updates to descendants
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

describe("PATCH /api/projects/:id/move", () => {
  const { getCurrentUserId } = require("@/lib/api/auth-helpers");

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("should reparent a project under a new parent", async () => {
    const projectId = "proj-child";
    const newParentId = "proj-new-parent";

    prismaMock.project.findFirst
      .mockResolvedValueOnce({
        id: projectId,
        title: "Child",
        depth: 1,
        path: "/proj-old-parent/",
        parentProjectId: "proj-old-parent",
        userId: "user-1",
      })
      .mockResolvedValueOnce({
        id: newParentId,
        title: "New Parent",
        depth: 0,
        path: "",
        userId: "user-1",
      });

    prismaMock.project.update.mockResolvedValue({
      id: projectId,
      title: "Child",
      depth: 1,
      path: `/${newParentId}/`,
      parentProjectId: newParentId,
    });

    // Mock descendants update
    prismaMock.project.findMany.mockResolvedValue([]);

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-child/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: newParentId }),
    });

    const response = await PATCH(req, { params: { id: projectId } });
    const data = await response.json();

    expect(data.parentProjectId).toBe(newParentId);
    expect(data.depth).toBe(1);
  });

  it("should reject move that would exceed max depth", async () => {
    const projectId = "proj-with-children";
    const newParentId = "proj-deep-parent";

    // Project has children (depth = subtree adds 1)
    prismaMock.project.findFirst
      .mockResolvedValueOnce({
        id: projectId,
        title: "Project with children",
        depth: 0,
        path: "",
        parentProjectId: null,
        userId: "user-1",
      })
      .mockResolvedValueOnce({
        id: newParentId,
        title: "Deep Parent",
        depth: 2, // Already at max depth
        path: "/root/child/",
        userId: "user-1",
      });

    // This project has children that would go to depth 4 (exceeds max)
    prismaMock.project.findMany.mockResolvedValue([
      { id: "grandchild", depth: 1, path: `/${projectId}/child/` },
    ]);

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-with-children/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: newParentId }),
    });

    const response = await PATCH(req, { params: { id: projectId } });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/depth|nesting|maximum/i);
  });

  it("should allow moving to root (parentProjectId = null)", async () => {
    const projectId = "proj-child";

    prismaMock.project.findFirst.mockResolvedValue({
      id: projectId,
      title: "Child",
      depth: 1,
      path: "/proj-parent/",
      parentProjectId: "proj-parent",
      userId: "user-1",
    });

    prismaMock.project.update.mockResolvedValue({
      id: projectId,
      title: "Child",
      depth: 0,
      path: "",
      parentProjectId: null,
    });

    prismaMock.project.findMany.mockResolvedValue([]);

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-child/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: null }),
    });

    const response = await PATCH(req, { params: { id: projectId } });
    const data = await response.json();

    expect(data.parentProjectId).toBeNull();
    expect(data.depth).toBe(0);
  });

  it("should prevent moving a project under its own descendant", async () => {
    const projectId = "proj-parent";
    const descendantId = "proj-child";

    prismaMock.project.findFirst
      .mockResolvedValueOnce({
        id: projectId,
        title: "Parent",
        depth: 0,
        path: "",
        parentProjectId: null,
        userId: "user-1",
      })
      .mockResolvedValueOnce({
        id: descendantId,
        title: "Child",
        depth: 1,
        path: `/${projectId}/`, // Child is a descendant of project
        userId: "user-1",
      });

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-parent/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: descendantId }),
    });

    const response = await PATCH(req, { params: { id: projectId } });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/circular|descendant|ancestor/i);
  });

  it("should prevent moving a project under itself", async () => {
    const projectId = "proj-1";

    prismaMock.project.findFirst.mockResolvedValue({
      id: projectId,
      title: "Project",
      depth: 0,
      path: "",
      userId: "user-1",
    });

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-1/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: projectId }),
    });

    const response = await PATCH(req, { params: { id: projectId } });

    expect(response.status).toBe(400);
  });

  it("should update descendant paths and depths when project moves", async () => {
    const projectId = "proj-child";
    const newParentId = "proj-new-parent";

    prismaMock.project.findFirst
      .mockResolvedValueOnce({
        id: projectId,
        title: "Child",
        depth: 1,
        path: "/proj-old-parent/",
        parentProjectId: "proj-old-parent",
        userId: "user-1",
      })
      .mockResolvedValueOnce({
        id: newParentId,
        title: "New Parent",
        depth: 0,
        path: "",
        userId: "user-1",
      });

    // Project has descendants that need path updates
    prismaMock.project.findMany.mockResolvedValue([
      {
        id: "grandchild",
        depth: 2,
        path: "/proj-old-parent/proj-child/",
      },
    ]);

    prismaMock.project.update.mockResolvedValue({
      id: projectId,
      depth: 1,
      path: `/${newParentId}/`,
      parentProjectId: newParentId,
    });

    const { PATCH } = await import("@/app/api/projects/[id]/move/route");

    const req = new Request("http://localhost/api/projects/proj-child/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentProjectId: newParentId }),
    });

    await PATCH(req, { params: { id: projectId } });

    // Grandchild's path and depth should be updated too
    expect(prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "grandchild" },
        data: expect.objectContaining({
          path: expect.stringContaining(newParentId),
          depth: 2,
        }),
      })
    );
  });
});
