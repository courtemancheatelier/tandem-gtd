export interface TandemExport {
  version: 1;
  exportedAt: string;
  user: {
    name: string;
    email: string;
  };
  data: {
    tasks: TaskExport[];
    projects: ProjectExport[];
    inboxItems: InboxItemExport[];
    contexts: ContextExport[];
    areas: AreaExport[];
    goals: GoalExport[];
    horizonNotes: HorizonNoteExport[];
    wikiArticles: WikiArticleExport[];
    waitingFor: WaitingForExport[];
    recurringTemplates: RecurringTemplateExport[];
    weeklyReviews: WeeklyReviewExport[];
  };
  counts: Record<string, number>;
}

export interface TaskExport {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins: number | null;
  energyLevel: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  projectTitle: string | null;
  contextName: string | null;
}

export interface ProjectExport {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  childType: string;
  outcome: string | null;
  sortOrder: number;
  isSomedayMaybe: boolean;
  completedAt: string | null;
  createdAt: string;
  areaName: string | null;
  goalTitle: string | null;
  parentProjectTitle: string | null;
}

export interface InboxItemExport {
  id: string;
  content: string;
  notes: string | null;
  status: string;
  createdAt: string;
}

export interface ContextExport {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface AreaExport {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface GoalExport {
  id: string;
  title: string;
  description: string | null;
  status: string;
  horizon: string;
  targetDate: string | null;
  progress: number;
  areaName: string | null;
}

export interface HorizonNoteExport {
  id: string;
  level: string;
  title: string;
  content: string;
}

export interface WikiArticleExport {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface WaitingForExport {
  id: string;
  description: string;
  person: string;
  dueDate: string | null;
  followUpDate: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RecurringTemplateExport {
  id: string;
  title: string;
  description: string | null;
  cronExpression: string;
  taskDefaults: unknown;
  isActive: boolean;
  lastGenerated: string | null;
  nextDue: string | null;
}

export interface WeeklyReviewExport {
  id: string;
  status: string;
  weekOf: string;
  notes: string | null;
  checklist: unknown;
  completedAt: string | null;
  aiCoachUsed: boolean;
  createdAt: string;
}
