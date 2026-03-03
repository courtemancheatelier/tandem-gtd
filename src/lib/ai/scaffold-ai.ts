import { buildScaffoldSystemPrompt } from "./scaffold-prompts";
import type { ProjectScaffoldSuggestion, ScaffoldInput } from "./scaffold-types";

export async function getScaffoldSuggestion(
  config: { apiKey: string; model?: string },
  input: ScaffoldInput
): Promise<ProjectScaffoldSuggestion> {
  const systemPrompt = buildScaffoldSystemPrompt(input.contexts);

  const userMessage = `Project: "${input.projectTitle}"${
    input.projectDescription ? `\nDescription: ${input.projectDescription}` : ""
  }\n\nTasks:\n${input.tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n")}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI scaffold request failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text || "{}";
  const suggestion: ProjectScaffoldSuggestion = JSON.parse(content);

  // Validate task count matches
  if (!suggestion.tasks || suggestion.tasks.length !== input.tasks.length) {
    throw new Error("AI returned wrong number of tasks");
  }

  // Sanitize dependsOn indices
  for (const task of suggestion.tasks) {
    if (task.dependsOn) {
      task.dependsOn = task.dependsOn.filter(
        (d) => d >= 0 && d < suggestion.tasks.length && d !== task.sortOrder
      );
    }
  }

  return suggestion;
}
