import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { reorderChildrenSchema } from "@/lib/validations/project";
import { reorderChildren } from "@/lib/sub-project-sequencing";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) return notFound("Project not found");

  const body = await req.json();
  const parsed = reorderChildrenSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    await reorderChildren(params.id, parsed.data.childIds, userId, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    return badRequest(message);
  }

  return NextResponse.json({ success: true });
}
