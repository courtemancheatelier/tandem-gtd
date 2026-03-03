import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

export const notificationQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const notificationPreferenceUpdateSchema = z.object({
  pushEnabled: z.boolean().optional(),
  pushDueToday: z.boolean().optional(),
  pushDueTomorrow: z.boolean().optional(),
  pushOverdue: z.boolean().optional(),
  pushWeeklyReview: z.boolean().optional(),
  pushDailyDigest: z.boolean().optional(),
  reminderTimeHour: z.number().int().min(0).max(23).optional(),
  reminderTimeMinute: z.number().int().min(0).max(59).optional(),
  weeklyReviewDay: z.number().int().min(0).max(6).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  emailEnabled: z.boolean().optional(),
  emailDailyDigest: z.boolean().optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type NotificationPreferenceUpdate = z.infer<typeof notificationPreferenceUpdateSchema>;
