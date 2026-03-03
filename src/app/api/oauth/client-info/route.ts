/**
 * OAuth Client Info — used by the consent page to display client name.
 *
 * GET /api/oauth/client-info?client_id=...
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing client_id" },
      { status: 400 }
    );
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { clientName: true, redirectUris: true },
  });

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
  });
}
