export interface FlowApiResponse {
  project: {
    id: string;
    title: string;
    status: string;
    type: string;
    teamId: string | null;
    velocityUnit?: "AUTO" | "TASKS" | "HOURS";
  };

  summary: {
    totalEstimatedMins: number;
    completedEstimatedMins: number;
    remainingEstimatedMins: number;
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    actionableTasks: number;
    longestBlockingChainDepth: number;
    projectedCompletionDate: string | null;
    projectedDaysRemaining: number | null;
    velocityTasksPerWeek: number;
  };

  zones: {
    actionable: FlowTask[];
    blocked: FlowBlockedTask[];
    completed: FlowTask[];
  };

  teamBreakdown: TeamMemberBreakdown[] | null;
}

export interface FlowTask {
  id: string;
  title: string;
  status: string;
  isNextAction: boolean;
  estimatedMins: number | null;
  contextId: string | null;
  contextName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  projectId: string;
  projectTitle: string;
  completedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface FlowBlockedTask extends FlowTask {
  blockerChain: BlockerChainNode[];
  totalChainDepth: number;
  stalestBlockerDays: number;
}

export interface BlockerChainNode {
  id: string;
  title: string;
  status: string;
  assignedToId: string | null;
  assignedToName: string | null;
  projectId: string | null;
  staleDays: number;
  blockedBy: BlockerChainNode[];
}

export interface TeamMemberBreakdown {
  userId: string;
  userName: string;
  actionableCount: number;
  actionableMins: number;
  blockedCount: number;
  blockingOthersCount: number;
}
