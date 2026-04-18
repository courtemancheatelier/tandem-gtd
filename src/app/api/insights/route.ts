import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

function parseRange(range: string | null): Date {
  const now = new Date();
  switch (range) {
    case "30d":
      return new Date(now.getTime() - 30 * 86400000);
    case "1y":
      return new Date(now.getTime() - 365 * 86400000);
    case "all":
      return new Date(0);
    case "90d":
    default:
      return new Date(now.getTime() - 90 * 86400000);
  }
}

function getISOWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const range = request.nextUrl.searchParams.get("range");
  const since = parseRange(range);

  const [
    statusEvents,
    completedTasks,
    taskCreatedEvents,
    taskCompletedEvents,
    inboxCapturedEvents,
    inboxProcessedEvents,
    pendingInboxCount,
    contexts,
  ] = await Promise.all([
    // 1. Time-in-status: task lifecycle events
    prisma.taskEvent.findMany({
      where: {
        task: { userId },
        eventType: { in: ["CREATED", "STATUS_CHANGED", "COMPLETED", "REOPENED"] },
        createdAt: { gte: since },
      },
      select: {
        taskId: true,
        eventType: true,
        changes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    // 2. Cycle time: completed tasks in range
    prisma.task.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: since },
      },
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        energyLevel: true,
        contextId: true,
        context: { select: { name: true } },
        projectId: true,
        estimatedMins: true,
        actualMinutes: true,
      },
    }),

    // 5. Throughput: created events
    prisma.taskEvent.findMany({
      where: {
        task: { userId },
        eventType: "CREATED",
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    }),

    // 5. Throughput: completed events
    prisma.taskEvent.findMany({
      where: {
        task: { userId },
        eventType: "COMPLETED",
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    }),

    // 6. Inbox throughput: captured
    prisma.inboxEvent.findMany({
      where: {
        inboxItem: { userId },
        eventType: "CAPTURED",
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    }),

    // 6. Inbox throughput: processed
    prisma.inboxEvent.findMany({
      where: {
        inboxItem: { userId },
        eventType: "PROCESSED",
        createdAt: { gte: since },
      },
      select: { createdAt: true, changes: true },
    }),

    // 7. Inbox funnel: pending count
    prisma.inboxItem.count({
      where: { userId, status: "UNPROCESSED" },
    }),

    // Context names for breakdown
    prisma.context.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  // === 1. Time-in-status ===
  // Group events by taskId, compute duration between consecutive events
  const eventsByTask = new Map<string, typeof statusEvents>();
  for (const ev of statusEvents) {
    if (!eventsByTask.has(ev.taskId)) eventsByTask.set(ev.taskId, []);
    eventsByTask.get(ev.taskId)!.push(ev);
  }

  const statusDurations = new Map<string, number[]>();
  for (const events of Array.from(eventsByTask.values())) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const nextEv = events[i + 1];
      if (!nextEv) continue;

      // Determine the status that was entered by this event
      let enteredStatus: string | null = null;
      if (ev.eventType === "CREATED") {
        enteredStatus = "NOT_STARTED";
      } else if (ev.eventType === "REOPENED") {
        enteredStatus = "NOT_STARTED";
      } else if (ev.eventType === "COMPLETED") {
        enteredStatus = "COMPLETED";
      } else if (ev.eventType === "STATUS_CHANGED") {
        const changes = ev.changes as Record<string, { old?: string; new?: string }>;
        enteredStatus = changes?.status?.new ?? null;
      }

      if (!enteredStatus) continue;

      const durationHours =
        (nextEv.createdAt.getTime() - ev.createdAt.getTime()) / 3600000;
      if (!statusDurations.has(enteredStatus))
        statusDurations.set(enteredStatus, []);
      statusDurations.get(enteredStatus)!.push(durationHours);
    }
  }

  const timeInStatus = Array.from(statusDurations.entries()).map(
    ([status, durations]) => {
      durations.sort((a, b) => a - b);
      const avg =
        durations.reduce((s, d) => s + d, 0) / durations.length;
      const median =
        durations.length % 2 === 0
          ? (durations[durations.length / 2 - 1] +
              durations[durations.length / 2]) /
            2
          : durations[Math.floor(durations.length / 2)];
      return {
        status,
        avgHours: Math.round(avg * 10) / 10,
        medianHours: Math.round(median * 10) / 10,
        count: durations.length,
      };
    }
  );

  // === 2. Cycle time ===
  const contextMap = new Map(contexts.map((c) => [c.id, c.name]));

  const cycleTimesRaw = completedTasks
    .filter((t) => t.completedAt)
    .map((t) => ({
      hours:
        (t.completedAt!.getTime() - t.createdAt.getTime()) / 3600000,
      week: getISOWeekMonday(t.completedAt!),
      contextName: t.contextId ? contextMap.get(t.contextId) ?? "Unknown" : "None",
      energyLevel: t.energyLevel ?? "None",
    }));

  // Trend by week
  const cycleByWeek = new Map<string, number[]>();
  for (const ct of cycleTimesRaw) {
    if (!cycleByWeek.has(ct.week)) cycleByWeek.set(ct.week, []);
    cycleByWeek.get(ct.week)!.push(ct.hours);
  }
  const cycleTrend = Array.from(cycleByWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, hours]) => ({
      week,
      avgHours:
        Math.round(
          (hours.reduce((s, h) => s + h, 0) / hours.length) * 10
        ) / 10,
      count: hours.length,
    }));

  // Breakdown by context
  const cycleByContext = new Map<string, number[]>();
  for (const ct of cycleTimesRaw) {
    if (!cycleByContext.has(ct.contextName))
      cycleByContext.set(ct.contextName, []);
    cycleByContext.get(ct.contextName)!.push(ct.hours);
  }
  const cycleContextBreakdown = Array.from(cycleByContext.entries()).map(
    ([context, hours]) => ({
      context,
      avgHours:
        Math.round(
          (hours.reduce((s, h) => s + h, 0) / hours.length) * 10
        ) / 10,
      count: hours.length,
    })
  );

  // Breakdown by energy
  const cycleByEnergy = new Map<string, number[]>();
  for (const ct of cycleTimesRaw) {
    if (!cycleByEnergy.has(ct.energyLevel))
      cycleByEnergy.set(ct.energyLevel, []);
    cycleByEnergy.get(ct.energyLevel)!.push(ct.hours);
  }
  const cycleEnergyBreakdown = Array.from(cycleByEnergy.entries()).map(
    ([energy, hours]) => ({
      energy,
      avgHours:
        Math.round(
          (hours.reduce((s, h) => s + h, 0) / hours.length) * 10
        ) / 10,
      count: hours.length,
    })
  );

  // === 3. Source distribution ===
  const sourceDistribution = await prisma.taskEvent.groupBy({
    by: ["source"],
    where: {
      task: { userId },
      createdAt: { gte: since },
    },
    _count: true,
  });
  const totalEvents = sourceDistribution.reduce(
    (s, d) => s + d._count,
    0
  );
  const sources = sourceDistribution.map((d) => ({
    source: d.source,
    count: d._count,
    percentage:
      totalEvents > 0
        ? Math.round((d._count / totalEvents) * 1000) / 10
        : 0,
  }));

  // === 4. Context/energy breakdown ===
  const contextBreakdown = new Map<string, number>();
  const energyBreakdown = new Map<string, number>();
  for (const t of completedTasks) {
    const ctxName = t.contextId
      ? contextMap.get(t.contextId) ?? "Unknown"
      : "None";
    contextBreakdown.set(ctxName, (contextBreakdown.get(ctxName) ?? 0) + 1);
    const energy = t.energyLevel ?? "None";
    energyBreakdown.set(energy, (energyBreakdown.get(energy) ?? 0) + 1);
  }

  const contextCompletions = Array.from(contextBreakdown.entries()).map(
    ([context, count]) => ({ context, count })
  );
  const energyCompletions = Array.from(energyBreakdown.entries()).map(
    ([energy, count]) => ({ energy, count })
  );

  // === 5. Throughput (created vs completed per week) ===
  const throughputMap = new Map<
    string,
    { created: number; completed: number }
  >();

  for (const ev of taskCreatedEvents) {
    const week = getISOWeekMonday(ev.createdAt);
    if (!throughputMap.has(week))
      throughputMap.set(week, { created: 0, completed: 0 });
    throughputMap.get(week)!.created++;
  }
  for (const ev of taskCompletedEvents) {
    const week = getISOWeekMonday(ev.createdAt);
    if (!throughputMap.has(week))
      throughputMap.set(week, { created: 0, completed: 0 });
    throughputMap.get(week)!.completed++;
  }

  const throughput = Array.from(throughputMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({ week, ...data }));

  // === 6. Inbox throughput ===
  const inboxThroughputMap = new Map<
    string,
    { captured: number; processed: number }
  >();

  for (const ev of inboxCapturedEvents) {
    const week = getISOWeekMonday(ev.createdAt);
    if (!inboxThroughputMap.has(week))
      inboxThroughputMap.set(week, { captured: 0, processed: 0 });
    inboxThroughputMap.get(week)!.captured++;
  }
  for (const ev of inboxProcessedEvents) {
    const week = getISOWeekMonday(ev.createdAt);
    if (!inboxThroughputMap.has(week))
      inboxThroughputMap.set(week, { captured: 0, processed: 0 });
    inboxThroughputMap.get(week)!.processed++;
  }

  const inboxThroughput = Array.from(inboxThroughputMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({ week, ...data }));

  // === 7. Inbox funnel ===
  // Categorize processed inbox events by their disposition
  const funnelCounts = { actionable: 0, someday: 0, reference: 0, trash: 0 };
  for (const ev of inboxProcessedEvents) {
    const changes = ev.changes as Record<string, unknown> | null;
    if (!changes) {
      funnelCounts.actionable++;
      continue;
    }
    // Check decision field or status change
    const decision = (changes.decision as string)?.toLowerCase?.() ?? "";
    const statusNew =
      ((changes.status as { new?: string })?.new ?? "").toLowerCase();

    if (
      decision.includes("trash") ||
      decision.includes("delete") ||
      statusNew === "deleted"
    ) {
      funnelCounts.trash++;
    } else if (
      decision.includes("someday") ||
      decision.includes("maybe")
    ) {
      funnelCounts.someday++;
    } else if (
      decision.includes("reference") ||
      decision.includes("wiki")
    ) {
      funnelCounts.reference++;
    } else {
      funnelCounts.actionable++;
    }
  }

  const totalProcessed = Object.values(funnelCounts).reduce(
    (s, c) => s + c,
    0
  );

  // === 8. Estimation accuracy ===
  const tasksWithBoth = completedTasks.filter(
    (t) => t.estimatedMins && t.actualMinutes && t.estimatedMins > 0
  );

  let estimationAccuracy = null;
  if (tasksWithBoth.length > 0) {
    const ratios = tasksWithBoth.map(
      (t) => t.actualMinutes! / t.estimatedMins!
    );
    const sortedRatios = [...ratios].sort((a, b) => a - b);
    const avgRatio =
      Math.round(
        (ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100
      ) / 100;
    const medianRatio =
      sortedRatios.length % 2 === 0
        ? Math.round(
            ((sortedRatios[sortedRatios.length / 2 - 1] +
              sortedRatios[sortedRatios.length / 2]) /
              2) *
              100
          ) / 100
        : Math.round(sortedRatios[Math.floor(sortedRatios.length / 2)] * 100) /
          100;

    // Distribution buckets
    const buckets = [
      { label: "Under 50%", min: 0, max: 0.5 },
      { label: "50–75%", min: 0.5, max: 0.75 },
      { label: "75–100%", min: 0.75, max: 1.0 },
      { label: "100–150%", min: 1.0, max: 1.5 },
      { label: "150–200%", min: 1.5, max: 2.0 },
      { label: "Over 200%", min: 2.0, max: Infinity },
    ];
    const distribution = buckets.map((b) => ({
      label: b.label,
      count: ratios.filter((r) => r >= b.min && r < b.max).length,
      isAccurate: b.min >= 0.75 && b.max <= 1.5,
    }));

    // Weekly trend (last 12 weeks)
    const weeklyMap = new Map<string, number[]>();
    for (const t of tasksWithBoth) {
      const week = getISOWeekMonday(t.completedAt!);
      if (!weeklyMap.has(week)) weeklyMap.set(week, []);
      weeklyMap.get(week)!.push(t.actualMinutes! / t.estimatedMins!);
    }
    const weeklyTrend = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, wkRatios]) => ({
        week,
        avgRatio:
          Math.round(
            (wkRatios.reduce((s, r) => s + r, 0) / wkRatios.length) * 100
          ) / 100,
        taskCount: wkRatios.length,
      }));

    // By energy level
    const energyMap = new Map<string, number[]>();
    for (const t of tasksWithBoth) {
      const energy = t.energyLevel ?? "None";
      if (!energyMap.has(energy)) energyMap.set(energy, []);
      energyMap.get(energy)!.push(t.actualMinutes! / t.estimatedMins!);
    }
    const byEnergy = Array.from(energyMap.entries()).map(([energy, ers]) => ({
      energy,
      avgRatio:
        Math.round((ers.reduce((s, r) => s + r, 0) / ers.length) * 100) / 100,
      count: ers.length,
    }));

    // By estimate size
    const sizeBuckets = [
      { label: "Quick (≤15m)", min: 0, max: 15 },
      { label: "Short (16–30m)", min: 16, max: 30 },
      { label: "Medium (31–60m)", min: 31, max: 60 },
      { label: "Long (61–120m)", min: 61, max: 120 },
      { label: "Extended (>120m)", min: 121, max: Infinity },
    ];
    const byEstimateSize = sizeBuckets
      .map((sb) => {
        const matching = tasksWithBoth.filter(
          (t) => t.estimatedMins! >= sb.min && t.estimatedMins! <= sb.max
        );
        if (matching.length === 0) return null;
        const sRatios = matching.map(
          (t) => t.actualMinutes! / t.estimatedMins!
        );
        return {
          label: sb.label,
          avgRatio:
            Math.round(
              (sRatios.reduce((s, r) => s + r, 0) / sRatios.length) * 100
            ) / 100,
          count: matching.length,
        };
      })
      .filter(Boolean);

    estimationAccuracy = {
      totalTasks: tasksWithBoth.length,
      avgRatio,
      medianRatio,
      distribution,
      weeklyTrend,
      byEnergy,
      byEstimateSize,
    };
  }

  return NextResponse.json({
    timeInStatus,
    cycleTime: {
      trend: cycleTrend,
      byContext: cycleContextBreakdown,
      byEnergy: cycleEnergyBreakdown,
    },
    sources,
    contextCompletions,
    energyCompletions,
    throughput,
    inboxThroughput,
    inboxFunnel: {
      ...funnelCounts,
      totalProcessed,
      pending: pendingInboxCount,
    },
    estimationAccuracy,
  });
}
