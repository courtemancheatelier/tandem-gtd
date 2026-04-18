import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Future date helper: returns a Date N days from now */
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** Past date helper: returns a Date N days ago */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding Tandem GTD database...\n");

  // =========================================================================
  // 1. SERVER SETTINGS
  // =========================================================================

  await prisma.serverSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      serverAiEnabled: false,
      allowUserOwnKeys: true,
      shareServerKey: false,
      defaultAiDailyLimit: 100,
      defaultAiModel: "claude-sonnet-4-20250514",
      mcpEnabled: true,
      allowUserAiToggle: true,
      allowUserMcpToggle: true,
      teamsEnabled: true,
      teamsAdminOnly: true,
    },
  });
  console.log("[+] Server settings");

  // =========================================================================
  // 2. USERS
  // =========================================================================

  const adminPassword = bcrypt.hashSync("admin123", 10);
  const demoPassword = bcrypt.hashSync("demo123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@tandem.local" },
    update: { isAdmin: true },
    create: {
      email: "admin@tandem.local",
      name: "Admin",
      password: adminPassword,
      isAdmin: true,
    },
  });
  console.log("[+] Admin user:", admin.email);

  const demo = await prisma.user.upsert({
    where: { email: "demo@tandem.local" },
    update: {},
    create: {
      email: "demo@tandem.local",
      name: "Demo User",
      password: demoPassword,
      isAdmin: false,
    },
  });
  console.log("[+] Demo user:", demo.email);

  // =========================================================================
  // 3. CONTEXTS (for demo user)
  // =========================================================================

  const contextDefs = [
    { name: "@Computer", color: "#8B5CF6", icon: "laptop", sortOrder: 0 },
    { name: "@Phone", color: "#F59E0B", icon: "phone", sortOrder: 1 },
    { name: "@Office", color: "#3B82F6", icon: "building-2", sortOrder: 2 },
    { name: "@Home", color: "#10B981", icon: "home", sortOrder: 3 },
    { name: "@Errands", color: "#EF4444", icon: "shopping-cart", sortOrder: 4 },
    { name: "@Anywhere", color: "#6B7280", icon: "globe", sortOrder: 5 },
    { name: "@Agenda", color: "#EC4899", icon: "users", sortOrder: 6 },
  ];

  const contexts: Record<string, { id: string }> = {};
  for (const ctx of contextDefs) {
    const record = await prisma.context.upsert({
      where: { userId_name: { userId: demo.id, name: ctx.name } },
      update: { color: ctx.color, icon: ctx.icon, sortOrder: ctx.sortOrder },
      create: { ...ctx, userId: demo.id },
    });
    contexts[ctx.name] = record;
  }
  console.log("[+] Contexts:", Object.keys(contexts).join(", "));

  // Also create default contexts for admin (keeps original behavior)
  const adminContextDefs = [
    { name: "@office", color: "#3B82F6", icon: "building-2", sortOrder: 0 },
    { name: "@home", color: "#10B981", icon: "home", sortOrder: 1 },
    { name: "@phone", color: "#F59E0B", icon: "phone", sortOrder: 2 },
    { name: "@errands", color: "#EF4444", icon: "shopping-cart", sortOrder: 3 },
    { name: "@computer", color: "#8B5CF6", icon: "laptop", sortOrder: 4 },
    { name: "@anywhere", color: "#6B7280", icon: "globe", sortOrder: 5 },
  ];
  for (const ctx of adminContextDefs) {
    await prisma.context.upsert({
      where: { userId_name: { userId: admin.id, name: ctx.name } },
      update: {},
      create: { ...ctx, userId: admin.id },
    });
  }
  console.log("[+] Admin contexts");

  // =========================================================================
  // 4. AREAS (for demo user)
  // =========================================================================

  const areaDefs = [
    {
      name: "Health & Fitness",
      description: "Physical and mental well-being, exercise routines, nutrition",
      sortOrder: 0,
    },
    {
      name: "Career",
      description: "Professional growth, skills development, networking",
      sortOrder: 1,
    },
    {
      name: "Finance",
      description: "Budgets, investments, savings goals, tax planning",
      sortOrder: 2,
    },
    {
      name: "Family",
      description: "Relationships, family events, quality time",
      sortOrder: 3,
    },
    {
      name: "Personal Development",
      description: "Learning, reading, self-improvement, hobbies",
      sortOrder: 4,
    },
    {
      name: "Home",
      description: "Home maintenance, renovation, organization",
      sortOrder: 5,
    },
  ];

  const areas: Record<string, { id: string }> = {};
  for (const a of areaDefs) {
    // Prisma Area has no unique compound key we can upsert on,
    // so we search first, then create if missing.
    const existing = await prisma.area.findFirst({
      where: { userId: demo.id, name: a.name },
    });
    if (existing) {
      areas[a.name] = existing;
    } else {
      const record = await prisma.area.create({
        data: { ...a, userId: demo.id },
      });
      areas[a.name] = record;
    }
  }
  console.log("[+] Areas:", Object.keys(areas).join(", "));

  // =========================================================================
  // 5. GOALS (for demo user)
  // =========================================================================

  interface GoalDef {
    title: string;
    description: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "DEFERRED";
    horizon: "HORIZON_3" | "HORIZON_4" | "HORIZON_5";
    progress: number;
    targetDate: Date | null;
    areaName: string | null;
  }

  const goalDefs: GoalDef[] = [
    {
      title: "Run a half marathon",
      description:
        "Train for and complete a half marathon within the next 18 months. Build up from current 5K base to 21K race distance.",
      status: "IN_PROGRESS",
      horizon: "HORIZON_3",
      progress: 25,
      targetDate: daysFromNow(365),
      areaName: "Health & Fitness",
    },
    {
      title: "Achieve senior engineer promotion",
      description:
        "Demonstrate technical leadership, mentor 2+ junior devs, lead a cross-team initiative, and pass the promo committee review.",
      status: "IN_PROGRESS",
      horizon: "HORIZON_3",
      progress: 40,
      targetDate: daysFromNow(270),
      areaName: "Career",
    },
    {
      title: "Build a location-independent income",
      description:
        "Develop skills and income streams that allow working from anywhere. Target: cover living expenses from remote/freelance work within 5 years.",
      status: "NOT_STARTED",
      horizon: "HORIZON_4",
      progress: 0,
      targetDate: daysFromNow(1460),
      areaName: "Finance",
    },
  ];

  const goals: Record<string, { id: string }> = {};
  for (const g of goalDefs) {
    const existing = await prisma.goal.findFirst({
      where: { userId: demo.id, title: g.title },
    });
    if (existing) {
      goals[g.title] = existing;
    } else {
      const record = await prisma.goal.create({
        data: {
          title: g.title,
          description: g.description,
          status: g.status,
          horizon: g.horizon,
          progress: g.progress,
          targetDate: g.targetDate,
          userId: demo.id,
          areaId: g.areaName ? areas[g.areaName]?.id : undefined,
        },
      });
      goals[g.title] = record;
    }
  }
  console.log("[+] Goals:", Object.keys(goals).join(", "));

  // =========================================================================
  // 6. PROJECTS (for demo user)
  // =========================================================================

  interface ProjectDef {
    title: string;
    description: string;
    status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "DROPPED" | "SOMEDAY_MAYBE";
    type: "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS";
    outcome: string;
    sortOrder: number;
    isSomedayMaybe: boolean;
    areaName: string | null;
    goalTitle: string | null;
  }

  const projectDefs: ProjectDef[] = [
    {
      title: "Plan Vacation to Japan",
      description:
        "Research and book a 2-week trip to Japan. Cover flights, accommodations, rail pass, itinerary for Tokyo, Kyoto, Osaka, and Hiroshima.",
      status: "ACTIVE",
      type: "SEQUENTIAL",
      outcome: "Fully booked Japan trip with detailed day-by-day itinerary",
      sortOrder: 0,
      isSomedayMaybe: false,
      areaName: "Family",
      goalTitle: null,
    },
    {
      title: "Home Renovation \u2014 Kitchen",
      description:
        "Complete kitchen renovation including new countertops, backsplash, cabinet refacing, and lighting upgrade.",
      status: "ACTIVE",
      type: "PARALLEL",
      outcome: "Fully renovated kitchen with modern finishes, completed within budget",
      sortOrder: 1,
      isSomedayMaybe: false,
      areaName: "Home",
      goalTitle: null,
    },
    {
      title: "Learn TypeScript",
      description:
        "Work through a structured TypeScript curriculum: basics, generics, advanced types, then build a real project.",
      status: "ACTIVE",
      type: "SEQUENTIAL",
      outcome: "Confident with TypeScript generics, utility types, and can scaffold projects from scratch",
      sortOrder: 2,
      isSomedayMaybe: false,
      areaName: "Career",
      goalTitle: "Achieve senior engineer promotion",
    },
    {
      title: "Q1 Budget Review",
      description:
        "Review all Q1 spending, reconcile accounts, update budget categories, and set Q2 targets.",
      status: "ACTIVE",
      type: "SINGLE_ACTIONS",
      outcome: "Clear picture of Q1 finances and actionable Q2 budget",
      sortOrder: 3,
      isSomedayMaybe: false,
      areaName: "Finance",
      goalTitle: null,
    },
    {
      title: "Write Blog Post",
      description:
        "Draft, edit, and publish a technical blog post about building a GTD app with Next.js and Prisma.",
      status: "SOMEDAY_MAYBE",
      type: "SEQUENTIAL",
      outcome: "Published blog post with at least 500 reads in first month",
      sortOrder: 4,
      isSomedayMaybe: true,
      areaName: "Personal Development",
      goalTitle: "Achieve senior engineer promotion",
    },
    {
      title: "Organize Garage",
      description:
        "Declutter, install shelving, label storage bins, and create a functional workshop area in the garage.",
      status: "ACTIVE",
      type: "PARALLEL",
      outcome: "Clean, organized garage with designated zones for tools, storage, and workspace",
      sortOrder: 5,
      isSomedayMaybe: false,
      areaName: "Home",
      goalTitle: null,
    },
  ];

  const projects: Record<string, { id: string }> = {};
  for (const p of projectDefs) {
    const existing = await prisma.project.findFirst({
      where: { userId: demo.id, title: p.title },
    });
    if (existing) {
      projects[p.title] = existing;
    } else {
      const record = await prisma.project.create({
        data: {
          title: p.title,
          description: p.description,
          status: p.status,
          type: p.type,
          outcome: p.outcome,
          sortOrder: p.sortOrder,
          isSomedayMaybe: p.isSomedayMaybe,
          userId: demo.id,
          areaId: p.areaName ? areas[p.areaName]?.id : undefined,
          goalId: p.goalTitle ? goals[p.goalTitle]?.id : undefined,
        },
      });
      projects[p.title] = record;
    }
  }
  console.log("[+] Projects:", Object.keys(projects).join(", "));

  // =========================================================================
  // 7. TASKS (for demo user)
  // =========================================================================

  interface TaskDef {
    title: string;
    notes?: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "DROPPED";
    isNextAction: boolean;
    estimatedMins?: number;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    scheduledDate?: Date;
    dueDate?: Date;
    sortOrder: number;
    completedAt?: Date;
    projectTitle: string | null;
    contextName: string | null;
    dependsOnTitles?: string[];
  }

  const taskDefs: TaskDef[] = [
    // --- Plan Vacation to Japan (SEQUENTIAL) ---
    {
      title: "Research best time to visit Japan",
      notes: "Consider cherry blossom season (late March - mid April) vs autumn foliage (November). Check visa requirements.",
      status: "COMPLETED",
      isNextAction: false,
      estimatedMins: 30,
      energyLevel: "LOW",
      sortOrder: 0,
      completedAt: daysAgo(10),
      projectTitle: "Plan Vacation to Japan",
      contextName: "@Computer",
    },
    {
      title: "Set vacation budget",
      notes: "Include flights (~$1,200/person), hotels (~$150/night), rail pass ($300), food ($80/day), activities.",
      status: "COMPLETED",
      isNextAction: false,
      estimatedMins: 45,
      energyLevel: "MEDIUM",
      sortOrder: 1,
      completedAt: daysAgo(7),
      projectTitle: "Plan Vacation to Japan",
      contextName: "@Computer",
      dependsOnTitles: ["Research best time to visit Japan"],
    },
    {
      title: "Book round-trip flights to Tokyo",
      notes: "Check Google Flights, Skyscanner. Prefer direct flights from SFO. Use credit card points if available.",
      status: "IN_PROGRESS",
      isNextAction: true,
      estimatedMins: 60,
      energyLevel: "MEDIUM",
      sortOrder: 2,
      projectTitle: "Plan Vacation to Japan",
      contextName: "@Computer",
      dependsOnTitles: ["Set vacation budget"],
    },
    {
      title: "Purchase Japan Rail Pass",
      status: "NOT_STARTED",
      isNextAction: false,
      estimatedMins: 20,
      energyLevel: "LOW",
      sortOrder: 3,
      projectTitle: "Plan Vacation to Japan",
      contextName: "@Computer",
      dependsOnTitles: ["Book round-trip flights to Tokyo"],
    },
    {
      title: "Book hotels in Tokyo, Kyoto, and Osaka",
      notes: "Look at Booking.com and Agoda. Target mid-range hotels near train stations.",
      status: "NOT_STARTED",
      isNextAction: false,
      estimatedMins: 90,
      energyLevel: "HIGH",
      sortOrder: 4,
      projectTitle: "Plan Vacation to Japan",
      contextName: "@Computer",
      dependsOnTitles: ["Book round-trip flights to Tokyo"],
    },

    // --- Home Renovation - Kitchen (PARALLEL) ---
    {
      title: "Get 3 quotes for countertop installation",
      notes: "Materials: quartz or granite. Measure current countertop area first (approx 45 sq ft).",
      status: "IN_PROGRESS",
      isNextAction: true,
      estimatedMins: 120,
      energyLevel: "HIGH",
      sortOrder: 0,
      projectTitle: "Home Renovation \u2014 Kitchen",
      contextName: "@Phone",
    },
    {
      title: "Choose backsplash tile design",
      notes: "Visit Home Depot and local tile shop. Budget: $500-800 for materials.",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 60,
      energyLevel: "MEDIUM",
      sortOrder: 1,
      projectTitle: "Home Renovation \u2014 Kitchen",
      contextName: "@Errands",
    },
    {
      title: "Order cabinet hardware samples",
      status: "COMPLETED",
      isNextAction: false,
      estimatedMins: 15,
      energyLevel: "LOW",
      sortOrder: 2,
      completedAt: daysAgo(3),
      projectTitle: "Home Renovation \u2014 Kitchen",
      contextName: "@Computer",
    },
    {
      title: "Schedule electrician for under-cabinet lighting",
      notes: "Need LED strip lighting under upper cabinets + 2 pendant lights over island.",
      status: "WAITING",
      isNextAction: false,
      estimatedMins: 15,
      energyLevel: "LOW",
      sortOrder: 3,
      projectTitle: "Home Renovation \u2014 Kitchen",
      contextName: "@Phone",
    },

    // --- Learn TypeScript (SEQUENTIAL) ---
    {
      title: "Complete TypeScript handbook: Basic Types chapter",
      notes: "Focus on: primitives, arrays, tuples, enums, any vs unknown, void/never.",
      status: "COMPLETED",
      isNextAction: false,
      estimatedMins: 90,
      energyLevel: "HIGH",
      sortOrder: 0,
      completedAt: daysAgo(14),
      projectTitle: "Learn TypeScript",
      contextName: "@Computer",
    },
    {
      title: "Complete TypeScript handbook: Interfaces & Types chapter",
      notes: "Understand difference between interface and type alias. Practice with exercises.",
      status: "COMPLETED",
      isNextAction: false,
      estimatedMins: 90,
      energyLevel: "HIGH",
      sortOrder: 1,
      completedAt: daysAgo(7),
      projectTitle: "Learn TypeScript",
      contextName: "@Computer",
      dependsOnTitles: ["Complete TypeScript handbook: Basic Types chapter"],
    },
    {
      title: "Complete TypeScript handbook: Generics chapter",
      notes: "Key topics: generic functions, generic constraints, using type parameters in generic constraints.",
      status: "IN_PROGRESS",
      isNextAction: true,
      estimatedMins: 120,
      energyLevel: "HIGH",
      sortOrder: 2,
      projectTitle: "Learn TypeScript",
      contextName: "@Computer",
      dependsOnTitles: ["Complete TypeScript handbook: Interfaces & Types chapter"],
    },
    {
      title: "Build a small CLI tool in TypeScript",
      notes: "Idea: a task manager CLI that reads/writes JSON. Practice generics, error handling, and project structure.",
      status: "NOT_STARTED",
      isNextAction: false,
      estimatedMins: 240,
      energyLevel: "HIGH",
      sortOrder: 3,
      projectTitle: "Learn TypeScript",
      contextName: "@Computer",
      dependsOnTitles: ["Complete TypeScript handbook: Generics chapter"],
    },

    // --- Q1 Budget Review (SINGLE_ACTIONS) ---
    {
      title: "Export bank statements for Jan-Mar",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 15,
      energyLevel: "LOW",
      sortOrder: 0,
      projectTitle: "Q1 Budget Review",
      contextName: "@Computer",
    },
    {
      title: "Categorize all Q1 transactions in spreadsheet",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 60,
      energyLevel: "MEDIUM",
      sortOrder: 1,
      projectTitle: "Q1 Budget Review",
      contextName: "@Computer",
    },
    {
      title: "Review subscription services and cancel unused",
      notes: "Check: streaming services, SaaS tools, gym membership, news subscriptions.",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 30,
      energyLevel: "LOW",
      sortOrder: 2,
      projectTitle: "Q1 Budget Review",
      contextName: "@Computer",
    },

    // --- Organize Garage (PARALLEL) ---
    {
      title: "Buy shelving unit from IKEA",
      notes: "BROR shelving unit, 2 sections. Check stock at local store first.",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 90,
      energyLevel: "MEDIUM",
      sortOrder: 0,
      projectTitle: "Organize Garage",
      contextName: "@Errands",
    },
    {
      title: "Sort garage items into keep/donate/trash piles",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 180,
      energyLevel: "HIGH",
      sortOrder: 1,
      projectTitle: "Organize Garage",
      contextName: "@Home",
    },
    {
      title: "Drop off donations at Goodwill",
      status: "NOT_STARTED",
      isNextAction: false,
      estimatedMins: 45,
      energyLevel: "LOW",
      sortOrder: 2,
      scheduledDate: daysFromNow(14),
      projectTitle: "Organize Garage",
      contextName: "@Errands",
    },

    // --- Standalone / ticklered tasks ---
    {
      title: "Call dentist to schedule 6-month checkup",
      status: "NOT_STARTED",
      isNextAction: true,
      estimatedMins: 10,
      energyLevel: "LOW",
      sortOrder: 0,
      scheduledDate: daysFromNow(3),
      projectTitle: null,
      contextName: "@Phone",
    },
  ];

  const tasks: Record<string, { id: string }> = {};
  for (const t of taskDefs) {
    const existing = await prisma.task.findFirst({
      where: { userId: demo.id, title: t.title },
    });
    if (existing) {
      tasks[t.title] = existing;
    } else {
      const record = await prisma.task.create({
        data: {
          title: t.title,
          notes: t.notes,
          status: t.status,
          isNextAction: t.isNextAction,
          estimatedMins: t.estimatedMins,
          energyLevel: t.energyLevel,
          scheduledDate: t.scheduledDate,
          dueDate: t.dueDate,
          sortOrder: t.sortOrder,
          completedAt: t.completedAt,
          userId: demo.id,
          projectId: t.projectTitle ? projects[t.projectTitle]?.id : undefined,
          contextId: t.contextName ? contexts[t.contextName]?.id : undefined,
        },
      });
      tasks[t.title] = record;
    }
  }
  console.log(`[+] Tasks: ${Object.keys(tasks).length} created`);

  // --- Wire up task dependencies (explicit TaskDependency model) ---
  for (const t of taskDefs) {
    if (t.dependsOnTitles && t.dependsOnTitles.length > 0) {
      const taskRecord = tasks[t.title];
      if (!taskRecord) continue;

      for (const depTitle of t.dependsOnTitles) {
        const predecessorRecord = tasks[depTitle];
        if (!predecessorRecord) continue;

        // Check if dependency already exists
        const existing = await prisma.taskDependency.findUnique({
          where: {
            predecessorId_successorId: {
              predecessorId: predecessorRecord.id,
              successorId: taskRecord.id,
            },
          },
        });

        if (!existing) {
          await prisma.taskDependency.create({
            data: {
              predecessorId: predecessorRecord.id,
              successorId: taskRecord.id,
              type: "FINISH_TO_START",
              lagMinutes: 0,
            },
          });
        }
      }
    }
  }
  console.log("[+] Task dependencies wired");

  // =========================================================================
  // 8. INBOX ITEMS (for demo user)
  // =========================================================================

  const inboxDefs = [
    {
      content: "Look into noise-cancelling headphones for the office",
      notes: "Sarah recommended the Sony WH-1000XM5. Check reviews and compare with Bose QC Ultra.",
    },
    {
      content: "Idea: automate weekly report generation with a Python script",
      notes: null,
    },
    {
      content: "Mom mentioned Aunt Linda's birthday is coming up \u2014 need to get a gift",
      notes: "She likes gardening and mystery novels.",
    },
    {
      content: "That article about spaced repetition for learning \u2014 read and take notes",
      notes: "Link: https://ncase.me/remember/",
    },
    {
      content: "Check if homeowner's insurance covers the kitchen renovation work",
      notes: null,
    },
  ];

  for (const item of inboxDefs) {
    const existing = await prisma.inboxItem.findFirst({
      where: { userId: demo.id, content: item.content },
    });
    if (!existing) {
      await prisma.inboxItem.create({
        data: {
          content: item.content,
          notes: item.notes,
          status: "UNPROCESSED",
          userId: demo.id,
        },
      });
    }
  }
  console.log(`[+] Inbox items: ${inboxDefs.length}`);

  // =========================================================================
  // 9. WAITING FOR (for demo user)
  // =========================================================================

  const waitingForDefs = [
    {
      description: "Countertop quote from GraniteWorks",
      person: "Mike at GraniteWorks",
      dueDate: daysFromNow(5),
      followUpDate: daysFromNow(3),
      isResolved: false,
    },
    {
      description: "TypeScript course reimbursement approval",
      person: "Manager (Lisa)",
      dueDate: daysFromNow(10),
      followUpDate: daysFromNow(7),
      isResolved: false,
    },
    {
      description: "Tax documents from accountant",
      person: "CPA (David Chen)",
      dueDate: daysFromNow(21),
      followUpDate: daysFromNow(14),
      isResolved: false,
    },
  ];

  for (const wf of waitingForDefs) {
    const existing = await prisma.waitingFor.findFirst({
      where: { userId: demo.id, description: wf.description },
    });
    if (!existing) {
      await prisma.waitingFor.create({
        data: {
          ...wf,
          userId: demo.id,
        },
      });
    }
  }
  console.log(`[+] Waiting-for items: ${waitingForDefs.length}`);

  // =========================================================================
  // 10. WIKI ARTICLES (for demo user)
  // =========================================================================

  const wikiDefs = [
    {
      title: "Meeting Notes Template",
      slug: "meeting-notes-template",
      content: `# Meeting Notes Template

## Meeting Info
- **Date:** [DATE]
- **Attendees:** [NAMES]
- **Purpose:** [OBJECTIVE]

## Agenda
1. [Topic 1]
2. [Topic 2]
3. [Topic 3]

## Discussion Notes
- ...

## Action Items
| Owner | Action | Due Date |
|-------|--------|----------|
|       |        |          |

## Decisions Made
- ...

## Next Meeting
- **Date:** [DATE]
- **Topics to carry over:** ...`,
      tags: ["template", "meetings", "work"],
    },
    {
      title: "Packing Checklist \u2014 International Travel",
      slug: "packing-checklist-international",
      content: `# International Travel Packing Checklist

## Documents
- [ ] Passport (valid 6+ months)
- [ ] Visa / travel authorization
- [ ] Travel insurance confirmation
- [ ] Flight itinerary (printed)
- [ ] Hotel confirmations
- [ ] Emergency contacts card

## Electronics
- [ ] Phone + charger
- [ ] Laptop + charger
- [ ] Universal power adapter
- [ ] Portable battery pack
- [ ] Headphones
- [ ] Camera + memory cards

## Clothing (adjust for weather)
- [ ] 5-7 days of tops
- [ ] 3-4 bottoms
- [ ] Underwear + socks (7 days)
- [ ] Light jacket / rain layer
- [ ] Comfortable walking shoes
- [ ] Sandals / flip-flops
- [ ] Sleepwear

## Toiletries (travel-sized)
- [ ] Toothbrush + toothpaste
- [ ] Deodorant
- [ ] Shampoo + conditioner
- [ ] Sunscreen
- [ ] Medications + prescriptions
- [ ] First-aid basics

## Misc
- [ ] Reusable water bottle
- [ ] Snacks for travel day
- [ ] Neck pillow
- [ ] Book / e-reader
- [ ] Laundry bag`,
      tags: ["checklist", "travel", "packing"],
    },
    {
      title: "Emergency Contacts",
      slug: "emergency-contacts",
      content: `# Emergency Contacts

## Personal
- **Partner:** Jane \u2014 (555) 123-4567
- **Parents:** Mom (555) 234-5678, Dad (555) 345-6789
- **Sibling:** Mark \u2014 (555) 456-7890

## Medical
- **Primary Doctor:** Dr. Sarah Kim \u2014 (555) 567-8901
- **Dentist:** Dr. Patel \u2014 (555) 678-9012
- **Pharmacy:** CVS on Main St \u2014 (555) 789-0123
- **Allergies:** None known
- **Blood Type:** O+

## Home
- **Landlord/HOA:** Property Mgmt Co \u2014 (555) 890-1234
- **Plumber:** Mike's Plumbing \u2014 (555) 901-2345
- **Electrician:** Spark Electric \u2014 (555) 012-3456
- **Locksmith:** 24hr Lock \u2014 (555) 111-2222

## Work
- **Manager:** Lisa Wong \u2014 lisa@company.com
- **HR:** hr@company.com \u2014 (555) 222-3333
- **IT Helpdesk:** help@company.com \u2014 ext 4444

## Insurance
- **Health:** BlueCross \u2014 Policy #BC-123456
- **Auto:** State Farm \u2014 Policy #SF-789012
- **Home:** Allstate \u2014 Policy #AS-345678`,
      tags: ["reference", "emergency", "contacts"],
    },
  ];

  for (const article of wikiDefs) {
    await prisma.wikiArticle.upsert({
      where: {
        userId_slug: { userId: demo.id, slug: article.slug },
      },
      update: {
        title: article.title,
        content: article.content,
        tags: article.tags,
      },
      create: {
        ...article,
        userId: demo.id,
      },
    });
  }
  console.log(`[+] Wiki articles: ${wikiDefs.length}`);

  // =========================================================================
  // 11. HORIZON NOTES (for demo user)
  // =========================================================================

  interface HorizonNoteDef {
    level:
      | "RUNWAY"
      | "HORIZON_1"
      | "HORIZON_2"
      | "HORIZON_3"
      | "HORIZON_4"
      | "HORIZON_5";
    title: string;
    content: string;
  }

  const horizonNoteDefs: HorizonNoteDef[] = [
    {
      level: "RUNWAY",
      title: "Current Focus Areas",
      content: `# Current Focus \u2014 This Week

## Top priorities
1. Book Japan flights before prices go up
2. Finish TypeScript generics chapter
3. Follow up on kitchen countertop quotes

## Energy management
- Mornings: Deep work (TypeScript learning, complex tasks)
- Afternoons: Calls, emails, errands
- Evenings: Light tasks, planning next day

## Habits to maintain
- Morning run (Tue/Thu/Sat)
- Daily inbox processing (end of day)
- Weekly review (Sunday evening)`,
    },
    {
      level: "HORIZON_2",
      title: "Areas of Focus & Responsibility",
      content: `# Areas of Focus

## Professional
- **Core job responsibilities:** Ship features on time, code quality, team collaboration
- **Growth:** TypeScript mastery, system design skills, mentoring juniors
- **Networking:** Attend 1 meetup/month, maintain LinkedIn

## Personal
- **Health:** Consistent exercise 4x/week, meal prep Sundays, 7+ hrs sleep
- **Finance:** Stay within monthly budget, contribute to 401k, build emergency fund
- **Relationships:** Weekly date night, monthly family call, plan group activities

## Home
- **Maintenance:** Keep up with repairs, seasonal tasks
- **Organization:** Declutter one area per month
- **Improvement:** Kitchen renovation (current), bathroom next year`,
    },
    {
      level: "HORIZON_3",
      title: "1-2 Year Goals & Objectives",
      content: `# Goals \u2014 Next 1-2 Years

## Career
- Achieve senior engineer title (target: Q4 this year)
- Publish 3+ technical blog posts
- Give a conference talk or workshop

## Health
- Complete a half marathon
- Establish consistent strength training routine
- Reach target weight and maintain

## Financial
- Build 6-month emergency fund
- Max out 401k contributions
- Start a side project with revenue potential

## Personal
- Visit Japan (planned!)
- Read 24 books this year
- Learn conversational Japanese basics`,
    },
    {
      level: "HORIZON_4",
      title: "3-5 Year Vision",
      content: `# Vision \u2014 3-5 Years Out

## Career & Work
- Move into a staff/principal engineer or engineering manager role
- Have the option to work remotely / location-independently
- Build a personal brand in the developer community

## Lifestyle
- Own a home (or be ready to buy)
- Have location flexibility \u2014 able to travel for extended periods
- Strong financial foundation: investments growing, no high-interest debt

## Growth
- Fluent in a second language
- Deep expertise in 2-3 technical domains
- Mentoring others regularly`,
    },
    {
      level: "HORIZON_5",
      title: "Life Purpose & Principles",
      content: `# Purpose & Principles

## Core purpose
Build things that help people, while living a balanced and intentional life.

## Guiding principles
1. **Clarity over complexity** \u2014 simplify systems, communication, and goals
2. **Health is the foundation** \u2014 physical and mental wellness enable everything else
3. **Learn constantly** \u2014 stay curious, embrace discomfort, share knowledge
4. **Relationships matter** \u2014 invest in the people who matter
5. **Own your time** \u2014 be deliberate about where attention goes
6. **Create more than consume** \u2014 build, write, teach, contribute

## What success looks like
- Waking up excited about the day ahead
- Meaningful work that creates value for others
- Deep relationships with family and friends
- Financial freedom and security
- Continuous growth and learning`,
    },
  ];

  for (const note of horizonNoteDefs) {
    const existing = await prisma.horizonNote.findFirst({
      where: { userId: demo.id, level: note.level, title: note.title },
    });
    if (!existing) {
      await prisma.horizonNote.create({
        data: {
          ...note,
          userId: demo.id,
        },
      });
    }
  }
  console.log(`[+] Horizon notes: ${horizonNoteDefs.length}`);

  // =========================================================================
  // DONE
  // =========================================================================

  console.log("\nSeed complete!");
  console.log("  Admin login:  admin@tandem.local / admin123");
  console.log("  Demo login:   demo@tandem.local / demo123");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
