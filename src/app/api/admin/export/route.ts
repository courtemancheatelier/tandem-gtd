import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { prisma } from "@/lib/prisma";
import { exportTandemJson } from "@/lib/export/tandem-json";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, isAdmin: true },
    orderBy: { email: "asc" },
  });

  const serverSettings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
  });

  const usersData = await Promise.all(
    users.map(async (user) => {
      const exportData = await exportTandemJson(user.id, "all", true);
      return {
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        data: exportData.data,
      };
    })
  );

  const serverExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    serverSettings: serverSettings ?? {},
    users: usersData,
  };

  const json = JSON.stringify(serverExport, null, 2);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tandem-server-export-${dateStamp}.json"`,
    },
  });
}
