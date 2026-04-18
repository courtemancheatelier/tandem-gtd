export type TagCategory = "productive" | "reactive" | "maintenance" | "untracked";

export interface QuickTag {
  key: string;
  emoji: string;
  label: string;
  category: TagCategory;
}

export const QUICK_TAGS: QuickTag[] = [
  { key: "task_work", emoji: "\u{1F3AF}", label: "Task work", category: "productive" },
  { key: "email_messages", emoji: "\u{1F4E7}", label: "Email/messages", category: "reactive" },
  { key: "meeting", emoji: "\u{1F91D}", label: "Meeting", category: "productive" },
  { key: "phone_scroll", emoji: "\u{1F4F1}", label: "Phone/scroll", category: "untracked" },
  { key: "eating", emoji: "\u{1F37D}", label: "Eating", category: "maintenance" },
  { key: "transit", emoji: "\u{1F6B6}", label: "Transit", category: "maintenance" },
  { key: "rest_break", emoji: "\u{1F4A4}", label: "Rest/break", category: "maintenance" },
  { key: "thinking", emoji: "\u{1F9E0}", label: "Thinking", category: "productive" },
  { key: "conversation", emoji: "\u{1F4AC}", label: "Conversation", category: "productive" },
  { key: "entertainment", emoji: "\u{1F3AD}", label: "Entertainment", category: "untracked" },
  { key: "exercise", emoji: "\u{1F3CB}", label: "Exercise", category: "maintenance" },
  { key: "chores", emoji: "\u{1F3E0}", label: "Chores", category: "maintenance" },
];

export const QUICK_TAG_MAP = new Map(QUICK_TAGS.map((t) => [t.key, t]));

export const INTERVAL_MINUTES = 15;

export const CATEGORY_COLORS: Record<TagCategory, string> = {
  productive: "hsl(var(--chart-2, 142 71% 45%))",
  reactive: "hsl(var(--chart-4, 24 95% 53%))",
  maintenance: "hsl(var(--muted-foreground))",
  untracked: "hsl(var(--chart-3, 262 83% 58%))",
};

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  productive: "Productive",
  reactive: "Reactive",
  maintenance: "Maintenance",
  untracked: "Untracked",
};
