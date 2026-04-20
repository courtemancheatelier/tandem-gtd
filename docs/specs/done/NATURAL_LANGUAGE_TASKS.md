# Natural Language Task Creation — "Call dentist Tuesday at 2pm"

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### What Exists

Task creation in Tandem requires filling in discrete fields:

- **Title** — text input (`src/lib/validations/task.ts`: `createTaskSchema`)
- **Due date** — ISO 8601 datetime via a date picker
- **Scheduled date** — ISO 8601 datetime (tickler)
- **Context** — select from existing contexts by ID
- **Energy level** — select: LOW / MEDIUM / HIGH
- **Estimated time** — number input in minutes
- **Project** — select from existing projects by ID

This is fine for deliberate task creation but slow for rapid capture. GTD's capture principle says "get it out of your head as fast as possible." When a user types "Call dentist Tuesday at 2pm @Phone ~15min," they know exactly what they mean — but Tandem makes them type the title, then pick a date, then pick a context, then enter a time estimate.

The inbox capture modal (`src/components/inbox/InboxCaptureModal.tsx`) is the fastest entry point today — a single text field with Enter to save. But it creates an inbox item with just `content` (a string). No structure is extracted.

### The Gap

1. **No parsing** — natural language like "tomorrow", "next Tuesday", "@Phone", "~30min" is not interpreted. It goes into a plain text field.
2. **No preview** — users cannot see what Tandem will create before committing.
3. **MCP is text-only** — when AI creates tasks via `tandem_task_create`, it must explicitly set every field. A natural language input tool would be more ergonomic.

### What Done Looks Like

Type `Call dentist Tuesday at 2pm @Phone ~15min !high` and Tandem parses it into:
- **Title:** "Call dentist"
- **Due date:** Tuesday, Feb 25, 2026 at 14:00
- **Context:** @Phone (matched to existing context)
- **Estimated time:** 15 minutes
- **Energy level:** HIGH

A preview card shows the extracted fields, editable before saving. When AI is enabled, ambiguous inputs like "pick up groceries" can be enhanced: the AI infers context (@Errands), estimates time (~20min), and suggests energy level (LOW).

---

## 2. Data Model Changes

No new models. The parser is a utility function. Parsed output maps directly to existing `CreateTaskInput`:

```typescript
interface ParsedTask {
  title: string;                         // Cleaned title (markers removed)
  dueDate?: string;                      // ISO 8601
  scheduledDate?: string;                // ISO 8601
  contextName?: string;                  // @-mention text (matched to Context.name)
  contextId?: string;                    // Resolved context ID
  estimatedMins?: number;                // Extracted duration
  energyLevel?: "LOW" | "MEDIUM" | "HIGH";
  projectName?: string;                  // #-mention text (matched to Project.title)
  projectId?: string;                    // Resolved project ID
  confidence: Record<string, number>;    // Per-field confidence (0-1) for UI indication
}
```

---

## 3. Client-Side Parser

### 3.1 Architecture

A pure function that takes a raw string and returns `ParsedTask`. No API calls, no side effects. Works offline.

```typescript
// src/lib/parsers/natural-language-task.ts

export function parseNaturalLanguageTask(
  input: string,
  options: {
    referenceDate?: Date;                // Default: now
    contexts?: Array<{ id: string; name: string }>; // For @-matching
    projects?: Array<{ id: string; title: string }>; // For #-matching
  }
): ParsedTask
```

### 3.2 Date Parsing with chrono-node

The `chrono-node` library handles natural language date parsing. It supports:

- "today", "tomorrow", "yesterday"
- "next Monday", "this Friday", "next week"
- "March 15", "March 15th", "3/15", "2026-03-15"
- "in 3 days", "in 2 weeks"
- "end of month", "end of week"
- "Tuesday at 2pm", "Friday 9am"
- "next Tuesday", "this Saturday"

Install: `npm install chrono-node` (add to `package.json` dependencies).

```typescript
import * as chrono from "chrono-node";

function extractDate(input: string, referenceDate: Date): {
  date: Date | null;
  matchedText: string | null;
  remainingInput: string;
} {
  const results = chrono.parse(input, referenceDate, { forwardDate: true });
  if (results.length === 0) return { date: null, matchedText: null, remainingInput: input };

  const result = results[0];
  const date = result.start.date();
  const matchedText = result.text;

  // Remove the matched date text from the input
  const remainingInput = input
    .replace(matchedText, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { date, matchedText, remainingInput };
}
```

### 3.3 Context Extraction (@-mentions)

Match `@Word` or `@multi-word` patterns against existing context names:

```typescript
function extractContext(
  input: string,
  contexts: Array<{ id: string; name: string }>
): {
  contextId: string | null;
  contextName: string | null;
  remainingInput: string;
} {
  // Pattern: @word (letters, digits, hyphens)
  const atMatch = input.match(/@(\w+(?:[-_]\w+)*)/i);
  if (!atMatch) return { contextId: null, contextName: null, remainingInput: input };

  const mention = atMatch[1].toLowerCase();
  // Find matching context (case-insensitive, match against name with @ stripped)
  const context = contexts.find((c) => {
    const cleanName = c.name.replace(/^@/, "").toLowerCase();
    return cleanName === mention || cleanName.startsWith(mention);
  });

  if (!context) return { contextId: null, contextName: atMatch[0], remainingInput: input };

  const remainingInput = input.replace(atMatch[0], "").replace(/\s{2,}/g, " ").trim();
  return { contextId: context.id, contextName: context.name, remainingInput };
}
```

### 3.4 Duration Extraction (~time)

Match `~Nmin`, `~Nh`, `~Nhrs`, `~N minutes`, `~N hours`:

```typescript
function extractDuration(input: string): {
  estimatedMins: number | null;
  remainingInput: string;
} {
  const patterns = [
    /~(\d+)\s*min(?:ute)?s?/i,              // ~30min, ~30 minutes
    /~(\d+(?:\.\d+)?)\s*h(?:ou)?r?s?/i,     // ~1h, ~1.5hrs, ~2 hours
    /~(\d+)m\b/i,                             // ~30m
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      let minutes: number;
      if (pattern.source.includes("h")) {
        minutes = Math.round(parseFloat(match[1]) * 60);
      } else {
        minutes = parseInt(match[1], 10);
      }
      const remainingInput = input.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
      return { estimatedMins: minutes, remainingInput };
    }
  }

  return { estimatedMins: null, remainingInput: input };
}
```

### 3.5 Energy Level Extraction (!level)

Match `!high`, `!medium`, `!low`, or shorthand `!h`, `!m`, `!l`:

```typescript
function extractEnergy(input: string): {
  energyLevel: "LOW" | "MEDIUM" | "HIGH" | null;
  remainingInput: string;
} {
  const match = input.match(/!(high|medium|low|h|m|l)\b/i);
  if (!match) return { energyLevel: null, remainingInput: input };

  const level = match[1].toLowerCase();
  const energyMap: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
    high: "HIGH", h: "HIGH",
    medium: "MEDIUM", m: "MEDIUM",
    low: "LOW", l: "LOW",
  };

  const remainingInput = input.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
  return { energyLevel: energyMap[level] || null, remainingInput };
}
```

### 3.6 Project Extraction (#project)

Match `#ProjectName` against existing projects:

```typescript
function extractProject(
  input: string,
  projects: Array<{ id: string; title: string }>
): {
  projectId: string | null;
  projectName: string | null;
  remainingInput: string;
} {
  const hashMatch = input.match(/#(\w+(?:[-_]\w+)*)/i);
  if (!hashMatch) return { projectId: null, projectName: null, remainingInput: input };

  const mention = hashMatch[1].toLowerCase();
  const project = projects.find((p) =>
    p.title.toLowerCase().includes(mention) ||
    p.title.toLowerCase().replace(/\s+/g, "-") === mention
  );

  if (!project) return { projectId: null, projectName: hashMatch[0], remainingInput: input };

  const remainingInput = input.replace(hashMatch[0], "").replace(/\s{2,}/g, " ").trim();
  return { projectId: project.id, projectName: project.title, remainingInput };
}
```

### 3.7 Due vs. Scheduled Date Heuristic

If the date text includes "by" or "due", it is a due date. If it includes "defer", "start", "begin", or "scheduled", it is a scheduled date. Default: due date.

```typescript
function classifyDate(matchedText: string): "due" | "scheduled" {
  const lowerText = matchedText.toLowerCase();
  if (/\b(defer|start|begin|scheduled?|tickler)\b/.test(lowerText)) return "scheduled";
  return "due";
}
```

### 3.8 Combined Parser

```typescript
export function parseNaturalLanguageTask(
  input: string,
  options: {
    referenceDate?: Date;
    contexts?: Array<{ id: string; name: string }>;
    projects?: Array<{ id: string; title: string }>;
  } = {}
): ParsedTask {
  const referenceDate = options.referenceDate || new Date();
  let remaining = input;

  // Extract in order: explicit markers first (unambiguous), then date (can be ambiguous)
  const energy = extractEnergy(remaining);
  remaining = energy.remainingInput;

  const duration = extractDuration(remaining);
  remaining = duration.remainingInput;

  const context = extractContext(remaining, options.contexts || []);
  remaining = context.remainingInput;

  const project = extractProject(remaining, options.projects || []);
  remaining = project.remainingInput;

  const dateResult = extractDate(remaining, referenceDate);
  remaining = dateResult.remainingInput;

  // What's left is the title
  const title = remaining.replace(/\s{2,}/g, " ").trim();

  const parsed: ParsedTask = {
    title: title || input, // Fallback to original input if everything got extracted
    confidence: {},
  };

  if (dateResult.date) {
    const classification = classifyDate(dateResult.matchedText || "");
    if (classification === "scheduled") {
      parsed.scheduledDate = dateResult.date.toISOString();
    } else {
      parsed.dueDate = dateResult.date.toISOString();
    }
    parsed.confidence.date = 0.9;
  }

  if (context.contextId) {
    parsed.contextId = context.contextId;
    parsed.contextName = context.contextName;
    parsed.confidence.context = 1.0;
  } else if (context.contextName) {
    // Context mentioned but not found in user's contexts
    parsed.contextName = context.contextName;
    parsed.confidence.context = 0.5;
  }

  if (duration.estimatedMins) {
    parsed.estimatedMins = duration.estimatedMins;
    parsed.confidence.estimatedMins = 1.0;
  }

  if (energy.energyLevel) {
    parsed.energyLevel = energy.energyLevel;
    parsed.confidence.energyLevel = 1.0;
  }

  if (project.projectId) {
    parsed.projectId = project.projectId;
    parsed.projectName = project.projectName;
    parsed.confidence.project = 1.0;
  } else if (project.projectName) {
    parsed.projectName = project.projectName;
    parsed.confidence.project = 0.5;
  }

  return parsed;
}
```

---

## 4. AI-Powered Enhancement

### 4.1 When to Use AI

The client-side parser handles explicit markers (`@Phone`, `~30min`, `!high`, dates). For ambiguous inputs where no markers are present, AI can infer:

- **Context:** "email the contractor" implies @Computer. "buy milk" implies @Errands.
- **Duration:** "write quarterly report" implies ~60-120min. "call dentist" implies ~10min.
- **Energy:** "brainstorm new product ideas" implies HIGH. "file receipts" implies LOW.

AI enhancement is **optional** and only fires when:
1. AI is enabled (server + user level)
2. The client-side parser extracted fewer than 2 structured fields (title only, or title + one field)
3. The user has not explicitly disabled AI suggestions

### 4.2 AI Parse Endpoint

```typescript
// src/app/api/ai/parse-task/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveAIConfig, checkAILimit } from "@/lib/ai/resolve-key";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod";

const parseSchema = z.object({
  text: z.string().min(1).max(500),
  existingParse: z.object({
    title: z.string(),
    dueDate: z.string().optional(),
    contextName: z.string().optional(),
    estimatedMins: z.number().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  // Rate limit: 10 parse requests per minute
  const rateLimited = checkRateLimit(`ai-parse:${userId}`, 10, 60_000);
  if (rateLimited) return rateLimited;

  const withinLimit = await checkAILimit(userId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Daily AI limit reached" },
      { status: 429 }
    );
  }

  const config = await resolveAIConfig(userId);
  if (!config) {
    return NextResponse.json(
      { error: "AI not available" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = parseSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { text, existingParse } = parsed.data;

  // Get user's contexts for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { name: true },
  });

  const systemPrompt = `You extract structured task data from natural language.
Given the user's input and what was already parsed, fill in missing fields.

Available contexts: ${contexts.map((c) => c.name).join(", ")}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "contextName": "@ContextName or null",
  "estimatedMins": number or null,
  "energyLevel": "LOW" | "MEDIUM" | "HIGH" | null
}

Rules:
- Do not include fields that were already parsed. Only add NEW inferences.
- If you are not confident (< 70% certainty), use null.
- Context must exactly match one of the available contexts listed above.
- estimatedMins should be a reasonable estimate (5-480 range).
- energyLevel: HIGH = creative/complex, MEDIUM = focused routine, LOW = simple/mechanical.`;

  const userMessage = `Input: "${text}"
Already parsed: ${JSON.stringify(existingParse)}`;

  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-sonnet-4-20250514",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      return NextResponse.json(
        { error: "AI parse failed" },
        { status: 502 }
      );
    }

    const result = await anthropicResponse.json();
    const content = result.content?.[0]?.text || "{}";

    // Parse the JSON response
    const aiFields = JSON.parse(content);

    return NextResponse.json(aiFields);
  } catch {
    return NextResponse.json(
      { error: "AI parse failed" },
      { status: 502 }
    );
  }
}
```

### 4.3 Combining Client + AI Parse

```typescript
// src/lib/parsers/enhanced-parse.ts

import { parseNaturalLanguageTask, ParsedTask } from "./natural-language-task";

interface EnhancedParseOptions {
  referenceDate?: Date;
  contexts?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; title: string }>;
  aiEnabled: boolean;
}

export async function enhancedParseTask(
  input: string,
  options: EnhancedParseOptions
): Promise<ParsedTask> {
  // Step 1: Client-side parse (instant, always runs)
  const clientParsed = parseNaturalLanguageTask(input, options);

  // Step 2: If AI enabled and parse is sparse, enhance
  const parsedFieldCount = Object.keys(clientParsed.confidence).length;
  if (options.aiEnabled && parsedFieldCount < 2) {
    try {
      const aiResult = await fetch("/api/ai/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          existingParse: {
            title: clientParsed.title,
            dueDate: clientParsed.dueDate,
            contextName: clientParsed.contextName,
            estimatedMins: clientParsed.estimatedMins,
            energyLevel: clientParsed.energyLevel,
          },
        }),
      });

      if (aiResult.ok) {
        const aiFields = await aiResult.json();

        // Merge AI fields with lower confidence
        if (aiFields.contextName && !clientParsed.contextId) {
          const context = options.contexts?.find(
            (c) => c.name.toLowerCase() === aiFields.contextName.toLowerCase()
          );
          if (context) {
            clientParsed.contextId = context.id;
            clientParsed.contextName = context.name;
            clientParsed.confidence.context = 0.7; // AI-inferred
          }
        }

        if (aiFields.estimatedMins && !clientParsed.estimatedMins) {
          clientParsed.estimatedMins = aiFields.estimatedMins;
          clientParsed.confidence.estimatedMins = 0.7;
        }

        if (aiFields.energyLevel && !clientParsed.energyLevel) {
          clientParsed.energyLevel = aiFields.energyLevel;
          clientParsed.confidence.energyLevel = 0.7;
        }
      }
    } catch {
      // AI enhancement failed silently, use client-only parse
    }
  }

  return clientParsed;
}
```

---

## 5. Preview UI

### 5.1 TaskPreviewCard Component

After parsing, show the extracted fields in an editable preview before creating the task.

```typescript
// src/components/tasks/TaskPreviewCard.tsx

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, MapPin, Clock, Zap, FolderKanban, Sparkles, Pencil, Check, X,
} from "lucide-react";
import type { ParsedTask } from "@/lib/parsers/natural-language-task";

interface TaskPreviewCardProps {
  parsed: ParsedTask;
  onConfirm: (data: {
    title: string;
    dueDate?: string;
    scheduledDate?: string;
    contextId?: string;
    estimatedMins?: number;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    projectId?: string;
  }) => void;
  onCancel: () => void;
}

export function TaskPreviewCard({ parsed, onConfirm, onCancel }: TaskPreviewCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [title, setTitle] = useState(parsed.title);
  // ... state for each editable field

  const isAIInferred = (field: string) =>
    parsed.confidence[field] !== undefined && parsed.confidence[field] < 1.0;

  return (
    <Card className="border-primary/30">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-medium"
          />
        </div>

        {parsed.dueDate && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Due: {new Date(parsed.dueDate).toLocaleDateString()}</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5">
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}

        {parsed.contextName && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="outline" className="text-xs">
              {parsed.contextName}
            </Badge>
            {isAIInferred("context") && (
              <Sparkles className="h-3 w-3 text-amber-500" />
            )}
          </div>
        )}

        {parsed.estimatedMins && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>~{parsed.estimatedMins} min</span>
            {isAIInferred("estimatedMins") && (
              <Sparkles className="h-3 w-3 text-amber-500" />
            )}
          </div>
        )}

        {parsed.energyLevel && (
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{parsed.energyLevel} energy</span>
            {isAIInferred("energyLevel") && (
              <Sparkles className="h-3 w-3 text-amber-500" />
            )}
          </div>
        )}

        {parsed.projectName && (
          <div className="flex items-center gap-2 text-sm">
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{parsed.projectName}</span>
          </div>
        )}

        {Object.values(parsed.confidence).some((c) => c < 1.0) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            AI-suggested fields shown with sparkle icon
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm({
            title,
            dueDate: parsed.dueDate,
            scheduledDate: parsed.scheduledDate,
            contextId: parsed.contextId,
            estimatedMins: parsed.estimatedMins,
            energyLevel: parsed.energyLevel,
            projectId: parsed.projectId,
          })}>
            <Check className="h-3.5 w-3.5 mr-1" />
            Create Task
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5.2 Integration Points

**Inbox Capture Modal** (`src/components/inbox/InboxCaptureModal.tsx`):
- After typing text and pressing Enter, parse the text
- If any structured fields were extracted (date, context, duration, etc.), show the `TaskPreviewCard` in-modal
- User can confirm as a structured task or dismiss and save as a raw inbox item
- If no fields extracted, save as inbox item immediately (current behavior)

**New Task Dialog:**
- Replace the multi-field form with a single text input at the top
- As the user types, show a live preview below with extracted fields
- Debounce parsing by 300ms to avoid excessive re-parsing
- Still show the full form fields below for manual override

**Quick Capture (Cmd+I):**
- The existing `InboxCaptureModal` is the quick capture. Enhanced with parsing.

### 5.3 MCP Tool Enhancement

Add a new MCP tool for natural language task creation:

```typescript
// In src/mcp/tools.ts, add to TOOLS array:
{
  name: "tandem_task_create_from_text",
  description:
    "Create a task from natural language text. Parses dates, contexts, duration, and energy level automatically. Example: 'Call dentist Tuesday at 2pm @Phone ~15min !high'",
  inputSchema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description:
          'Natural language task description. Supports: dates ("tomorrow", "next Tuesday"), @contexts, ~duration (~30min), !energy (!high, !low), #project.',
      },
      autoCreate: {
        type: "boolean",
        description:
          "If true (default), create the task immediately. If false, return the parsed result without creating.",
      },
    },
    required: ["text"],
  },
}
```

Handler:
```typescript
case "tandem_task_create_from_text": {
  const { text, autoCreate = true } = args;

  // Get user's contexts and projects for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const projects = await prisma.project.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, title: true },
  });

  const parsed = parseNaturalLanguageTask(text, { contexts, projects });

  if (!autoCreate) {
    return { content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }] };
  }

  // Create the task using the parsed data
  const taskData: any = { title: parsed.title };
  if (parsed.dueDate) taskData.dueDate = parsed.dueDate;
  if (parsed.scheduledDate) taskData.scheduledDate = parsed.scheduledDate;
  if (parsed.contextId) taskData.contextId = parsed.contextId;
  if (parsed.estimatedMins) taskData.estimatedMins = parsed.estimatedMins;
  if (parsed.energyLevel) taskData.energyLevel = parsed.energyLevel;
  if (parsed.projectId) taskData.projectId = parsed.projectId;

  const task = await createTask(userId, taskData, {
    actorType: "AI",
    source: "MCP",
  });

  return {
    content: [{
      type: "text",
      text: `Created task "${task.title}" (${task.id})` +
        (parsed.dueDate ? `\nDue: ${new Date(parsed.dueDate).toLocaleDateString()}` : "") +
        (parsed.contextName ? `\nContext: ${parsed.contextName}` : "") +
        (parsed.estimatedMins ? `\nEstimate: ${parsed.estimatedMins} min` : "") +
        (parsed.energyLevel ? `\nEnergy: ${parsed.energyLevel}` : ""),
    }],
  };
}
```

---

## 6. Edge Cases

- **Ambiguous dates:** "next Friday" when today is Friday — chrono-node's `forwardDate: true` option handles this (always looks forward).
- **Multiple dates:** "meet with Sarah Monday, report due Friday" — take the first date match. The title retains the second date reference for the user to handle.
- **No title left after extraction:** "tomorrow @Home ~30min !low" leaves no title. Fall back to the original input as the title and let the user edit in the preview card.
- **Context not found:** "@Gym" when no such context exists. Show the extracted `@Gym` in the preview with a warning: "Context not found. Create it?" with a quick-create button.
- **Conflicting markers:** "~30min ~1h" — take the first match.
- **Special characters in titles:** task titles with `@`, `~`, `!`, `#` that are not markers. The parser requires markers to be at word boundaries (e.g., `@` must be preceded by whitespace or be at the start of the string). Text like "send email about ~pricing" should not extract `~pricing` as a duration.
- **Timezone:** chrono-node uses the system timezone. The preview shows the parsed date for user confirmation.
- **Empty input:** return the input as the title with no extracted fields.
- **Very long input:** truncate parsing to first 500 characters (matching the createTaskSchema max length).

---

## 7. Implementation Phases

### Phase 1: Client-Side Date Parser

**Goal:** Parse dates from natural language. The highest-value extraction.

**Dependencies:** `npm install chrono-node`

**New files:**
- `src/lib/parsers/natural-language-task.ts` — Core parser (date extraction only in Phase 1)
- `src/lib/parsers/__tests__/natural-language-task.test.ts` — Unit tests

**Modified files:**
- `package.json` — add `chrono-node` dependency

**Tests:**
```typescript
import { parseNaturalLanguageTask } from "../natural-language-task";

describe("parseNaturalLanguageTask", () => {
  const refDate = new Date("2026-02-23T10:00:00Z");

  test("parses 'call dentist tomorrow'", () => {
    const result = parseNaturalLanguageTask("call dentist tomorrow", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("call dentist");
    expect(result.dueDate).toBeDefined();
    expect(new Date(result.dueDate!).getDate()).toBe(24);
  });

  test("parses 'buy groceries next Monday at 10am'", () => {
    const result = parseNaturalLanguageTask("buy groceries next Monday at 10am", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("buy groceries");
    expect(result.dueDate).toBeDefined();
  });

  test("returns original input when no date found", () => {
    const result = parseNaturalLanguageTask("buy groceries", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("buy groceries");
    expect(result.dueDate).toBeUndefined();
  });

  test("uses scheduledDate for defer keywords", () => {
    const result = parseNaturalLanguageTask("defer clean garage until next Saturday", {
      referenceDate: refDate,
    });
    expect(result.scheduledDate).toBeDefined();
    expect(result.dueDate).toBeUndefined();
  });
});
```

**Files touched:** 3

### Phase 2: @Context + ~Duration + !Energy + #Project Extraction

**Goal:** Full client-side parsing of all marker types.

**Modified files:**
- `src/lib/parsers/natural-language-task.ts` — Add context, duration, energy, project extraction
- `src/lib/parsers/__tests__/natural-language-task.test.ts` — Additional tests

**Files touched:** 2

### Phase 3: Preview UI

**Goal:** Show parsed results before creating.

**New files:**
- `src/components/tasks/TaskPreviewCard.tsx` — Preview card component

**Modified files:**
- `src/components/inbox/InboxCaptureModal.tsx` — Integrate parser + preview after text entry
- New task creation dialogs as applicable

**Files touched:** 3

### Phase 4: AI Enhancement

**Goal:** AI-powered inference for ambiguous inputs.

**New files:**
- `src/app/api/ai/parse-task/route.ts` — AI parse endpoint (non-streaming, single shot)
- `src/lib/parsers/enhanced-parse.ts` — Combined client + AI parse

**Modified files:**
- `src/components/tasks/TaskPreviewCard.tsx` — Show AI-inferred fields with sparkle icon and lower-confidence styling

**Files touched:** 3

### Phase 5: MCP Tool Integration

**Goal:** Natural language task creation via MCP for AI assistants.

**Modified files:**
- `src/mcp/tools.ts` — Add `tandem_task_create_from_text` tool definition and handler

**Files touched:** 1

---

## 8. Key Files Reference

| File | What's There | What Changes |
|---|---|---|
| `src/lib/validations/task.ts` | `createTaskSchema` Zod validation | No changes — parsed output conforms to existing schema |
| `src/lib/services/task-service.ts` | `createTask()` with cascade logic | No changes — called with parsed data |
| `src/components/inbox/InboxCaptureModal.tsx` | Quick capture modal (Cmd+I) | Integrate parser + preview |
| `src/mcp/tools.ts` | MCP tool definitions + handlers | Add `tandem_task_create_from_text` |
| `src/app/api/ai/chat/route.ts` | AI chat endpoint | Pattern reference for AI parse endpoint |
| `src/lib/ai/resolve-key.ts` | AI config resolution | Reused by AI parse endpoint |

---

## 9. What This Spec Does Not Cover

- **Recurring task parsing** — "every Monday clean the fridge" is not parsed into a RecurringTemplate. That is a separate feature.
- **Multi-task parsing** — "buy milk, call dentist, email Sarah" as three separate tasks. One input = one task.
- **Language localization** — chrono-node supports multiple languages, but the @/~/! markers and the AI prompts are English only for now.
- **Voice input** — speech-to-text before parsing. The parser works on text input; voice is a separate layer.
- **Smart scheduling** — AI suggesting the best date based on calendar availability. The parser extracts what the user wrote; it does not suggest dates.
- **Learning from user behavior** — the parser does not learn which contexts a user assigns frequently. All inference is stateless.
