import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleSheetsClient } from "./sheets/sheets-client.js";
import { epicReadTools } from "./tools/epic-tools.js";
import { epicWriteTools } from "./tools/epic-write-tools.js";
import { CONFIG } from "./config.js";

class TeamVisibilityMCPServer {
  private server: Server;
  private sheetsClient: GoogleSheetsClient;
  private tools: Tool[];

  constructor() {
    this.server = new Server(
      {
        name: "team-epic-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.sheetsClient = new GoogleSheetsClient();

    // 읽기와 쓰기 도구 모두 포함
    this.tools = [
      ...epicReadTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      ...epicWriteTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    ];

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // 읽기 도구 찾기
        const readTool = epicReadTools.find((tool) => tool.name === name);
        if (readTool) {
          const data = await this.sheetsClient.fetchAllData();
          return readTool.handler(data, args);
        }

        // 쓰기 도구 찾기
        const writeTool = epicWriteTools.find((tool) => tool.name === name);
        if (writeTool) {
          return await writeTool.handler(this.sheetsClient, args);
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Team Epic MCP Server started`);
    console.error(`Connected to spreadsheet: ${CONFIG.SPREADSHEET_ID}`);
  }
}

const server = new TeamVisibilityMCPServer();
server.start().catch(console.error);
