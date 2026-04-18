# Velocity Multiplier — Test Plan

## What It Does
Uses actual timer data from completed tasks to adjust burn-down/burn-up projection accuracy. If tasks consistently take longer (or shorter) than estimated, the projection line shifts accordingly.

- **Multiplier > 1** (e.g. 1.3) = tasks take 30% longer than estimated → projected completion moves later
- **Multiplier < 1** (e.g. 0.8) = tasks take 20% less than estimated → projected completion moves earlier
- **Multiplier = null** (< 5 tasks with both values) → projections unchanged from current behavior

## Setup: Seed Test Data

You need at least **5 completed tasks** in one project that have both `estimatedMins` and `actualMinutes` set.

### Option A: Use the Focus Timer naturally
1. Pick a project with estimated tasks
2. Start the focus timer on a task, work, stop the timer
3. Complete the task — `actualMinutes` gets recorded
4. Repeat for 5+ tasks

### Option B: Seed via database (faster)
```sql
-- Find completed tasks in a project
SELECT id, title, "estimated_mins", "actual_minutes", status
FROM "Task"
WHERE "project_id" = '<PROJECT_ID>' AND status = 'COMPLETED'
LIMIT 10;

-- Set actualMinutes on 5+ completed tasks (simulating tasks taking 1.3x longer)
UPDATE "Task" SET "actual_minutes" = ROUND("estimated_mins" * 1.3)
WHERE "project_id" = '<PROJECT_ID>'
  AND status = 'COMPLETED'
  AND "estimated_mins" IS NOT NULL
  AND "estimated_mins" > 0
LIMIT 5;
```

## Test Cases

### 1. Multiplier Not Active (< 5 tasks)
- **Setup:** Project with fewer than 5 completed tasks having both values
- **Check:** Burn-down projection is identical to before (no change)
- **API:** `GET /api/projects/<id>/burn-down` → `velocity.velocityMultiplier` is `null`

### 2. Multiplier Active — Tasks Take Longer (multiplier > 1)
- **Setup:** 5+ completed tasks where `actualMinutes > estimatedMins` (e.g. 1.3x)
- **Check burn-down:** Projection line should show a **later** completion date than raw velocity alone would suggest
- **Check burn-up:** Projected completion line rises more slowly
- **API:** `velocityMultiplier` ≈ 1.3

### 3. Multiplier Active — Tasks Overestimated (multiplier < 1)
- **Setup:** 5+ completed tasks where `actualMinutes < estimatedMins` (e.g. 0.7x)
- **Check burn-down:** Projection line shows an **earlier** completion date
- **Check burn-up:** Projected completion line rises faster
- **API:** `velocityMultiplier` ≈ 0.7

### 4. Pace Badge on Velocity Chart
- **Setup:** Same as test 2 or 3 (multiplier is active)
- **Navigate:** Project detail → Charts → Velocity tab
- **Check:** Blue "Pace: 1.3x estimates" badge appears next to trend badge

### 5. No Pace Badge When Inactive
- **Setup:** Project with < 5 qualifying tasks
- **Navigate:** Velocity chart
- **Check:** No pace badge shown

### 6. Mixed Data — Only Tasks With Both Values Count
- **Setup:** 10 completed tasks, but only 3 have `actualMinutes` set
- **Check:** Multiplier is `null` (needs 5 with *both* values)

## API Verification

```bash
# Check burn-down response
curl -s localhost:2000/api/projects/<ID>/burn-down | jq '.velocity.velocityMultiplier'

# Check velocity response
curl -s localhost:2000/api/projects/<ID>/velocity | jq '.velocityMultiplier'

# Check burn-up response
curl -s localhost:2000/api/projects/<ID>/burn-up | jq '.velocityMultiplier'
```

All three should return the same multiplier value (or `null`).

## Visual Verification
1. Open a project with enough timer data
2. Expand Charts → Burn-Down tab
3. Note the "Projected: <date>" badge and the dashed projection line
4. Compare against the same chart when multiplier is removed (set `actualMinutes` to NULL on those tasks)
5. The projection date should shift meaningfully
