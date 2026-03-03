/**
 * Tests for POST /api/projects/:id/children — Create sub-project under parent
 *
 * Covers:
 * - Creating child projects with correct depth and path
 * - Enforcing max depth of 3 (depth 0, 1, 2)
 * - Inheriting parent's type, areaId, goalId by default
 * - Validating parent project exists and belongs to user
 * - Error cases: invalid parent, depth exceeded, unauthenticated
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

describe("POST /api/projects/:id/children", () => {
  const { getCurrentUserId } = require("@/lib/api/auth-helpers");

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("should create a child project with depth = parent.depth + 1", async () => {
    const parentId = "proj-parent";

    prismaMock.project.findFirst.mockResolvedValue({
      id: parentId,
      title: "Parent Project",
      depth: 0,
      path: "",
      type: "SEQUENTIAL",
      status: "ACTIVE",
      userId: "user-1",
      areaId: "area-1",
      goalId: "goal-1",
    });

    prismaMock.project.create.mockResolvedValue({
      id: "proj-child",
      title: "Child Project",
      depth: 1,
      path: `/${parentId}/`,
      type: "SEQUENTIAL",
      parentProjectId: parentId,
      userId: "user-1",
    });

    // Import the route handler (will fail until implemented)
    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child Project" }),
    });

    const response = await POST(req, { params: { id: parentId } });
    const data = await response.json();

    expect(data.depth).toBe(1);
    expect(data.path).toContain(parentId);
    expect(data.parentProjectId).toBe(parentId);
  });

  it("should compute path as parent.path + parent.id + '/'", async () => {
    const rootId = "proj-root";
    const childId = "proj-child";

    // Parent is depth 1, child will be depth 2
    prismaMock.project.findFirst.mockResolvedValue({
      id: childId,
      title: "Child Project",
      depth: 1,
      path: `/${rootId}/`,
      type: "PARALLEL",
      status: "ACTIVE",
      userId: "user-1",
    });

    prismaMock.project.create.mockResolvedValue({
      id: "proj-grandchild",
      title: "Grandchild Project",
      depth: 2,
      path: `/${rootId}/${childId}/`,
      type: "PARALLEL",
      parentProjectId: childId,
      userId: "user-1",
    });

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-child/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Grandchild Project" }),
    });

    const response = await POST(req, { params: { id: childId } });
    const data = await response.json();

    expect(data.depth).toBe(2);
    expect(data.path).toBe(`/${rootId}/${childId}/`);
  });

  it("should reject creating child when depth would exceed 2 (max depth 3 levels)", async () => {
    const parentId = "proj-grandchild";

    // Parent is already at depth 2 (max nesting)
    prismaMock.project.findFirst.mockResolvedValue({
      id: parentId,
      title: "Grandchild",
      depth: 2,
      path: "/proj-root/proj-child/",
      type: "SEQUENTIAL",
      status: "ACTIVE",
      userId: "user-1",
    });

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-grandchild/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Too Deep" }),
    });

    const response = await POST(req, { params: { id: parentId } });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/depth|nesting|maximum/i);
  });

  it("should inherit parent type by default", async () => {
    const parentId = "proj-parent";

    prismaMock.project.findFirst.mockResolvedValue({
      id: parentId,
      title: "Parent",
      depth: 0,
      path: "",
      type: "PARALLEL",
      status: "ACTIVE",
      userId: "user-1",
      areaId: "area-1",
      goalId: null,
    });

    prismaMock.project.create.mockImplementation(async (args: any) => ({
      id: "proj-child",
      ...args.data,
    }));

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child" }),
    });

    await POST(req, { params: { id: parentId } });

    // Should inherit parent's type
    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PARALLEL",
        }),
      })
    );
  });

  it("should allow overriding inherited type", async () => {
    const parentId = "proj-parent";

    prismaMock.project.findFirst.mockResolvedValue({
      id: parentId,
      title: "Parent",
      depth: 0,
      path: "",
      type: "SEQUENTIAL",
      status: "ACTIVE",
      userId: "user-1",
    });

    prismaMock.project.create.mockImplementation(async (args: any) => ({
      id: "proj-child",
      ...args.data,
    }));

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child", type: "PARALLEL" }),
    });

    await POST(req, { params: { id: parentId } });

    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PARALLEL",
        }),
      })
    );
  });

  it("should return 404 if parent project not found", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/nonexistent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child" }),
    });

    const response = await POST(req, { params: { id: "nonexistent" } });

    expect(response.status).toBe(404);
  });

  it("should return 401 if user is not authenticated", async () => {
    getCurrentUserId.mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-1/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child" }),
    });

    const response = await POST(req, { params: { id: "proj-1" } });

    expect(response.status).toBe(401);
  });

  it("should inherit parent's areaId and goalId by default", async () => {
    const parentId = "proj-parent";

    prismaMock.project.findFirst.mockResolvedValue({
      id: parentId,
      title: "Parent",
      depth: 0,
      path: "",
      type: "SEQUENTIAL",
      status: "ACTIVE",
      userId: "user-1",
      areaId: "area-1",
      goalId: "goal-1",
    });

    prismaMock.project.create.mockImplementation(async (args: any) => ({
      id: "proj-child",
      ...args.data,
    }));

    const { POST } = await import(
      "@/app/api/projects/[id]/children/route"
    );

    const req = new Request("http://localhost/api/projects/proj-parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child" }),
    });

    await POST(req, { params: { id: parentId } });

    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          areaId: "area-1",
          goalId: "goal-1",
        }),
      })
    );
  });
});
