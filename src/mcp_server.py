import json
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP, Handle, Message
from fastmcp.data_format import Text
from fastmcp.prompts import GetPrompt, GetPromptResponse, ListPrompts, ListPromptsResponse
from langfuse import Langfuse
from langfuse.model import ChatPromptClient

from .config import settings
from .utils import extract_variables

# Initialize Langfuse client from environment variables
langfuse = Langfuse(
    public_key=settings.LANGFUSE_PUBLIC_KEY,
    secret_key=settings.LANGFUSE_SECRET_KEY,
    base_url=settings.LANGFUSE_BASEURL,
)


def get_mcp_server() -> FastMCP:
    """
    Creates and configures the FastMCP server with prompt handlers and tools.
    """
    mcp = FastMCP(
        name="langfuse-prompts",
        version="1.0.0",
    )

    @mcp.prompt(name="prompts/list")
    async def list_prompts_handler(request: ListPrompts) -> ListPromptsResponse:
        """
        Handles the prompts/list request.
        Fetches prompts from the Langfuse API.
        """
        print("Handling list prompt request")
        try:
            page = int(request.cursor) if request.cursor else 1
            res = langfuse.api.prompts.list(
                label="production",
                limit=100,
                page=page,
            )

            res_prompts = []
            for i in res.data:
                # Inefficiently fetch each prompt to get variables, matching original logic
                prompt = langfuse.get_prompt(i.name, cache_ttl_seconds=0)
                variables = extract_variables(json.dumps(prompt.prompt))
                res_prompts.append(
                    {
                        "name": i.name,
                        "arguments": [{"name": v, "required": False} for v in variables],
                    }
                )

            next_cursor = str(page + 1) if res.meta.total_pages > page else None

            return ListPromptsResponse(
                prompts=res_prompts,
                next_cursor=next_cursor,
            )
        except Exception as e:
            print(f"Error fetching prompts: {e}")
            raise

    @mcp.prompt(name="prompts/get")
    async def get_prompt_handler(request: GetPrompt) -> GetPromptResponse:
        """
        Handles the prompts/get request.
        Fetches a specific prompt and compiles it.
        """
        print(f"Handling get prompt request for '{request.name}'")
        try:
            compiled_prompt: Optional[List[Dict[str, Any]]] = None

            try:
                # Try chat prompt first
                prompt = langfuse.get_prompt(request.name, type="chat")
                if isinstance(prompt, ChatPromptClient):
                    compiled = prompt.compile(**request.arguments)
                    compiled_prompt = [
                        {
                            "role": "assistant" if msg.role in ["ai", "assistant"] else "user",
                            "content": [{"type": "text", "text": msg.content}],
                        }
                        for msg in compiled
                    ]
            except Exception:
                # Fallback to text prompt
                prompt = langfuse.get_prompt(request.name, type="text")
                compiled = prompt.compile(**request.arguments)
                compiled_prompt = [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": compiled}],
                    }
                ]

            if compiled_prompt is None:
                raise ValueError(f"Failed to get prompt for '{request.name}'")

            return GetPromptResponse(messages=compiled_prompt)

        except Exception as e:
            print(f"Error getting prompt '{request.name}': {e}")
            raise

    @mcp.tool()
    async def get_prompts(
        handle: Handle,
        cursor: Optional[str] = None,
    ) -> List[Text]:
        """
        Get prompts that are stored in Langfuse.

        :param cursor: Cursor to paginate through prompts.
        """
        try:
            res = await list_prompts_handler(ListPrompts(cursor=cursor))
            return [Text(json.dumps(p)) for p in res.prompts]
        except Exception as e:
            await handle.error(f"Error: {e}")
            return []

    @mcp.tool()
    async def get_prompt(
        handle: Handle,
        name: str,
        arguments: Optional[str] = None,
    ) -> Text:
        """
        Get a prompt that is stored in Langfuse.

        :param name: Name of the prompt to retrieve.
        :param arguments: JSON object with prompt variables, e.g., '{"var": "value"}'.
        """
        try:
            args_dict = json.loads(arguments) if arguments else {}
            res = await get_prompt_handler(GetPrompt(name=name, arguments=args_dict))
            return Text(json.dumps(res.dict()))
        except Exception as e:
            await handle.error(f"Error: {e}")
            return Text("")

    return mcp
