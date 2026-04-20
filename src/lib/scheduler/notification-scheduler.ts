import { runNotificationTick } from "@/lib/services/notification-tick-service";
import { runTrialTick } from "@/lib/services/trial-tick-service";
import { runRetention } from "@/lib/services/retention-service";

const TICK_INTERVAL_MS = 15 * 60 * 1000;

let handle: NodeJS.Timeout | null = null;
let running = false;
// UTC YYYY-MM-DD of the last day the daily-slot jobs ran. Reset to null
// on process restart, which is safe because each daily job is idempotent.
let lastDailyRunDay: string | null = null;

/**
 * Start the in-process notification scheduler. Idempotent.
 *
 * Spec: docs/specs/INTERNAL_SCHEDULER_NOTIFICATIONS.md
 *
 * Single-process invariant: Tandem runs one Node process per database.
 * Do not start multiple Node processes against one Tandem DB without
 * leader election — both would tick and double-send notifications.
 */
export function startNotificationScheduler() {
  if (handle) return;

  console.log("[scheduler] notification scheduler starting (15 min interval)");

  handle = setInterval(async () => {
    if (running) {
      console.warn("[scheduler] previous notification tick still running — skipping");
      return;
    }
    running = true;
    try {
      const now = new Date();

      try {
        const result = await runNotificationTick(now);
        console.log("[scheduler] notification tick:", result);
      } catch (err) {
        console.error("[scheduler] notification tick failed:", err);
      }

      // Daily slot — runs once per UTC day. Each daily job is idempotent
      // so re-running after a process restart is safe.
      const today = now.toISOString().slice(0, 10);
      if (lastDailyRunDay !== today) {
        try {
          const trialResult = await runTrialTick(now);
          console.log("[scheduler] trial tick:", trialResult);
        } catch (err) {
          console.error("[scheduler] trial tick failed:", err);
        }

        try {
          const retentionResult = await runRetention({ dryRun: false });
          console.log("[scheduler] retention tick:", retentionResult);
        } catch (err) {
          console.error("[scheduler] retention tick failed:", err);
        }

        lastDailyRunDay = today;
      }
    } finally {
      running = false;
    }
  }, TICK_INTERVAL_MS);

  const stop = () => {
    if (handle) {
      clearInterval(handle);
      handle = null;
      console.log("[scheduler] notification scheduler stopped");
    }
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
