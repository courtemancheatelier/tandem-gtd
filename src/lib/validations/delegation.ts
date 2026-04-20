import { z } from "zod";

export const createDelegationSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  delegateeId: z.string().min(1, "delegateeId is required"),
  landingZone: z.enum(["INBOX", "DO_NOW"]).default("INBOX"),
  note: z.string().max(1000).optional(),
});

export const declineDelegationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;
export type DeclineDelegationInput = z.infer<typeof declineDelegationSchema>;
