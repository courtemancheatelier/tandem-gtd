import { NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { saveAsTemplateSchema } from "@/lib/validations/project-template";
import { saveProjectAsTemplate } from "@/lib/services/template-service";

// POST /api/projects/[id]/save-as-template
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id } = params;

  const body = await request.json();
  const parsed = saveAsTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  try {
    const template = await saveProjectAsTemplate(id, userId, parsed.data);
    if (!template) return notFound("Project not found");
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save as template";
    return badRequest(message);
  }
}
