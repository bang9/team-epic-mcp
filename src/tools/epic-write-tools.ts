import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { GoogleSheetsClient } from "../sheets/sheets-client.js";
import { Platform } from "../types.js";

interface EpicWriteTool extends Tool {
  handler: (client: GoogleSheetsClient, args: any) => Promise<any>;
}

// 유틸리티 함수들
const extractEpicIdFromUrl = (epicUrl: string): string | null => {
  // https://company.atlassian.net/browse/PROJ-123 형태에서 PROJ-123 추출
  const match = epicUrl.match(/\/browse\/([A-Z]+-\d+)$/);
  return match ? match[1] : null;
};

// 유효성 검증 헬퍼 함수들
const validateAssignee = (assignee: string): boolean => {
  return assignee.startsWith("@") && assignee.length > 1;
};

const validateDateFormat = (date: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;

  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
};

const validateEpicUrl = (epicUrl: string): boolean => {
  return extractEpicIdFromUrl(epicUrl) !== null;
};

export const epicWriteTools: EpicWriteTool[] = [
  {
    name: "create_epic",
    description: "새로운 Epic을 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_name: {
          type: "string",
          description: "Epic 이름",
        },
        ios_assignee: {
          type: "string",
          description: "iOS 담당자 (예: @Airen Kang)",
        },
        android_assignee: {
          type: "string",
          description: "Android 담당자 (예: @John Kim)",
        },
        js_assignee: {
          type: "string",
          description: "JS 담당자 (예: @Sarah Lee)",
        },
        start_date: {
          type: "string",
          description: "시작일 (YYYY-MM-DD 형식)",
        },
        target_date: {
          type: "string",
          description: "목표일 (YYYY-MM-DD 형식)",
        },
        epic_url: {
          type: "string",
          description: "Epic URL (선택사항, 자동 생성됨)",
        },
        prd_link: {
          type: "string",
          description: "PRD 링크 (선택사항)",
        },
        tip_link: {
          type: "string",
          description: "TIP 링크 (선택사항)",
        },
        initial_status: {
          type: "string",
          description: "초기 상태 (선택사항, 기본값: backlog)",
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
        author: {
          type: "string",
          description: "생성자",
        },
      },
      required: [
        "epic_name",
        "epic_url",
        "ios_assignee",
        "android_assignee",
        "js_assignee",
        "start_date",
        "target_date",
        "author",
      ],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // 입력 유효성 검증
      const errors: string[] = [];

      // Epic URL 형식 검증
      if (!validateEpicUrl(args.epic_url)) {
        errors.push(
          "Epic URL 형식이 올바르지 않습니다. 예: https://company.atlassian.net/browse/PROJ-123",
        );
      }

      // 담당자 형식 검증
      if (!validateAssignee(args.ios_assignee)) {
        errors.push("iOS 담당자는 @로 시작해야 합니다");
      }
      if (!validateAssignee(args.android_assignee)) {
        errors.push("Android 담당자는 @로 시작해야 합니다");
      }
      if (!validateAssignee(args.js_assignee)) {
        errors.push("JS 담당자는 @로 시작해야 합니다");
      }

      // 날짜 형식 검증
      if (!validateDateFormat(args.start_date)) {
        errors.push("시작일은 YYYY-MM-DD 형식이어야 합니다");
      }
      if (!validateDateFormat(args.target_date)) {
        errors.push("목표일은 YYYY-MM-DD 형식이어야 합니다");
      }

      // 날짜 논리 검증
      if (new Date(args.start_date) > new Date(args.target_date)) {
        errors.push("시작일은 목표일보다 이전이어야 합니다");
      }

      // Epic 이름 길이 검증
      if (args.epic_name.trim().length < 3) {
        errors.push("Epic 이름은 최소 3자 이상이어야 합니다");
      }

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 입력 오류:\n${errors.map((e) => `- ${e}`).join("\n")}`,
            },
          ],
        };
      }

      try {
        // Epic URL에서 Epic ID 추출
        const epicId = extractEpicIdFromUrl(args.epic_url);
        if (!epicId) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Epic URL에서 ID를 추출할 수 없습니다: ${args.epic_url}`,
              },
            ],
          };
        }

        // Epic 생성
        const newEpicId = await client.createEpic(args);

        return {
          content: [
            {
              type: "text",
              text: `✅ 새로운 Epic이 생성되었습니다!

**Epic ID**: ${newEpicId}
**Epic 이름**: ${args.epic_name}
**담당자**:
- iOS: ${args.ios_assignee}
- Android: ${args.android_assignee}
- JS: ${args.js_assignee}
**기간**: ${args.start_date} ~ ${args.target_date}
**상태**: ${args.initial_status || "backlog"}

Epic이 성공적으로 생성되었습니다. 스프레드시트에서 확인하세요.`,
            },
          ],
        };
      } catch (error) {
        console.error("Epic creation error:", error);
        console.error("Epic data:", args);

        let errorMessage = "알 수 없는 오류";
        if (error instanceof Error) {
          errorMessage = error.message;

          // 추가적인 에러 정보 제공
          if (error.message.includes("API key")) {
            errorMessage +=
              "\n\nAPI 키 설정을 확인해주세요. MCP 서버 환경에 GOOGLE_API_KEY가 설정되어 있어야 합니다.";
          } else if (error.message.includes("Permission denied")) {
            errorMessage +=
              "\n\n스프레드시트 권한을 확인해주세요. API 키가 해당 스프레드시트에 쓰기 권한이 있어야 합니다.";
          } else if (error.message.includes("404")) {
            errorMessage +=
              "\n\n스프레드시트 ID나 시트 이름이 올바른지 확인해주세요.";
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ Epic 생성 중 오류가 발생했습니다: ${errorMessage}`,
            },
          ],
        };
      }
    },
  },

  {
    name: "update_progress",
    description:
      "플랫폼별 진행률을 업데이트합니다. 가장 자주 사용되는 기능입니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        platform: {
          type: "string",
          description: "플랫폼",
          enum: ["iOS", "Android", "JS"],
        },
        progress: {
          type: "number",
          description: "진행률 (0-100)",
          minimum: 0,
          maximum: 100,
        },
        comment: {
          type: "string",
          description: "진행 상황 코멘트 (선택사항)",
        },
        author: {
          type: "string",
          description: "작성자 (예: @Airen Kang)",
        },
      },
      required: ["epic_url", "platform", "progress", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      try {
        // Epic URL에서 Epic ID 추출
        const epicId = extractEpicIdFromUrl(args.epic_url);
        if (!epicId) {
          return {
            content: [
              {
                type: "text",
                text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
              },
            ],
          };
        }

        const data = await client.fetchAllData();
        
        // Epic 존재 여부 확인
        const epic = data.epics.find(e => e.epic_id === epicId);
        if (!epic) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Epic ${epicId}를 찾을 수 없습니다.`,
              },
            ],
          };
        }

        // 플랫폼별 진행률 업데이트
        const updates: any = {
          updated_by: args.author,
        };

        switch (args.platform) {
          case "iOS":
            updates.ios_progress = args.progress;
            break;
          case "Android":
            updates.android_progress = args.progress;
            break;
          case "JS":
            updates.js_progress = args.progress;
            break;
        }

        if (args.comment) {
          updates.last_comment = args.comment;
        }

        // Epic Status 업데이트
        const statusUpdated = await client.updateEpicStatus(epicId, updates);

        // Status Update 히스토리 추가
        const historyAdded = await client.addStatusUpdate({
          epic_id: epicId,
          update_type: "progress",
          platform: args.platform as Platform,
          message: `${args.progress}% 완료${args.comment ? ` - ${args.comment}` : ""}`,
          author: args.author,
        });

        if (statusUpdated && historyAdded) {
          return {
            content: [
              {
                type: "text",
                text: `✅ ${epicId}의 ${args.platform} 진행률이 ${args.progress}%로 업데이트되었습니다.`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `❌ 업데이트 중 오류가 발생했습니다. (Status Update: ${statusUpdated}, History: ${historyAdded})`,
              },
            ],
          };
        }
      } catch (error) {
        console.error("Progress update error:", error);

        let errorMessage = "알 수 없는 오류";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ 진행률 업데이트 중 오류가 발생했습니다: ${errorMessage}`,
            },
          ],
        };
      }
    },
  },

  {
    name: "add_comment",
    description:
      "Epic에 코멘트를 추가합니다. 현재 상황을 빠르게 공유할 때 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        comment: {
          type: "string",
          description: "코멘트 내용",
        },
        platform: {
          type: "string",
          description: "플랫폼 (선택사항)",
          enum: ["iOS", "Android", "JS"],
        },
        author: {
          type: "string",
          description: "작성자",
        },
      },
      required: ["epic_url", "comment", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      try {
        // Epic URL에서 Epic ID 추출
        const epicId = extractEpicIdFromUrl(args.epic_url);
        if (!epicId) {
          return {
            content: [
              {
                type: "text",
                text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
              },
            ],
          };
        }

        // Epic Status의 last_comment 업데이트
        const statusUpdated = await client.updateEpicStatus(epicId, {
          last_comment: args.comment,
          updated_by: args.author,
        });

        // Status Update 히스토리 추가
        const historyAdded = await client.addStatusUpdate({
          epic_id: epicId,
          update_type: "comment",
          platform: args.platform as Platform | undefined,
          message: args.comment,
          author: args.author,
        });

        if (statusUpdated && historyAdded) {
          return {
            content: [
              {
                type: "text",
                text: `💬 코멘트가 추가되었습니다.`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `❌ 코멘트 추가 중 오류가 발생했습니다. (Status Update: ${statusUpdated}, History: ${historyAdded})`,
              },
            ],
          };
        }
      } catch (error) {
        console.error("Comment add error:", error);

        let errorMessage = "알 수 없는 오류";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ 코멘트 추가 중 오류가 발생했습니다: ${errorMessage}`,
            },
          ],
        };
      }
    },
  },

  {
    name: "report_blocker",
    description:
      "블로커를 등록합니다. 작업을 막는 이슈가 발생했을 때 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        platform: {
          type: "string",
          description: "블로커가 발생한 플랫폼",
          enum: ["iOS", "Android", "JS"],
        },
        description: {
          type: "string",
          description: "블로커 설명",
        },
        author: {
          type: "string",
          description: "보고자",
        },
      },
      required: ["epic_url", "platform", "description", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // Epic URL에서 Epic ID 추출
      const epicId = extractEpicIdFromUrl(args.epic_url);
      if (!epicId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
            },
          ],
        };
      }

      // Status Update에 블로커 추가
      const added = await client.addStatusUpdate({
        epic_id: epicId,
        update_type: "blocker",
        platform: args.platform as Platform,
        message: args.description,
        author: args.author,
      });

      // Epic Status의 코멘트도 업데이트
      await client.updateEpicStatus(epicId, {
        last_comment: `🚫 [${args.platform}] 블로커: ${args.description}`,
        updated_by: args.author,
      });

      if (added) {
        return {
          content: [
            {
              type: "text",
              text: `🚫 블로커가 등록되었습니다: ${args.description}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ 블로커 등록 중 오류가 발생했습니다.`,
            },
          ],
        };
      }
    },
  },

  {
    name: "resolve_blocker",
    description: "블로커를 해결 처리합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        platform: {
          type: "string",
          description: "해결된 플랫폼",
          enum: ["iOS", "Android", "JS"],
        },
        resolution: {
          type: "string",
          description: "해결 방법 설명",
        },
        author: {
          type: "string",
          description: "해결자",
        },
      },
      required: ["epic_url", "platform", "resolution", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // Epic URL에서 Epic ID 추출
      const epicId = extractEpicIdFromUrl(args.epic_url);
      if (!epicId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
            },
          ],
        };
      }

      const added = await client.addStatusUpdate({
        epic_id: epicId,
        update_type: "resolved",
        platform: args.platform as Platform,
        message: args.resolution,
        author: args.author,
      });

      // Epic Status의 코멘트도 업데이트
      await client.updateEpicStatus(epicId, {
        last_comment: `✅ [${args.platform}] 블로커 해결: ${args.resolution}`,
        updated_by: args.author,
      });

      if (added) {
        return {
          content: [
            {
              type: "text",
              text: `✅ 블로커가 해결되었습니다!`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ 블로커 해결 처리 중 오류가 발생했습니다.`,
            },
          ],
        };
      }
    },
  },

  {
    name: "change_epic_status",
    description: "Epic의 전체 상태를 변경합니다. (예: planning → development)",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        new_status: {
          type: "string",
          description: "새로운 상태",
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
        reason: {
          type: "string",
          description: "상태 변경 이유 (선택사항)",
        },
        author: {
          type: "string",
          description: "변경자",
        },
      },
      required: ["epic_url", "new_status", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // Epic URL에서 Epic ID 추출
      const epicId = extractEpicIdFromUrl(args.epic_url);
      if (!epicId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
            },
          ],
        };
      }

      // Epic 상태 변경
      const statusChanged = await client.changeEpicStatus(
        epicId,
        args.new_status,
      );

      // 히스토리 추가
      const message = args.reason
        ? `상태 변경: ${args.new_status} - ${args.reason}`
        : `상태 변경: ${args.new_status}`;

      const historyAdded = await client.addStatusUpdate({
        epic_id: epicId,
        update_type: "status_change",
        message: message,
        author: args.author,
      });

      // Epic Status 업데이트
      await client.updateEpicStatus(epicId, {
        overall_status: args.new_status,
        last_comment: message,
        updated_by: args.author,
      });

      if (statusChanged && historyAdded) {
        return {
          content: [
            {
              type: "text",
              text: `🔄 Epic 상태가 ${args.new_status}로 변경되었습니다.`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ 상태 변경 중 오류가 발생했습니다.`,
            },
          ],
        };
      }
    },
  },

  {
    name: "mark_platform_done",
    description: "특정 플랫폼의 작업을 완료 처리합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        platform: {
          type: "string",
          description: "완료된 플랫폼",
          enum: ["iOS", "Android", "JS"],
        },
        author: {
          type: "string",
          description: "완료 처리자",
        },
      },
      required: ["epic_url", "platform", "author"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // Epic URL에서 Epic ID 추출
      const epicId = extractEpicIdFromUrl(args.epic_url);
      if (!epicId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
            },
          ],
        };
      }

      // 진행률을 100%로 설정
      const updates: any = {
        updated_by: args.author,
        last_comment: `${args.platform} 개발 완료`,
      };

      switch (args.platform) {
        case "iOS":
          updates.ios_progress = 100;
          break;
        case "Android":
          updates.android_progress = 100;
          break;
        case "JS":
          updates.js_progress = 100;
          break;
      }

      const statusUpdated = await client.updateEpicStatus(epicId, updates);

      // 히스토리 추가
      const historyAdded = await client.addStatusUpdate({
        epic_id: epicId,
        update_type: "progress",
        platform: args.platform as Platform,
        message: "개발 완료 (100%)",
        author: args.author,
      });

      if (statusUpdated && historyAdded) {
        return {
          content: [
            {
              type: "text",
              text: `🎉 ${args.platform} 플랫폼 작업이 완료되었습니다!`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ 완료 처리 중 오류가 발생했습니다.`,
            },
          ],
        };
      }
    },
  },

  {
    name: "add_to_sprint",
    description: "스프린트에 Epic을 추가합니다.",
    inputSchema: {
      type: "object",
      properties: {
        epic_url: {
          type: "string",
          description:
            "Epic URL (예: https://company.atlassian.net/browse/PROJ-123)",
        },
        sprint_name: {
          type: "string",
          description: "스프린트 이름",
        },
        sprint_goal: {
          type: "string",
          description: "이번 스프린트의 목표 (선택사항)",
        },
        is_carry_over: {
          type: "boolean",
          description: "이전 스프린트에서 이월된 Epic인지",
          default: false,
        },
      },
      required: ["epic_url", "sprint_name"],
    },
    handler: async (client: GoogleSheetsClient, args: any) => {
      // Epic URL에서 Epic ID 추출
      const epicId = extractEpicIdFromUrl(args.epic_url);
      if (!epicId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123`,
            },
          ],
        };
      }

      // Sprint_View functionality removed
      return {
        content: [
          {
            type: "text",
            text: `❌ Sprint 기능이 제거되었습니다. Sprint_View가 더 이상 사용되지 않습니다.`,
          },
        ],
      };
    },
  },
];
