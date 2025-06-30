# Team Epic MCP

AI와 자연어로 소통하는 팀 프로젝트 관리를 위한 Model Context Protocol (MCP) 서버입니다.

"우리 팀에서 현재 블로커가 있는 프로젝트가 있어?"라고 물어보면 Google Sheets에서 데이터를 조회해서 즉시 답변해줍니다.

## Features

- **자연어 쿼리**: 프로젝트 상태, 블로커, 팀 진행률을 자연어로 조회
- **실시간 진행률 추적**: iOS, Android, JS 플랫폼별 진행률 모니터링  
- **자동 히스토리 관리**: 모든 업데이트가 자동으로 기록되고 추적 가능
- **블로커 감지**: 해결되지 않은 이슈를 즉시 식별 및 추적
- **팀 리포팅**: 팀 전체 진행 상황 요약 및 분석
- **성능 최적화**: 분기별 데이터 파티셔닝으로 확장 가능한 성능

## Prerequisites

- Node.js 18+
- Google Sheets 서비스 계정 접근 권한
- MCP 호환 클라이언트 (Claude Desktop, Cursor 등)

## Installation

```bash
npx team-epic-mcp@latest
```

## Configuration

### MCP 클라이언트 설정

**표준 MCP 설정:**
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

**Claude Code 설정:**
```bash
claude mcp add team-epic \
  -e SPREADSHEET_ID="1ABC123def456..." \
  -e GOOGLE_SERVICE_ACCOUNT_BASE64="eyJ0eXBlIjoi..." \
  -- npx team-epic-mcp@latest
```

### Google Sheets 설정

새 Google Sheets 문서를 생성하고 다음 시트들을 추가하세요:

**Epics:**
```
epic_id | epic_name | epic_url | current_status | ios_assignee | android_assignee | js_assignee | start_date | target_date | prd_link | tip_link | created_quarter
```

**Epic_Status:**
```
epic_id | ios_progress | android_progress | js_progress | overall_status | last_comment | last_updated | updated_by
```

**Status_Updates:**
```
timestamp | epic_id | update_type | platform | message | author
```

### Google Service Account

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. Google Sheets API 활성화
3. 서비스 계정 생성 및 JSON 키 다운로드
4. 스프레드시트를 서비스 계정과 공유 (편집자 권한)
5. JSON 키를 Base64로 인코딩:

```bash
# macOS/Linux
cat service-account.json | base64 -w 0

# Windows
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SPREADSHEET_ID` | Yes | Google Sheets 문서 ID | - |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Yes | Base64 인코딩된 서비스 계정 JSON | - |
| `CACHE_DURATION` | No | 캐시 지속 시간 (밀리초) | 60000 |

## Usage

### 기본 사용법

**팀 상황 파악:**
```
"팀 전체 진행 상황 알려줘"
→ 상태별 Epic 분포와 플랫폼별 평균 진행률 표시
```

**블로커 확인:**
```
"해결되지 않은 블로커가 있어?"
→ 현재 활성 블로커 목록 표시
```

**개인 업무 확인:**
```
"@alice가 담당하는 프로젝트들 보여줘"
→ 특정 담당자의 프로젝트 목록 표시
```

**진행률 업데이트:**
```
"PROJ-123 iOS 진행률 80%로 업데이트"
→ 진행률 업데이트 및 히스토리 자동 기록
```

### Epic 상태 라이프사이클

```
backlog → kickoff → planning → development → code_review → testing → ready_to_release → released → done
                                                                                  ↓
                                                                              on_hold
```

## Tools

### Read Tools (6개)

| Tool | Description |
|------|-------------|
| `list_epics` | Epic 목록 조회 (상태/담당자 필터링 가능) |
| `get_epic_details` | Epic 상세 정보 및 최근 업데이트 |
| `get_epic_timeline` | Epic 전체 타임라인 조회 |
| `get_team_progress` | 팀 전체 진행 상황 요약 |
| `find_blockers` | 해결되지 않은 블로커 검색 |
| `search_by_assignee` | 담당자별 Epic 검색 |

### Write Tools (7개)

| Tool | Description |
|------|-------------|
| `create_epic` | 새 Epic 생성 |
| `update_progress` | 플랫폼별 진행률 업데이트 |
| `add_comment` | Epic에 코멘트 추가 |
| `report_blocker` | 블로커 등록 |
| `resolve_blocker` | 블로커 해결 처리 |
| `change_epic_status` | Epic 상태 변경 |
| `mark_platform_done` | 플랫폼 작업 완료 처리 |

## Troubleshooting

### 일반적인 문제

**권한 오류:**
- 서비스 계정이 스프레드시트에 편집자 권한으로 공유되어 있는지 확인
- `GOOGLE_SERVICE_ACCOUNT_BASE64` 값이 올바르게 인코딩되었는지 확인

**데이터 업데이트 지연:**
- 캐시로 인해 최대 1분 지연 가능
- Google Sheets API 할당량 확인

**스프레드시트 ID 찾기:**
- URL에서 추출: `https://docs.google.com/spreadsheets/d/[여기가-ID]/edit`

### Performance

- **분기별 파티셔닝**: 새 Epic은 현재 분기에 자동 할당
- **캐시 최적화**: 현재 분기 데이터 우선 로드로 90% 성능 향상
- **확장성**: 데이터 증가와 관계없이 일정한 성능 유지

## Development

### Local Development

```bash
git clone https://github.com/bang9/team-epic-mcp.git
cd team-epic-mcp
npm install
npm run dev
```

### Build Commands

```bash
npm run dev          # 개발 모드
npm run build        # 프로덕션 빌드
npm run typecheck    # TypeScript 타입 검사
npm run lint         # ESLint 검사
```

### Project Structure

```
src/
├── index.ts              # MCP 서버 진입점
├── config.ts             # 설정 관리
├── types.ts              # 타입 정의
├── tools/
│   ├── epic-tools.ts     # 읽기 도구
│   └── epic-write-tools.ts # 쓰기 도구
└── sheets/
    ├── sheets-client.ts  # Google Sheets API 클라이언트
    ├── parser.ts         # 데이터 파싱
    └── version-manager.ts # 스키마 버전 관리
```

## Links

- [NPM Package](https://www.npmjs.com/package/team-epic-mcp)
- [GitHub Repository](https://github.com/bang9/team-epic-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Google Sheets API](https://developers.google.com/sheets/api)

## License

MIT License
