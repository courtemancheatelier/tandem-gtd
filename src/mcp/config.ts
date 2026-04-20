/**
 * MCP Server Configuration
 *
 * Reads configuration from environment variables.
 * The MCP server runs as a standalone process outside of Next.js,
 * so we resolve config from env vars directly.
 *
 * Required env vars:
 *   DATABASE_URL    - PostgreSQL connection string
 *   TANDEM_USER_ID  - The user ID for all MCP operations (single-user context)
 */

import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

export interface McpConfig {
  databaseUrl: string;
  userId: string;
}

/**
 * Attempt to load a .env file from the project root.
 * This is a lightweight parser for standalone use — does not require dotenv.
 */
function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Only set if not already in environment (env vars take precedence)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore .env read errors
  }
}

/**
 * Resolve the MCP configuration.
 * Loads .env file first, then reads from environment.
 * Throws descriptive errors if required values are missing.
 */
export function getConfig(): McpConfig {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Set it as an environment variable or in a .env file."
    );
  }

  const userId = process.env.TANDEM_USER_ID;
  if (!userId) {
    throw new Error(
      "TANDEM_USER_ID is required. Set it to your Tandem user ID.\n" +
        "You can find your user ID in the Tandem database or admin panel."
    );
  }

  return { databaseUrl, userId };
}
