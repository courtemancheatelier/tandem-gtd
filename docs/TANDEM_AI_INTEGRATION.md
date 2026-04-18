# Tandem AI Integration Spec

## Overview

This document specifies how Claude connects to Tandem via two complementary surfaces:

1. **MCP Server** — Tandem exposes an MCP server so Claude (via claude.ai, Claude Desktop, Claude Code, or any MCP-compatible client) can read and write GTD data conversationally.
2. **Embedded AI Assistant** — A Claude-powered chat panel inside Tandem's own UI for users who prefer staying in-app.

Both surfaces share a single internal API layer. Build the API layer first, then the two surfaces become thin wrappers around it.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Claude.ai / Desktop               │
│                    (MCP Client)                      │
└──────────────┬──────────────────────────────────────┘
               │ MCP Protocol (HTTP transport)
               ▼
┌──────────────────────────┐
│   Tandem MCP Server      │  ← /api/mcp/  (Next.js route)
│   (Tool definitions)     │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐     ┌──────────────────────┐
│   Tandem AI API Layer    │◄────│  Embedded AI Panel   │
│   (Shared business logic)│     │  (React component)   │
│                          │     │  calls Anthropic API  │
│  • InboxService          │     │  with Tandem context  │
│  • TaskService           │     └──────────────────────┘
│  • ProjectService        │
│  • ReviewService         │
│  • ContextViewService    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   Prisma + PostgreSQL    │
│   (16 core models)       │
└──────────────────────────┘
```

---

## Shared AI API Layer

These service functions are the foundation. Both the MCP server and the embedded assistant call them. Each function operates on behalf of an authenticated user.

### Inbox Operations

```typescript
// POST /api/ai/inbox/capture
inboxCapture(userId: string, input: {
  rawText: string;           // Natural language input
  source?: "mcp" | "embed";  // Which surface initiated
}) => Promise<InboxItem[]>
// Parses natural language into one or more inbox items.
// Example: "Call dentist tomorrow, pick up library book, 
//           and remind me to email Sarah about the proposal"
// Returns 3 InboxItem records.

// POST /api/ai/inbox/process
inboxProcess(userId: string, input: {
  itemId: string;
  decision?: "actionable" | "not_actionable";
  // If actionable:
  projectId?: string;
  context?: string;          // @home, @errands, @computer, etc.
  energyLevel?: "low" | "medium" | "high";
  timeEstimate?: number;     // minutes
  deferDate?: string;        // ISO date
  delegateTo?: string;       // userId for delegation
  // If not actionable:
  disposition?: "trash" | "someday" | "reference";
}) => Promise<{ task?: Task; reference?: Reference; }>

// GET /api/ai/inbox/next
inboxNext(userId: string) => Promise<{
  item: InboxItem;
  suggestion: {
    isActionable: boolean;
    reasoning: string;
    suggestedProject?: string;
    suggestedContext?: string;
    suggestedEnergy?: string;
    suggestedTime?: number;
    isTwoMinute: boolean;    // Can this be done in < 2 min?
  };
}>
// Returns the next unprocessed inbox item with AI-generated 
// processing suggestions based on the item content and the 
// user's existing projects/contexts.
```

### Task & Project Operations

```typescript
// POST /api/ai/tasks/create
taskCreate(userId: string, input: {
  title: string;
  projectId?: string;
  context?: string;
  energyLevel?: "low" | "medium" | "high";
  timeEstimate?: number;
  deferDate?: string;
  waitingFor?: string;
  notes?: string;
  dependsOn?: string[];     // task IDs this blocks on
}) => Promise<Task>

// POST /api/ai/projects/breakdown
projectBreakdown(userId: string, input: {
  description: string;       // Natural language project description
  projectType?: "sequential" | "parallel" | "single_actions";
  areaId?: string;           // Area of Responsibility
}) => Promise<{
  project: {
    title: string;
    outcome: string;         // Clear desired outcome (GTD principle)
    type: "sequential" | "parallel" | "single_actions";
  };
  tasks: Array<{
    title: string;
    sequence?: number;       // For sequential projects
    context?: string;
    energyLevel?: string;
    timeEstimate?: number;
    dependsOn?: number[];    // Indices of other tasks in this array
  }>;
}>
// AI generates a full project structure from a description.
// Example: "Plan a birthday party for my brother in March"
// Returns project with ~8-12 sequenced tasks.

// GET /api/ai/context-view
contextView(userId: string, filters: {
  contexts?: string[];       // @home, @computer, @errands, etc.
  energyLevel?: "low" | "medium" | "high";
  maxTime?: number;          // minutes available
  includeWaitingFor?: boolean;
}) => Promise<{
  tasks: Task[];
  summary: string;           // "You have 7 tasks available @home..."
}>
```

### Weekly Review Operations

```typescript
// GET /api/ai/review/status
reviewStatus(userId: string) => Promise<{
  lastReviewDate: string | null;
  daysSinceReview: number;
  isOverdue: boolean;        // > 7 days
}>

// GET /api/ai/review/get-clear
reviewGetClear(userId: string) => Promise<{
  unprocessedInbox: number;
  orphanedActions: Task[];   // Tasks with no project
  staleItems: Task[];        // No update in 14+ days
}>

// GET /api/ai/review/get-current
reviewGetCurrent(userId: string) => Promise<{
  activeProjects: Array<{
    project: Project;
    hasNextAction: boolean;
    daysSinceUpdate: number;
    status: "on_track" | "stale" | "stuck" | "completed";
  }>;
  waitingFor: Task[];        // Outstanding delegated/waiting items
  somedayMaybe: Task[];      // For re-evaluation
  upcomingDeadlines: Task[]; // Next 14 days
}>

// GET /api/ai/review/get-creative
reviewGetCreative(userId: string) => Promise<{
  neglectedAreas: Area[];    // Areas with no active projects
  horizonGaps: {
    level: string;           // "30K Goals", "40K Vision", etc.
    lastUpdated: string | null;
    suggestion: string;
  }[];
}>

// POST /api/ai/review/complete
reviewComplete(userId: string) => Promise<{
  reviewId: string;
  completedAt: string;
  summary: string;
}>
```

---

## Surface 1: MCP Server

### Transport & Authentication

The MCP server runs as a Next.js API route at `/api/mcp/`. It uses **Streamable HTTP transport** (the current MCP standard, replacing the deprecated SSE transport).

Authentication options (user chooses during setup):
- **API token** — Tandem generates a personal access token. User passes it as a Bearer token when configuring the MCP server in Claude.
- **OAuth 2.1** — For multi-user deployments. Tandem acts as the OAuth provider. This aligns with the MCP spec's auth recommendations.

```
# User connects in Claude Desktop or claude.ai:
MCP Server URL: https://gtd.yourdomain.com/api/mcp/
Auth: Bearer <personal-access-token>

# Or via Tailscale (no public domain needed):
MCP Server URL: http://100.x.y.z:3000/api/mcp/
```

### MCP Tool Definitions

Each tool maps to one or more AI API layer functions. Tools are what Claude "sees" and can invoke.

```typescript
const tools = [
  // ── Inbox ──────────────────────────────────
  {
    name: "inbox_capture",
    description: 
      "Add items to the GTD inbox from natural language. " +
      "Can parse multiple items from a single input. " +
      "Example: 'Call dentist, buy groceries, and email boss about PTO'",
    inputSchema: {
      type: "object",
      properties: {
        text: { 
          type: "string", 
          description: "Natural language describing one or more things to capture" 
        }
      },
      required: ["text"]
    }
  },
  {
    name: "inbox_list",
    description: "Show unprocessed inbox items",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items to return (default 20)" }
      }
    }
  },
  {
    name: "inbox_process",
    description: 
      "Process an inbox item through the GTD workflow. " +
      "Decides: actionable or not? If actionable: is it a 2-minute task, " +
      "a next action, a project, or something to delegate/defer? " +
      "If not actionable: trash, someday/maybe, or reference?",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        decision: { type: "string", enum: ["actionable", "not_actionable"] },
        context: { type: "string", description: "@home, @errands, @computer, @phone, @anywhere" },
        energyLevel: { type: "string", enum: ["low", "medium", "high"] },
        timeEstimate: { type: "number", description: "Minutes" },
        projectId: { type: "string", description: "Existing project to add to" },
        disposition: { type: "string", enum: ["trash", "someday", "reference"] }
      },
      required: ["itemId", "decision"]
    }
  },

  // ── Tasks ──────────────────────────────────
  {
    name: "task_create",
    description: "Create a new task with GTD metadata",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        projectId: { type: "string" },
        context: { type: "string" },
        energyLevel: { type: "string", enum: ["low", "medium", "high"] },
        timeEstimate: { type: "number" },
        deferDate: { type: "string", format: "date" },
        waitingFor: { type: "string" },
        notes: { type: "string" }
      },
      required: ["title"]
    }
  },
  {
    name: "task_complete",
    description: 
      "Mark a task as complete. This triggers the next-action " +
      "cascade engine — sequential projects advance, dependencies " +
      "resolve, and newly unblocked tasks become available.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "task_search",
    description: "Search tasks by keyword, context, project, or status",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        context: { type: "string" },
        projectId: { type: "string" },
        status: { type: "string", enum: ["available", "waiting", "deferred", "completed"] },
        energyLevel: { type: "string", enum: ["low", "medium", "high"] },
        maxTime: { type: "number", description: "Max minutes" }
      }
    }
  },

  // ── What Should I Do Now? ──────────────────
  {
    name: "what_now",
    description: 
      "The core GTD question. Returns available next actions " +
      "filtered by context, energy, and available time. " +
      "This is what users ask most often.",
    inputSchema: {
      type: "object",
      properties: {
        contexts: { 
          type: "array", items: { type: "string" },
          description: "Where are you? @home, @office, @errands, etc."
        },
        energyLevel: { 
          type: "string", enum: ["low", "medium", "high"],
          description: "How much energy do you have right now?"
        },
        availableTime: { 
          type: "number",
          description: "How many minutes do you have?"
        }
      }
    }
  },

  // ── Projects ───────────────────────────────
  {
    name: "project_list",
    description: "List active projects with their next actions and status",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "someday", "completed", "all"] },
        areaId: { type: "string" }
      }
    }
  },
  {
    name: "project_create_from_description",
    description: 
      "AI-powered project breakdown. Describe what you want to " +
      "accomplish and get back a structured project with sequenced " +
      "tasks, contexts, time estimates, and dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        description: { 
          type: "string", 
          description: "What do you want to accomplish? Be as detailed as you want." 
        },
        projectType: { type: "string", enum: ["sequential", "parallel", "single_actions"] },
        areaId: { type: "string", description: "Area of Responsibility this falls under" }
      },
      required: ["description"]
    }
  },

  // ── Weekly Review ──────────────────────────
  {
    name: "review_start",
    description: 
      "Begin a guided Weekly Review. Returns the current state " +
      "across all three phases: Get Clear, Get Current, Get Creative.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "review_get_clear",
    description: "Phase 1: Surface unprocessed inbox items, orphaned actions, and stale items",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "review_get_current",
    description: "Phase 2: Review every active project, check waiting-for items, evaluate someday/maybe",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "review_get_creative",
    description: "Phase 3: Look at higher horizons, find neglected areas, brainstorm new projects",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "review_complete",
    description: "Mark the weekly review as done and generate a summary",
    inputSchema: { type: "object", properties: {} }
  },

  // ── Contexts & Areas ───────────────────────
  {
    name: "context_list",
    description: "List all available contexts with task counts",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "area_list",
    description: "List Areas of Responsibility with active project counts",
    inputSchema: { type: "object", properties: {} }
  },

  // ── Horizons of Focus ──────────────────────
  {
    name: "horizons_view",
    description: 
      "View the Horizons of Focus from Runway (next actions) up " +
      "through 50,000 ft (purpose and principles)",
    inputSchema: {
      type: "object",
      properties: {
        level: { 
          type: "string", 
          enum: ["runway", "10k", "20k", "30k", "40k", "50k", "all"] 
        }
      }
    }
  }
];
```

### MCP Resources (Read-Only Context)

Resources let Claude passively read Tandem data without needing a tool call. Useful for giving Claude background context at the start of a conversation.

```typescript
const resources = [
  {
    uri: "tandem://user/summary",
    name: "GTD System Summary",
    description: "Overview of inbox count, active projects, contexts, and review status",
    mimeType: "application/json"
  },
  {
    uri: "tandem://projects/active",
    name: "Active Projects",
    description: "All active projects with next actions",
    mimeType: "application/json"
  },
  {
    uri: "tandem://contexts",
    name: "Context Definitions",
    description: "User's configured contexts and their task counts",
    mimeType: "application/json"
  }
];
```

### MCP Prompts (Pre-built Workflows)

Prompts are reusable conversation starters that Claude can offer to the user.

```typescript
const prompts = [
  {
    name: "weekly_review",
    description: "Guided Weekly Review: Get Clear → Get Current → Get Creative",
    arguments: []
  },
  {
    name: "brain_dump",
    description: "Rapid inbox capture session — just talk, I'll sort it out",
    arguments: []
  },
  {
    name: "process_inbox",
    description: "Work through inbox items one by one with GTD decision tree",
    arguments: []
  },
  {
    name: "what_should_i_do",
    description: "Context-aware task recommendation based on where you are and how you feel",
    arguments: [
      { name: "context", description: "Where are you? (home, office, errands, etc.)" },
      { name: "energy", description: "Energy level (low, medium, high)" },
      { name: "time", description: "Available time in minutes" }
    ]
  }
];
```

---

## Surface 2: Embedded AI Assistant

### UI Integration

A slide-out panel or bottom sheet inside Tandem, accessible via a keyboard shortcut (Cmd+J or similar) or a floating action button.

```
┌──────────────────────────────────────────────────┐
│  Tandem                              [AI] [≡]    │
├────────────────────────────┬─────────────────────┤
│                            │  ┌─────────────────┐│
│  Main Tandem UI            │  │ AI Assistant     ││
│  (Context views,           │  │                  ││
│   projects, inbox, etc.)   │  │ "I need to plan  ││
│                            │  │  the team offsite││
│                            │  │  for April"      ││
│                            │  │                  ││
│                            │  │ ▶ Created project││
│                            │  │   "Team Offsite" ││
│                            │  │   with 9 tasks   ││
│                            │  │   [View Project] ││
│                            │  │                  ││
│                            │  │ ┌───────────────┐││
│                            │  │ │ Type here...  │││
│                            │  │ └───────────────┘││
│                            │  └─────────────────┘│
└────────────────────────────┴─────────────────────┘
```

### How It Works

The embedded assistant calls the Anthropic Messages API from a Next.js API route (`/api/ai/chat`). The route:

1. Authenticates the user (NextAuth session)
2. Loads relevant GTD context from Prisma (inbox count, active projects, recent activity)
3. Builds a system prompt with GTD methodology knowledge + user's data summary
4. Sends messages to Anthropic API with tool definitions that map to the same AI API layer
5. Streams the response back to the React component

```typescript
// /api/ai/chat/route.ts (simplified)

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: Request) {
  const session = await getServerSession();
  const { messages } = await req.json();
  
  // Load user's GTD context
  const context = await buildGTDContext(session.user.id);
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: buildSystemPrompt(context),
    messages,
    tools: tandemTools,  // Same tool definitions as MCP
    stream: true,
  });
  
  // Handle tool calls by routing to AI API layer
  // Stream results back to client
}
```

### System Prompt for Embedded Assistant

```typescript
function buildSystemPrompt(context: GTDContext): string {
  return `You are a GTD coach embedded in Tandem, a Getting Things Done app. 
You help users capture, clarify, organize, reflect, and engage with their 
commitments using David Allen's methodology.

Current state for this user:
- Inbox: ${context.inboxCount} unprocessed items
- Active projects: ${context.activeProjectCount}
- Available next actions: ${context.availableTaskCount}
- Days since last weekly review: ${context.daysSinceReview}
- Contexts: ${context.contexts.join(", ")}

Key GTD principles to follow:
- Everything goes in the inbox first. No exceptions.
- The two-minute rule: if it takes less than 2 minutes, do it now.
- Every project needs at least one next action.
- Next actions must be concrete, physical actions (not vague).
- "Call Sarah" is a next action. "Handle Sarah situation" is not.
- Weekly Review keeps the system trusted.
- Context + energy + time = what you should do right now.

When helping process inbox items, guide the user through:
1. What is it?
2. Is it actionable?
   - No → Trash, Someday/Maybe, or Reference
   - Yes → What's the next action?
     - < 2 min? Do it now.
     - Delegate? → Waiting For
     - Defer? → Calendar or Next Actions list
     - Part of a multi-step outcome? → Create/add to Project

Be conversational but efficient. Users are here to get things done, 
not read essays. Suggest contexts and energy levels when creating tasks.
Flag when a "task" is actually a project (multi-step outcome).`;
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Build with v1.0)

**Goal:** Ship the AI API layer and MCP server alongside core Tandem features.

1. **AI API Layer** — Service functions for inbox, tasks, projects, context views
2. **MCP Server** — Streamable HTTP transport at `/api/mcp/`
   - Tools: `inbox_capture`, `inbox_list`, `task_create`, `task_complete`, `task_search`, `what_now`, `project_list`, `context_list`
   - Resources: `tandem://user/summary`
   - Auth: Personal access tokens
3. **Natural Language Parser** — Shared function that takes free text and produces structured inbox items (used by both MCP `inbox_capture` tool and the embedded assistant)

### Phase 2: Guided Workflows (Build with v1.0-1.1)

4. **Inbox Processing AI** — The `inbox_process` tool with AI suggestions
5. **Project Breakdown AI** — `project_create_from_description`
6. **Embedded Assistant UI** — React panel with Anthropic API integration
7. **MCP Prompts** — Pre-built conversation starters

### Phase 3: Weekly Review & Horizons (Build with v1.1)

8. **Weekly Review AI** — All review tools, guided walkthrough
9. **Horizons of Focus integration** — AI helps connect daily actions to higher purpose
10. **MCP Apps UI** — Interactive widgets rendered inside Claude.ai (task lists, review dashboards)

### Phase 4: Advanced (v1.2+)

11. **OAuth 2.1** for MCP auth (multi-user deployments)
12. **Conversation memory** — AI remembers past interactions within Tandem
13. **Proactive suggestions** — "You haven't reviewed in 10 days" nudges
14. **Voice capture** — Whisper API → inbox items

---

## Key Technical Decisions

### Why Sonnet for Embedded, Not Opus?

The embedded assistant handles high-volume, lower-complexity requests (parsing inbox text, suggesting contexts, generating task breakdowns). Sonnet is fast and cheap enough to use liberally. The MCP path uses whatever model the user has in Claude.ai — they get Opus if they're on Pro/Max.

### Rate Limiting & Costs

The embedded assistant should:
- Use Sonnet (`claude-sonnet-4-20250514`) for most operations
- Cache the GTD context summary (refresh every 60 seconds, not every message)
- Batch tool calls where possible (inbox capture can parse multiple items in one API call)
- Set a per-user daily message limit (configurable in Tandem settings)

For a personal/family deployment, expect ~$5-15/month in API costs with moderate daily use.

### Privacy Architecture

Since Tandem is self-hosted, the AI integration inherits the privacy model:
- **MCP path**: Data flows from Tandem → Claude.ai. The user's Claude account processes it. Anthropic's standard data policies apply.
- **Embedded path**: Data flows from Tandem → Anthropic API → Tandem. The server owner's API key is used. Enable zero-data-retention if desired.
- **No data leaves the server** unless the user explicitly invokes AI features.
- AI features are opt-in and can be disabled entirely.

### MCP Server File Structure

```
src/
├── lib/
│   └── ai/
│       ├── api-layer.ts          # Shared service functions
│       ├── nl-parser.ts          # Natural language → structured data
│       ├── gtd-context.ts        # Build GTD context for prompts
│       └── system-prompts.ts     # Prompt templates
├── app/
│   └── api/
│       ├── mcp/
│       │   └── route.ts          # MCP Streamable HTTP endpoint
│       └── ai/
│           └── chat/
│               └── route.ts      # Embedded assistant API
└── components/
    └── ai/
        ├── AssistantPanel.tsx     # Slide-out AI chat panel
        ├── InboxProcessor.tsx     # Guided inbox processing UI
        └── ReviewCoach.tsx        # Weekly review AI companion
```

---

## Example User Flows

### Flow 1: Brain Dump via MCP (in Claude.ai)

```
User: I just got out of a meeting. I need to follow up with 
      Sarah about the budget proposal, schedule a dentist 
      appointment, buy a birthday gift for Mom (her birthday 
      is March 15), and look into refinancing options.

Claude: [calls inbox_capture with the full text]

Got it — I've added 4 items to your Tandem inbox:

1. Follow up with Sarah about budget proposal
2. Schedule dentist appointment  
3. Buy birthday gift for Mom (birthday March 15)
4. Research refinancing options

Want me to help you process these now? I can walk through 
each one and figure out contexts, projects, and next actions.
```

### Flow 2: Inbox Processing in Embedded Assistant

```
AI: You have 6 items in your inbox. Let's process them.
    First up: "Follow up with Sarah about budget proposal"
    
    This looks actionable — and it sounds like a single 
    next action, not a project. I'd suggest:
    • Context: @computer (or @phone if you'd rather call)
    • Energy: Medium
    • Time: ~15 minutes
    • Possible next action: "Email Sarah re: budget proposal 
      revisions discussed in today's meeting"
    
    Does that feel right, or do you want to adjust?

User: Make it @phone, and actually this is part of the 
      Q1 Budget project.

AI: Done. Created task "Call Sarah re: budget proposal 
    revisions" → Q1 Budget project, @phone, medium energy, 
    15 min.
    
    Next item: "Schedule dentist appointment"
    This one's probably under 2 minutes if you just call. 
    Two-minute rule — do it now?
```

### Flow 3: Weekly Review via MCP

```
User: Let's do my weekly review.

Claude: [calls review_get_clear]

── GET CLEAR ──

Your inbox has 3 unprocessed items — let's clear those first.
I also found 2 orphaned actions (tasks with no project):
  • "Research standing desks" (created 12 days ago)
  • "Update LinkedIn profile" (created 8 days ago)

And 1 stale item that hasn't been touched in 3 weeks:
  • "Draft blog post outline" in the Content Marketing project

Want to process the inbox items now, or move to Get Current?
```

---

## Dependencies to Add

```json
// package.json additions
{
  "@anthropic-ai/sdk": "^0.39.0",
  "@modelcontextprotocol/sdk": "^1.12.0"
}
```

---

## Configuration

```env
# .env.local additions

# Required for embedded AI assistant
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Override default model
TANDEM_AI_MODEL=claude-sonnet-4-20250514

# Optional: Disable AI features entirely
TANDEM_AI_ENABLED=true

# Optional: Daily message limit per user (embedded assistant)
TANDEM_AI_DAILY_LIMIT=100

# MCP Server
TANDEM_MCP_ENABLED=true
```

---

## Open Questions

1. **Should the MCP server require the Anthropic API key?** The MCP server itself doesn't call Claude — it just exposes tools. But the `project_create_from_description` and `inbox_process` suggestion features DO need Claude for the AI reasoning. Option: make those tools work without AI (just CRUD) via MCP, and only use AI in the embedded assistant. Or: require the API key for AI-enhanced tools.

2. **MCP Apps UI priority?** The new MCP Apps extension lets Tandem render interactive widgets inside Claude.ai. This is compelling (imagine seeing your context view as a clickable list right in Claude) but adds frontend complexity. Ship text-only MCP first, add MCP Apps UI in Phase 3?

3. **Conversation history for embedded assistant?** Store chat history in Postgres? Or treat each session as ephemeral? Storing it enables "continue where I left off" but adds data/privacy considerations.

4. **Multi-user AI costs?** For family/group deployments, each user's embedded AI usage costs API money. Should there be per-user quotas? A shared pool? Or just trust the small group to be reasonable?
