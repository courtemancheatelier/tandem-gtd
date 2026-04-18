import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  tandemSchedulerStarted: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Boot the in-process scheduler the first time prisma is imported on the
// server. Every API route imports prisma, so this fires within seconds of
// boot (on the first request). The instrumentation.ts hook would be
// cleaner but in Next 14 it bundles a separate chunk that can't resolve
// node-only deps (web-push, nodemailer) transitively pulled by the
// scheduler. Booting from prisma.ts keeps everything in the main server
// bundle. See docs/specs/INTERNAL_SCHEDULER_NOTIFICATIONS.md.
if (
  typeof window === "undefined" &&
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.INTERNAL_SCHEDULER_ENABLED !== "false" &&
  !globalForPrisma.tandemSchedulerStarted
) {
  globalForPrisma.tandemSchedulerStarted = true;
  // Defer to next tick so this module finishes initializing first.
  setImmediate(() => {
    import("@/lib/scheduler/notification-scheduler")
      .then(({ startNotificationScheduler }) => startNotificationScheduler())
      .catch((err) => console.error("[scheduler] failed to start:", err));
  });
}
