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

  // Access check: system templates visible to all, personal to owner, team to members
  if (!template.isSystem && template.userId !== userId) {
    if (template.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: template.teamId, userId },
      });
      if (!membership) return notFound("Template not found");
    } else {
      return notFound("Template not found");
    }
  }

  return NextResponse.json(template);
}

// DELETE /api/project-templates/[id] — delete user/team template (403 for system)
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

  // Team template: check team membership with ADMIN role
  if (template.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: template.teamId, userId },
    });
    if (!membership) return notFound("Template not found");
    if (membership.role !== "ADMIN") {
      return forbidden("Only team admins can delete team templates");
    }
  } else if (template.userId !== userId) {
    return notFound("Template not found");
  }

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
