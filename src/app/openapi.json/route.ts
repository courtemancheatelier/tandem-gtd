import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import * as fs from "node:fs";
import * as path from "node:path";

let cachedSpec: string | null = null;

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  if (!cachedSpec) {
    const specPath = path.resolve(process.cwd(), "generated/openapi.json");
    cachedSpec = fs.readFileSync(specPath, "utf-8");
  }

  return new Response(cachedSpec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
