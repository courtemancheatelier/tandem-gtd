import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUserId,
  unauthorized,
  badRequest,
} from "@/lib/api/auth-helpers";
import { createProject } from "@/lib/services/project-service";
import { createTask } from "@/lib/services/task-service";
import { applyProjectScaffold } from "@/lib/services/scaffold-service";
import { isTeamMember } from "@/lib/services/team-permissions";
import type { ActorContext } from "@/lib/services/task-service";
import { z } from "zod";

const scaffoldSuggestionSchema = z.object({
  projectType: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]),
  projectTypeReason: z.string(),
  tasks: z.array(
    z.object({
      title: z.string(),
      sortOrder: z.number(),
      estimatedMins: z.number().optional(),
      energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      contextName: z.string().optional(),
      dependsOn: z.array(z.number()).optional(),
    })
  ),
  phases: z
    .array(
      z.object({
        label: z.string(),
        taskIndices: z.array(z.number()),
      })
    )
    .optional(),
});

const createWithTasksSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  projectDescription: z.string().optional(),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]).default("SEQUENTIAL"),
  areaId: z.string().optional(),
  teamId: z.string().optional(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
      })
    )
    .min(1)
    .max(50),
  suggestion: scaffoldSuggestionSchema.optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = createWithTasksSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { projectTitle, projectDescription, type, areaId, teamId, tasks, suggestion } =
    parsed.data;

  // Verify team membership if teamId is provided
  if (teamId) {
    const member = await isTeamMember(userId, teamId);
    if (!member) {
      return badRequest("You are not a member of this team");
    }
  }

  const actor: ActorContext = {
    actorType: "USER",
    actorId: userId,
    source: "API",
  };

  try {
    if (suggestion) {
      // Apply AI scaffold suggestion
      const project = await applyProjectScaffold({
        userId,
        projectTitle,
        projectDescription,
        suggestion,
        areaId,
        teamId,
        actor,
      });

      return NextResponse.json({ success: true, projectId: project.id });
    }

    // No suggestion — create project then tasks in order
    const project = await createProject(
      userId,
      {
        title: projectTitle,
        description: projectDescription,
        type,
        childType: "SEQUENTIAL",
        isSomedayMaybe: false,
        areaId,
        teamId: teamId ?? null,
      },
      actor
    );

    for (let i = 0; i < tasks.length; i++) {
      await createTask(
        userId,
        {
          title: tasks[i].title,
          projectId: project.id,
          sortOrder: i,
        },
        actor
      );
    }

    return NextResponse.json({ success: true, projectId: project.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
