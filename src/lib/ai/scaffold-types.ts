export interface ProjectScaffoldSuggestion {
  projectType: "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS";
  projectTypeReason: string;
  tasks: Array<{
    title: string;
    sortOrder: number;
    estimatedMins?: number;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    contextName?: string;
    dependsOn?: number[];
  }>;
  phases?: Array<{
    label: string;
    taskIndices: number[];
  }>;
}

export interface ScaffoldInput {
  projectTitle: string;
  projectDescription?: string;
  tasks: Array<{ title: string }>;
  contexts: Array<{ name: string }>;
}
