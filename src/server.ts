import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import express from 'express';

import { getMcpServer } from './mcp_server.js';

const MCP_SESSION_HEADER_FIELD = 'mcp-session-id';

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req: express.Request, res: express.Response) => {
  const sessionId =
    (req.headers[MCP_SESSION_HEADER_FIELD] as string) || undefined;

  let transport: StreamableHTTPServerTransport;

  const existing_transport = sessionId ? transports.get(sessionId) : undefined;
  if (existing_transport) {
    // Reuse existing transport
    transport = existing_transport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
      sessionIdGenerator: () => randomUUID(),
    });

    // Clean up transport on closed
    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    // setup server resources, tools, and prompts ...
    const server = getMcpServer();

    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
      jsonrpc: '2.0',
    });
    return;
  }
  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable hanlder for GET and DELETE requests
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response,
) => {
  const sessionId =
    (req.headers[MCP_SESSION_HEADER_FIELD] as string) || undefined;

  const existing_transport = sessionId ? transports.get(sessionId) : undefined;

  if (!existing_transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  await existing_transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

export default app;
