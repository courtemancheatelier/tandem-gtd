import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createProjectTemplateSchema } from "@/lib/validations/project-template";

// GET /api/project-templates — list system + user + team templates
export async function GET(request: Request) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  const url = new URL(request.url);
  const showHidden = url.searchParams.get("showHidden") === "true";

  // Get user's team memberships
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const where: Record<string, unknown> = {
    OR: [
      { isSystem: true, ...(showHidden ? {} : { isGloballyHidden: false }) },
      { userId, teamId: null },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
    ],
  };

  if (!showHidden) {
    where.NOT = { hiddenBy: { some: { userId } } };
  }

  const templates = await prisma.projectTemplate.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { taskTemplates: true, subProjectTemplates: true } },
    },
    orderBy: [{ isSystem: "desc" }, { title: "asc" }],
  });

  return NextResponse.json(templates);
}

// POST /api/project-templates — create user template manually
export async function POST(request: Request) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  const body = await request.json();
  const parsed = createProjectTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { taskTemplates: taskData, ...templateData } = parsed.data;

  const template = await prisma.projectTemplate.create({
    data: {
      ...templateData,
      userId,
      isSystem: false,
    },
  });

  // Create task templates if provided
  if (taskData && taskData.length > 0) {
    for (let i = 0; i < taskData.length; i++) {
      const task = taskData[i];
      await prisma.projectTaskTemplate.create({
        data: {
          title: task.title,
          notes: task.notes || null,
          estimatedMins: task.estimatedMins || null,
          energyLevel: task.energyLevel || null,
          contextName: task.contextName || null,
          sortOrder: task.sortOrder ?? i,
          templateId: template.id,
        },
      });
    }
  }

  const result = await prisma.projectTemplate.findUnique({
    where: { id: template.id },
    include: {
      taskTemplates: { orderBy: { sortOrder: "asc" } },
      subProjectTemplates: {
        orderBy: { sortOrder: "asc" },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { taskTemplates: true, subProjectTemplates: true } },
    },
  });

  return NextResponse.json(result, { status: 201 });
}
