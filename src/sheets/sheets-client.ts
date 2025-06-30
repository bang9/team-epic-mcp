import { google, sheets_v4 } from "googleapis";
import axios from "axios";
import { parse } from "csv-parse/sync";
import { CONFIG, getExportUrl, MCP_VERSION, getCurrentQuarter, dateToQuarter, getStatusUpdatesSheetName } from "../config";
import { SheetData, Epic, EpicStatus, StatusUpdate } from "../types";

interface MetadataRow {
  key: string;
  value: string;
  updated_at: string;
}

class VersionManager {
  private static sheetVersionCache: string | null = null;
  private static migrationComplete: boolean = false;
  
  static get isMigrationComplete(): boolean {
    return VersionManager.migrationComplete;
  }
  private sheetsClient: GoogleSheetsClient;

  constructor(sheetsClient: GoogleSheetsClient) {
    this.sheetsClient = sheetsClient;
  }

  async checkAndMigrateIfNeeded(): Promise<void> {
    if (VersionManager.migrationComplete) {
      return;
    }

    const mcpVersion = MCP_VERSION;
    const sheetVersion = await this.getSchemaVersion();

    if (sheetVersion !== mcpVersion) {
      console.log(`🔄 스키마 마이그레이션 시작: ${sheetVersion} → ${mcpVersion}`);
      
      await this.executeMigration(sheetVersion, mcpVersion);
      await this.updateSchemaVersion(mcpVersion);
      
      VersionManager.migrationComplete = true;
      
      console.log(`✅ 마이그레이션 완료: ${sheetVersion} → ${mcpVersion}`);
    }
  }

  private async getSchemaVersion(): Promise<string> {
    if (VersionManager.sheetVersionCache) {
      return VersionManager.sheetVersionCache;
    }

    try {
      const metadata = await this.sheetsClient.fetchSheetData<MetadataRow>(CONFIG.SHEET_NAMES.METADATA, -1);
      const versionRow = metadata.find(row => row.key === "schema_version");
      
      const version = versionRow?.value || "1.0.2";
      VersionManager.sheetVersionCache = version;
      return version;
    } catch (error) {
      // _Metadata 시트가 없으면 생성하고 기본 버전 반환
      await this.createMetadataSheet();
      return "1.0.2";
    }
  }

  private async createMetadataSheet(): Promise<void> {
    try {
      await this.sheetsClient.createSheet(CONFIG.SHEET_NAMES.METADATA);
      
      const initialData = [
        ["key", "value", "updated_at"],
        ["schema_version", "1.0.2", new Date().toISOString()],
        ["created_at", new Date().toISOString().split('T')[0], new Date().toISOString()],
        ["last_migration", "none", new Date().toISOString()]
      ];
      
      await this.sheetsClient.updateValues(`${CONFIG.SHEET_NAMES.METADATA}!A1:C4`, initialData);
      
    } catch (error) {
      console.error("Failed to create _Metadata sheet:", error);
      throw error;
    }
  }

  private async updateSchemaVersion(newVersion: string): Promise<void> {
    await this.upsertMetadata("schema_version", newVersion);
    VersionManager.sheetVersionCache = newVersion;
  }

  private async upsertMetadata(key: string, value: string): Promise<void> {
    try {
      const metadata = await this.sheetsClient.fetchSheetData<MetadataRow>(CONFIG.SHEET_NAMES.METADATA, -1);
      const existingIndex = metadata.findIndex(row => row.key === key);
      
      const newRow = [key, value, new Date().toISOString()];
      
      if (existingIndex >= 0) {
        // 업데이트
        const range = `${CONFIG.SHEET_NAMES.METADATA}!A${existingIndex + 2}:C${existingIndex + 2}`;
        await this.sheetsClient.updateValues(range, [newRow]);
      } else {
        // 생성
        await this.sheetsClient.appendValues(`${CONFIG.SHEET_NAMES.METADATA}!A:C`, [newRow]);
      }
    } catch (error) {
      console.error(`Failed to upsert metadata ${key}:`, error);
      throw error;
    }
  }

  private async executeMigration(fromVersion: string, toVersion: string): Promise<void> {
    switch (`${fromVersion}->${toVersion}`) {
      case "1.0.2->1.1.0":
        await this.migrate_1_0_2_to_1_1_0();
        break;
      default:
        throw new Error(`지원하지 않는 마이그레이션: ${fromVersion} → ${toVersion}`);
    }
  }

  private async migrate_1_0_2_to_1_1_0(): Promise<void> {
    console.log("📋 1.0.2 → 1.1.0 마이그레이션 시작...");
    
    try {
      // 1. Epics 시트에 created_quarter 컬럼 추가
      console.log("1. Epics 시트에 created_quarter 컬럼 추가 중...");
      await this.addCreatedQuarterColumn();
      
      // 2. 기존 Epic들에 생성 분기 추정 및 할당
      console.log("2. 기존 Epic들에 생성 분기 할당 중...");
      const epics = await this.sheetsClient.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS, -1);
      const statusUpdates = await this.sheetsClient.fetchSheetData<StatusUpdate>(CONFIG.SHEET_NAMES.STATUS_UPDATES, -1);
      
      const quarterAssignments = new Map<string, string>();
      
      for (const epic of epics) {
        const quarter = this.estimateCreationQuarter(epic, statusUpdates);
        quarterAssignments.set(epic.epic_id, quarter);
        await this.updateEpicQuarter(epic.epic_id, quarter);
      }
      
      // 3. 필요한 분기별 시트들 생성
      console.log("3. 분기별 Status_Updates 시트 생성 중...");
      const requiredQuarters = [...new Set(quarterAssignments.values())];
      for (const quarter of requiredQuarters) {
        const sheetName = getStatusUpdatesSheetName(quarter);
        await this.sheetsClient.createSheet(sheetName);
      }
      
      // 4. 모든 Status_Updates를 분기별로 이동
      console.log("4. Status_Updates 데이터를 분기별로 이동 중...");
      await this.migrateStatusUpdates(statusUpdates, quarterAssignments);
      
      // 5. 기존 Status_Updates 시트 비우기
      console.log("5. 기존 Status_Updates 시트 정리 중...");
      await this.clearStatusUpdatesSheet();
      
      console.log("✅ 1.0.2 → 1.1.0 마이그레이션 완료!");
      
    } catch (error) {
      console.error("❌ 마이그레이션 실패:", error);
      throw error;
    }
  }

  private async addCreatedQuarterColumn(): Promise<void> {
    try {
      // Epics 시트의 L1 셀에 헤더 추가
      await this.sheetsClient.updateValues(`${CONFIG.SHEET_NAMES.EPICS}!L1`, [["created_quarter"]]);
    } catch (error) {
      console.error("Failed to add created_quarter column:", error);
      throw error;
    }
  }

  private estimateCreationQuarter(epic: Epic, statusUpdates: StatusUpdate[]): string {
    // 1. start_date가 있으면 그것 기준
    if (epic.start_date && epic.start_date.trim()) {
      try {
        return dateToQuarter(epic.start_date);
      } catch (error) {
        console.warn(`Invalid start_date for epic ${epic.epic_id}: ${epic.start_date}`);
      }
    }
    
    // 2. 해당 Epic의 첫 번째 Status_Update 기준
    const epicUpdates = statusUpdates
      .filter(u => u.epic_id === epic.epic_id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (epicUpdates.length > 0) {
      try {
        return dateToQuarter(epicUpdates[0].timestamp);
      } catch (error) {
        console.warn(`Invalid timestamp for epic ${epic.epic_id}: ${epicUpdates[0].timestamp}`);
      }
    }
    
    // 3. 기본값: 현재 분기
    return getCurrentQuarter();
  }

  private async updateEpicQuarter(epicId: string, quarter: string): Promise<void> {
    try {
      const epics = await this.sheetsClient.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS, -1);
      const rowIndex = epics.findIndex(e => e.epic_id === epicId);
      
      if (rowIndex >= 0) {
        const range = `${CONFIG.SHEET_NAMES.EPICS}!L${rowIndex + 2}`;
        await this.sheetsClient.updateValues(range, [[quarter]]);
      }
    } catch (error) {
      console.error(`Failed to update quarter for epic ${epicId}:`, error);
      throw error;
    }
  }

  private async migrateStatusUpdates(statusUpdates: StatusUpdate[], quarterAssignments: Map<string, string>): Promise<void> {
    // 분기별로 그룹화
    const updatesByQuarter = new Map<string, StatusUpdate[]>();
    
    for (const update of statusUpdates) {
      const quarter = quarterAssignments.get(update.epic_id);
      if (quarter) {
        if (!updatesByQuarter.has(quarter)) {
          updatesByQuarter.set(quarter, []);
        }
        updatesByQuarter.get(quarter)!.push(update);
      }
    }
    
    // 각 분기별 시트에 데이터 추가
    for (const [quarter, updates] of updatesByQuarter) {
      const sheetName = getStatusUpdatesSheetName(quarter);
      
      // 헤더 먼저 추가
      await this.sheetsClient.updateValues(
        `${sheetName}!A1:F1`,
        [["timestamp", "epic_id", "update_type", "platform", "message", "author"]]
      );
      
      // 데이터 추가
      if (updates.length > 0) {
        const rows = updates.map(update => [
          update.timestamp,
          update.epic_id,
          update.update_type,
          update.platform || "",
          update.message,
          update.author
        ]);
        
        await this.sheetsClient.appendValues(`${sheetName}!A:F`, rows);
      }
    }
  }

  private async clearStatusUpdatesSheet(): Promise<void> {
    try {
      // 시트의 모든 데이터 지우기 (헤더 제외)
      await this.sheetsClient.updateValues(
        `${CONFIG.SHEET_NAMES.STATUS_UPDATES}!A2:Z`,
        [[]]
      );
    } catch (error) {
      console.error("Failed to clear Status_Updates sheet:", error);
      throw error;
    }
  }
}

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private cache: SheetData | null = null;
  private cacheTimestamp: number = 0;
  private auth: any;
  private versionManager: VersionManager;

  constructor() {
    // Service Account 인증 설정
    this.initializeAuth();
    this.sheets = google.sheets({ version: "v4", auth: this.auth });
    this.versionManager = new VersionManager(this);
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
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < CONFIG.CACHE_DURATION) {
      return this.cache;
    }

    // Service Account가 있으면 batchGet 사용
    if (this.auth) {
      try {
        // 현재 분기 Status_Updates 시트명 결정
        const currentQuarterSheet = getStatusUpdatesSheetName();
        
        // 한 번의 요청으로 모든 시트 데이터 가져오기
        const response = await this.sheets.spreadsheets.values.batchGet({
          spreadsheetId: CONFIG.SPREADSHEET_ID,
          ranges: [
            `${CONFIG.SHEET_NAMES.EPICS}!A:Z`,
            `${CONFIG.SHEET_NAMES.EPIC_STATUS}!A:Z`,
            `${currentQuarterSheet}!A:Z`,
          ],
        });

        const valueRanges = response.data.valueRanges || [];
        
        // 각 시트 데이터 파싱
        const epics = this.parseSheetData<Epic>(valueRanges[0]?.values || []);
        const epicStatuses = this.parseSheetData<EpicStatus>(valueRanges[1]?.values || []);
        let statusUpdates = this.parseSheetData<StatusUpdate>(valueRanges[2]?.values || []);
        
        // 마이그레이션이 완료되지 않은 경우 기존 Status_Updates도 포함
        if (statusUpdates.length === 0 || !VersionManager.isMigrationComplete) {
          try {
            const legacyResponse = await this.sheets.spreadsheets.values.get({
              spreadsheetId: CONFIG.SPREADSHEET_ID,
              range: `${CONFIG.SHEET_NAMES.STATUS_UPDATES}!A:Z`,
            });
            const legacyUpdates = this.parseSheetData<StatusUpdate>(legacyResponse.data.values || []);
            statusUpdates = [...statusUpdates, ...legacyUpdates];
          } catch (error) {
            console.warn("Could not fetch legacy Status_Updates:", error);
          }
        }

        this.cache = {
          epics,
          epicStatuses,
          statusUpdates,
        };
        this.cacheTimestamp = now;

        return this.cache;
      } catch (error) {
        console.error("Failed to batch fetch sheets:", error);
        // 에러 시 개별 요청으로 폴백
      }
    }

    // Service Account가 없거나 batchGet 실패 시 개별 요청
    const currentQuarterSheet = getStatusUpdatesSheetName();
    
    const [epics, epicStatuses] = await Promise.all([
      this.fetchSheet<Epic>("Epics", CONFIG.SHEET_GIDS.EPICS),
      this.fetchSheet<EpicStatus>("Epic_Status", CONFIG.SHEET_GIDS.EPIC_STATUS),
    ]);
    
    // Status_Updates는 현재 분기 시트 우선, 실패 시 기존 시트
    let statusUpdates: StatusUpdate[] = [];
    try {
      statusUpdates = await this.fetchSheet<StatusUpdate>(currentQuarterSheet, -1);
    } catch (error) {
      console.warn(`Could not fetch ${currentQuarterSheet}, falling back to legacy sheet:`, error);
      try {
        statusUpdates = await this.fetchSheet<StatusUpdate>("Status_Updates", CONFIG.SHEET_GIDS.STATUS_UPDATES);
      } catch (legacyError) {
        console.warn("Could not fetch legacy Status_Updates either:", legacyError);
        statusUpdates = [];
      }
    }

    this.cache = {
      epics,
      epicStatuses,
      statusUpdates,
    };
    this.cacheTimestamp = now;

    return this.cache;
  }

  private parseSheetData<T>(rows: any[][]): T[] {
    if (rows.length === 0) return [];

    // 첫 번째 행을 헤더로 사용
    const headers = rows[0];
    const records = rows.slice(1).map(row => {
      const record: any = {};
      headers.forEach((header: string, index: number) => {
        let value = row[index] || '';
        
        // 타입 변환
        if (['ios_progress', 'android_progress', 'js_progress'].includes(header)) {
          value = parseInt(value) || 0;
        } else if (header === 'is_carry_over') {
          value = value.toString().toLowerCase() === 'true';
        }
        
        record[header] = value;
      });
      return record;
    });

    return records as T[];
  }

  private async fetchSheet<T>(sheetName: string, gid: number): Promise<T[]> {
    try {
      // Service Account가 있으면 Sheets API 사용, 없으면 CSV export 사용
      if (this.auth) {
        // Google Sheets API 사용
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: CONFIG.SPREADSHEET_ID,
          range: `${sheetName}!A:Z`, // 모든 열 읽기
        });

        const rows = response.data.values || [];
        return this.parseSheetData<T>(rows);
      } else {
        // 기존 CSV export 방식 (읽기 전용)
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
      }
    } catch (error) {
      console.error(`Failed to fetch ${sheetName} sheet:`, error);
      return [];
    }
  }

  // 쓰기 작업을 위한 메서드들
  async updateValues(range: string, values: any[][]): Promise<boolean> {
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
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
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
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
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
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
      const targetSheetName = await this.getTargetSheetForUpdate(update.epic_id);
      
      return await this.appendValues(`${targetSheetName}!A:F`, [newRow]);
    } catch (error) {
      console.error("Error adding status update:", error);
      return false;
    }
  }

  private async getTargetSheetForUpdate(epicId: string): Promise<string> {
    try {
      // Epic 정보를 조회해서 created_quarter 확인
      const epics = await this.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS, -1);
      const epic = epics.find(e => e.epic_id === epicId);
      
      if (epic && epic.created_quarter) {
        // 마이그레이션 완료된 Epic: 해당 분기 시트 사용
        return getStatusUpdatesSheetName(epic.created_quarter);
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
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
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
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
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
  async fetchSheetData<T>(sheetName: string, gid: number = -1): Promise<T[]> {
    return this.fetchSheet<T>(sheetName, gid);
  }

  // 특정 Epic의 히스토리 조회 (분기별 시트에서)
  async fetchEpicHistory(epicId: string): Promise<StatusUpdate[]> {
    // 자동 마이그레이션 체크
    await this.versionManager.checkAndMigrateIfNeeded();
    
    try {
      // Epic 정보 조회해서 created_quarter 확인
      const epics = await this.fetchSheetData<Epic>(CONFIG.SHEET_NAMES.EPICS, -1);
      const epic = epics.find(e => e.epic_id === epicId);
      
      if (epic && epic.created_quarter) {
        // 마이그레이션 완료된 Epic: 해당 분기 시트에서 조회
        const sheetName = getStatusUpdatesSheetName(epic.created_quarter);
        const allUpdates = await this.fetchSheetData<StatusUpdate>(sheetName, -1);
        return allUpdates.filter(u => u.epic_id === epicId);
      } else {
        // 기존 Epic: 기존 시트에서 조회
        const allUpdates = await this.fetchSheetData<StatusUpdate>(CONFIG.SHEET_NAMES.STATUS_UPDATES, -1);
        return allUpdates.filter(u => u.epic_id === epicId);
      }
    } catch (error) {
      console.error(`Failed to fetch history for epic ${epicId}:`, error);
      return [];
    }
  }

  // 새 시트 생성
  async createSheet(sheetName: string): Promise<boolean> {
    if (!this.auth) {
      throw new Error(
        "Write operations require Service Account authentication. Please set GOOGLE_SERVICE_ACCOUNT_BASE64 environment variable.",
      );
    }

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
}
