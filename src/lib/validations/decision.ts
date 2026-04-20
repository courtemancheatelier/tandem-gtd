import { z } from "zod";

export const createDecisionSchema = z.object({
  question: z.string().min(1).max(2000),
  context: z.string().max(5000).optional(),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  respondentIds: z.array(z.string()).min(1).max(50),
  deadline: z.string().datetime().optional(),
  wikiSlug: z.string().max(200).optional(),
  decisionType: z.enum(["APPROVAL", "POLL", "QUICK_POLL", "PROPOSAL"]).default("APPROVAL"),
  options: z.array(z.object({
    label: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
  })).optional(),
  // Proposal-specific fields
  description: z.string().max(10000).optional(),
  wikiArticleId: z.string().optional(),
  wikiSection: z.string().max(200).optional(),
}).refine(
  (data) => (data.taskId && !data.projectId) || (!data.taskId && data.projectId),
  { message: "Exactly one of taskId or projectId must be provided" }
).refine(
  (data) => (data.decisionType !== "POLL" && data.decisionType !== "QUICK_POLL") || (data.options && data.options.length >= 2),
  { message: "Poll decisions require at least 2 options" }
);

export const respondDecisionSchema = z.object({
  vote: z.enum(["APPROVE", "REJECT", "COMMENT", "DEFER"]),
  comment: z.string().max(2000).optional(),
});

export const resolveDecisionSchema = z.object({
  resolution: z.string().min(1).max(5000),
  chosenOptionId: z.string().optional(),
});

export const voteOptionSchema = z.object({
  optionId: z.string().min(1),
  comment: z.string().max(2000).optional(),
});

export const createContributionSchema = z.object({
  content: z.string().min(1).max(10000),
});

// === Decision Proposal lifecycle schemas ===

export const publishDecisionSchema = z.object({
  inputRequests: z.array(z.object({
    assigneeId: z.string().min(1),
    type: z.enum(["RESEARCH", "VOTE", "REVIEW", "APPROVAL_INPUT", "OPEN_INPUT"]).default("OPEN_INPUT"),
    prompt: z.string().max(2000).optional(),
    isRequired: z.boolean().default(true),
  })).optional(),
});

export const reviewDecisionSchema = z.object({});

export const resolveProposalSchema = z.object({
  outcome: z.string().min(1).max(10000),
  rationale: z.string().max(10000).optional(),
  chosenOptionId: z.string().optional(),
});

export const deferDecisionSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const cancelDecisionSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const createInputRequestSchema = z.object({
  assigneeId: z.string().min(1),
  type: z.enum(["RESEARCH", "VOTE", "REVIEW", "APPROVAL_INPUT", "OPEN_INPUT"]).default("OPEN_INPUT"),
  prompt: z.string().max(2000).optional(),
  isRequired: z.boolean().default(true),
});

export const updateInputRequestSchema = z.object({
  status: z.enum(["PENDING", "SUBMITTED", "WAIVED", "EXPIRED"]).optional(),
  prompt: z.string().max(2000).optional(),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type RespondDecisionInput = z.infer<typeof respondDecisionSchema>;
export type ResolveDecisionInput = z.infer<typeof resolveDecisionSchema>;
export type VoteOptionInput = z.infer<typeof voteOptionSchema>;
export type CreateContributionInput = z.infer<typeof createContributionSchema>;
export type PublishDecisionInput = z.infer<typeof publishDecisionSchema>;
export type ResolveProposalInput = z.infer<typeof resolveProposalSchema>;
export type DeferDecisionInput = z.infer<typeof deferDecisionSchema>;
export type CancelDecisionInput = z.infer<typeof cancelDecisionSchema>;
export type CreateInputRequestInput = z.infer<typeof createInputRequestSchema>;
export type UpdateInputRequestInput = z.infer<typeof updateInputRequestSchema>;
