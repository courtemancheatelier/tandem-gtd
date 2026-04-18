# Admin Usage Dashboard — Test Plan

## Prerequisites
- Logged in as an admin user
- At least 2 users on the server with varying activity levels

## API Route Tests

### GET /api/admin/usage
- [ ] Returns 401 for unauthenticated requests
- [ ] Returns 403 for non-admin users
- [ ] Returns 200 with `{ summary, users }` for admin
- [ ] `summary` contains: totalUsers, totalTasks, totalCompleted, totalProjects, totalInboxProcessed, totalReviews, engagement
- [ ] `users` array contains one entry per user
- [ ] Each user entry has: id, name, email, createdAt, lastActive, engagement, tasks, projects, inbox, waitingFor, reviews, setup

## UI Tests

### Navigation
- [ ] Settings > Admin > "Usage" tab is visible (6th tab)
- [ ] Clicking Usage tab shows the Usage Dashboard card (collapsed by default)

### UsageDashboard
- [ ] Expanding the card triggers a data fetch (loading spinner shows)
- [ ] Data loads successfully and populates summary cards + user table
- [ ] Collapsing and re-expanding does not re-fetch (cached)

### UsageSummaryCards
- [ ] 5 cards displayed: Total Users, Tasks Created, Projects Created, Inbox Processed, Weekly Reviews
- [ ] Each card shows correct aggregate value
- [ ] "Total Users" card shows active/new counts in subtext
- [ ] Cards have colored left borders (blue, green, purple, yellow, cyan)

### UserUsageTable
- [ ] All users listed with correct name/email
- [ ] Engagement badges show correct color: green (Active), blue (New), yellow (Drifting), gray (Dormant)
- [ ] Tasks column shows completed/total with mini progress bar
- [ ] Projects column shows active/total with mini progress bar
- [ ] Inbox column shows processed/captured with processing rate percentage
- [ ] Reviews column shows count and relative "last review" date
- [ ] Setup column shows green/gray icons for contexts, areas, goals, horizon notes
- [ ] Clicking column headers sorts the table (toggles asc/desc)
- [ ] Default sort is Last Active descending

### Engagement Logic
- [ ] User created <7 days ago shows as "New" (blue)
- [ ] User with activity in last 7 days shows as "Active" (green)
- [ ] User with activity 8-30 days ago shows as "Drifting" (yellow)
- [ ] User with no activity or >30 days shows as "Dormant" (gray)

## Edge Cases
- [ ] Server with only 1 user (admin) — table shows single row
- [ ] User with zero tasks/projects/inbox — displays 0 values and dashes
- [ ] Large numbers format with locale separators (e.g., 1,234)
