import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find the first user (for seeding on alpha/beta)
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No users found — cannot seed routine");
    process.exit(1);
  }

  console.log(`Seeding routine for user: ${user.name ?? user.email}`);

  // Check if routine already exists
  const existing = await prisma.routine.findFirst({
    where: { userId: user.id, title: "Daily Supplement Stack" },
  });
  if (existing) {
    console.log("Routine already exists — skipping");
    process.exit(0);
  }

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const routine = await prisma.routine.create({
    data: {
      title: "Daily Supplement Stack",
      description: "Daily supplement routine with timed windows",
      cronExpression: "daily",
      isActive: true,
      color: "#6366F1",
      estimatedMins: 10,
      nextDue: tomorrow,
      userId: user.id,
      windows: {
        create: [
          {
            title: "Morning — Empty Stomach",
            targetTime: "07:00",
            sortOrder: 0,
            constraint: "empty_stomach",
            items: {
              create: [
                { name: "PerfectAmino", dosage: "1 scoop", form: "powder", sortOrder: 0 },
                { name: "AloeBiotics", dosage: "2 caps", form: "capsule", sortOrder: 1 },
              ],
            },
          },
          {
            title: "With Breakfast",
            targetTime: "07:30",
            sortOrder: 1,
            constraint: "with_food",
            items: {
              create: [
                { name: "Creatine Monohydrate", dosage: "5g", form: "powder", sortOrder: 0 },
                { name: "BodyBio PC", dosage: "2 softgels", form: "softgel", sortOrder: 1 },
                { name: "Electrolytes", dosage: "1 serving", form: "powder", sortOrder: 2 },
              ],
            },
          },
          {
            title: "Mid-Afternoon",
            targetTime: "14:00",
            sortOrder: 2,
            items: {
              create: [
                { name: "Electrolytes", dosage: "1 serving", form: "powder", sortOrder: 0 },
              ],
            },
          },
          {
            title: "Post-Workout",
            sortOrder: 3,
            constraint: "post_workout",
            items: {
              create: [
                { name: "Zinc", dosage: "50mg", form: "capsule", sortOrder: 0 },
                { name: "Vitamin D3", dosage: "10,000 IU", form: "softgel", sortOrder: 1 },
                { name: "BCAAs", dosage: "1 serving", form: "powder", sortOrder: 2 },
              ],
            },
          },
        ],
      },
    },
    include: {
      windows: {
        include: { items: true },
      },
    },
  });

  console.log(`Created routine: "${routine.title}" with ${routine.windows.length} windows`);
  for (const w of routine.windows) {
    console.log(`  ${w.targetTime ?? "—"} ${w.title} (${w.items.length} items)`);
  }

  // Also generate today's task so it shows up immediately
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const noteLines: string[] = [];
  for (const w of routine.windows) {
    noteLines.push(`## ${w.title}${w.targetTime ? ` (${w.targetTime})` : ""}`);
    for (const item of w.items) {
      noteLines.push(`- ${item.name}${item.dosage ? ` — ${item.dosage}` : ""}`);
    }
    noteLines.push("");
  }

  await prisma.task.create({
    data: {
      title: routine.title,
      notes: noteLines.join("\n").trim(),
      userId: user.id,
      routineId: routine.id,
      scheduledDate: today,
      estimatedMins: routine.estimatedMins,
      isNextAction: true,
      status: "NOT_STARTED",
    },
  });

  console.log("Created today's task — visible on Card File now");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
