import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import yaml from "js-yaml";
import { PrismaClient, ProjectType, EnergyLevel } from "@prisma/client";

const prisma = new PrismaClient();
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

async function createTemplateFromYAML(
  data: TemplateYAML,
  sourceFile: string,
  sourceHash: string
) {
  const template = await prisma.projectTemplate.create({
    data: {
      title: data.title,
      description: data.description || null,
      type: toProjectType(data.type),
      outcome: data.outcome || null,
      icon: data.icon || null,
      isSystem: true,
      sourceFile,
      sourceHash,
      variables: data.variables || [],
    },
  });

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
          templateId: template.id,
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
              templateId: template.id,
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
          templateId: template.id,
        },
      });
    }
  }
}

async function updateTemplateFromYAML(
  templateId: string,
  data: TemplateYAML,
  sourceHash: string
) {
  // Update the template record
  await prisma.projectTemplate.update({
    where: { id: templateId },
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

  // Recreate sub-project templates and their tasks
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

  // Recreate top-level tasks
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

async function seedTemplates() {
  console.log("Seeding project templates from docs/templates/...");

  const files = await readdir(TEMPLATES_DIR);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml")
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const file of yamlFiles) {
    const filePath = join(TEMPLATES_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const sourceHash = createHash("sha256").update(raw).digest("hex");
    const data = yaml.load(raw) as TemplateYAML;

    const existing = await prisma.projectTemplate.findUnique({
      where: { sourceFile: file },
    });

    if (!existing) {
      await createTemplateFromYAML(data, file, sourceHash);
      created++;
      console.log(`  + Created: ${file} → "${data.title}"`);
    } else if (existing.sourceHash !== sourceHash) {
      // Delete existing children and recreate
      await prisma.projectTaskTemplate.deleteMany({
        where: { templateId: existing.id },
      });
      await prisma.projectSubTemplate.deleteMany({
        where: { templateId: existing.id },
      });
      await updateTemplateFromYAML(existing.id, data, sourceHash);
      updated++;
      console.log(`  ~ Updated: ${file} → "${data.title}"`);
    } else {
      unchanged++;
    }
  }

  console.log(
    `\nTemplates seeded: ${created} created, ${updated} updated, ${unchanged} unchanged`
  );
}

seedTemplates()
  .catch((e) => {
    console.error("Failed to seed templates:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
