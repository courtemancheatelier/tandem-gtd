import * as chrono from "chrono-node";

export interface ParsedTask {
  title: string;
  dueDate?: string;
  scheduledDate?: string;
  contextName?: string;
  contextId?: string;
  estimatedMins?: number;
  energyLevel?: "LOW" | "MEDIUM" | "HIGH";
  projectName?: string;
  projectId?: string;
  confidence: Record<string, number>;
}

interface ParseOptions {
  referenceDate?: Date;
  contexts?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; title: string }>;
}

function extractEnergy(input: string): {
  energyLevel: "LOW" | "MEDIUM" | "HIGH" | null;
  remainingInput: string;
} {
  const match = input.match(/(?:^|\s)!(high|medium|low|h|m|l)\b/i);
  if (!match) return { energyLevel: null, remainingInput: input };

  const level = match[1].toLowerCase();
  const energyMap: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
    high: "HIGH", h: "HIGH",
    medium: "MEDIUM", m: "MEDIUM",
    low: "LOW", l: "LOW",
  };

  const remainingInput = input.replace(match[0], " ").replace(/\s{2,}/g, " ").trim();
  return { energyLevel: energyMap[level] || null, remainingInput };
}

function extractDuration(input: string): {
  estimatedMins: number | null;
  remainingInput: string;
} {
  const patterns = [
    /(?:^|\s)~(\d+)\s*min(?:ute)?s?/i,
    /(?:^|\s)~(\d+(?:\.\d+)?)\s*h(?:ou)?r?s?/i,
    /(?:^|\s)~(\d+)m\b/i,
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
      const remainingInput = input.replace(match[0], " ").replace(/\s{2,}/g, " ").trim();
      return { estimatedMins: minutes, remainingInput };
    }
  }

  return { estimatedMins: null, remainingInput: input };
}

function extractContext(
  input: string,
  contexts: Array<{ id: string; name: string }>
): {
  contextId: string | null;
  contextName: string | null;
  remainingInput: string;
} {
  const atMatch = input.match(/(?:^|\s)@(\w+(?:[-_]\w+)*)/i);
  if (!atMatch) return { contextId: null, contextName: null, remainingInput: input };

  const mention = atMatch[1].toLowerCase();

  // Find matching context (case-insensitive, match against name with @ stripped)
  const context = contexts.find((c) => {
    const cleanName = c.name.replace(/^@/, "").toLowerCase();
    return cleanName === mention || cleanName.startsWith(mention);
  });

  if (!context) {
    // Context mentioned but not found — keep the marker in the title for now
    return { contextId: null, contextName: atMatch[0].trim(), remainingInput: input };
  }

  const remainingInput = input.replace(atMatch[0], " ").replace(/\s{2,}/g, " ").trim();
  return { contextId: context.id, contextName: context.name, remainingInput };
}

function extractProject(
  input: string,
  projects: Array<{ id: string; title: string }>
): {
  projectId: string | null;
  projectName: string | null;
  remainingInput: string;
} {
  const hashMatch = input.match(/(?:^|\s)#(\w+(?:[-_]\w+)*)/i);
  if (!hashMatch) return { projectId: null, projectName: null, remainingInput: input };

  const mention = hashMatch[1].toLowerCase();
  const project = projects.find((p) =>
    p.title.toLowerCase().includes(mention) ||
    p.title.toLowerCase().replace(/\s+/g, "-") === mention
  );

  if (!project) {
    return { projectId: null, projectName: hashMatch[0].trim(), remainingInput: input };
  }

  const remainingInput = input.replace(hashMatch[0], " ").replace(/\s{2,}/g, " ").trim();
  return { projectId: project.id, projectName: project.title, remainingInput };
}

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

  const remainingInput = input
    .replace(matchedText, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { date, matchedText, remainingInput };
}

function classifyDate(matchedText: string, fullInput: string): "due" | "scheduled" {
  // Check both the matched date text and the surrounding input for scheduling keywords
  const combined = `${matchedText} ${fullInput}`.toLowerCase();
  if (/\b(defer|start|begin|scheduled?|tickler)\b/.test(combined)) return "scheduled";
  return "due";
}

export function parseNaturalLanguageTask(
  input: string,
  options: ParseOptions = {}
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
    title: title || input,
    confidence: {},
  };

  if (dateResult.date) {
    const classification = classifyDate(dateResult.matchedText || "", input);
    if (classification === "scheduled") {
      parsed.scheduledDate = dateResult.date.toISOString();
    } else {
      parsed.dueDate = dateResult.date.toISOString();
    }
    parsed.confidence.date = 0.9;
  }

  if (context.contextId) {
    parsed.contextId = context.contextId;
    parsed.contextName = context.contextName ?? undefined;
    parsed.confidence.context = 1.0;
  } else if (context.contextName) {
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
    parsed.projectName = project.projectName ?? undefined;
    parsed.confidence.project = 1.0;
  } else if (project.projectName) {
    parsed.projectName = project.projectName;
    parsed.confidence.project = 0.5;
  }

  return parsed;
}
