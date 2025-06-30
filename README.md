# Team Epic MCP

**AI와 자연어로 소통하는 팀 프로젝트 관리 시스템**

"우리 팀에서 현재 블로커가 있는 프로젝트가 있어?" 라고 물어보면, AI가 Google Sheets에서 데이터를 조회해서 즉시 답변해주는 MCP 서버입니다.

더 이상 직접 찾아볼 필요가 없습니다. AI가 알아서 조회하고, 업데이트하고, 분석해줍니다.

---

## 🚀 5분 설치

```bash
npx team-epic-mcp@latest
```

MCP 클라이언트 설정 예시:
```json
{
  "mcpServers": {
    "team-epic": {
      "command": "npx",
      "args": ["team-epic-mcp@latest"],
      "env": {
        "SPREADSHEET_ID": "1ABC123...",
        "GOOGLE_SERVICE_ACCOUNT_BASE64": "eyJ0eXBlIjoi..."
      }
    }
  }
}
```

> 🎯 **목표**: 5분 안에 "우리 팀 진행 상황 알려줘"라고 물어볼 수 있게 하는 것

---

## 💬 실제 사용 모습

### 팀 리더의 하루

**오전 9시 - 데일리 스탠드업 전**
```
🧑‍💼 "어제 진행된 업데이트들 보여줘"
🤖 "어제 3개 Epic에서 업데이트가 있었습니다:
   • PROJ-001: iOS 개발 90% 완료 (Alice)
   • PROJ-002: Android 테스트 완료, 배포 준비 중 (Bob)  
   • PROJ-003: 새로운 블로커 발생 - API 응답 지연 이슈"
```

**오후 2시 - 급한 확인**
```
🧑‍💼 "PROJ-003 블로커 상황 어때?"
🤖 "PROJ-003의 API 응답 지연 이슈는 아직 해결되지 않았습니다.
   담당자: Charlie (Backend)
   등록일: 오늘 오전 10:30
   상세: 평균 응답시간이 500ms → 2000ms로 증가"
```

**오후 4시 - 진행률 업데이트**
```
🧑‍💼 "PROJ-001 iOS 완료됐어"
🤖 "PROJ-001의 iOS 진행률을 100%로 업데이트하고 상태를 'testing'으로 변경했습니다."
```

### 개발자의 사용법

**블로커 등록**
```
👩‍💻 "PROJ-002 Android에 RecyclerView 성능 이슈 블로커 등록해줘"
🤖 "PROJ-002 Android 플랫폼에 'RecyclerView 성능 이슈' 블로커를 등록했습니다."
```

**진행률 체크**
```
👨‍💻 "내가 담당하고 있는 프로젝트들 상황 알려줘"
🤖 "Alice님이 담당 중인 프로젝트 현황:
   • PROJ-001 (iOS): 100% 완료, testing 단계
   • PROJ-004 (iOS): 60% 진행 중, development 단계
   • PROJ-005 (iOS): 시작 예정, backlog 단계"
```

---

## ✨ 핵심 가치

### 🎯 **자연어로 소통**
"현재 블로커가 있는 프로젝트 있어?" → 즉시 답변
스프레드시트 열고, 찾고, 필터링하는 시간 절약

### 📊 **실시간 팀 상황 파악** 
"팀 전체 진행 상황 요약해줘" → 한눈에 보는 대시보드
매주 보고서 작성 시간 단축

### ⚡ **확장 가능한 성능**
분기별 자동 파티셔닝으로 데이터가 늘어나도 성능 저하 없음

### 🔄 **자동 히스토리 관리**
모든 업데이트가 자동으로 기록되고 추적 가능
"언제 누가 뭘 바꿨는지" 더 이상 찾아다니지 않아도 됨

### 🚫 **블로커 추적**
문제 상황을 놓치지 않고 즉시 파악
"해결되지 않은 블로커들" 자동 리포팅

---

## 🛠️ 주요 기능

| 기능 | 설명 | 예시 명령어 |
|------|------|-------------|
| **📋 Epic 조회** | 프로젝트 목록과 상태 확인 | "development 단계인 프로젝트들 보여줘" |
| **📈 진행률 관리** | 플랫폼별 진행률 업데이트 | "PROJ-123 iOS 진행률 80%로 업데이트" |
| **💬 코멘트 추가** | 실시간 상황 업데이트 | "API 연동 완료됐다고 코멘트 추가해줘" |
| **🚨 블로커 관리** | 장애 요소 등록/해결 추적 | "메모리 누수 블로커 해결됐어" |
| **👥 담당자별 조회** | 개인별 업무 현황 파악 | "@Alice 담당 프로젝트들 어때?" |
| **📊 팀 리포팅** | 전체 팀 진행 상황 요약 | "팀 전체 진행 상황 요약해줘" |

### Epic 상태 라이프사이클
```
backlog → kickoff → planning → development → code_review → testing → ready_to_release → released → done
                                                                                  ↓
                                                                              on_hold
```

---

## 📋 설치 가이드 (신규 사용자)

### 1. Google Sheets 준비

**스프레드시트 생성 및 구조 설정**

새 Google Sheets를 생성하고 다음 기본 시트들을 만드세요:

#### 📋 **Epics** (프로젝트 기본 정보)
```
epic_id | epic_name | epic_url | current_status | ios_assignee | android_assignee | js_assignee | start_date | target_date | prd_link | tip_link
```

#### 📊 **Epic_Status** (실시간 진행 상황)
```
epic_id | ios_progress | android_progress | js_progress | overall_status | last_comment | last_updated | updated_by
```

#### 📝 **Status_Updates** (변경 히스토리)
```
timestamp | epic_id | update_type | platform | message | author
```

> 💡 **예제 데이터**: `sheets_data/` 폴더의 CSV 파일들을 참고하여 각 시트에 헤더와 샘플 데이터를 추가하세요.
> - `Epics.csv`: 프로젝트 기본 정보 예제
> - `Epic_Status.csv`: 진행 상황 예제  
> - `Status_Updates.csv`: 히스토리 예제

### 2. Google Service Account 설정

**서비스 계정 생성**
1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성
2. APIs & Services → Credentials → Service Account 생성
3. JSON 키 다운로드

**권한 설정**
1. 스프레드시트 → 공유 버튼
2. 서비스 계정 이메일 추가
3. "편집자" 권한 부여

**환경변수 설정**
```bash
# 스프레드시트 ID (URL에서 추출)
export SPREADSHEET_ID="1ABC123def456..."

# 서비스 계정 키 (Base64 인코딩)
export GOOGLE_SERVICE_ACCOUNT_BASE64="$(cat service-account.json | base64 -w 0)"
```

### 3. MCP 클라이언트 설정

**옵션 1: MCP JSON 설정**
```json
{
  "mcpServers": {
    "team-epic": {
      "command": "npx",
      "args": ["team-epic-mcp@latest"],
      "env": {
        "SPREADSHEET_ID": "1ABC123def456...",
        "GOOGLE_SERVICE_ACCOUNT_BASE64": "eyJ0eXBlIjoi..."
      }
    }
  }
}
```

**옵션 2: Claude Code 명령어**
```bash
claude mcp add team-epic \
  -e SPREADSHEET_ID="1ABC123def456..." \
  -e GOOGLE_SERVICE_ACCOUNT_BASE64="eyJ0eXBlIjoi..." \
  -- npx team-epic-mcp@latest
```

클라이언트 재시작 → "우리 팀 상황 알려줘" 테스트

---

## 🔧 API 레퍼런스

### 읽기 도구 (6개)

| 도구 | 기능 | 사용 예시 |
|------|------|----------|
| `list_epics` | Epic 목록 조회 | "현재 진행 중인 프로젝트들" |
| `get_epic_details` | Epic 상세 정보 | "PROJ-123 상세 정보" |
| `get_epic_timeline` | 변경 히스토리 | "PROJ-123 업데이트 내역" |
| `get_team_progress` | 팀 전체 현황 | "팀 진행 상황 요약" |
| `find_blockers` | 블로커 검색 | "해결 안 된 블로커들" |
| `search_by_assignee` | 담당자별 검색 | "@Alice 담당 프로젝트들" |

### 쓰기 도구 (7개)

| 도구 | 기능 | 사용 예시 |
|------|------|----------|
| `create_epic` | 새 Epic 생성 | "신규 프로젝트 생성" |
| `update_progress` | 진행률 업데이트 | "iOS 80% 완료" |
| `add_comment` | 코멘트 추가 | "API 연동 완료" |
| `report_blocker` | 블로커 등록 | "성능 이슈 발생" |
| `resolve_blocker` | 블로커 해결 | "메모리 누수 해결됨" |
| `change_epic_status` | 상태 변경 | "testing 단계로 이동" |
| `mark_platform_done` | 플랫폼 완료 | "iOS 개발 완료" |

---

## 🚨 문제 해결

### 자주 묻는 질문

**Q: "권한 오류가 발생해요"**
- 스프레드시트에 서비스 계정이 "편집자" 권한으로 공유되었는지 확인
- `GOOGLE_SERVICE_ACCOUNT_BASE64` 값이 올바른지 확인

**Q: "데이터가 업데이트되지 않아요"**  
- 캐시 때문에 최대 1분 지연될 수 있음
- Google Sheets API 할당량 초과 여부 확인

**Q: "스프레드시트 ID는 어디서 찾나요?"**
- Google Sheets URL: `https://docs.google.com/spreadsheets/d/[여기가 ID]/edit`

### Base64 인코딩 방법

```bash
# macOS/Linux
cat service-account.json | base64 -w 0

# Windows PowerShell  
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

---

## 🏗️ 개발자 정보

### 로컬 개발

```bash
git clone https://github.com/bang9/team-epic-mcp.git
cd team-epic-mcp
npm install
npm run dev
```

### 빌드 명령어

```bash
npm run dev          # 개발 모드 실행
npm run build        # 압축 번들 빌드
npm run typecheck    # TypeScript 타입 체크
npm run lint         # ESLint 코드 검사
```

### 프로젝트 구조

```
team-epic-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── config.ts             # 설정 및 유틸리티
│   ├── types.ts              # 타입 정의
│   ├── tools/                # MCP 도구들
│   │   ├── epic-tools.ts     # 읽기 도구
│   │   └── epic-write-tools.ts # 쓰기 도구  
│   └── sheets/               # Google Sheets 연동
│       ├── sheets-client.ts  # API 클라이언트
│       └── parser.ts         # 데이터 파싱
├── sheets_data/              # 샘플 데이터
└── dist/                     # 배포 파일
```

### 환경 변수

```bash
SPREADSHEET_ID=               # 필수: Google Sheets ID
GOOGLE_SERVICE_ACCOUNT_BASE64= # 필수: 서비스 계정 키 (Base64)
CACHE_DURATION=60000          # 선택: 캐시 시간 (기본: 60초)
```

---

## 🔗 관련 링크

- **NPM Package**: [team-epic-mcp](https://www.npmjs.com/package/team-epic-mcp)
- **GitHub Repository**: [bang9/team-epic-mcp](https://github.com/bang9/team-epic-mcp)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Google Sheets API**: [developers.google.com/sheets](https://developers.google.com/sheets/api)

---

## 📄 라이선스

MIT License

---

**팀의 생산성을 한 단계 끌어올리세요** 🚀

더 이상 스프레드시트를 직접 관리하지 마세요. AI가 대신 해드립니다.
