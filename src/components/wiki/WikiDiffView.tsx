"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface WikiDiffViewProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
}

interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
  lineNum?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: "context", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      diff.unshift({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }

  // Collapse long context runs — show only 3 context lines around changes
  for (let idx = 0; idx < diff.length; idx++) {
    const line = diff[idx];

    if (line.type !== "context") {
      result.push(line);
      continue;
    }

    // Check if this context line is within 3 lines of a change
    let nearChange = false;
    for (let k = Math.max(0, idx - 3); k <= Math.min(diff.length - 1, idx + 3); k++) {
      if (diff[k].type !== "context") {
        nearChange = true;
        break;
      }
    }

    if (nearChange) {
      result.push(line);
    } else if (
      result.length > 0 &&
      result[result.length - 1].type === "context" &&
      result[result.length - 1].text !== "···"
    ) {
      // Separator for collapsed lines
      result.push({ type: "context", text: "···" });
    }
  }

  return result;
}

export function WikiDiffView({ oldContent, newContent, oldTitle, newTitle }: WikiDiffViewProps) {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);

  return (
    <div className="space-y-2">
      {oldTitle && newTitle && oldTitle !== newTitle && (
        <div className="text-sm space-y-1">
          <div className="text-red-600 dark:text-red-400">
            - Title: {oldTitle}
          </div>
          <div className="text-green-600 dark:text-green-400">
            + Title: {newTitle}
          </div>
        </div>
      )}
      <div className="rounded-md border border-border overflow-hidden">
        <pre className="text-sm font-mono overflow-x-auto p-0 m-0">
          {diffLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                "px-3 py-0.5 min-h-[1.5em] whitespace-pre-wrap break-words",
                line.type === "add" && "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
                line.type === "remove" && "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
                line.type === "context" && line.text === "···" && "bg-muted text-muted-foreground text-center"
              )}
            >
              <span className="select-none mr-2 text-muted-foreground">
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
