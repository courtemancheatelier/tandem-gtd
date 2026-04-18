import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.googleCalendarSync.findMany();
  for (const r of records) {
    const watched = ((r.watchedCalendars as Array<Record<string, unknown>>) || []).map(
      (c) => ({ ...c, syncToken: null })
    );
    await prisma.googleCalendarSync.update({
      where: { id: r.id },
      data: { watchedCalendars: JSON.parse(JSON.stringify(watched)) },
    });
    console.log(`Cleared syncTokens for user ${r.userId} — ${watched.length} calendars`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
