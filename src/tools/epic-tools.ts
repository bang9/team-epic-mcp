import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SheetData, StatusUpdate } from "../types.js";
import {
  formatEpicWithStatus,
  formatStatusUpdate,
} from "../sheets/parser.js";

interface EpicTool extends Tool {
  handler: (data: SheetData, args: any) => any;
}

export const epicReadTools: EpicTool[] = [
  {
    name: "list_epics",
    description: "Epic 목록을 조회합니다. 상태와 담당자로 필터링 가능합니다.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Epic 상태 필터",
          enum: [
            "backlog",
            "kickoff",
            "planning",
            "development",
            "code_review",
            "testing",
            "ready_to_release",
            "released",
            "done",
            "on_hold",
          ],
        },
        assignee: {
          type: "string",
          description: "담당자 멘션 (예: @Airen Kang)",
        },
      },
    },
    handler: (data: SheetData, args: any) => {
      let epics = data.epics;

      if (args.status) {
        epics = epics.filter((e) => e.current_status === args.status);
      }

      if (args.assignee) {
        epics = epics.filter(
          (e) =>
            e.ios_assignee === args.assignee ||
            e.android_assignee === args.assignee ||
            e.js_assignee === args.assignee,
        );
      }

      // Sprint filtering removed - Sprint_View no longer available

      const content =
        epics.length > 0
          ? epics
              .map((epic) => {
                const status = data.epicStatuses.find(
                  (s) => s.epic_id === epic.epic_id,
                );
                return formatEpicWithStatus(epic, status);
              })
              .join("\n\n---\n\n")
          : "조건에 맞는 Epic이 없습니다.";

      return {
        content: [
          {
            type: "text",
            text: `# Epic 목록 (${epics.length}개)\n\n${content}`,
          },
        ],
      };
    },
  },

  {
    name: "get_epic_details",
    description: "특정 Epic의 상세 정보와 최근 업데이트를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_id: {
          type: "string",
          description: "Epic ID (예: PROJ-123)",
        },
      },
      required: ["epic_id"],
    },
    handler: (data: SheetData, args: any) => {
      const epic = data.epics.find((e) => e.epic_id === args.epic_id);

      if (!epic) {
        return {
          content: [
            {
              type: "text",
              text: `Epic ID ${args.epic_id}를 찾을 수 없습니다.`,
            },
          ],
        };
      }

      const status = data.epicStatuses.find((s) => s.epic_id === args.epic_id);
      const updates = data.statusUpdates
        .filter((u) => u.epic_id === args.epic_id)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 10); // 최근 10개

      let content = `# Epic 상세 정보\n\n${formatEpicWithStatus(epic, status)}\n\n`;

      if (updates.length > 0) {
        content += `## 📜 최근 업데이트 (${updates.length}개)\n\n`;
        content += updates.map(formatStatusUpdate).join("\n");
      }

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    },
  },

  {
    name: "get_epic_timeline",
    description: "특정 Epic의 전체 타임라인을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_id: {
          type: "string",
          description: "Epic ID",
        },
        limit: {
          type: "number",
          description: "조회할 업데이트 수 (기본값: 50)",
          default: 50,
        },
      },
      required: ["epic_id"],
    },
    handler: (data: SheetData, args: any) => {
      const epic = data.epics.find((e) => e.epic_id === args.epic_id);

      if (!epic) {
        return {
          content: [
            {
              type: "text",
              text: `Epic ID ${args.epic_id}를 찾을 수 없습니다.`,
            },
          ],
        };
      }

      const updates = data.statusUpdates
        .filter((u) => u.epic_id === args.epic_id)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, args.limit || 50);

      let content = `# ${epic.epic_name} 타임라인\n\n`;

      if (updates.length > 0) {
        content += updates.map(formatStatusUpdate).join("\n");
      } else {
        content += "아직 업데이트가 없습니다.";
      }

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    },
  },

  {
    name: "get_team_progress",
    description: "팀 전체의 Epic 진행 상황을 요약합니다.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: (data: SheetData, args: any) => {
      const activeEpics = data.epics.filter(
        (e) =>
          !["backlog", "done", "released", "on_hold"].includes(
            e.current_status,
          ),
      );

      // 상태별 집계
      const statusCount: Record<string, number> = {};
      activeEpics.forEach((epic) => {
        statusCount[epic.current_status] =
          (statusCount[epic.current_status] || 0) + 1;
      });

      // 플랫폼별 평균 진행률
      let totalIos = 0,
        totalAndroid = 0,
        totalJs = 0;
      let count = 0;

      activeEpics.forEach((epic) => {
        const status = data.epicStatuses.find(
          (s) => s.epic_id === epic.epic_id,
        );
        if (status) {
          totalIos += status.ios_progress;
          totalAndroid += status.android_progress;
          totalJs += status.js_progress;
          count++;
        }
      });

      const avgIos = count > 0 ? Math.round(totalIos / count) : 0;
      const avgAndroid = count > 0 ? Math.round(totalAndroid / count) : 0;
      const avgJs = count > 0 ? Math.round(totalJs / count) : 0;

      // 블로커 찾기
      const blockers = data.statusUpdates
        .filter((u) => u.update_type === "blocker")
        .filter((u) => {
          // 해결되지 않은 블로커만
          const resolved = data.statusUpdates.find(
            (r) =>
              r.epic_id === u.epic_id &&
              r.update_type === "resolved" &&
              new Date(r.timestamp) > new Date(u.timestamp),
          );
          return !resolved;
        });

      let content = `# 🏢 팀 진행 현황\n\n`;
      content += `## 📊 Epic 상태 분포\n`;

      Object.entries(statusCount).forEach(([status, count]) => {
        content += `- ${status}: ${count}개\n`;
      });

      content += `\n## 🎯 플랫폼별 평균 진행률\n`;
      content += `- iOS: ${avgIos}%\n`;
      content += `- Android: ${avgAndroid}%\n`;
      content += `- JS: ${avgJs}%\n`;

      if (blockers.length > 0) {
        content += `\n## 🚫 현재 블로커 (${blockers.length}개)\n`;
        blockers.slice(0, 5).forEach((blocker) => {
          const epic = data.epics.find((e) => e.epic_id === blocker.epic_id);
          content += `- **${epic?.epic_name || blocker.epic_id}**: ${blocker.message}\n`;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    },
  },

  {
    name: "find_blockers",
    description: "해결되지 않은 블로커가 있는 Epic을 찾습니다.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: (data: SheetData, args: any) => {
      // 모든 블로커 찾기
      const blockersByEpic: Record<string, StatusUpdate[]> = {};

      data.statusUpdates.forEach((update) => {
        if (update.update_type === "blocker") {
          // 이 블로커가 해결되었는지 확인
          const resolved = data.statusUpdates.find(
            (r) =>
              r.epic_id === update.epic_id &&
              r.update_type === "resolved" &&
              r.platform === update.platform &&
              new Date(r.timestamp) > new Date(update.timestamp),
          );

          if (!resolved) {
            if (!blockersByEpic[update.epic_id]) {
              blockersByEpic[update.epic_id] = [];
            }
            blockersByEpic[update.epic_id].push(update);
          }
        }
      });

      const epicIds = Object.keys(blockersByEpic);

      if (epicIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "현재 해결되지 않은 블로커가 없습니다. 🎉",
            },
          ],
        };
      }

      let content = `# 🚫 블로커가 있는 Epic (${epicIds.length}개)\n\n`;

      epicIds.forEach((epicId) => {
        const epic = data.epics.find((e) => e.epic_id === epicId);
        const blockers = blockersByEpic[epicId];

        content += `## ${epic?.epic_name || epicId}\n`;
        blockers.forEach((blocker) => {
          content += formatStatusUpdate(blocker) + "\n";
        });
        content += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    },
  },

  {
    name: "search_by_assignee",
    description: "특정 담당자가 할당된 Epic을 검색합니다.",
    inputSchema: {
      type: "object",
      properties: {
        assignee: {
          type: "string",
          description: "담당자 멘션 (예: @Airen Kang)",
        },
        platform: {
          type: "string",
          description: "플랫폼 필터",
          enum: ["iOS", "Android", "JS"],
        },
      },
      required: ["assignee"],
    },
    handler: (data: SheetData, args: any) => {
      let epics = data.epics;

      if (args.platform) {
        switch (args.platform) {
          case "iOS":
            epics = epics.filter((e) => e.ios_assignee === args.assignee);
            break;
          case "Android":
            epics = epics.filter((e) => e.android_assignee === args.assignee);
            break;
          case "JS":
            epics = epics.filter((e) => e.js_assignee === args.assignee);
            break;
        }
      } else {
        epics = epics.filter(
          (e) =>
            e.ios_assignee === args.assignee ||
            e.android_assignee === args.assignee ||
            e.js_assignee === args.assignee,
        );
      }

      // 진행중인 것과 완료된 것 분리
      const activeEpics = epics.filter(
        (e) => !["done", "released"].includes(e.current_status),
      );
      const completedEpics = epics.filter((e) =>
        ["done", "released"].includes(e.current_status),
      );

      let content = `# ${args.assignee}님의 Epic\n\n`;

      if (activeEpics.length > 0) {
        content += `## 🔄 진행중 (${activeEpics.length}개)\n\n`;
        activeEpics.forEach((epic) => {
          const status = data.epicStatuses.find(
            (s) => s.epic_id === epic.epic_id,
          );
          content += formatEpicWithStatus(epic, status) + "\n\n";
        });
      }

      if (completedEpics.length > 0) {
        content += `## ✅ 완료 (${completedEpics.length}개)\n\n`;
        completedEpics.forEach((epic) => {
          content += `- ${epic.epic_name} (${epic.epic_id})\n`;
        });
      }

      if (epics.length === 0) {
        content = `${args.assignee}님에게 할당된 Epic이 없습니다.`;
      }

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    },
  },
];
