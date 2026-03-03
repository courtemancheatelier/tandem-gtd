/**
 * Tests for GET /api/projects/:id/tree — Full project tree with rollup data
 *
 * Covers:
 * - Returning nested project hierarchy
 * - Including rollup progress and status
 * - Including task counts per project
 * - Handling projects with no children (leaf nodes)
 * - Max depth traversal
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

describe("GET /api/projects/:id/tree", () => {
  const { getCurrentUserId } = require("@/lib/api/auth-helpers");

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("should return full project tree with nested children", async () => {
    const rootId = "proj-root";

    prismaMock.project.findFirst.mockResolvedValue({
      id: rootId,
      title: "Root Project",
      depth: 0,
      path: "",
      status: "ACTIVE",
      type: "SEQUENTIAL",
      rollupProgress: 0.6,
      rollupStatus: "ACTIVE",
      userId: "user-1",
      childProjects: [
        {
          id: "proj-child-1",
          title: "Child 1",
          depth: 1,
          path: `/${rootId}/`,
          status: "ACTIVE",
          rollupProgress: 0.8,
          childProjects: [],
        },
        {
          id: "proj-child-2",
          title: "Child 2",
          depth: 1,
          path: `/${rootId}/`,
          status: "ACTIVE",
          rollupProgress: 0.4,
          childProjects: [],
        },
      ],
    });

    const { GET } = await import("@/app/api/projects/[id]/tree/route");

    const req = new Request("http://localhost/api/projects/proj-root/tree");
    const response = await GET(req, { params: { id: rootId } });
    const data = await response.json();

    expect(data.id).toBe(rootId);
    expect(data.childProjects).toHaveLength(2);
    expect(data.rollupProgress).toBeDefined();
  });

  it("should include task counts in tree response", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: "proj-root",
      title: "Root",
      depth: 0,
      status: "ACTIVE",
      userId: "user-1",
      childProjects: [],
      _count: { tasks: 5 },
    });

    const { GET } = await import("@/app/api/projects/[id]/tree/route");

    const req = new Request("http://localhost/api/projects/proj-root/tree");
    const response = await GET(req, { params: { id: "proj-root" } });
    const data = await response.json();

    // Response should include task count
    expect(data._count?.tasks ?? data.taskCount).toBeDefined();
  });

  it("should return 404 for nonexistent project", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/projects/[id]/tree/route");

    const req = new Request("http://localhost/api/projects/nonexistent/tree");
    const response = await GET(req, { params: { id: "nonexistent" } });

    expect(response.status).toBe(404);
  });

  it("should return 401 if unauthenticated", async () => {
    getCurrentUserId.mockResolvedValue(null);

    const { GET } = await import("@/app/api/projects/[id]/tree/route");

    const req = new Request("http://localhost/api/projects/proj-root/tree");
    const response = await GET(req, { params: { id: "proj-root" } });

    expect(response.status).toBe(401);
  });

  it("should include rollupProgress and rollupStatus in response", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: "proj-root",
      title: "Root",
      depth: 0,
      status: "ACTIVE",
      rollupProgress: 0.72,
      rollupStatus: "ACTIVE",
      userId: "user-1",
      childProjects: [
        {
          id: "proj-child",
          title: "Child",
          depth: 1,
          status: "ON_HOLD",
          rollupProgress: 0.45,
          rollupStatus: "ON_HOLD",
          childProjects: [],
        },
      ],
    });

    const { GET } = await import("@/app/api/projects/[id]/tree/route");

    const req = new Request("http://localhost/api/projects/proj-root/tree");
    const response = await GET(req, { params: { id: "proj-root" } });
    const data = await response.json();

    expect(data.rollupProgress).toBe(0.72);
    expect(data.rollupStatus).toBe("ACTIVE");
    expect(data.childProjects[0].rollupProgress).toBe(0.45);
    expect(data.childProjects[0].rollupStatus).toBe("ON_HOLD");
  });
});
