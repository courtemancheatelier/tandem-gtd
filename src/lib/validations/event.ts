import { z } from "zod";

// ── Create Event ────────────────────────────────────────────────────────────

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  eventDate: z.string().datetime(),
  lockDate: z.string().datetime().optional(),
  projectId: z.string().min(1),
  teamId: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

// ── Update Event ────────────────────────────────────────────────────────────

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  eventDate: z.string().datetime().optional(),
  lockDate: z.string().datetime().optional().nullable(),
  isLocked: z.boolean().optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ── Event Field ─────────────────────────────────────────────────────────────

export const createEventFieldSchema = z.object({
  type: z.enum(["ATTENDANCE", "HEADCOUNT", "SINGLE_SELECT", "MULTI_SELECT", "CLAIM", "TEXT", "TOGGLE"]),
  label: z.string().min(1).max(200),
  isRequired: z.boolean().optional(),
  isOrgOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
});

export type CreateEventFieldInput = z.infer<typeof createEventFieldSchema>;

export const updateEventFieldSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  isRequired: z.boolean().optional(),
  isOrgOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
});

export type UpdateEventFieldInput = z.infer<typeof updateEventFieldSchema>;

// ── Invitation ──────────────────────────────────────────────────────────────

export const createInvitationSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(100),
  role: z.string().max(100).optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// ── Claim Lock ──────────────────────────────────────────────────────────────

export const claimLockSchema = z.object({
  fieldId: z.string().min(1),
  optionKey: z.string().min(1),
});

export type ClaimLockInput = z.infer<typeof claimLockSchema>;

// ── Submit RSVP ────────────────────────────────────────────────────────────

export const submitRsvpSchema = z.object({
  attendance: z.enum(["YES", "NO", "MAYBE"]),
  fieldValues: z.record(z.string(), z.any()).optional(),
});

export type SubmitRsvpInput = z.infer<typeof submitRsvpSchema>;

// ── Event Trigger ───────────────────────────────────────────────────────────

export const createEventTriggerSchema = z.object({
  condition: z.string().min(1).max(500),
  taskTitle: z.string().min(1).max(200),
  assigneeId: z.string().optional(),
});

export type CreateEventTriggerInput = z.infer<typeof createEventTriggerSchema>;
