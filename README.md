# Team Epic MCP Server

Jira Epic 기반으로 팀 프로젝트를 관리하는 MCP(Model Context Protocol) 서버입니다. Google Sheets를 백엔드로 사용하여 읽기/쓰기가 가능합니다.

## 주요 기능

- **Epic 관리**: Jira Epic 기반 프로젝트 추적
- **플랫폼별 진행률**: iOS, Android, JS 각 플랫폼별 진행 상황 관리
- **실시간 업데이트**: 진행률, 코멘트, 블로커 등 실시간 업데이트
- **히스토리 추적**: 모든 변경사항 자동 기록
- **자연어 쿼리**: AI가 이해하기 쉬운 형태로 데이터 제공

## 설치 방법

1. 프로젝트 클론 및 의존성 설치:
```bash
git clone <repository-url>
cd team-mcp
npm install
```

2. 빌드:
```bash
npm run build
```

## Google Sheets 설정

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

### 3. Google Service Account 설정 (쓰기 권한 필요)

Google Sheets API의 쓰기 작업을 위해서는 Service Account 인증이 필요합니다.

#### Service Account 생성

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. 좌측 메뉴에서 "IAM 및 관리자" > "서비스 계정" 선택
4. "서비스 계정 만들기" 클릭
5. 서비스 계정 이름 입력 (예: "team-mcp-service")
6. "만들기 및 계속" 클릭
7. 역할은 건너뛰고 "계속" 클릭
8. "완료" 클릭

#### JSON 키 파일 생성

1. 생성된 서비스 계정 클릭
2. "키" 탭으로 이동
3. "키 추가" > "새 키 만들기" 클릭
4. JSON 형식 선택 후 "만들기"
5. JSON 파일이 자동으로 다운로드됨

#### 스프레드시트 권한 설정

1. Google Sheets에서 사용할 스프레드시트 열기
2. 우측 상단 "공유" 버튼 클릭
3. Service Account 이메일 추가 (예: team-mcp-service@project-id.iam.gserviceaccount.com)
4. "편집자" 권한 부여
5. "보내기" 클릭

#### Base64 인코딩

```bash
# Linux/Mac
cat service-account-key.json | base64

# 또는 줄바꿈 없이 인코딩 (권장)
cat service-account-key.json | base64 -w 0  # Linux
cat service-account-key.json | base64 -b 0  # Mac
```

## MCP 서버 설정

### Claude Desktop 설정

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "team-epic": {
      "command": "node",
      "args": ["/path/to/team-mcp/dist/index.js"],
      "env": {
        "SPREADSHEET_ID": "your-spreadsheet-id",
        "GOOGLE_SERVICE_ACCOUNT_BASE64": "base64로 인코딩된 Service Account JSON"
      }
    }
  }
}
```

### 환경 변수

```bash
# 필수: 스프레드시트 ID
export SPREADSHEET_ID="your-spreadsheet-id"

# 필수: Service Account (쓰기 권한이 필요한 경우)
export GOOGLE_SERVICE_ACCOUNT_BASE64="base64-encoded-json"

# 선택: 캐시 시간 (기본값: 60000ms)
export CACHE_DURATION="60000"
```

## 사용 가능한 도구

### 읽기 도구 (6개)

#### 1. `list_epics`
Epic 목록을 조회합니다.

```
예시: "현재 development 상태인 Epic들 보여줘"
      "@Airen Kang가 담당하는 Epic 목록"
```

#### 2. `get_epic_details`
특정 Epic의 상세 정보와 최근 업데이트를 조회합니다.

```
예시: "AA-3617 Epic의 상세 정보와 진행 상황"
```

#### 3. `get_epic_timeline`
Epic의 전체 히스토리를 시간순으로 조회합니다.

```
예시: "AA-3617의 모든 업데이트 내역 보여줘"
```

#### 4. `get_team_progress`
팀 전체의 진행 현황을 요약합니다.

```
예시: "팀 전체 진행 상황 요약해줘"
```


#### 6. `find_blockers`
해결되지 않은 블로커를 찾습니다.

```
예시: "현재 블로커가 있는 Epic들 찾아줘"
```

#### 7. `search_by_assignee`
담당자별 Epic을 검색합니다.

```
예시: "@John Kim이 Android 담당인 Epic들"
```

### 쓰기 도구 (7개)

#### 1. `create_epic` 🆕
새로운 Epic을 생성합니다.

```
예시: "새 Epic 생성: '[AI Agent Client] Real-time sync' iOS는 @Airen Kang, Android는 @John Kim, JS는 @Sarah Lee가 담당, 2월 1일 시작해서 3월 15일까지"
```

필수 정보:
- Epic 이름
- iOS/Android/JS 담당자 (@로 시작)
- 시작일과 목표일 (YYYY-MM-DD 형식)

#### 2. `update_progress` ⭐
플랫폼별 진행률을 업데이트합니다.

```
예시: "AA-3617의 iOS 진행률을 80%로 업데이트"
```

#### 3. `add_comment` ⭐
현재 상황에 대한 코멘트를 추가합니다.

```
예시: "AA-3617에 'API 연동 완료, UI 테스트 진행 중' 코멘트 추가"
```

#### 4. `report_blocker`
블로커를 등록합니다.

```
예시: "AA-3617 Android에 'RecyclerView 성능 이슈' 블로커 등록"
```

#### 5. `resolve_blocker`
블로커를 해결 처리합니다.

```
예시: "AA-3617 Android 블로커를 'DiffUtil 적용으로 해결' 처리"
```

#### 6. `change_epic_status`
Epic의 전체 상태를 변경합니다.

```
예시: "AA-3617을 testing 상태로 변경"
```

#### 7. `mark_platform_done`
특정 플랫폼을 완료 처리합니다.

```
예시: "AA-3617의 iOS 개발 완료 처리"
```


## 사용 예시

### AI와의 대화

1. **진행 상황 업데이트**
   ```
   사용자: "AA-3617의 iOS 개발이 90% 완료됐어. UI 테스트만 남았어"
   AI: [update_progress 도구 사용하여 업데이트]
   ```

2. **팀 현황 파악**
   ```
   사용자: "우리 팀 전체 상황이 어떻게 되고 있어?"
   AI: [get_team_progress 도구 사용하여 요약 제공]
   ```

3. **블로커 관리**
   ```
   사용자: "AA-3617 Android에서 메모리 누수 문제가 발생했어"
   AI: [report_blocker 도구 사용하여 블로커 등록]
   ```


## Epic 상태 라이프사이클

```
backlog → kickoff → planning → development → code_review → testing → ready_to_release → released → done
                                                                              ↓
                                                                          on_hold
```

## 프로젝트 구조

```
team-mcp/
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
└── dist/                     # 빌드 결과물
```

## 개발

```bash
# 개발 모드 실행
npm run dev

# 타입 체크
npm run typecheck

# 린트
npm run lint
```

## 문제 해결

### 쓰기가 안 되는 경우
- 스프레드시트가 "편집자" 권한으로 공유되어 있는지 확인
- 인터넷 연결 상태 확인
- 콘솔에서 오류 메시지 확인

### 데이터가 업데이트되지 않는 경우
- 캐시 시간(기본 1분) 때문일 수 있음
- 강제로 새로고침이 필요한 경우 서버 재시작

### API 제한
- Google Sheets API는 무료로 사용 가능하지만 rate limit이 있음
- 과도한 요청 시 일시적으로 차단될 수 있음

## 라이선스

MIT