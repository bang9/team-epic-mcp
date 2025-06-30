import {
  CONFIG,
  MCP_VERSION,
  getCurrentQuarter,
  dateToQuarter,
  getStatusUpdatesSheetName,
} from "../config";
import { Epic, StatusUpdate } from "../types";

interface MetadataRow {
  key: string;
  value: string;
  updated_at: string;
}

// Forward declaration to avoid circular dependency
interface SheetsClientInterface {
  fetchSheet<T>(sheetName: string): Promise<T[]>;
  fetchSheetData<T>(sheetName: string): Promise<T[]>;
  createSheet(sheetName: string): Promise<boolean>;
  updateValues(range: string, values: any[][]): Promise<boolean>;
  appendValues(range: string, values: any[][]): Promise<boolean>;
  sheetExists(sheetName: string): Promise<boolean>;
}

export class VersionManager {
  private static sheetVersionCache: string | null = null;
  private static migrationComplete: boolean = false;

  static get isMigrationComplete(): boolean {
    return VersionManager.migrationComplete;
  }
  private sheetsClient: SheetsClientInterface;

  constructor(sheetsClient: SheetsClientInterface) {
    this.sheetsClient = sheetsClient;
  }

  async checkAndMigrateIfNeeded(): Promise<void> {
    if (VersionManager.migrationComplete) {
      return;
    }

    const mcpVersion = MCP_VERSION;
    const sheetVersion = await this.getSchemaVersion();

    if (this.needsMigration(sheetVersion, mcpVersion)) {
      console.error(
        `Schema migration started: ${sheetVersion} -> ${mcpVersion}`,
      );

      await this.executeMigration(sheetVersion, mcpVersion);
      await this.updateSchemaVersion(mcpVersion);

      VersionManager.migrationComplete = true;

      console.error(`Migration completed: ${sheetVersion} -> ${mcpVersion}`);
    }
  }

  private needsMigration(fromVersion: string, toVersion: string): boolean {
    // 버전이 같으면 마이그레이션 불필요
    if (fromVersion === toVersion) {
      return false;
    }

    // 시맨틱 버전 파싱
    const parseVersion = (version: string) => {
      const parts = version.split(".").map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const from = parseVersion(fromVersion);
    const to = parseVersion(toVersion);

    // major 또는 minor 버전이 다르면 마이그레이션 필요
    // patch 버전만 다르면 마이그레이션 불필요 (버그픽스)
    return from.major !== to.major || from.minor !== to.minor;
  }

  private async getSchemaVersion(): Promise<string> {
    if (VersionManager.sheetVersionCache) {
      return VersionManager.sheetVersionCache;
    }

    try {
      // 무한루프 방지: fetchSheetData 직접 호출 (마이그레이션 체크 없이)
      const metadata = await this.sheetsClient.fetchSheet<MetadataRow>(
        CONFIG.SHEET_NAMES.METADATA,
      );
      const versionRow = metadata.find((row) => row.key === "schema_version");

      const version = versionRow?.value || "1.0.2";
      VersionManager.sheetVersionCache = version;
      return version;
    } catch (error) {
      console.error("Failed to fetch Metadata sheet:", error);

      // Metadata 시트가 없는 경우 자동 생성
      console.error("Metadata sheet does not exist. Creating it now...");
      try {
        await this.createMetadataSheet();

        // 생성 후 기본 버전(1.0.2)으로 설정하여 마이그레이션이 진행되도록 함
        const initialVersion = "1.0.2";
        VersionManager.sheetVersionCache = initialVersion;

        console.error(
          `Metadata sheet created successfully with initial schema version: ${initialVersion}`,
        );
        return initialVersion;
      } catch (createError) {
        console.error("Failed to create Metadata sheet:", createError);
        console.error(
          "CreateError details:",
          JSON.stringify(createError, null, 2),
        );

        // 생성 실패 시에도 초기 버전 반환하여 마이그레이션 진행
        const fallbackVersion = "1.0.2";
        VersionManager.sheetVersionCache = fallbackVersion;
        console.error(
          `Falling back to version ${fallbackVersion} to continue migration`,
        );
        return fallbackVersion;
      }
    }
  }

  private async createMetadataSheet(): Promise<void> {
    try {
      console.error(`Creating _Metadata sheet: ${CONFIG.SHEET_NAMES.METADATA}`);
      const createResult = await this.sheetsClient.createSheet(
        CONFIG.SHEET_NAMES.METADATA,
      );
      console.error(`Sheet creation result: ${createResult}`);

      const initialData = [
        ["key", "value", "updated_at"],
        ["schema_version", "1.0.2", new Date().toISOString()],
        [
          "created_at",
          new Date().toISOString().split("T")[0],
          new Date().toISOString(),
        ],
        ["last_migration", "none", new Date().toISOString()],
      ];

      console.error("Adding initial data to _Metadata sheet...");
      await this.sheetsClient.updateValues(
        `${CONFIG.SHEET_NAMES.METADATA}!A1:C4`,
        initialData,
      );
      console.error("_Metadata sheet created and initialized successfully");
    } catch (error) {
      console.error("Failed to create _Metadata sheet:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  private async updateSchemaVersion(newVersion: string): Promise<void> {
    await this.upsertMetadata("schema_version", newVersion);
    VersionManager.sheetVersionCache = newVersion;
  }

  private async upsertMetadata(key: string, value: string): Promise<void> {
    try {
      // 무한루프 방지: fetchSheet 직접 호출 (마이그레이션 체크 없이)
      const metadata = await this.sheetsClient.fetchSheet<MetadataRow>(
        CONFIG.SHEET_NAMES.METADATA,
      );
      const existingIndex = metadata.findIndex((row) => row.key === key);

      const newRow = [key, value, new Date().toISOString()];

      if (existingIndex >= 0) {
        // 업데이트
        const range = `${CONFIG.SHEET_NAMES.METADATA}!A${existingIndex + 2}:C${existingIndex + 2}`;
        await this.sheetsClient.updateValues(range, [newRow]);
      } else {
        // 생성
        await this.sheetsClient.appendValues(
          `${CONFIG.SHEET_NAMES.METADATA}!A:C`,
          [newRow],
        );
      }
    } catch (error) {
      console.error(`Failed to upsert metadata ${key}:`, error);
      throw error;
    }
  }

  private async executeMigration(
    fromVersion: string,
    toVersion: string,
  ): Promise<void> {
    // 시맨틱 버전 파싱
    const parseVersion = (version: string) => {
      const parts = version.split(".").map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const from = parseVersion(fromVersion);
    const to = parseVersion(toVersion);

    // 스키마 변경이 필요한 마이그레이션만 실행
    if (
      from.major === 1 &&
      from.minor === 0 &&
      to.major === 1 &&
      to.minor >= 1
    ) {
      // 1.0.x -> 1.1.x+ 마이그레이션
      await this.migrate_1_0_2_to_1_1_0();
    }

    // 향후 다른 major/minor 버전 마이그레이션이 필요하면 여기에 추가
    // 예: if (from.major === 1 && from.minor === 1 && to.major === 1 && to.minor === 2) { ... }

    console.error(
      `Schema migration completed from ${fromVersion} to ${toVersion}`,
    );
  }

  private async migrate_1_0_2_to_1_1_0(): Promise<void> {
    console.error("Starting 1.0.2 -> 1.1.0 migration...");

    try {
      // 1. Epics 시트에 created_quarter 컬럼 추가
      console.error("1. Adding created_quarter column to Epics sheet...");
      await this.addCreatedQuarterColumn();

      // 2. 기존 Epic들에 생성 분기 추정 및 할당
      console.error("2. Assigning quarters to existing epics...");
      const epics = await this.sheetsClient.fetchSheetData<Epic>(
        CONFIG.SHEET_NAMES.EPICS,
      );
      const statusUpdates =
        await this.sheetsClient.fetchSheetData<StatusUpdate>(
          CONFIG.SHEET_NAMES.STATUS_UPDATES,
        );

      const quarterAssignments = new Map<string, string>();

      for (const epic of epics) {
        const quarter = this.estimateCreationQuarter(epic, statusUpdates);
        quarterAssignments.set(epic.epic_id, quarter);
        await this.updateEpicQuarter(epic.epic_id, quarter);
      }

      // 3. 필요한 분기별 시트들 생성 및 마이그레이션 상태 확인
      console.error("3. Creating quarterly Status_Updates sheets...");
      const requiredQuarters = [...new Set(quarterAssignments.values())];
      let allSheetsAlreadyExist = true;

      for (const quarter of requiredQuarters) {
        const sheetName = getStatusUpdatesSheetName(quarter);
        const exists = await this.sheetsClient.sheetExists(sheetName);
        if (!exists) {
          console.error(`Creating new sheet: ${sheetName}`);
          await this.sheetsClient.createSheet(sheetName);
          allSheetsAlreadyExist = false;
        } else {
          console.error(`Sheet already exists: ${sheetName}`);
        }
      }

      // 4. 데이터 마이그레이션 (새로 생성된 시트가 있는 경우에만)
      if (!allSheetsAlreadyExist) {
        console.error(
          "4. Migrating Status_Updates data to quarterly sheets...",
        );
        await this.migrateStatusUpdates(statusUpdates, quarterAssignments);

        // 5. 기존 Status_Updates 시트 비우기
        console.error("5. Clearing legacy Status_Updates sheet...");
        await this.clearStatusUpdatesSheet();
      } else {
        console.error(
          "4. All quarterly sheets already exist - skipping data migration",
        );
      }

      console.error("1.0.2 -> 1.1.0 migration completed successfully!");
    } catch (error) {
      console.error("Migration failed:", error);
      throw error;
    }
  }

  private async addCreatedQuarterColumn(): Promise<void> {
    try {
      // Epics 시트의 L1 셀에 헤더 추가
      await this.sheetsClient.updateValues(`${CONFIG.SHEET_NAMES.EPICS}!L1`, [
        ["created_quarter"],
      ]);
    } catch (error) {
      console.error("Failed to add created_quarter column:", error);
      throw error;
    }
  }

  private estimateCreationQuarter(
    epic: Epic,
    statusUpdates: StatusUpdate[],
  ): string {
    // 1. start_date가 있으면 그것 기준
    if (epic.start_date && epic.start_date.trim()) {
      try {
        return dateToQuarter(epic.start_date);
      } catch (error) {
        console.warn(
          `Invalid start_date for epic ${epic.epic_id}: ${epic.start_date}`,
        );
      }
    }

    // 2. 해당 Epic의 첫 번째 Status_Update 기준
    const epicUpdates = statusUpdates
      .filter((u) => u.epic_id === epic.epic_id)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (epicUpdates.length > 0) {
      try {
        return dateToQuarter(epicUpdates[0].timestamp);
      } catch (error) {
        console.warn(
          `Invalid timestamp for epic ${epic.epic_id}: ${epicUpdates[0].timestamp}`,
        );
      }
    }

    // 3. 기본값: 현재 분기
    return getCurrentQuarter();
  }

  private async updateEpicQuarter(
    epicId: string,
    quarter: string,
  ): Promise<void> {
    try {
      const epics = await this.sheetsClient.fetchSheetData<Epic>(
        CONFIG.SHEET_NAMES.EPICS,
      );
      const rowIndex = epics.findIndex((e) => e.epic_id === epicId);

      if (rowIndex >= 0) {
        const range = `${CONFIG.SHEET_NAMES.EPICS}!L${rowIndex + 2}`;
        await this.sheetsClient.updateValues(range, [[quarter]]);
      }
    } catch (error) {
      console.error(`Failed to update quarter for epic ${epicId}:`, error);
      throw error;
    }
  }

  private async migrateStatusUpdates(
    statusUpdates: StatusUpdate[],
    quarterAssignments: Map<string, string>,
  ): Promise<void> {
    console.error(
      `Processing ${statusUpdates.length} status updates for migration...`,
    );

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

    // 각 분기별 시트에 데이터 추가 (배치 처리로 메모리 사용량 최적화)
    for (const [quarter, updates] of updatesByQuarter) {
      const sheetName = getStatusUpdatesSheetName(quarter);
      console.error(`Migrating ${updates.length} updates to ${sheetName}...`);

      // 헤더 먼저 추가
      await this.sheetsClient.updateValues(`${sheetName}!A1:F1`, [
        [
          "timestamp",
          "epic_id",
          "update_type",
          "platform",
          "message",
          "author",
        ],
      ]);

      // 데이터를 배치로 나누어 처리 (메모리 사용량 제한)
      if (updates.length > 0) {
        const BATCH_SIZE = 1000; // 배치 크기 제한
        const batches = [];

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          const rows = batch.map((update) => [
            update.timestamp,
            update.epic_id,
            update.update_type,
            update.platform || "",
            update.message,
            update.author,
          ]);
          batches.push(rows);
        }

        // 각 배치를 순차적으로 처리
        for (let i = 0; i < batches.length; i++) {
          console.error(
            `Processing batch ${i + 1}/${batches.length} for ${sheetName}...`,
          );
          await this.sheetsClient.appendValues(`${sheetName}!A:F`, batches[i]);

          // 메모리 정리를 위한 짧은 대기
          if (batches.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    }

    console.error("Status updates migration completed.");
  }

  private async clearStatusUpdatesSheet(): Promise<void> {
    try {
      // 시트의 모든 데이터 지우기 (헤더 제외)
      await this.sheetsClient.updateValues(
        `${CONFIG.SHEET_NAMES.STATUS_UPDATES}!A2:Z`,
        [[]],
      );
    } catch (error) {
      console.error("Failed to clear Status_Updates sheet:", error);
      throw error;
    }
  }
}
