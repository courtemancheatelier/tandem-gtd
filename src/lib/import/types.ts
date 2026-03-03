export type DuplicateAction = "skip" | "overwrite";

export interface TaskPreviewItem {
  title: string;
  notes?: string | null;
  status: string;
  isNextAction?: boolean;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
  completedAt?: string | null;
  projectTitle?: string | null;
  contextName?: string | null;
  isDuplicate: boolean;
  duplicateAction: DuplicateAction;
}

export interface ProjectPreviewItem {
  title: string;
  description?: string | null;
  status: string;
  type: string;
  childType?: string;
  outcome?: string | null;
  sortOrder?: number;
  isSomedayMaybe?: boolean;
  completedAt?: string | null;
  areaName?: string | null;
  goalTitle?: string | null;
  parentProjectTitle?: string | null;
  isDuplicate: boolean;
  duplicateAction: DuplicateAction;
}

export interface ContextPreviewItem {
  name: string;
  color?: string | null;
  icon?: string | null;
  isDuplicate: boolean;
}

export interface AreaPreviewItem {
  name: string;
  description?: string | null;
  isActive?: boolean;
  isDuplicate: boolean;
}

export interface GoalPreviewItem {
  title: string;
  description?: string | null;
  status: string;
  horizon?: string;
  targetDate?: string | null;
  progress?: number;
  areaName?: string | null;
  isDuplicate: boolean;
}

export interface InboxPreviewItem {
  content: string;
  notes?: string | null;
  status: string;
}

export interface HorizonNotePreviewItem {
  level: string;
  title: string;
  content: string;
}

export interface WikiArticlePreviewItem {
  title: string;
  slug: string;
  content: string;
  tags: string[];
  isDuplicate: boolean;
}

export interface WaitingForPreviewItem {
  description: string;
  person: string;
  dueDate?: string | null;
  followUpDate?: string | null;
  isResolved?: boolean;
}

export interface RecurringTemplatePreviewItem {
  title: string;
  description?: string | null;
  cronExpression: string;
  taskDefaults?: unknown;
  isActive?: boolean;
}

export interface WeeklyReviewPreviewItem {
  status: string;
  weekOf: string;
  notes?: string | null;
  checklist?: unknown;
  completedAt?: string | null;
  aiCoachUsed?: boolean;
}

export interface ImportPreview {
  tasks: TaskPreviewItem[];
  projects: ProjectPreviewItem[];
  contexts: ContextPreviewItem[];
  areas: AreaPreviewItem[];
  goals: GoalPreviewItem[];
  inboxItems: InboxPreviewItem[];
  horizonNotes: HorizonNotePreviewItem[];
  wikiArticles: WikiArticlePreviewItem[];
  waitingFor: WaitingForPreviewItem[];
  recurringTemplates: RecurringTemplatePreviewItem[];
  weeklyReviews: WeeklyReviewPreviewItem[];
}

export function emptyPreview(): ImportPreview {
  return {
    tasks: [],
    projects: [],
    contexts: [],
    areas: [],
    goals: [],
    inboxItems: [],
    horizonNotes: [],
    wikiArticles: [],
    waitingFor: [],
    recurringTemplates: [],
    weeklyReviews: [],
  };
}

export interface ImportError {
  entity: string;
  index: number;
  field?: string;
  message: string;
}
