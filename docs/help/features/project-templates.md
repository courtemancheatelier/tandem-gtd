---
title: Project Templates
category: Features
tags: [projects, templates, automation, reuse]
sortOrder: 9
---

# Project Templates

Project templates let you start new projects from proven structures instead of building from scratch. Tandem includes built-in system templates for common workflows, and you can save any project as a reusable template.

---

## System Templates

Tandem ships with five system templates available to all users:

| Template | Type | Variables | Description |
|----------|------|-----------|-------------|
| **Plan a Trip** | Sequential | destination, travel_dates | 10 tasks from research to packing |
| **Hire Someone** | Sequential | role, department | 10 tasks from job description to onboarding |
| **Launch a Product** | Parallel | product_name, launch_date | Sub-projects for Engineering + Marketing, plus top-level tasks |
| **Move Apartments** | Sequential | new_address, move_date | 12 tasks covering logistics, utilities, and the move |
| **Weekly Grocery Run** | Parallel | store | 6 tasks for meal planning through to putting groceries away |

System templates cannot be deleted or modified.

---

## Using a Template

### From the Projects Page

1. Go to **Projects**
2. Click the **+ New Project** button
3. Click **Browse Templates**
4. Select a template from the library
5. Fill in the template variables (e.g. destination, dates)
6. Optionally set an Area and Goal
7. Click **Create Project**

Variables like `{destination}` are automatically replaced throughout all task titles. Date variables (names containing "date", "deadline", "due") show a date picker and automatically set the project's target date.

### From the API

List available templates:

```bash
curl -H "Authorization: Bearer tnm_abc123..." \
  https://your-tandem.example.com/api/project-templates
```

Get template details (tasks, sub-projects, variables):

```bash
curl -H "Authorization: Bearer tnm_abc123..." \
  https://your-tandem.example.com/api/project-templates/TEMPLATE_ID
```

Create a project from a template:

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {"destination": "Tokyo", "travel_dates": "Apr 10, 2026"},
    "projectTitle": "Trip to Tokyo",
    "areaId": "OPTIONAL_AREA_ID",
    "goalId": "OPTIONAL_GOAL_ID"
  }' \
  https://your-tandem.example.com/api/project-templates/TEMPLATE_ID/instantiate
```

### From MCP (AI Assistants)

Use the `tandem_project_create_from_template` tool. Call it without arguments to list available templates, or with a `templateId` and `variables` to create a project.

---

## Saving a Project as a Template

You can turn any existing project into a reusable template:

1. Open a project
2. Click the **Template** button (copy icon) in the project header
3. Give the template a name and optional description
4. Click **Save as Template**

The template captures:
- All tasks (excluding dropped tasks) with their titles, notes, time estimates, energy levels, and contexts
- Sub-project structure (titles, types, and their tasks)
- Project type (sequential, parallel, or single actions)
- Project outcome

Saved templates appear under **My Templates** in the template library. You can delete user templates by hovering and clicking the trash icon.

### From the API

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"title": "My Sprint Template", "description": "Standard 2-week sprint"}' \
  https://your-tandem.example.com/api/projects/PROJECT_ID/save-as-template
```

---

## Variables

Templates support placeholder variables that get replaced when creating a project. Variables use `{variable_name}` syntax in task titles and project outcomes.

For example, the "Plan a Trip" template has tasks like:
- "Research {destination} — visa, weather, attractions"
- "Book flights to {destination}"
- "Book accommodation for {travel_dates}"

When you fill in `destination = "Tokyo"` and `travel_dates = "Apr 10-17"`, the created tasks become:
- "Research Tokyo — visa, weather, attractions"
- "Book flights to Tokyo"
- "Book accommodation for Apr 10-17"

### Context Mapping

Templates store context names (like `@Computer`, `@Phone`) by name rather than ID. When instantiating, Tandem automatically maps these to your personal context IDs. If a context doesn't exist in your account, it's simply skipped.

---

## See Also

- [[public-rest-api|Public REST API]] — full endpoint reference including templates
- [[mcp-setup-claude-ai|Setting Up MCP with Claude.ai]] — AI tool integration
