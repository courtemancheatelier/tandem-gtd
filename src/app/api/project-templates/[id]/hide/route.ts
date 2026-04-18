import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";

// POST /api/project-templates/[id]/hide — hide a system or team template for this user
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id } = params;

  const template = await prisma.projectTemplate.findUnique({
    where: { id },
  });

  if (!template) return notFound("Template not found");

  // Can only hide system or team templates — personal templates should just be deleted
  if (!template.isSystem && !template.teamId) {
    return badRequest("Personal templates cannot be hidden — delete them instead");
  }

  // For team templates, verify membership
  if (template.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: template.teamId, userId },
    });
    if (!membership) return notFound("Template not found");
  }

  await prisma.hiddenTemplate.upsert({
    where: { userId_templateId: { userId, templateId: id } },
    create: { userId, templateId: id },
    update: {},
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/project-templates/[id]/hide — unhide a template for this user
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id } = params;

  await prisma.hiddenTemplate.deleteMany({
    where: { userId, templateId: id },
  });

  return NextResponse.json({ success: true });
}
