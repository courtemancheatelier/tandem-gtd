# Tandem Load Testing & Data Generation Tool

> **Status:** Draft
> **Author:** Jason Courtemanche
> **Created:** 2026-02-27

## Overview

A CLI tool that generates realistic synthetic data (users, projects, sub-projects, tasks, wiki articles) at configurable scale to stress-test Tandem's API, database performance, and disk usage. The tool should support variable inputs (e.g., 10 users or 1,000) so we can identify upper limits, measure PostgreSQL load, and track storage consumption.

---

## Goals

- Generate configurable volumes of users, projects (with nested sub-projects/tasks), and wiki articles via the API
- Measure and report: API response times, database query load, disk/storage usage before and after
- Identify performance cliffs and upper limits
- Provide repeatable, scriptable test runs with consistent seed data

---

## CLI Interface

```
tandem-loadtest \
  --users 1000 \
  --projects 1000 \
  --wikis 1000 \
  --base-url http://localhost:3000 \
  --api-key <service-key> \
  --seed 42 \
  --report ./reports/run-001.json
```

### Parameters

| Flag | Description | Default |
|------|-------------|---------|
| `--users` | Number of users to generate | 10 |
| `--projects` | Number of top-level projects to generate | 10 |
| `--wikis` | Number of wiki articles to generate | 10 |
| `--sub-projects-min` | Min sub-projects per project | 0 |
| `--sub-projects-max` | Max sub-projects per project | 5 |
| `--tasks-min` | Min tasks per project/sub-project | 1 |
| `--tasks-max` | Max tasks per project/sub-project | 20 |
| `--wiki-length` | Approximate word count per wiki article | 500 |
| `--wiki-links` | Average number of `[[wikilinks]]` per article | 3 |
| `--concurrency` | Parallel API requests | 10 |
| `--seed` | Random seed for reproducibility | random |
| `--base-url` | Tandem instance URL | `http://localhost:3000` |
| `--api-key` | Service/admin API key | — |
| `--report` | Output path for JSON report | stdout |
| `--cleanup` | Delete generated data after run | false |
| `--dry-run` | Parse and validate without executing | false |

---

## Data Generation Strategy

### Users

<!-- TODO: Define user generation approach — direct DB seed vs API, fake names/emails, team membership distribution -->

### Projects

<!-- TODO: Define project type distribution (sequential/parallel/single-actions), sub-project depth (max 3 levels), task count variability, context and energy level distribution, due date spread -->

### Wiki Articles

<!-- TODO: Define content generation (lorem ipsum vs semi-realistic), wikilink graph connectivity, tag distribution, version history depth -->

---

## Metrics & Reporting

### Capture During Run

<!-- TODO: Define what to measure — API response times (p50/p95/p99), error rates, requests/sec throughput -->

### Database Metrics

<!-- TODO: Define PostgreSQL metrics — active connections, query duration, table sizes before/after, index usage, WAL size -->

### Storage Metrics

<!-- TODO: Define disk usage measurements — total DB size, per-table size breakdown, average row size by entity type, projected storage at 10x/100x scale -->

### Report Format

<!-- TODO: Define JSON report schema with run metadata, timing histograms, storage deltas, error log -->

---

## Implementation Notes

### Tech Stack

<!-- TODO: Define — Node.js script? Separate TypeScript CLI? k6? Direct Prisma seeding vs API calls? -->

### Concurrent Multi-User Simulation

The tool must simulate realistic concurrent access — not sequential requests from a single thread. In production, multiple users are hitting the API simultaneously, which surfaces contention issues (row locks, connection pool exhaustion, transaction deadlocks) that serial testing completely misses.

**Approach:**
- Spawn a worker pool where each worker acts as a distinct authenticated user
- Workers make API calls independently and concurrently, simulating real multi-user load
- The `--concurrency` flag controls how many simultaneous users are active (default 10)
- Each worker cycles through realistic action patterns: create a project, add tasks to it, create/edit wiki articles, complete tasks (triggering cascades)
- Stagger worker start times slightly to avoid artificial thundering herd at launch

**What this catches that serial testing won't:**
- PostgreSQL connection pool limits under concurrent load
- Row-level lock contention on shared resources (team projects, cascade engine updates)
- Transaction isolation issues with event sourcing writes
- API rate limiting or middleware bottlenecks
- Race conditions in task promotion and project completion cascades

### API vs Direct DB — Hybrid Approach

**Users → Direct Prisma seeding.** Mass simultaneous user creation isn't a realistic scenario — people sign up one at a time. Seeding users directly is fast and gets them out of the way so we can focus on what matters.

**Projects, tasks, wiki articles → API calls.** These represent real concurrent workload patterns — multiple users creating and updating things throughout the day. Running these through the API exercises the full stack: middleware, validation, the cascade engine, event sourcing, and database writes. This is where we'll find the actual bottlenecks.

### Cleanup Strategy

<!-- TODO: Define how to tear down generated data — soft delete, hard delete, separate test database -->

---

## Presets

<!-- TODO: Define named presets for common scenarios -->

| Preset | Users | Projects | Wikis | Description |
|--------|-------|----------|-------|-------------|
| `smoke` | 10 | 10 | 10 | Quick sanity check |
| `medium` | 100 | 100 | 100 | Moderate load |
| `heavy` | 1,000 | 1,000 | 1,000 | Full stress test |
| `extreme` | 10,000 | 10,000 | 10,000 | Find the breaking point |

---

## Success Criteria

<!-- TODO: Define acceptable thresholds — max response time, max DB size per 1k entities, no errors under X load -->

---

## Concurrency Conflict Scenarios

The load testing tool must specifically exercise concurrent access patterns on shared team resources to surface race conditions and data loss. These scenarios require the optimistic concurrency control from SPEC-optimistic-concurrency.md to be implemented first — without it, these tests will silently pass while losing data.

### Scenario: Simultaneous Task Edits

Two workers holding the same task's version both send PATCH requests. One should succeed, one should receive a 409 Conflict. Verify the winning write is intact and the losing client gets enough information to retry.

### Scenario: Edit vs Complete Race

Worker A is editing a task's title/notes. Worker B completes the same task, triggering the cascade engine. The completion should either win cleanly (and A gets a 409) or A's edit lands first and B's completion applies on top — but never should A's edit silently overwrite the completion status.

### Scenario: Cascade Under Concurrent Load

Multiple users complete tasks in the same sequential project simultaneously. The cascade engine must promote exactly the right next tasks without double-promoting, skipping, or deadlocking on row locks.

### Scenario: Project Completion Race

Two users complete the last two remaining tasks in a project at nearly the same time. Both cascade runs check "are all tasks complete?" — exactly one should trigger the project completion, not both and not neither.

### Scenario: Cross-Project Cascade Contention

Task in Project A depends on task in Project B. User 1 completes the blocker in Project B while User 2 is editing the dependent task in Project A. The cascade promotion must not conflict with or overwrite the in-flight edit.

### Metrics to Capture

- 409 Conflict rate under varying concurrency levels
- Cascade correctness: expected vs actual task promotions and project completions
- Data integrity: verify no silent overwrites occurred by comparing event history against expected state
- Deadlock frequency and recovery time

---

## Open Questions

- API-only generation vs direct DB seeding vs hybrid?
- Should generated data be realistic enough for UI testing or just volumetric?
- Do we need concurrent read load during generation to simulate real usage?
- Should this live in the main repo or as a separate tool?
- How do we handle auth for 1,000 generated users — service key bypass?
- Do we want to test the cascade engine under load (complete tasks in bulk)?

---

## Future Enhancements

- Continuous load testing in CI pipeline
- Read/write mixed workload simulation
- Multi-tenant isolation stress testing
- MCP tool throughput testing
- Gantt chart rendering performance with large project trees
