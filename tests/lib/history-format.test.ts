/**
 * Tests for history format helpers, including TIMER_SESSION rendering.
 */

describe("formatDuration", () => {
  it("formats minutes under an hour as Nm", async () => {
    const { formatDuration } = await import("@/lib/history/format");
    expect(formatDuration(5)).toBe("5m");
    expect(formatDuration(59)).toBe("59m");
  });

  it("formats whole hours without minutes", async () => {
    const { formatDuration } = await import("@/lib/history/format");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(180)).toBe("3h");
  });

  it("formats hours + minutes", async () => {
    const { formatDuration } = await import("@/lib/history/format");
    expect(formatDuration(65)).toBe("1h 5m");
    expect(formatDuration(125)).toBe("2h 5m");
  });

  it("returns <1m for zero or negative durations", async () => {
    const { formatDuration } = await import("@/lib/history/format");
    expect(formatDuration(0)).toBe("<1m");
    expect(formatDuration(-5)).toBe("<1m");
  });
});

describe("formatEventDescription — TIMER_SESSION", () => {
  it("includes the session duration in the description", async () => {
    const { formatEventDescription } = await import("@/lib/history/format");
    const description = formatEventDescription({
      eventType: "TIMER_SESSION",
      changes: {
        durationMin: { old: null, new: 5 },
      },
      actorType: "USER",
      source: "MANUAL",
    });
    expect(description).toBe("Timer session · 5m");
  });

  it("handles missing duration by falling back to <1m", async () => {
    const { formatEventDescription } = await import("@/lib/history/format");
    const description = formatEventDescription({
      eventType: "TIMER_SESSION",
      changes: {},
      actorType: "USER",
      source: "MANUAL",
    });
    expect(description).toBe("Timer session · <1m");
  });

  it("does not append a source suffix for timer sessions", async () => {
    const { formatEventDescription } = await import("@/lib/history/format");
    const description = formatEventDescription({
      eventType: "TIMER_SESSION",
      changes: { durationMin: { old: null, new: 90 } },
      actorType: "USER",
      source: "MCP",
    });
    expect(description).toBe("Timer session · 1h 30m");
  });
});
