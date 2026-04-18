import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { requireTeamAdmin } from "@/lib/services/team-permissions";

const projectSettingsSchema = z.object({
  threadsEnabled: z.boolean().optional(),
  decisionsEnabled: z.boolean().optional(),
  completionNotesEnabled: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = projectSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { teamId: true },
  });
  if (!project) return notFound("Project not found");
  if (!project.teamId) {
    return badRequest("Settings are only available for team projects");
  }

  try {
    await requireTeamAdmin(userId, project.teamId);
  } catch {
    return NextResponse.json({ error: "Only team admins can change project settings" }, { status: 403 });
  }

  const data: Record<string, boolean> = {};
  if (parsed.data.threadsEnabled !== undefined) data.threadsEnabled = parsed.data.threadsEnabled;
  if (parsed.data.decisionsEnabled !== undefined) data.decisionsEnabled = parsed.data.decisionsEnabled;
  if (parsed.data.completionNotesEnabled !== undefined) data.completionNotesEnabled = parsed.data.completionNotesEnabled;

  const updated = await prisma.project.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      threadsEnabled: true,
      decisionsEnabled: true,
      completionNotesEnabled: true,
    },
  });

  return NextResponse.json(updated);
}
