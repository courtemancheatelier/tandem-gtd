export type DecisionTypeValue = "APPROVAL" | "POLL" | "QUICK_POLL" | "PROPOSAL";

export interface DecisionTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  decisionType: DecisionTypeValue;
  defaults: {
    questionPrefix?: string;
    contextHint?: string;
    defaultOptions?: string[];
    suggestedInputTypes?: string[];
  };
}

export const DECISION_TEMPLATES: DecisionTemplate[] = [
  {
    id: "quick-poll",
    name: "Quick Poll",
    description: "Fast vote with custom options. Auto-resolves when everyone votes.",
    icon: "Zap",
    decisionType: "QUICK_POLL",
    defaults: {
      questionPrefix: "Vote: ",
      contextHint: "Add options for the team to vote on. Auto-resolves when everyone votes.",
      defaultOptions: ["", "", ""],
    },
  },
  {
    id: "yes-no-vote",
    name: "Yes / No Vote",
    description: "Simple binary poll with pre-filled Yes and No options.",
    icon: "ThumbsUp",
    decisionType: "QUICK_POLL",
    defaults: {
      questionPrefix: "Should we ",
      defaultOptions: ["Yes", "No"],
    },
  },
  {
    id: "approval-request",
    name: "Approval Request",
    description: "Request sign-off from one or more team members.",
    icon: "CheckCircle",
    decisionType: "APPROVAL",
    defaults: {
      contextHint: "Describe what you need approved and who needs to sign off.",
    },
  },
  {
    id: "budget-approval",
    name: "Budget Approval",
    description: "Request approval for a specific spend or budget allocation.",
    icon: "DollarSign",
    decisionType: "APPROVAL",
    defaults: {
      questionPrefix: "Approve spending: ",
      contextHint: "Include amount, purpose, and budget category.",
    },
  },
  {
    id: "standard-proposal",
    name: "Standard Proposal",
    description: "Full decision proposal with research and structured input.",
    icon: "FileText",
    decisionType: "PROPOSAL",
    defaults: {
      contextHint:
        "Describe the decision context. You can add research tasks and input requests after publishing.",
      suggestedInputTypes: ["RESEARCH", "VOTE"],
    },
  },
  {
    id: "schedule-decision",
    name: "Schedule / Date",
    description: "Pick a date or time slot with your team.",
    icon: "Calendar",
    decisionType: "POLL",
    defaults: {
      questionPrefix: "When should we ",
      defaultOptions: ["This week", "Next week", "In two weeks"],
    },
  },
  {
    id: "go-no-go",
    name: "Go / No-Go",
    description: "Binary launch or proceed decision requiring approval.",
    icon: "Rocket",
    decisionType: "APPROVAL",
    defaults: {
      questionPrefix: "Go/No-Go: ",
    },
  },
];
