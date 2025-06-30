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


  // 캐시 설정
  CACHE_DURATION: parseInt(process.env.CACHE_DURATION || "60000"), // 기본 1분

  // API 설정
  SHEETS_API: {
    BASE_URL: "https://sheets.googleapis.com/v4/spreadsheets",
  },
};

// 헬퍼 함수

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
