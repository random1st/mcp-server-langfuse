import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { getMcpServer } from './mcp_server.js';

async function main() {
  const transport = new StdioServerTransport();
  const server = getMcpServer();
  await server.connect(transport);
  console.error('Langfuse Prompts MCP Server running on stdio');
}

main().catch((error: unknown) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
