/**
 * Mock Prisma client for unit testing.
 *
 * Creates a deeply-mocked Prisma client that can be configured per-test
 * using Jest's mockResolvedValue/mockImplementation.
 */

type MockPrismaModel = {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  upsert: jest.Mock;
};

function createMockModel(): MockPrismaModel {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn().mockRejectedValue(new Error("Not found")),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn(),
    upsert: jest.fn(),
  };
}

export const prismaMock = {
  task: createMockModel(),
  project: createMockModel(),
  taskDependency: createMockModel(),
  baselineSnapshot: createMockModel(),
  user: createMockModel(),
  context: createMockModel(),
  goal: createMockModel(),
  area: createMockModel(),
  taskEvent: createMockModel(),
  projectEvent: createMockModel(),
  inboxEvent: createMockModel(),
  inboxItem: createMockModel(),
  taskSnapshot: createMockModel(),
  projectMember: createMockModel(),
  $transaction: jest.fn((fn: any) => fn(prismaMock)),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};
