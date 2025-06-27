import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolResult,
  GetPromptRequest,
  GetPromptRequestSchema,
  GetPromptResult,
  ListPromptsRequest,
  ListPromptsRequestSchema,
  ListPromptsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { ChatPromptClient, Langfuse } from 'langfuse';
import { z } from 'zod';

import { extractVariables } from './utils.js';

// Requires Environment Variables
const langfuse = new Langfuse();

async function getPromptHandler(
  request: GetPromptRequest,
): Promise<GetPromptResult> {
  console.log('Handing get prompt request');

  const promptName: string = request.params.name;
  const args = request.params.arguments ?? {};

  try {
    // Initialize Langfuse client and fetch the prompt by name.
    let compiledTextPrompt: string | undefined;
    let compiledChatPrompt: ChatPromptClient['prompt'] | undefined; // Langfuse chat prompt type

    try {
      // try chat prompt type first
      const prompt = await langfuse.getPrompt(promptName, undefined, {
        type: 'chat',
      });
      if (prompt.type !== 'chat') {
        throw new Error(`Prompt '${promptName}' is not a chat prompt`);
      }
      compiledChatPrompt = prompt.compile(args);
    } catch {
      // fallback to text prompt type
      const prompt = await langfuse.getPrompt(promptName, undefined, {
        type: 'text',
      });
      compiledTextPrompt = prompt.compile(args);
    }

    if (compiledChatPrompt) {
      const result: GetPromptResult = {
        messages: compiledChatPrompt.map((msg) => ({
          content: {
            text: msg.content,
            type: 'text',
          },
          role: ['ai', 'assistant'].includes(msg.role) ? 'assistant' : 'user',
        })),
      };
      return result;
    } else if (compiledTextPrompt) {
      const result: GetPromptResult = {
        messages: [
          {
            content: { text: compiledTextPrompt, type: 'text' },
            role: 'user',
          },
        ],
      };
      return result;
    } else {
      throw new Error(`Failed to get prompt for '${promptName}'`);
    }
  } catch (err: unknown) {
    const error = err as Error;

    throw new Error(
      `Failed to get prompt for '${promptName}': ${error.message}`,
    );
  }
}

async function listPromptsHandler(
  request: ListPromptsRequest,
): Promise<ListPromptsResult> {
  console.log('Handing list prompt request');

  try {
    const cursor = request.params?.cursor;
    const page = cursor ? Number(cursor) : 1;
    if (cursor !== undefined && isNaN(page)) {
      throw new Error('Cursor must be a valid number');
    }

    const res = await langfuse.api.promptsList({
      label: 'production',
      limit: 100,
      page,
    });

    const resPrompts: ListPromptsResult['prompts'] = await Promise.all(
      res.data.map(async (i) => {
        const prompt = await langfuse.getPrompt(i.name, undefined, {
          cacheTtlSeconds: 0,
        });
        const variables = extractVariables(JSON.stringify(prompt.prompt));
        return {
          arguments: variables.map((v) => ({
            name: v,
            required: false,
          })),
          name: i.name,
        };
      }),
    );

    return {
      nextCursor:
        res.meta.totalPages > page ? (page + 1).toString() : undefined,
      prompts: resPrompts,
    };
  } catch (error) {
    console.error('Error fetching prompts:', error);
    throw new Error('Failed to fetch prompts');
  }
}

export const getMcpServer = (): McpServer => {
  const server = new McpServer(
    {
      name: 'langfuse-prompts',
      version: '1.0.0',
    },
    {
      capabilities: {
        prompts: {},
      },
    },
  );

  // Register handlers
  server.server.setRequestHandler(ListPromptsRequestSchema, listPromptsHandler);
  server.server.setRequestHandler(GetPromptRequestSchema, getPromptHandler);

  // Tools for compatibility
  server.tool(
    'get-prompts',
    'Get prompts that are stored in Langfuse',
    {
      cursor: z
        .string()
        .optional()
        .describe('Cursor to paginate through prompts'),
    },
    async (args) => {
      try {
        const res = await listPromptsHandler({
          method: 'prompts/list',
          params: {
            cursor: args.cursor,
          },
        });

        const parsedRes: CallToolResult = {
          content: res.prompts.map((p) => ({
            text: JSON.stringify(p),
            type: 'text',
          })),
        };

        return parsedRes;
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ text: 'Error: ' + error.message, type: 'text' }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get-prompt',
    'Get a prompt that is stored in Langfuse',
    {
      arguments: z
        .record(z.string())
        .optional()
        .describe(
          'Arguments with prompt variables to pass to the prompt template, json object, e.g. {"<name>":"<value>"}',
        ),
      name: z
        .string()
        .describe(
          'Name of the prompt to retrieve, use get-prompts to get a list of prompts',
        ),
    },
    async (args) => {
      try {
        const res = await getPromptHandler({
          method: 'prompts/get',
          params: {
            arguments: args.arguments,
            name: args.name,
          },
        });

        const parsedRes: CallToolResult = {
          content: [
            {
              text: JSON.stringify(res),
              type: 'text',
            },
          ],
        };

        return parsedRes;
      } catch (err: unknown) {
        const error = err as Error;

        return {
          content: [{ text: 'Error: ' + error.message, type: 'text' }],
          isError: true,
        };
      }
    },
  );

  return server;
};
