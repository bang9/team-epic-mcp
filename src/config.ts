export const CONFIG = {
  // 스프레드시트 ID는 환경 변수에서 가져옴 (필수)
  SPREADSHEET_ID:
    process.env.SPREADSHEET_ID ||
    (() => {
      throw new Error("SPREADSHEET_ID environment variable is required");
    })(),

  // Google Service Account 인증 (base64로 인코딩된 JSON)
  GOOGLE_SERVICE_ACCOUNT_BASE64: process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,

  // 시트 이름 정의
  SHEET_NAMES: {
    EPICS: "Epics",
    EPIC_STATUS: "Epic_Status",
    STATUS_UPDATES: "Status_Updates",
    METADATA: "Metadata",
  },

  // 시트 GID (Google Sheets의 고유 ID)
  SHEET_GIDS: {
    EPICS: 0,
    EPIC_STATUS: 1,
    STATUS_UPDATES: 2,
  },

  // 캐시 설정
  CACHE_DURATION: parseInt(process.env.CACHE_DURATION || "60000"), // 기본 1분

  // API 설정
  SHEETS_API: {
    BASE_URL: "https://sheets.googleapis.com/v4/spreadsheets",
    EXPORT_URL: "https://docs.google.com/spreadsheets/d",
  },
};

// 헬퍼 함수
export function getExportUrl(sheetGid: number): string {
  // Using Google Visualization API instead of direct export URL
  // Find which sheet name corresponds to this GID
  const entry = Object.entries(CONFIG.SHEET_GIDS).find(
    ([_, gid]) => gid === sheetGid,
  );
  if (!entry) {
    throw new Error(`No sheet found for GID ${sheetGid}`);
  }
  const sheetKey = entry[0] as keyof typeof CONFIG.SHEET_NAMES;
  const sheetName = CONFIG.SHEET_NAMES[sheetKey];
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
}

export function getApiUrl(range: string): string {
  return `${CONFIG.SHEETS_API.BASE_URL}/${CONFIG.SPREADSHEET_ID}/values/${range}`;
}

// 버전 관리
import packageJson from '../package.json' assert { type: 'json' };

export const MCP_VERSION = packageJson.version;

// 분기 관리 함수들
export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}_Q${quarter}`;
}

export function dateToQuarter(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return `${year}_Q${quarter}`;
}

export function getStatusUpdatesSheetName(quarter?: string): string {
  const targetQuarter = quarter || getCurrentQuarter();
  return `Status_Updates_${targetQuarter}`;
}
