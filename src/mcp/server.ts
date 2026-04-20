#!/usr/bin/env node

/**
 * Tandem GTD — MCP Server
 *
 * A Model Context Protocol server that exposes the Tandem GTD system
 * as tools and resources for AI assistants (Claude Desktop, etc.).
 *
 * This server runs as a standalone process using stdio transport.
 * It connects directly to the PostgreSQL database via Prisma.
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *
 * Required environment variables:
 *   DATABASE_URL    - PostgreSQL connection string
 *   TANDEM_USER_ID  - Your Tandem user ID
 *
 * Install dependency:
 *   npm install @modelcontextprotocol/sdk
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { disconnect } from "./prisma-client";

const SERVER_NAME = "tandem-gtd";
const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  // Create the MCP server
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register tools and resources
  registerTools(server);
  registerResources(server);

  // Set up graceful shutdown
  const cleanup = async () => {
    await disconnect();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol messages)
  console.error(`[${SERVER_NAME}] MCP server running (v${SERVER_VERSION})`);
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
