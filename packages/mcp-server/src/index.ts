#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolDefinitions, handleTool } from "./tools.js";

const server = new McpServer({
  name: "lattice",
  version: "1.0.0",
});

// Register all tools
for (const def of toolDefinitions) {
  server.tool(
    def.name,
    def.description,
    def.inputSchema.properties as Record<string, unknown>,
    async (args: Record<string, unknown>) => {
      const result = await handleTool(def.name, args);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    }
  );
}

// Start the server on stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start Lattice MCP server:", err);
  process.exit(1);
});
