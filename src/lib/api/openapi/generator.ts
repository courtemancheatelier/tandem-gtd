/**
 * OpenAPI spec generator.
 *
 * Run:  npx tsx src/lib/api/openapi/generator.ts
 * Or:   npm run generate:openapi
 *
 * Produces public/openapi.json (OpenAPI 3.1).
 */
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";
import * as fs from "node:fs";
import * as path from "node:path";

const generator = new OpenApiGeneratorV31(registry.definitions);

const doc = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Tandem API",
    version: "1.8.0",
    description:
      "REST API for the Tandem GTD application. " +
      "Authenticate with a personal API token (Bearer tnm_...) created in Settings → API Tokens. " +
      "Session-cookie auth is also accepted for browser clients.",
    license: {
      name: "AGPL-3.0",
      url: "https://www.gnu.org/licenses/agpl-3.0.html",
    },
  },
  servers: [
    {
      url: "{baseUrl}",
      description: "Your Tandem instance",
      variables: {
        baseUrl: {
          default: "http://localhost:2000",
          description: "Base URL of the Tandem server",
        },
      },
    },
  ],
  tags: [
    { name: "Tasks", description: "Task CRUD and lifecycle" },
    { name: "Projects", description: "Project management and sub-projects" },
    { name: "Inbox", description: "Quick capture inbox" },
    { name: "Contexts", description: "GTD contexts (@Home, @Office, etc.)" },
    { name: "Areas", description: "Areas of focus / responsibility" },
    { name: "Goals", description: "1-2 year goals" },
    { name: "Waiting For", description: "Delegated items tracker" },
    { name: "Reviews", description: "Weekly reviews" },
    { name: "Horizons", description: "Horizon notes and reviews" },
    { name: "Wiki", description: "Personal and team wiki" },
    { name: "Teams", description: "Team management and membership" },
    { name: "Notifications", description: "Notifications and push subscriptions" },
    { name: "History", description: "Activity feed and audit trail" },
    { name: "Search", description: "Full-text search" },
    { name: "Dashboard", description: "PM dashboard statistics" },
    { name: "Import/Export", description: "Data import and export" },
    { name: "Insights", description: "Productivity analytics" },
    { name: "AI", description: "AI-powered features (uses user's own API key)" },
    { name: "Settings", description: "User settings and API tokens" },
    { name: "Recurring", description: "Recurring task templates" },
    { name: "Public", description: "Unauthenticated endpoints" },
  ],
});

const outPath = path.resolve(__dirname, "../../../../public/openapi.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");

console.log(`OpenAPI spec written to ${outPath}`);
console.log(`  Paths: ${Object.keys(doc.paths ?? {}).length}`);
console.log(`  Schemas: ${Object.keys(doc.components?.schemas ?? {}).length}`);
