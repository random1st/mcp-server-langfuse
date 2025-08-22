import argparse

from .config import settings
from .mcp_server import get_mcp_server


def main():
    """
    Main entry point for the MCP server.
    Parses command-line arguments to determine which transport to use.
    """
    parser = argparse.ArgumentParser(description="Langfuse Prompts MCP Server")
    parser.add_argument(
        "--transport",
        type=str,
        choices=["stdio", "http"],
        default="stdio",
        help="The transport to use for the MCP server.",
    )
    args = parser.parse_args()

    mcp = get_mcp_server()

    if args.transport == "http":
        print(f"Running MCP server with HTTP transport on port {settings.PORT}")
        mcp.run(transport="http", port=settings.PORT)
    else:
        print("Running MCP server with stdio transport")
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
