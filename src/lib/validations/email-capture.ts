import { z } from "zod";

export const emailInboundSchema = z.object({
  token: z.string().min(8).max(32),
  subject: z.string().max(500),
  body: z.string().max(10000).optional(),
  from: z.string().email().optional(),
});

export type EmailInboundInput = z.infer<typeof emailInboundSchema>;
