/**
 * Tests for PM Foundation schema changes
 *
 * Validates that the Prisma schema has been correctly updated with:
 * - TaskDependency model with DependencyType enum
 * - Project model additions (depth, path, rollupProgress, rollupStatus, parentProjectId)
 * - Task model additions (isMilestone, percentComplete, actualMinutes)
 * - BaselineSnapshot model
 *
 * These tests import from @prisma/client and verify the types/enums exist.
 * They will FAIL until the schema migration is complete.
 */

describe("PM Foundation Schema — DependencyType enum", () => {
  it("should export DependencyType enum from Prisma client", () => {
    // This import will fail until the schema is updated
    const { DependencyType } = require("@prisma/client");

    expect(DependencyType).toBeDefined();
    expect(DependencyType.FINISH_TO_START).toBe("FINISH_TO_START");
    expect(DependencyType.START_TO_START).toBe("START_TO_START");
    expect(DependencyType.FINISH_TO_FINISH).toBe("FINISH_TO_FINISH");
    expect(DependencyType.START_TO_FINISH).toBe("START_TO_FINISH");
  });

  it("should have all four dependency types", () => {
    const { DependencyType } = require("@prisma/client");

    const values = Object.values(DependencyType);
    expect(values).toHaveLength(4);
    expect(values).toContain("FINISH_TO_START");
    expect(values).toContain("START_TO_START");
    expect(values).toContain("FINISH_TO_FINISH");
    expect(values).toContain("START_TO_FINISH");
  });
});

describe("PM Foundation Schema — TaskDependency model", () => {
  it("should be importable from Prisma client types", () => {
    // Verify the Prisma namespace includes TaskDependency
    // This tests that the model exists in the generated client
    const PrismaModule = require("@prisma/client");

    // Prisma generates a namespace with model types
    // We can verify the model exists by checking if the Prisma client
    // has the taskDependency model accessor
    expect(PrismaModule.Prisma).toBeDefined();
    expect(PrismaModule.Prisma.TaskDependencyScalarFieldEnum).toBeDefined();
  });

  it("should have required fields in TaskDependency model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskDependencyScalarFieldEnum);
    expect(fields).toContain("id");
    expect(fields).toContain("predecessorId");
    expect(fields).toContain("successorId");
    expect(fields).toContain("type");
    expect(fields).toContain("lagMinutes");
  });
});

describe("PM Foundation Schema — Project model additions", () => {
  it("should have depth field in Project model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.ProjectScalarFieldEnum);
    expect(fields).toContain("depth");
  });

  it("should have path field in Project model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.ProjectScalarFieldEnum);
    expect(fields).toContain("path");
  });

  it("should have rollupProgress field in Project model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.ProjectScalarFieldEnum);
    expect(fields).toContain("rollupProgress");
  });

  it("should have rollupStatus field in Project model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.ProjectScalarFieldEnum);
    expect(fields).toContain("rollupStatus");
  });

  it("should have parentProjectId self-relation field", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.ProjectScalarFieldEnum);
    expect(fields).toContain("parentProjectId");
  });
});

describe("PM Foundation Schema — Task model additions", () => {
  it("should have isMilestone field in Task model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskScalarFieldEnum);
    expect(fields).toContain("isMilestone");
  });

  it("should have percentComplete field in Task model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskScalarFieldEnum);
    expect(fields).toContain("percentComplete");
  });

  it("should have actualMinutes field in Task model", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskScalarFieldEnum);
    expect(fields).toContain("actualMinutes");
  });

  it("should use estimatedMins (not estimatedMinutes) field name", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskScalarFieldEnum);
    expect(fields).toContain("estimatedMins");
    // Verify the wrong name is NOT used
    expect(fields).not.toContain("estimatedMinutes");
  });
});

describe("PM Foundation Schema — BaselineSnapshot model", () => {
  it("should be importable from Prisma client", () => {
    const { Prisma } = require("@prisma/client");

    expect(Prisma.BaselineSnapshotScalarFieldEnum).toBeDefined();
  });

  it("should have required fields", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.BaselineSnapshotScalarFieldEnum);
    expect(fields).toContain("id");
    expect(fields).toContain("projectId");
    expect(fields).toContain("userId");
    expect(fields).toContain("name");
    expect(fields).toContain("snapshotData");
    expect(fields).toContain("createdAt");
  });
});

describe("PM Foundation Schema — Task model no longer has implicit M2M", () => {
  it("should NOT have dependsOn in Task scalar fields (replaced by TaskDependency)", () => {
    const { Prisma } = require("@prisma/client");

    const fields = Object.values(Prisma.TaskScalarFieldEnum);
    // dependsOn was an implicit M2M relation, not a scalar field
    // After migration, the Task model should have predecessors/successors
    // via the explicit TaskDependency model instead
    expect(fields).not.toContain("dependsOn");
    expect(fields).not.toContain("dependents");
  });
});
