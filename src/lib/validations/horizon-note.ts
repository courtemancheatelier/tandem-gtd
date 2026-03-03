import { z } from "zod";

export const upsertHorizonNoteSchema = z.object({
  level: z.enum([
    "RUNWAY",
    "HORIZON_1",
    "HORIZON_2",
    "HORIZON_3",
    "HORIZON_4",
    "HORIZON_5",
  ]),
  title: z.string().max(200).default(""),
  content: z.string().max(10000),
});

export type UpsertHorizonNoteInput = z.infer<typeof upsertHorizonNoteSchema>;
