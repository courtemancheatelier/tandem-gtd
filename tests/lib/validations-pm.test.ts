/**
 * Tests for PM Foundation validation schema updates
 *
 * The Zod validation schemas need to be updated to support:
 * - New task fields: isMilestone, percentComplete, actualMinutes
 * - New dependency creation: predecessorId, type (DependencyType), lagMinutes
 * - New project fields: parentProjectId, depth, path
 * - Sub-project creation validation
 */

describe("Task validation — PM Foundation fields", () => {
  it("should accept isMilestone in create task schema", async () => {
    const { createTaskSchema } = await import("@/lib/validations/task");

    const result = createTaskSchema.safeParse({
      title: "MVP Complete",
      isMilestone: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isMilestone).toBe(true);
    }
  });

  it("should accept percentComplete in update task schema", async () => {
    const { updateTaskSchema } = await import("@/lib/validations/task");

    const result = updateTaskSchema.safeParse({
      percentComplete: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.percentComplete).toBe(50);
    }
  });

  it("should reject percentComplete > 100", async () => {
    const { updateTaskSchema } = await import("@/lib/validations/task");

    const result = updateTaskSchema.safeParse({
      percentComplete: 150,
    });

    expect(result.success).toBe(false);
  });

  it("should reject percentComplete < 0", async () => {
    const { updateTaskSchema } = await import("@/lib/validations/task");

    const result = updateTaskSchema.safeParse({
      percentComplete: -10,
    });

    expect(result.success).toBe(false);
  });

  it("should accept actualMinutes in update task schema", async () => {
    const { updateTaskSchema } = await import("@/lib/validations/task");

    const result = updateTaskSchema.safeParse({
      actualMinutes: 120,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actualMinutes).toBe(120);
    }
  });

  it("should allow null actualMinutes", async () => {
    const { updateTaskSchema } = await import("@/lib/validations/task");

    const result = updateTaskSchema.safeParse({
      actualMinutes: null,
    });

    expect(result.success).toBe(true);
  });

  it("should use estimatedMins field name (not estimatedMinutes)", async () => {
    const { createTaskSchema } = await import("@/lib/validations/task");

    const result = createTaskSchema.safeParse({
      title: "Test task",
      estimatedMins: 30,
    });

    expect(result.success).toBe(true);

    // Verify wrong field name is rejected
    const wrongResult = createTaskSchema.safeParse({
      title: "Test task",
      estimatedMinutes: 30, // Wrong field name
    });

    // estimatedMinutes should either be rejected or ignored
    if (wrongResult.success) {
      expect((wrongResult.data as any).estimatedMinutes).toBeUndefined();
    }
  });
});

describe("Dependency creation validation", () => {
  it("should validate dependency creation with type and lag", async () => {
    // After PM Foundation, there should be a dependency validation schema
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      // Module exists but schema not yet added
    }

    if (!createDependencySchema) {
      // The schema doesn't exist yet — this test should fail
      fail("createDependencySchema not found in @/lib/validations/task");
    }

    const result = createDependencySchema.safeParse({
      predecessorId: "task-a",
      type: "FINISH_TO_START",
      lagMinutes: 0,
    });

    expect(result.success).toBe(true);
  });

  it("should default type to FINISH_TO_START", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const result = createDependencySchema.safeParse({
      predecessorId: "task-a",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("FINISH_TO_START");
    }
  });

  it("should default lagMinutes to 0", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const result = createDependencySchema.safeParse({
      predecessorId: "task-a",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lagMinutes).toBe(0);
    }
  });

  it("should reject invalid dependency type", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const result = createDependencySchema.safeParse({
      predecessorId: "task-a",
      type: "INVALID_TYPE",
    });

    expect(result.success).toBe(false);
  });

  it("should accept all four dependency types", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const types = [
      "FINISH_TO_START",
      "START_TO_START",
      "FINISH_TO_FINISH",
      "START_TO_FINISH",
    ];

    for (const type of types) {
      const result = createDependencySchema.safeParse({
        predecessorId: "task-a",
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should allow negative lagMinutes (lead time)", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const result = createDependencySchema.safeParse({
      predecessorId: "task-a",
      lagMinutes: -30,
    });

    expect(result.success).toBe(true);
  });

  it("should require predecessorId", async () => {
    let createDependencySchema: any;
    try {
      const module = await import("@/lib/validations/task");
      createDependencySchema = (module as any).createDependencySchema;
    } catch {
      fail("createDependencySchema not found");
    }

    const result = createDependencySchema.safeParse({
      type: "FINISH_TO_START",
    });

    expect(result.success).toBe(false);
  });
});

describe("Project validation — PM Foundation fields", () => {
  it("should accept parentProjectId in create project schema", async () => {
    const { createProjectSchema } = await import("@/lib/validations/project");

    const result = createProjectSchema.safeParse({
      title: "Child Project",
      parentProjectId: "proj-parent",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).parentProjectId).toBe("proj-parent");
    }
  });

  it("should allow parentProjectId to be omitted (root project)", async () => {
    const { createProjectSchema } = await import("@/lib/validations/project");

    const result = createProjectSchema.safeParse({
      title: "Root Project",
    });

    expect(result.success).toBe(true);
  });
});
