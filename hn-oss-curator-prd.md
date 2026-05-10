# PRD: ossriff
**Product Requirements Document**
버전: 0.2 | 작성일: 2026-05-10 | 상태: 초안

---

## 1. 개요 (Overview)

### 1.1 제품 한 줄 정의
해커뉴스(Hacker News)에 등장한 오픈소스 프로젝트를 자동으로 수집·분류하여, CLI와 MCP를 통해 개발자가 주목할 만한 프로젝트를 쉽게 발견할 수 있게 해주는 개인/소규모 팀용 큐레이션 도구.

### 1.2 배경 및 문제 정의
- 해커뉴스에는 매일 수십 개의 오픈소스 프로젝트가 올라오지만, 흘러가는 피드 속에서 놓치기 쉬움
- GitHub 트렌딩은 단기 인기 기반이라 "검증된 신진 프로젝트"를 가려내기 어려움
- 개발자가 HN과 GitHub을 오가며 수동으로 대조하는 번거로움이 존재함
- HN 커뮤니티의 반응(점수, 댓글)과 GitHub 성장 지표(스타, 최근 커밋)를 함께 보여주는 도구가 없음

### 1.3 목표
- HN에 올라온 오픈소스 프로젝트를 6시간마다 자동 수집
- CLI와 MCP 서버로 조회 (개인/소규모 팀 사용)
- 팀원 컴퓨터에 `brew install ossriff`로 간단히 설치
- 이 프로젝트 자체도 오픈소스로 공개

---

## 2. 대상 사용자 (Target Users)

개인 또는 함께 일하는 소규모 팀. 공개 서비스 아님.

| 사용자 유형 | 특징 | 주요 니즈 |
|---|---|---|
| **사이드 프로젝트 탐색자** | 새 기술 트렌드를 꾸준히 팔로우하는 개발자 | "요즘 HN에서 뜨는 게 뭔지 빠르게 보고 싶다" |
| **오픈소스 기여자** | 기여할 프로젝트를 찾는 개발자 | "스타는 적지만 유망한 초기 프로젝트를 발견하고 싶다" |
| **기술 리서처** | 팀/회사의 기술 스택을 검토하는 엔지니어 | "특정 카테고리의 최신 오픈소스를 빠르게 비교하고 싶다" |

---

## 3. 수집 기준 (Collection Criteria)

### 3.1 필터링 조건 (확정)
| 항목 | 기준 |
|---|---|
| HN 점수 | **50점 이상** |
| GitHub 스타 | **100개 이상** |
| HN 게시물 유형 | 모든 게시물 (Show HN + 일반 링크 포함) |
| URL 조건 | `github.com` 포함 |
| 수집 주기 | **6시간마다** |

### 3.2 수집 메타데이터

**HN에서 수집**
- 게시물 제목, 점수(upvotes), 댓글 수
- 게시 날짜, Show HN 여부
- HN 게시물 URL

**GitHub에서 수집**
- 스타 수, 포크 수
- 프로그래밍 언어, 라이선스
- 레포 설명(description), 토픽 태그
- 최근 커밋 날짜 (활성도 지표)
- 오픈 이슈 수

---

## 4. 제품 구성 (Product Components)

```
ossriff/
├── collector/     # 데이터 수집 봇 (TypeScript + Bun)
├── cli/           # 터미널 조회 도구 (TypeScript + Bun)
├── mcp/           # MCP 서버 (TypeScript + Bun)
└── menubar/       # macOS 메뉴바 앱 (Tauri)
```

---

## 5. 기능 요구사항 (Functional Requirements)

### 5.1 Collector (수집 봇)

**필수 기능**
- HN Algolia API를 통해 6시간마다 게시물 수집
- `github.com` URL이 포함된 게시물 자동 필터링
- GitHub API로 레포 메타데이터 수집
- 중복 처리: 이미 수집된 레포 업데이트 (스타 수 갱신)
- SQLite DB에 저장

**자동화**
- GitHub Actions 크론잡으로 운영 (무료 티어 내에서 동작)
- 수집 완료 후 `ossriff.db`를 GitHub Releases에 업로드
- 수집 실패 시 로그 기록 및 재시도 로직

**API 사용**
| API | 용도 | 제한 |
|---|---|---|
| HN Algolia API | 게시물 수집 | 무료, 제한 없음 |
| GitHub REST API | 레포 메타데이터 | 인증 없이 60회/시간, 인증 시 5,000회/시간 |

---

### 5.2 CLI (터미널 도구)

**자동 동기화**
- 실행 시 GitHub Releases에서 최신 `ossriff.db` 버전 확인
- 새 버전이 있으면 자동 다운로드 (`~/.ossriff/ossriff.db` 갱신)
- 이후 로컬 SQLite에서 조회 (인터넷 연결 불필요)

**필수 기능**
- 최근 수집된 프로젝트 목록 조회
- 필터 옵션: `--lang python`, `--min-stars 500`, `--since 7d`
- 결과를 테이블 형태로 출력 (TUI)
- 선택한 프로젝트의 GitHub 또는 HN 링크 브라우저로 열기
- `ossriff update` — 수동 동기화 명령어

**설치**
```bash
brew install ossriff
```

---

### 5.3 MCP 서버

**필수 기능**
- Claude에서 자연어로 수집된 프로젝트 조회
- 로컬 SQLite(`~/.ossriff/ossriff.db`)에서 직접 읽기

**제공 Tool 목록**
| Tool | 기능 |
|---|---|
| `list_projects` | 프로젝트 목록 조회 (필터/정렬 지원) |
| `search_projects` | 키워드 검색 |
| `get_project` | 특정 프로젝트 상세 조회 |
| `get_stats` | 수집 현황 통계 |

**사용 예시**
```
"이번 주 HN에서 Rust로 만든 프로젝트 뭐 올라왔어?"
"스타 500개 이상이면서 Show HN인 것만 보여줘"
"최근 커밋이 활발한 Go 프로젝트 있어?"
```

---

### 5.4 macOS 메뉴바 앱 (Tauri)

**필수 기능**
- 메뉴바 상주 (항상 접근 가능)
- 클릭 시 최근 10개 프로젝트 목록 표시
- 각 항목 클릭 → GitHub 또는 HN 링크로 바로 이동
- 백그라운드에서 6시간마다 자동 동기화 (`ossriff.db` 갱신)

**알림 기능**
- 동기화 후 새 프로젝트가 있으면 macOS 알림
- 예: _"HN 50점+ 오픈소스 5개 새로 등록됨"_
- 알림 클릭 → 메뉴바 앱 열기

**기술 스택**
- Tauri (Rust + WebView)
- UI: TypeScript (로컬 SQLite 직접 읽기)

---

## 6. 비기능 요구사항 (Non-Functional Requirements)

| 항목 | 기준 |
|---|---|
| 수집 지연 | HN 게시 후 최대 6시간 이내 반영 |
| CLI 동기화 | 최신 DB 확인 및 다운로드 5초 이내 |
| GitHub API 비용 | 무료 티어 내 운영 |
| 운영 비용 | $0 (GitHub Actions + GitHub Releases 기준) |
| 라이선스 | MIT (오픈소스 공개) |

---

## 7. 데이터 모델 (Data Model)

### projects 테이블
```sql
CREATE TABLE projects (
  id              INTEGER PRIMARY KEY,
  github_url      TEXT UNIQUE NOT NULL,
  repo_name       TEXT NOT NULL,
  description     TEXT,
  language        TEXT,
  license         TEXT,
  stars           INTEGER,
  forks           INTEGER,
  open_issues     INTEGER,
  last_commit_at  DATETIME,
  hn_title        TEXT,
  hn_score        INTEGER,
  hn_comments     INTEGER,
  hn_url          TEXT,
  is_show_hn      BOOLEAN DEFAULT FALSE,
  collected_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. 기술 스택 (Tech Stack)

| 컴포넌트 | 기술 | 이유 |
|---|---|---|
| Collector | TypeScript + Bun | fetch() 네이티브, Bun.sqlite 내장, CLI와 코드 공유 |
| DB | SQLite (Bun.sqlite) | 단일 파일, 서버 불필요, GitHub Releases로 배포 |
| CLI | TypeScript + Bun (Commander + Ink) | temper와 동일 패턴, TUI 풍부 |
| MCP | TypeScript + Bun | CLI와 코드 공유, 로컬 SQLite 직접 읽기 |
| 메뉴바 앱 | Tauri (Rust + WebView) | 네이티브 성능, 작은 번들 크기 |
| 자동화 | GitHub Actions + GitHub Releases | 무료, 크론잡 + DB 배포 |
| Web | — | 필요시 Next.js로 추후 추가 |

### 공유 모듈 구조
```
ossriff/
└── src/
    ├── types.ts    # HNPost, GitHubRepo, Project 타입 — 전체 공유
    ├── db/         # SQLite 스키마 + 쿼리 — collector/cli/mcp 공유
    └── api/        # HN, GitHub API 클라이언트 — collector 사용
```

---

## 9. 개발 로드맵 (Roadmap)

### Phase 1 — Collector MVP
- [ ] HN Algolia API 연동 (TypeScript + Bun)
- [ ] GitHub API 연동 및 메타데이터 수집
- [ ] SQLite 저장 로직 (Bun.sqlite)
- [ ] GitHub Actions 크론잡 설정 (6시간마다)
- [ ] GitHub Releases에 ossriff.db 업로드

### Phase 2 — CLI + MCP
- [ ] 자동 동기화 (GitHub Releases → `~/.ossriff/ossriff.db`)
- [ ] 기본 조회 명령어 + TUI 테이블 출력 (Ink)
- [ ] 필터 옵션 (`--lang`, `--min-stars`, `--since`)
- [ ] MCP 서버 4개 Tool 구현
- [ ] Homebrew formula + `brew install ossriff`

### Phase 3 — 메뉴바 앱
- [ ] Tauri 프로젝트 초기화
- [ ] 메뉴바 아이콘 + 드롭다운 목록
- [ ] 백그라운드 자동 동기화 (6시간마다)
- [ ] macOS 알림 연동
- [ ] 배포 (GitHub Releases)

### Phase 4 — Web (선택적)
- [ ] 필요시 Next.js로 추가
- [ ] 로컬 SQLite 읽기 API 라우트

---

## 10. 미결 사항 (Open Questions)

| 항목 | 질문 | 우선순위 |
|---|---|---|
| 알림 기준 | 메뉴바 알림을 HN 점수 기준으로 더 세분화할까? (100점+, 200점+) | 중간 |
| 카테고리 분류 | GitHub 토픽 태그를 기반으로 자동 카테고리화할까? | 중간 |
| 데이터 소스 확장 | HN 외 Reddit r/programming, lobste.rs 등도 포함할까? | 낮음 (v2) |

---

## 11. 성공 지표 (Success Metrics)

| 지표 | 목표 (출시 3개월) |
|---|---|
| GitHub 스타 (이 프로젝트 자체) | 200개 이상 |
| Homebrew 다운로드 | 500회 이상 |
| 수집 프로젝트 누적 수 | 500개 이상 |
| 메뉴바 앱 다운로드 | 200개 이상 |
