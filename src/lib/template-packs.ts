// ============================================================================
// Recurring Template Packs — Pre-built SHE-style card sets
// ============================================================================

export interface TemplateDef {
  title: string;
  description: string;
  cronExpression: string;
  color: string;
  estimatedMins: number;
}

export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  templates: TemplateDef[];
}

// ---------------------------------------------------------------------------
// Running a House (~22 templates)
// ---------------------------------------------------------------------------

const YELLOW = "#FBBF24";
const BLUE = "#60A5FA";
const GRAY = "#9CA3AF";
const PINK = "#F9A8D4";
const GREEN = "#34D399";

const runningAHouse: TemplatePack = {
  id: "running-a-house",
  name: "Running a House",
  description:
    "Daily, weekly, and seasonal household maintenance — the SHE classic.",
  templates: [
    // Daily (yellow)
    { title: "Make beds", description: "Start your day with a quick win", cronExpression: "daily", color: YELLOW, estimatedMins: 5 },
    { title: "Wipe kitchen counters", description: "Prevents buildup and keeps surfaces sanitary", cronExpression: "daily", color: YELLOW, estimatedMins: 5 },
    { title: "Load/run dishwasher", description: "Run when full; unload first thing next morning", cronExpression: "daily", color: YELLOW, estimatedMins: 10 },
    { title: "Quick tidy living areas", description: "10-minute sweep: cushions, remotes, stray items", cronExpression: "daily", color: YELLOW, estimatedMins: 10 },
    { title: "Take out trash", description: "Check kitchen, bathroom, and office bins", cronExpression: "daily", color: YELLOW, estimatedMins: 5 },

    // Weekly (blue)
    { title: "Meal plan for the week", description: "Plan 5-7 dinners, check pantry, build grocery list", cronExpression: "weekly:0", color: BLUE, estimatedMins: 30 },
    { title: "Grocery shopping", description: "Shop from your meal plan list to reduce waste", cronExpression: "weekly:0", color: BLUE, estimatedMins: 60 },
    { title: "Laundry — bedsheets & towels", description: "Wash on hot; rotate between sets", cronExpression: "weekly:6", color: BLUE, estimatedMins: 15 },
    { title: "Take out recycling/bins", description: "Check collection day; rinse containers first", cronExpression: "weekly:3", color: BLUE, estimatedMins: 10 },
    { title: "Vacuum all floors", description: "Move furniture pads; get corners and under sofas", cronExpression: "weekly:6", color: BLUE, estimatedMins: 30 },

    // Biweekly (blue)
    { title: "Mop kitchen & bathroom floors", description: "Sweep first, then mop with appropriate cleaner", cronExpression: "biweekly:6", color: BLUE, estimatedMins: 30 },
    { title: "Clean bathrooms", description: "Toilet, sink, mirror, tub; restock supplies", cronExpression: "biweekly:6", color: BLUE, estimatedMins: 30 },

    // Monthly (gray)
    { title: "Clean fridge & freezer", description: "Toss expired items, wipe shelves, check freezer frost", cronExpression: "monthly:1", color: GRAY, estimatedMins: 30 },
    { title: "Change HVAC filter", description: "Write the install date on the new filter", cronExpression: "monthly:1", color: GRAY, estimatedMins: 10 },
    { title: "Check smoke detector batteries", description: "Press test button; replace batteries annually", cronExpression: "monthly:1", color: GRAY, estimatedMins: 10 },
    { title: "Deep clean oven", description: "Use oven cleaner or self-clean cycle; wipe racks", cronExpression: "monthly:15", color: GRAY, estimatedMins: 45 },

    // Quarterly (pink)
    { title: "Rotate seasonal clothes", description: "Pack out-of-season items; check for repairs needed", cronExpression: "quarterly:1", color: PINK, estimatedMins: 60 },
    { title: "Declutter one room", description: "One room at a time: donate, trash, or relocate items", cronExpression: "quarterly:1", color: PINK, estimatedMins: 90 },
    { title: "Clean gutters", description: "Clear debris; check downspouts flow freely", cronExpression: "quarterly:1", color: PINK, estimatedMins: 60 },
    { title: "Wash windows", description: "Inside and out; use squeegee for streak-free finish", cronExpression: "quarterly:1", color: PINK, estimatedMins: 60 },

    // Yearly (pink)
    { title: "Service HVAC system", description: "Schedule professional maintenance before peak season", cronExpression: "yearly:3:1", color: PINK, estimatedMins: 30 },
    { title: "Flush water heater", description: "Drain sediment to extend tank life", cronExpression: "yearly:6:1", color: PINK, estimatedMins: 30 },
    { title: "Review home insurance", description: "Compare coverage and rates; update for renovations", cronExpression: "yearly:1:15", color: PINK, estimatedMins: 60 },
  ],
};

// ---------------------------------------------------------------------------
// Small Garden (~12 templates)
// ---------------------------------------------------------------------------

const smallGarden: TemplatePack = {
  id: "small-garden",
  name: "Small Garden",
  description:
    "Daily watering through seasonal planning for a backyard or patio garden.",
  templates: [
    // Daily (yellow)
    { title: "Water container plants", description: "Check soil moisture first; water deeply when dry", cronExpression: "daily", color: YELLOW, estimatedMins: 10 },
    { title: "Check for pests & diseases", description: "Look under leaves; catch problems early", cronExpression: "daily", color: YELLOW, estimatedMins: 5 },

    // Weekly (green)
    { title: "Weed garden beds", description: "Pull weeds when soil is moist; get the roots", cronExpression: "weekly:6", color: GREEN, estimatedMins: 30 },
    { title: "Harvest ripe produce", description: "Pick regularly to encourage continued production", cronExpression: "weekly:3", color: GREEN, estimatedMins: 15 },
    { title: "Deadhead spent flowers", description: "Snip below the spent bloom to promote new growth", cronExpression: "weekly:3", color: GREEN, estimatedMins: 15 },

    // Monthly (gray)
    { title: "Fertilize beds & containers", description: "Use balanced fertilizer; follow package rates", cronExpression: "monthly:1", color: GRAY, estimatedMins: 20 },
    { title: "Turn compost pile", description: "Aerate to speed decomposition; add water if dry", cronExpression: "monthly:15", color: GRAY, estimatedMins: 20 },
    { title: "Prune overgrowth", description: "Remove dead/crossing branches; shape for airflow", cronExpression: "monthly:15", color: GRAY, estimatedMins: 30 },

    // Quarterly (pink)
    { title: "Plan next season's planting", description: "Research varieties; sketch bed layout; order seeds", cronExpression: "quarterly:1", color: PINK, estimatedMins: 60 },
    { title: "Amend soil with compost", description: "Add 2-3 inches; work into top 6 inches of soil", cronExpression: "quarterly:1", color: PINK, estimatedMins: 45 },

    // Yearly (pink)
    { title: "Order seeds for spring", description: "Review last year's notes; try one new variety", cronExpression: "yearly:1:15", color: PINK, estimatedMins: 30 },
    { title: "Winterize garden beds", description: "Mulch heavily; protect tender perennials; drain hoses", cronExpression: "yearly:11:1", color: PINK, estimatedMins: 60 },
  ],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const TEMPLATE_PACKS: TemplatePack[] = [runningAHouse, smallGarden];

export function getPackById(id: string): TemplatePack | undefined {
  return TEMPLATE_PACKS.find((p) => p.id === id);
}
