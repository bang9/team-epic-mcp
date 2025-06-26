import { google, sheets_v4 } from "googleapis";
import axios from "axios";
import { parse } from "csv-parse/sync";
import { CONFIG, getExportUrl } from "../config";
import { SheetData, Epic, EpicStatus, StatusUpdate } from "../types";

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private cache: SheetData | null = null;
  private cacheTimestamp: number = 0;
  private auth: any;

  constructor() {
    // Service Account 인증 설정
    this.initializeAuth();
    this.sheets = google.sheets({ version: "v4", auth: this.auth });
  }

  private initializeAuth() {
    const base64Credentials = CONFIG.GOOGLE_SERVICE_ACCOUNT_BASE64;

    if (base64Credentials) {
      try {
        // base64 디코딩
        const credentialsJson = Buffer.from(
          base64Credentials,
          "base64",
        ).toString("utf-8");
        const credentials = JSON.parse(credentialsJson);

        // GoogleAuth 설정
        this.auth = new google.auth.GoogleAuth({
          credentials: credentials,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        console.log("Service Account authentication initialized successfully");
      } catch (error) {
        console.error(
          "Failed to initialize Service Account authentication:",
          error,
        );
        throw new Error(
          "Invalid GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable. Please ensure it contains a valid base64-encoded Service Account JSON.",
        );
      }
    } else {
      // 읽기 전용 모드 (인증 없음)
      console.warn(
        "No Service Account credentials found. Operating in read-only mode.",
      );
      this.auth = null;
    }
  }

  // CSV 형식으로 읽기 (퍼블릭 읽기 전용)
  async fetchAllData(): Promise<SheetData> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < CONFIG.CACHE_DURATION) {
      return this.cache;
    }

    const [epics, epicStatuses, statusUpdates] = await Promise.all([
      this.fetchSheet<Epic>("Epics", CONFIG.SHEET_GIDS.EPICS),
      this.fetchSheet<EpicStatus>("Epic_Status", CONFIG.SHEET_GIDS.EPIC_STATUS),
      this.fetchSheet<StatusUpdate>(
        "Status_Updates",
        CONFIG.SHEET_GIDS.STATUS_UPDATES,
      ),
    ]);

    this.cache = {
      epics,
      epicStatuses,
      statusUpdates,
    };
    this.cacheTimestamp = now;

    return this.cache;
  }

  private async fetchSheet<T>(sheetName: string, gid: number): Promise<T[]> {
    try {
      const url = getExportUrl(gid);
      const response = await axios.get(url);

      const records = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
          // 숫자 변환
          if (
            context.column === "ios_progress" ||
            context.column === "android_progress" ||
            context.column === "js_progress"
          ) {
            return parseInt(value) || 0;
          }
          // boolean 변환
          if (context.column === "is_carry_over") {
            return value.toLowerCase() === "true";
          }
          return value;
        },
      });

      return records as T[];
    } catch (error) {
      console.error(`Failed to fetch ${sheetName} sheet:`, error);
      return [];
    }
  }

  // 쓰기 작업을 위한 메서드들
  async updateValues(range: string, values: any[][]): Promise<boolean> {
    // Service Account가 없으면 오류 반환
    if (!this.auth) {
      throw new Error(
        "Write operations require Service Account authentication. Please set GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable.",
      );
    }

    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: values,
        },
      });

      this.clearCache(); // 캐시 무효화
      return response.status === 200;
    } catch (error: any) {
      console.error("Failed to update values:", error);

      // Google API 에러 메시지 추출
      let errorMessage = "Failed to update values";
      if (error.errors && error.errors[0]) {
        errorMessage = error.errors[0].message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // 특정 에러 케이스 처리
      if (error.code === 403) {
        errorMessage =
          "Permission denied. Please ensure the Service Account has edit access to the spreadsheet.";
      } else if (error.code === 404) {
        errorMessage =
          "Spreadsheet or range not found. Please check the spreadsheet ID and range.";
      } else if (error.code === 401) {
        errorMessage =
          "Authentication failed. Please check your Service Account credentials.";
      }

      throw new Error(errorMessage);
    }
  }

  async appendValues(range: string, values: any[][]): Promise<boolean> {
    // Service Account가 없으면 오류 반환
    if (!this.auth) {
      throw new Error(
        "Write operations require Service Account authentication. Please set GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable.",
      );
    }

    try {
      console.log("Attempting to append values to:", range);
      console.log("Values to append:", JSON.stringify(values));

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: values,
        },
      });

      console.log("Response status:", response.status);
      console.log("Values appended successfully");

      this.clearCache(); // 캐시 무효화
      return response.status === 200;
    } catch (error: any) {
      console.error("Failed to append values:", error);

      // Google API 에러 메시지 추출
      let errorMessage = "Failed to append values";
      if (error.errors && error.errors[0]) {
        errorMessage = error.errors[0].message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // 특정 에러 케이스 처리
      if (error.code === 403) {
        errorMessage =
          "Permission denied. Please ensure the Service Account has edit access to the spreadsheet.";
      } else if (error.code === 404) {
        errorMessage =
          "Spreadsheet or range not found. Please check the spreadsheet ID and range.";
      } else if (error.code === 401) {
        errorMessage =
          "Authentication failed. Please check your Service Account credentials.";
      }

      throw new Error(errorMessage);
    }
  }

  // 특정 Epic의 상태 업데이트
  async updateEpicStatus(
    epicId: string,
    updates: Partial<EpicStatus>,
  ): Promise<boolean> {
    try {
      const data = await this.fetchAllData();
      const rowIndex = data.epicStatuses.findIndex((e) => e.epic_id === epicId);

      if (rowIndex === -1) {
        // 새로운 Epic Status 추가
        const newRow = [
          epicId,
          updates.ios_progress || 0,
          updates.android_progress || 0,
          updates.js_progress || 0,
          updates.overall_status || "",
          updates.last_comment || "",
          new Date().toISOString(),
          updates.updated_by || "System",
        ];

        return await this.appendValues(
          `${CONFIG.SHEET_NAMES.EPIC_STATUS}!A:H`,
          [newRow],
        );
      } else {
        // 기존 Epic Status 업데이트
        const range = `${CONFIG.SHEET_NAMES.EPIC_STATUS}!A${rowIndex + 2}:H${rowIndex + 2}`;
        const existing = data.epicStatuses[rowIndex];

        const updatedRow = [
          epicId,
          updates.ios_progress ?? existing.ios_progress,
          updates.android_progress ?? existing.android_progress,
          updates.js_progress ?? existing.js_progress,
          updates.overall_status ?? existing.overall_status,
          updates.last_comment ?? existing.last_comment,
          new Date().toISOString(),
          updates.updated_by ?? existing.updated_by,
        ];

        return await this.updateValues(range, [updatedRow]);
      }
    } catch (error) {
      console.error("Error updating epic status:", error);
      return false;
    }
  }

  // Status Update 추가
  async addStatusUpdate(
    update: Omit<StatusUpdate, "timestamp">,
  ): Promise<boolean> {
    try {
      const newRow = [
        new Date().toISOString(),
        update.epic_id,
        update.update_type,
        update.platform || "",
        update.message,
        update.author,
      ];

      return await this.appendValues(
        `${CONFIG.SHEET_NAMES.STATUS_UPDATES}!A:F`,
        [newRow],
      );
    } catch (error) {
      console.error("Error adding status update:", error);
      return false;
    }
  }

  // Epic 상태 변경
  async changeEpicStatus(epicId: string, newStatus: string): Promise<boolean> {
    try {
      const data = await this.fetchAllData();
      const rowIndex = data.epics.findIndex((e) => e.epic_id === epicId);

      if (rowIndex === -1) {
        console.error(`Epic ${epicId} not found`);
        return false;
      }

      const range = `${CONFIG.SHEET_NAMES.EPICS}!D${rowIndex + 2}`;
      return await this.updateValues(range, [[newStatus]]);
    } catch (error) {
      console.error("Error changing epic status:", error);
      return false;
    }
  }

  // Epic URL에서 Epic ID 추출
  private extractEpicIdFromUrl(epicUrl: string): string | null {
    const match = epicUrl.match(/\/browse\/([A-Z]+-\d+)$/);
    return match ? match[1] : null;
  }

  // 새로운 Epic 생성
  async createEpic(epicData: {
    epic_name: string;
    ios_assignee: string;
    android_assignee: string;
    js_assignee: string;
    start_date: string;
    target_date: string;
    epic_url: string;
    prd_link?: string;
    tip_link?: string;
    initial_status?: string;
    author: string;
  }): Promise<string> {
    try {
      // 1. Epic URL에서 Epic ID 추출
      let newEpicId = this.extractEpicIdFromUrl(epicData.epic_url);

      if (!newEpicId) {
        throw new Error(
          "올바른 Epic URL 형식이 아닙니다. 예: https://company.atlassian.net/browse/PROJ-123",
        );
      }

      // 2. Epic URL은 그대로 사용
      const epicUrl = epicData.epic_url;

      // 3. Epics 시트에 추가
      const epicRow = [
        newEpicId,
        epicData.epic_name,
        epicUrl,
        epicData.initial_status || "backlog",
        epicData.ios_assignee,
        epicData.android_assignee,
        epicData.js_assignee,
        epicData.start_date,
        epicData.target_date,
        epicData.prd_link || "",
        epicData.tip_link || "",
      ];

      try {
        await this.appendValues(`${CONFIG.SHEET_NAMES.EPICS}!A:K`, [epicRow]);
      } catch (error: any) {
        throw new Error(`Failed to add epic to Epics sheet: ${error.message}`);
      }

      // 4. Epic Status 시트에 초기 상태 추가
      const statusRow = [
        newEpicId,
        0, // ios_progress
        0, // android_progress
        0, // js_progress
        epicData.initial_status || "backlog",
        "Epic created",
        new Date().toISOString(),
        epicData.author,
      ];

      try {
        await this.appendValues(`${CONFIG.SHEET_NAMES.EPIC_STATUS}!A:H`, [
          statusRow,
        ]);
      } catch (error: any) {
        throw new Error(
          `Failed to add epic to Epic_Status sheet: ${error.message}`,
        );
      }

      // 5. Status Updates에 생성 기록 추가
      const createUpdate = {
        epic_id: newEpicId,
        update_type: "status_change" as const,
        message: `Epic created: ${epicData.epic_name}`,
        author: epicData.author,
      };

      const updateAdded = await this.addStatusUpdate(createUpdate);

      if (!updateAdded) {
        // This is less critical, so we don't throw an error
        console.error(
          "Warning: Failed to add creation record to Status_Updates",
        );
      }

      return newEpicId;
    } catch (error: any) {
      // API 키 관련 오류인지 확인
      if (
        error.message.includes("Permission denied") ||
        error.message.includes("API key")
      ) {
        throw new Error(
          "API key is missing or invalid. Please set GOOGLE_API_KEY environment variable.",
        );
      }
      throw error;
    }
  }

  clearCache() {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}
