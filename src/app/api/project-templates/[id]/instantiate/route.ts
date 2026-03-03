import { NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { instantiateTemplateSchema } from "@/lib/validations/project-template";
import { instantiateTemplate } from "@/lib/services/template-service";

// POST /api/project-templates/[id]/instantiate — create project from template
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  const { userId, isBearerAuth } = auth;
  const { id } = params;

  const body = await request.json();
  const parsed = instantiateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  try {
    const project = await instantiateTemplate({
      templateId: id,
      userId,
      variables: parsed.data.variables || {},
      projectTitle: parsed.data.projectTitle,
      targetDate: parsed.data.targetDate,
      areaId: parsed.data.areaId,
      goalId: parsed.data.goalId,
      teamId: parsed.data.teamId,
      actor: {
        actorType: isBearerAuth ? "AI" : "USER",
        actorId: userId,
        source: isBearerAuth ? "API" : "MANUAL",
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to instantiate template";
    return badRequest(message);
  }
}
