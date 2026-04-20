import { parseNaturalLanguageTask } from "../natural-language-task";

describe("parseNaturalLanguageTask", () => {
  const refDate = new Date("2026-02-23T10:00:00Z");

  const contexts = [
    { id: "ctx-1", name: "@Phone" },
    { id: "ctx-2", name: "@Computer" },
    { id: "ctx-3", name: "@Errands" },
    { id: "ctx-4", name: "@Home" },
  ];

  const projects = [
    { id: "proj-1", title: "Kitchen Renovation" },
    { id: "proj-2", title: "Q1 Report" },
  ];

  // === Date Parsing ===

  test("parses 'call dentist tomorrow'", () => {
    const result = parseNaturalLanguageTask("call dentist tomorrow", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("call dentist");
    expect(result.dueDate).toBeDefined();
    expect(new Date(result.dueDate as string).getDate()).toBe(24);
    expect(result.confidence.date).toBe(0.9);
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

  // === Context Extraction ===

  test("extracts @Phone context", () => {
    const result = parseNaturalLanguageTask("call dentist @Phone", {
      referenceDate: refDate,
      contexts,
    });
    expect(result.title).toBe("call dentist");
    expect(result.contextId).toBe("ctx-1");
    expect(result.contextName).toBe("@Phone");
    expect(result.confidence.context).toBe(1.0);
  });

  test("matches partial context name", () => {
    const result = parseNaturalLanguageTask("send email @comp", {
      referenceDate: refDate,
      contexts,
    });
    expect(result.contextId).toBe("ctx-2");
    expect(result.contextName).toBe("@Computer");
  });

  test("unrecognized context shows with low confidence", () => {
    const result = parseNaturalLanguageTask("workout @gym", {
      referenceDate: refDate,
      contexts,
    });
    expect(result.contextId).toBeUndefined();
    expect(result.contextName).toBe("@gym");
    expect(result.confidence.context).toBe(0.5);
  });

  // === Duration Extraction ===

  test("extracts ~30min duration", () => {
    const result = parseNaturalLanguageTask("write report ~30min", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("write report");
    expect(result.estimatedMins).toBe(30);
    expect(result.confidence.estimatedMins).toBe(1.0);
  });

  test("extracts ~1.5h duration", () => {
    const result = parseNaturalLanguageTask("deep work session ~1.5h", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("deep work session");
    expect(result.estimatedMins).toBe(90);
  });

  test("extracts ~15m shorthand", () => {
    const result = parseNaturalLanguageTask("quick call ~15m", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("quick call");
    expect(result.estimatedMins).toBe(15);
  });

  // === Energy Level Extraction ===

  test("extracts !high energy", () => {
    const result = parseNaturalLanguageTask("brainstorm ideas !high", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("brainstorm ideas");
    expect(result.energyLevel).toBe("HIGH");
    expect(result.confidence.energyLevel).toBe(1.0);
  });

  test("extracts !l shorthand for LOW", () => {
    const result = parseNaturalLanguageTask("file receipts !l", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("file receipts");
    expect(result.energyLevel).toBe("LOW");
  });

  test("extracts !medium energy", () => {
    const result = parseNaturalLanguageTask("review PR !medium", {
      referenceDate: refDate,
    });
    expect(result.title).toBe("review PR");
    expect(result.energyLevel).toBe("MEDIUM");
  });

  // === Project Extraction ===

  test("extracts #kitchen project match", () => {
    const result = parseNaturalLanguageTask("order countertops #kitchen", {
      referenceDate: refDate,
      projects,
    });
    expect(result.title).toBe("order countertops");
    expect(result.projectId).toBe("proj-1");
    expect(result.projectName).toBe("Kitchen Renovation");
    expect(result.confidence.project).toBe(1.0);
  });

  test("unrecognized project shows with low confidence", () => {
    const result = parseNaturalLanguageTask("do something #unknown", {
      referenceDate: refDate,
      projects,
    });
    expect(result.projectId).toBeUndefined();
    expect(result.projectName).toBe("#unknown");
    expect(result.confidence.project).toBe(0.5);
  });

  // === Combined Parsing ===

  test("parses full input with all markers", () => {
    const result = parseNaturalLanguageTask(
      "call dentist Tuesday at 2pm @Phone ~15min !high",
      { referenceDate: refDate, contexts, projects }
    );
    expect(result.title).toBe("call dentist");
    expect(result.dueDate).toBeDefined();
    expect(result.contextId).toBe("ctx-1");
    expect(result.estimatedMins).toBe(15);
    expect(result.energyLevel).toBe("HIGH");
  });

  test("parses input with project and context", () => {
    const result = parseNaturalLanguageTask(
      "measure sink area @home #kitchen ~30min",
      { referenceDate: refDate, contexts, projects }
    );
    expect(result.title).toBe("measure sink area");
    expect(result.contextId).toBe("ctx-4");
    expect(result.projectId).toBe("proj-1");
    expect(result.estimatedMins).toBe(30);
  });

  // === Edge Cases ===

  test("empty input returns input as title", () => {
    const result = parseNaturalLanguageTask("", { referenceDate: refDate });
    expect(result.title).toBe("");
    expect(Object.keys(result.confidence)).toHaveLength(0);
  });

  test("input with only markers falls back to original", () => {
    const result = parseNaturalLanguageTask("tomorrow ~30min !high @Phone", {
      referenceDate: refDate,
      contexts,
    });
    // Title should be empty/fallback since everything is extracted
    // The original input becomes the fallback
    expect(result.dueDate).toBeDefined();
    expect(result.estimatedMins).toBe(30);
    expect(result.energyLevel).toBe("HIGH");
    expect(result.contextId).toBe("ctx-1");
  });

  test("does not extract duration from words containing tilde", () => {
    // ~pricing should not be extracted as a duration since it's not a number
    const result = parseNaturalLanguageTask("send email about ~pricing", {
      referenceDate: refDate,
    });
    expect(result.estimatedMins).toBeUndefined();
    expect(result.title).toBe("send email about ~pricing");
  });
});
