import { prisma } from "@/lib/prisma";

interface TeamSettings {
  teamsEnabled: boolean;
  teamsAdminOnly: boolean;
}

let cache: { data: TeamSettings; expiry: number } | null = null;

export function invalidateTeamSettingsCache() {
  cache = null;
}

export async function getTeamSettings(): Promise<TeamSettings> {
  const now = Date.now();
  if (cache && now < cache.expiry) {
    return cache.data;
  }

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { teamsEnabled: true, teamsAdminOnly: true },
  });

  const data: TeamSettings = settings ?? {
    teamsEnabled: true,
    teamsAdminOnly: true,
  };

  cache = { data, expiry: now + 60_000 };
  return data;
}
