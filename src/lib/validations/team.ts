import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
});

export const addTeamMemberSchema = z
  .object({
    userId: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
    label: z.string().max(100).optional(),
  })
  .refine((data) => data.userId || data.email, {
    message: "Either userId or email must be provided",
  });

export const updateTeamMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  label: z.string().max(100).nullable().optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
