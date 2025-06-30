import { google, sheets_v4 } from "googleapis";
import {
  CONFIG,
  getCurrentQuarter,
  getStatusUpdatesSheetName,
} from "../config";
import { SheetData, Epic, EpicStatus, StatusUpdate } from "../types";
import { VersionManager } from "./version-manager";

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private cache: SheetData | null = null;
  private cacheTimestamp: number = 0;
  private auth: any;
  private versionManager: VersionManager;

  constructor() {
    this.initializeAuth();
    this.sheets = google.sheets({ version: "v4", auth: this.auth });
    this.versionManager = new VersionManager(this);
  }

  private initializeAuth() {
    const base64Credentials = CONFIG.GOOGLE_SERVICE_ACCOUNT_BASE64;

    if (!base64Credentials) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable is required. Service Account authentication is mandatory.",
      );
    }

    try {
      const credentialsJson = Buffer.from(base64Credentials, "base64").toString(
        "utf-8",
      );
      const credentials = JSON.parse(credentialsJson);

      this.auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      console.error("Service Account authentication initialized successfully");
    } catch (error) {
      console.error(
        "Failed to initialize Service Account authentication:",
        error,
      );
      throw new Error(
        "Invalid GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable. Please ensure it contains a valid base64-encoded Service Account JSON.",
      );
    }
  }

  // CSV 형식으로 읽기 (퍼블릭 읽기 전용)
  async fetchAllData(): Promise<SheetData> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < CONFIG.CACHE_DURATION) {
      return this.cache;
    }

    try {
      // 기본 시트 데이터 가져오기
      const response = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        ranges: [
          `${CONFIG.SHEET_NAMES.EPICS}!A:Z`,
          `${CONFIG.SHEET_NAMES.EPIC_STATUS}!A:Z`,
        ],
      });

      const valueRanges = response.data.valueRanges || [];

      // 각 시트 데이터 파싱
      const epics = this.parseSheetData<Epic>(valueRanges[0]?.values || []);
      const epicStatuses = this.parseSheetData<EpicStatus>(
        valueRanges[1]?.values || [],
      );

      // 완료되지 않은 에픽들의 created_quarter를 기준으로 상태 업데이트 가져오기
      const incompleteEpics = epics.filter(
        (epic) =>
          epic.current_status !== "done" && epic.current_status !== "released",
      );
      const uniqueQuarters = [
        ...new Set(
          incompleteEpics.map((epic) => epic.created_quarter).filter(Boolean),
        ),
      ];

      let statusUpdates: StatusUpdate[] = [];
      const fetchedQuarters = new Set<string>();

      // 각 분기별로 상태 업데이트 가져오기
      for (const quarter of uniqueQuarters) {
        const quarterSheet = getStatusUpdatesSheetName(quarter);
        try {
          const quarterResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${quarterSheet}!A:Z`,
          });
          const quarterStatusUpdates = this.parseSheetData<StatusUpdate>(
            quarterResponse.data.values || [],
          );
          statusUpdates.push(...quarterStatusUpdates);
          fetchedQuarters.add(quarter!);
        } catch (error) {
          console.warn(`Could not fetch ${quarterSheet}:`, error);
        }
      }

      // 현재 분기 상태 업데이트도 추가 (새로운 에픽들을 위해) - 중복 방지
      const currentQuarter = getCurrentQuarter();
      if (!fetchedQuarters.has(currentQuarter)) {
        const currentQuarterSheet = getStatusUpdatesSheetName();
        try {
          const currentResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${currentQuarterSheet}!A:Z`,
          });
          const currentQuarterStatusUpdates = this.parseSheetData<StatusUpdate>(
            currentResponse.data.values || [],
          );
          statusUpdates.push(...currentQuarterStatusUpdates);
        } catch (error) {
          console.warn(
            `Could not fetch current quarter ${currentQuarterSheet}:`,
            error,
          );
        }
      }

      // 레거시 Status_Updates 시트도 확인 (마이그레이션 전 데이터)
      try {
        const legacyResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId: CONFIG.SPREADSHEET_ID,
          range: `${CONFIG.SHEET_NAMES.STATUS_UPDATES}!A:Z`,
        });
        const legacyUpdates = this.parseSheetData<StatusUpdate>(
          legacyResponse.data.values || [],
        );
        statusUpdates.push(...legacyUpdates);
      } catch (legacyError) {
        console.warn("Could not fetch legacy Status_Updates:", legacyError);
      }

      this.cache = {
        epics,
        epicStatuses,
        statusUpdates,
      };
      this.cacheTimestamp = now;

      return this.cache;
    } catch (error) {
      console.error("Failed to fetch sheets:", error);
      throw error;
    }
  }

  private parseSheetData<T>(rows: any[][]): T[] {
    if (rows.length === 0) return [];

    // 첫 번째 행을 헤더로 사용
    const headers = rows[0];
    const records = rows.slice(1).map((row) => {
      const record: any = {};
      headers.forEach((header: string, index: number) => {
        let value = row[index] || "";

        // 타입 변환
        if (
          ["ios_progress", "android_progress", "js_progress"].includes(header)
        ) {
          value = parseInt(value) || 0;
        } else if (header === "is_carry_over") {
          value = value.toString().toLowerCase() === "true";
        }

        record[header] = value;
      });
      return record;
    });

    return records as T[];
  }

  public async fetchSheet<T>(sheetName: string): Promise<T[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${sheetName}!A:Z`,
      });

      const rows = response.data.values || [];
      return this.parseSheetData<T>(rows);
    } catch (error: any) {
      console.error(`Failed to fetch ${sheetName} sheet:`, error);

      if (
        error.message &&
        (error.message.includes("Unable to parse range") ||
          error.message.includes("not found") ||
          error.message.includes("does not exist"))
      ) {
        throw error;
      }

      return [];
    }
  }

  // 쓰기 작업을 위한 메서드들
  async updateValues(range: string, values: any[][]): Promise<boolean> {
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
    try {
      console.error("Attempting to append values to:", range);
      console.error("Values to append:", JSON.stringify(values));

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: values,
        },
      });

      console.error("Response status:", response.status);
      console.error("Values appended successfully");

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

      // Epic의 created_quarter에 따라 올바른 시트에 추가
      const targetSheetName = await this.getTargetSheetForUpdate(
        update.epic_id,
      );

      return await this.appendValues(`${targetSheetName}!A:F`, [newRow]);
    } catch (error) {
      console.error("Error adding status update:", error);
      return false;
    }
  }

  private async getTargetSheetForUpdate(epicId: string): Promise<string> {
    try {
      // Epic 정보를 조회해서 created_quarter 확인
      const epics = await this.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS);
      const epic = epics.find((e) => e.epic_id === epicId);

      if (epic && epic.created_quarter) {
        // 마이그레이션 완료된 Epic: 해당 분기 시트 사용
        const quarterSheetName = getStatusUpdatesSheetName(
          epic.created_quarter,
        );

        // 분기별 시트가 존재하는지 확인하고 없으면 생성
        const exists = await this.sheetExists(quarterSheetName);
        if (!exists) {
          console.error(
            `Creating missing quarterly sheet: ${quarterSheetName}`,
          );
          await this.createSheet(quarterSheetName);

          // 헤더 추가
          await this.updateValues(`${quarterSheetName}!A1:F1`, [
            [
              "timestamp",
              "epic_id",
              "update_type",
              "platform",
              "message",
              "author",
            ],
          ]);
        }

        return quarterSheetName;
      } else {
        // 기존 Epic 또는 마이그레이션 이전: 기존 시트 사용
        return CONFIG.SHEET_NAMES.STATUS_UPDATES;
      }
    } catch (error) {
      console.error("Failed to determine target sheet for update:", error);
      // 오류 시 기본 시트 사용
      return CONFIG.SHEET_NAMES.STATUS_UPDATES;
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

      // 3. Epics 시트에 추가 (created_quarter 자동 할당)
      const currentQuarter = getCurrentQuarter();
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
        currentQuarter, // created_quarter 자동 할당
      ];

      try {
        await this.appendValues(`${CONFIG.SHEET_NAMES.EPICS}!A:L`, [epicRow]);
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

  // Public wrapper for fetchSheet (for VersionManager)
  async fetchSheetData<T>(sheetName: string): Promise<T[]> {
    return this.fetchSheet<T>(sheetName);
  }

  // 특정 Epic의 히스토리 조회 (분기별 시트에서)
  async fetchEpicHistory(epicId: string): Promise<StatusUpdate[]> {
    try {
      // Epic 정보 조회해서 created_quarter 확인
      const epics = await this.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS);
      const epic = epics.find((e) => e.epic_id === epicId);

      if (epic && epic.created_quarter) {
        // 마이그레이션 완료된 Epic: 해당 분기 시트에서 조회
        const sheetName = getStatusUpdatesSheetName(epic.created_quarter);
        const allUpdates = await this.fetchSheetData<StatusUpdate>(sheetName);
        return allUpdates.filter((u) => u.epic_id === epicId);
      } else {
        // 기존 Epic: 기존 시트에서 조회
        const allUpdates = await this.fetchSheetData<StatusUpdate>(
          CONFIG.SHEET_NAMES.STATUS_UPDATES,
        );
        return allUpdates.filter((u) => u.epic_id === epicId);
      }
    } catch (error) {
      console.error(`Failed to fetch history for epic ${epicId}:`, error);
      return [];
    }
  }

  // 시트 존재 여부 확인
  async sheetExists(sheetName: string): Promise<boolean> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
      });

      const sheets = response.data.sheets || [];
      return sheets.some((sheet) => sheet.properties?.title === sheetName);
    } catch (error) {
      console.error(`Failed to check if sheet ${sheetName} exists:`, error);
      return false;
    }
  }

  // 새 시트 생성
  async createSheet(sheetName: string): Promise<boolean> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      this.clearCache();
      return response.status === 200;
    } catch (error: any) {
      console.error(`Failed to create sheet ${sheetName}:`, error);

      // 이미 존재하는 시트인 경우는 성공으로 처리
      if (error.message && error.message.includes("already exists")) {
        return true;
      }

      throw new Error(`Failed to create sheet ${sheetName}: ${error.message}`);
    }
  }

  clearCache() {
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  // 서버 시작시 마이그레이션 체크용 public 메서드
  async checkAndMigrateIfNeeded(): Promise<void> {
    return this.versionManager.checkAndMigrateIfNeeded();
  }
}
