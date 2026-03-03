import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, notFound } from "@/lib/api/auth-helpers";

// GET /api/project-templates/[id] — get template with full details
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id } = params;

  const template = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      taskTemplates: { orderBy: { sortOrder: "asc" } },
      subProjectTemplates: {
        orderBy: { sortOrder: "asc" },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { taskTemplates: true, subProjectTemplates: true } },
    },
  });

  if (!template) return notFound("Template not found");

  // Access check: system templates are visible to all, user templates only to owner
  if (!template.isSystem && template.userId !== userId) {
    return notFound("Template not found");
  }

  return NextResponse.json(template);
}

// DELETE /api/project-templates/[id] — delete user template (403 for system)
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id } = params;

  const template = await prisma.projectTemplate.findUnique({
    where: { id },
  });

  if (!template) return notFound("Template not found");
  if (template.isSystem) return forbidden("System templates cannot be deleted");
  if (template.userId !== userId) return notFound("Template not found");

  // Delete children first, then template
  await prisma.projectTaskTemplate.deleteMany({
    where: { templateId: id },
  });
  await prisma.projectSubTemplate.deleteMany({
    where: { templateId: id },
  });
  await prisma.projectTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
