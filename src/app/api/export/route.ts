import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { exportQuerySchema } from "@/lib/validations/import-export";
import { exportTandemJson } from "@/lib/export/tandem-json";
import { exportTasksCsv, exportProjectsCsv, exportRoutineLogsCsv } from "@/lib/export/csv";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = exportQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { format, scope, includeCompleted } = parsed.data;
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const data = await exportTandemJson(userId, scope, includeCompleted);
    const json = JSON.stringify(data, null, 2);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="tandem-export-${scope}-${dateStamp}.json"`,
      },
    });
  }

  if (format === "csv") {
    if (scope !== "tasks" && scope !== "projects" && scope !== "routine-logs") {
      return badRequest("CSV export supports 'tasks', 'projects', or 'routine-logs' scope only");
    }

    const csv =
      scope === "routine-logs"
        ? await exportRoutineLogsCsv(userId)
        : scope === "tasks"
          ? await exportTasksCsv(userId, includeCompleted)
          : await exportProjectsCsv(userId, includeCompleted);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tandem-${scope}-${dateStamp}.csv"`,
      },
    });
  }

  return badRequest("Invalid format. Use 'json' or 'csv'.");
}
