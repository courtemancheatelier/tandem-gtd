/**
 * Standalone seed script for the Wedding Planning template.
 *
 * This re-uses the generic seed-templates flow (which reads all YAML files)
 * but can also be run independently:
 *
 *   npx tsx prisma/seed-wedding-template.ts
 *
 * It ensures the wedding-planning.yaml template exists in the database.
 * The wedding-specific post-instantiation features (team roles, RSVP fields,
 * wiki pages, discussion threads) are handled at instantiation time by
 * template-service.ts via the YAML `meta` block.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import yaml from "js-yaml";
import { PrismaClient, ProjectType, EnergyLevel } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATE_FILE = "wedding-planning.yaml";
const TEMPLATES_DIR = join(process.cwd(), "docs/templates");

interface TaskYAML {
  title: string;
  notes?: string;
  estimatedMins?: number;
  energyLevel?: string;
  contextName?: string;
}

interface SubProjectYAML {
  title: string;
  type?: string;
  outcome?: string;
  tasks?: TaskYAML[];
}

interface TemplateYAML {
  title: string;
  description?: string;
  type?: string;
  outcome?: string;
  icon?: string;
  variables?: string[];
  tasks?: TaskYAML[];
  subProjects?: SubProjectYAML[];
  meta?: Record<string, unknown>;
}

function toProjectType(type?: string): ProjectType {
  if (type === "PARALLEL") return "PARALLEL";
  if (type === "SINGLE_ACTIONS") return "SINGLE_ACTIONS";
  return "SEQUENTIAL";
}

function toEnergyLevel(level?: string): EnergyLevel | null {
  if (level === "LOW") return "LOW";
  if (level === "MEDIUM") return "MEDIUM";
  if (level === "HIGH") return "HIGH";
  return null;
}

async function seedWeddingTemplate() {
  console.log("Seeding Wedding Planning template...");

  const filePath = join(TEMPLATES_DIR, TEMPLATE_FILE);
  const raw = await readFile(filePath, "utf-8");
  const sourceHash = createHash("sha256").update(raw).digest("hex");
  const data = yaml.load(raw) as TemplateYAML;

  const existing = await prisma.projectTemplate.findUnique({
    where: { sourceFile: TEMPLATE_FILE },
  });

  if (existing && existing.sourceHash === sourceHash) {
    console.log("  Wedding template unchanged — skipping");
    return;
  }

  if (existing) {
    // Delete existing children and recreate
    await prisma.projectTaskTemplate.deleteMany({
      where: { templateId: existing.id },
    });
    await prisma.projectSubTemplate.deleteMany({
      where: { templateId: existing.id },
    });

    await prisma.projectTemplate.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: data.description || null,
        type: toProjectType(data.type),
        outcome: data.outcome || null,
        icon: data.icon || null,
        sourceHash,
        variables: data.variables || [],
      },
    });

    await createChildren(existing.id, data);
    console.log(`  ~ Updated: ${TEMPLATE_FILE} → "${data.title}"`);
  } else {
    const template = await prisma.projectTemplate.create({
      data: {
        title: data.title,
        description: data.description || null,
        type: toProjectType(data.type),
        outcome: data.outcome || null,
        icon: data.icon || null,
        isSystem: true,
        sourceFile: TEMPLATE_FILE,
        sourceHash,
        variables: data.variables || [],
      },
    });

    await createChildren(template.id, data);
    console.log(`  + Created: ${TEMPLATE_FILE} → "${data.title}"`);
  }

  // Count tasks across all phases
  let totalTasks = (data.tasks || []).length;
  for (const sub of data.subProjects || []) {
    totalTasks += (sub.tasks || []).length;
  }
  console.log(
    `  ${data.subProjects?.length || 0} phases, ${totalTasks} tasks total`
  );
}

async function createChildren(templateId: string, data: TemplateYAML) {
  // Create sub-project templates and their tasks
  if (data.subProjects) {
    for (let i = 0; i < data.subProjects.length; i++) {
      const sub = data.subProjects[i];
      const subTemplate = await prisma.projectSubTemplate.create({
        data: {
          title: sub.title,
          type: toProjectType(sub.type),
          outcome: sub.outcome || null,
          sortOrder: i,
          templateId,
        },
      });

      if (sub.tasks) {
        for (let j = 0; j < sub.tasks.length; j++) {
          const task = sub.tasks[j];
          await prisma.projectTaskTemplate.create({
            data: {
              title: task.title,
              notes: task.notes || null,
              estimatedMins: task.estimatedMins || null,
              energyLevel: toEnergyLevel(task.energyLevel),
              contextName: task.contextName || null,
              sortOrder: j,
              templateId,
              subProjectTemplateId: subTemplate.id,
            },
          });
        }
      }
    }
  }

  // Create top-level tasks
  if (data.tasks) {
    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      await prisma.projectTaskTemplate.create({
        data: {
          title: task.title,
          notes: task.notes || null,
          estimatedMins: task.estimatedMins || null,
          energyLevel: toEnergyLevel(task.energyLevel),
          contextName: task.contextName || null,
          sortOrder: i,
          templateId,
        },
      });
    }
  }
}

seedWeddingTemplate()
  .catch((e) => {
    console.error("Failed to seed wedding template:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
