# Team Epic MCP Server

Epic 기반 팀 프로젝트 관리를 위한 MCP(Model Context Protocol) 서버입니다. Google Sheets를 백엔드로 사용하여 실시간 협업과 프로젝트 추적이 가능합니다.

## ✨ 주요 기능

- **Epic 라이프사이클 관리**: backlog → kickoff → planning → development → code_review → testing → ready_to_release → released → done
- **플랫폼별 진행률 추적**: iOS, Android, JS 각 플랫폼별 진행 상황 관리
- **실시간 업데이트**: 진행률, 코멘트, 블로커 등 실시간 업데이트
- **히스토리 추적**: 모든 변경사항 자동 기록
- **자연어 쿼리**: AI가 이해하기 쉬운 형태로 데이터 제공
- **블로커 관리**: 프로젝트 장애 요소 추적 및 해결 관리

## 🚀 빠른 시작

### Option 1: NPM 설치 (권장)

가장 간단한 방법은 npm을 통한 설치입니다:

```bash
# npx를 통한 실행
npx team-epic-mcp@latest
```

Claude Desktop 설정:
```json
{
  "mcpServers": {
    "team-epic": {
      "command": "npx",
      "args": ["team-epic-mcp@latest"],
      "env": {
        "SPREADSHEET_ID": "your-spreadsheet-id",
        "GOOGLE_SERVICE_ACCOUNT_BASE64": "your-base64-encoded-service-account"
      }
    }
  }
}
```

### Option 2: GitHub Raw 배포

GitHub에서 직접 배포된 번들을 사용:

```json
{
  "mcpServers": {
    "team-epic": {
      "command": "node",
      "args": ["https://raw.githubusercontent.com/bang9/team-epic-mcp/main/dist/team-epic-mcp.min.js"],
      "env": {
        "SPREADSHEET_ID": "your-spreadsheet-id",
        "GOOGLE_SERVICE_ACCOUNT_BASE64": "your-base64-encoded-service-account"
      }
    }
  }
}
```

### 배포 파일 옵션

- **NPM 패키지**: `npx team-epic-mcp@latest` (자동 업데이트)
- **압축 번들**: `team-epic-mcp.min.js` (9.4MB)
- **일반 번들**: `team-epic-mcp.js` (23MB)

## 📋 Google Sheets 설정

### 1. 스프레드시트 구조

3개의 시트를 생성해야 합니다:

#### Epics (메인 정보)
```
epic_id | epic_name | epic_url | current_status | ios_assignee | android_assignee | js_assignee | start_date | target_date | prd_link | tip_link
```

#### Epic_Status (실시간 상태)
```
epic_id | ios_progress | android_progress | js_progress | overall_status | last_comment | last_updated | updated_by
```

#### Status_Updates (히스토리)
```
timestamp | epic_id | update_type | platform | message | author
```

### 2. 샘플 데이터

`sheets_data` 폴더의 CSV 파일들을 Google Sheets에 복사하여 시작할 수 있습니다.

### 3. Google Service Account 설정

#### Service Account 생성

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. APIs & Services > Credentials > Create Credentials > Service Account
4. 서비스 계정 이름 입력 (예: "team-mcp-service")
5. JSON 키 파일 다운로드

#### 스프레드시트 권한 설정

1. Google Sheets에서 사용할 스프레드시트 열기
2. 우측 상단 "공유" 버튼 클릭
3. Service Account 이메일 추가 (예: team-mcp-service@project-id.iam.gserviceaccount.com)
4. "편집자" 권한 부여

#### Base64 인코딩

```bash
# Linux/Mac
cat service-account-key.json | base64 -w 0  # Linux
cat service-account-key.json | base64 -b 0  # Mac

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account-key.json"))
```

## 🛠️ 사용 가능한 도구

### 읽기 도구 (6개)

| 도구 | 설명 | 예시 |
|------|------|------|
| `list_epics` | Epic 목록 조회 | "현재 development 상태인 Epic들 보여줘" |
| `get_epic_details` | Epic 상세 정보 조회 | "PROJ-123 Epic의 상세 정보와 진행 상황" |
| `get_epic_timeline` | Epic 히스토리 조회 | "PROJ-123의 모든 업데이트 내역 보여줘" |
| `get_team_progress` | 팀 전체 진행 현황 | "팀 전체 진행 상황 요약해줘" |
| `find_blockers` | 블로커 찾기 | "현재 블로커가 있는 Epic들 찾아줘" |
| `search_by_assignee` | 담당자별 Epic 검색 | "@Alice Kim이 iOS 담당인 Epic들" |

### 쓰기 도구 (7개)

| 도구 | 설명 | 예시 |
|------|------|------|
| `create_epic` | 새 Epic 생성 | "새 Epic 생성: '[Mobile App] Push Notification' iOS는 @Alice, Android는 @Bob" |
| `update_progress` | 진행률 업데이트 | "PROJ-123의 iOS 진행률을 80%로 업데이트" |
| `add_comment` | 코멘트 추가 | "PROJ-123에 'API 연동 완료, UI 테스트 진행 중' 코멘트 추가" |
| `report_blocker` | 블로커 등록 | "PROJ-123 Android에 'RecyclerView 성능 이슈' 블로커 등록" |
| `resolve_blocker` | 블로커 해결 | "PROJ-123 Android 블로커를 'DiffUtil 적용으로 해결' 처리" |
| `change_epic_status` | Epic 상태 변경 | "PROJ-123을 testing 상태로 변경" |
| `mark_platform_done` | 플랫폼 완료 처리 | "PROJ-123의 iOS 개발 완료 처리" |

## 💬 사용 예시

### AI와의 자연어 대화

```
사용자: "우리 팀에서 현재 블로커가 있는 프로젝트가 있어?"
AI: [find_blockers 도구 사용] 
    "현재 2개의 Epic에서 블로커가 발견되었습니다:
     - PROJ-001: Android RecyclerView 성능 이슈
     - PROJ-003: iOS 메모리 누수 문제"

사용자: "PROJ-001의 Android 블로커를 DiffUtil 적용으로 해결했어"
AI: [resolve_blocker 도구 사용]
    "PROJ-001의 Android 블로커가 해결 처리되었습니다."

사용자: "@Alice Kim이 담당하고 있는 프로젝트들의 진행 상황은?"
AI: [search_by_assignee 도구 사용]
    "Alice Kim님이 담당 중인 프로젝트 현황..."
```

## 🏗️ 로컬 개발 설정

### 프로젝트 클론 및 설치

```bash
git clone https://github.com/bang9/team-epic-mcp.git
cd team-epic-mcp
npm install
```

### 개발 명령어

```bash
# 개발 모드 실행
npm run dev

# 타입 체크
npm run typecheck

# 빌드
npm run build

# 번들 생성
npm run bundle        # 일반 번들
npm run bundle:min    # 압축 번들
npm run build:all     # 전체 빌드
```

### 환경 변수

```bash
# 필수: 스프레드시트 ID (Google Sheets URL에서 추출)
export SPREADSHEET_ID="your-spreadsheet-id"

# 필수: Service Account 인증 (쓰기 작업용)
export GOOGLE_SERVICE_ACCOUNT_BASE64="base64-encoded-json"

# 선택: 캐시 시간 (기본값: 60초)
export CACHE_DURATION="60000"
```

## 📁 프로젝트 구조

```
team-epic-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── config.ts             # 설정 관리
│   ├── types.ts              # TypeScript 타입 정의
│   ├── sheets/               # Google Sheets 통합
│   │   ├── sheets-client.ts  # 읽기/쓰기 클라이언트
│   │   └── parser.ts         # 데이터 포맷팅
│   └── tools/                # MCP 도구
│       ├── epic-tools.ts     # 읽기 도구
│       └── epic-write-tools.ts # 쓰기 도구
├── sheets_data/              # 샘플 CSV 데이터
├── dist/                     # 배포 번들
│   ├── team-epic-mcp.js      # 일반 번들 (23MB)
│   └── team-epic-mcp.min.js  # 압축 번들 (9.4MB)
└── README.md
```

## 🔄 Epic 상태 라이프사이클

```
backlog → kickoff → planning → development → code_review → testing → ready_to_release → released → done
                                                                              ↓
                                                                          on_hold
```

## 🚨 문제 해결

### 쓰기 작업이 실패하는 경우
- 스프레드시트가 Service Account에 "편집자" 권한으로 공유되어 있는지 확인
- `GOOGLE_SERVICE_ACCOUNT_BASE64` 환경변수가 올바르게 설정되었는지 확인
- Service Account JSON이 유효한지 확인

### 데이터가 업데이트되지 않는 경우
- 캐시 시간(기본 1분) 때문일 수 있음
- 네트워크 연결 상태 확인
- Google Sheets API 할당량 확인

### 환경변수 관련 오류
- `SPREADSHEET_ID`가 올바른 Google Sheets ID인지 확인
- Service Account 권한이 올바르게 설정되었는지 확인

## 🔗 유용한 링크

- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)
- [Google Sheets API 문서](https://developers.google.com/sheets/api)
- [Google Cloud Service Account 설정](https://cloud.google.com/iam/docs/service-accounts)

## 📄 라이선스

MIT License

---

**🤖 Generated with [Claude Code](https://claude.ai/code)**