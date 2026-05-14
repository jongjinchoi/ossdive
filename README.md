# ossdive

[![Homebrew](https://img.shields.io/badge/homebrew-jongjinchoi%2Fossdive-orange?logo=homebrew)](https://github.com/jongjinchoi/homebrew-ossdive)
[![npm](https://img.shields.io/npm/v/ossdive)](https://www.npmjs.com/package/ossdive)
[![Release](https://img.shields.io/github/v/release/jongjinchoi/ossdive)](https://github.com/jongjinchoi/ossdive/releases)

HN에 등장한 오픈소스 프로젝트를 자동 수집·큐레이션하는 도구. HN 50점 이상 + GitHub 100스타 이상 프로젝트를 6시간마다 SQLite에 저장하고, CLI와 MCP 서버로 조회합니다.

## Install

```bash
# Homebrew (recommended)
brew install jongjinchoi/ossdive/ossdive

# npm
npm install -g ossdive

# Run directly from source
bun run cli/index.ts
```

## CLI Usage

```bash
# Interactive TUI (default)
ossdive

# List with filters
ossdive list --lang rust --min-stars 500 --since 30d
ossdive list --show-hn --sort stars
ossdive list --min-score 200 --no-tui   # plain text output

# Search
ossdive search auth
ossdive search "machine learning" -n 50

# Get details
ossdive get microsoft/VibeVoice

# Stats
ossdive stats

# Sync DB manually
ossdive update

# Start MCP server
ossdive mcp
```

### TUI Key Bindings

| Key | Action |
|---|---|
| `↑ / ↓` (or `k/j`) | Move cursor |
| `Tab` | Toggle GitHub / HN link mode |
| `Enter` | Open selected link in browser |
| `q` / `Esc` | Quit |

## Setup (from source)

```bash
bun install
```

## Collector

HN Algolia API와 GitHub API로 데이터를 수집해 `ossdive.db`에 저장합니다.

```bash
# 기본 실행 (마지막 수집 시점부터 이어서)
bun run collect

# 특정 날짜부터 소급 수집
COLLECT_SINCE=2025-01-01 bun run collect
```

환경변수 (`.env.local`):
```bash
GITHUB_TOKEN=ghp_...     # rate limit 60→5,000/h
COLLECT_SINCE=2025-01-01 # 첫 실행 시 소급 시작점
```

## MCP Server

Claude Desktop / Claude Code에서 자연어로 수집된 프로젝트를 조회합니다.

```bash
bun run mcp
# or via CLI:
ossdive mcp
```

### Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ossdive": {
      "command": "ossdive",
      "args": ["mcp"]
    }
  }
}
```

소스에서 실행 시:

```json
{
  "mcpServers": {
    "ossdive": {
      "command": "bun",
      "args": ["/Users/jongjinchoi/Documents/projects/ossdive/mcp/index.ts"],
      "env": {
        "OSSDIVE_DB": "/Users/jongjinchoi/Documents/projects/ossdive/ossdive.db"
      }
    }
  }
}
```

### 제공 Tools

| Tool | 설명 |
|---|---|
| `list_projects` | 필터/정렬로 프로젝트 목록 조회 (`lang`, `min_stars`, `min_score`, `since`, `is_show_hn`, `sort_by`: `hn_score`\|`stars`\|`last_commit_at`\|`collected_at`\|`hn_created_at`) |
| `search_projects` | 키워드로 repo명/HN 제목/설명 검색 |
| `get_project` | `"owner/repo"` 형식으로 특정 프로젝트 상세 조회 |
| `get_stats` | 수집 현황 통계 (총 수, 언어 분포, 상위 starred) |

사용 예시:
```
"이번 주 HN에서 Rust로 만든 프로젝트 뭐 올라왔어?"
"스타 500개 이상이면서 Show HN인 것만 보여줘"
"auth 관련 프로젝트 찾아줘"
"ossdive에 수집된 프로젝트 통계 알려줘"
"이번 주 HN에 올라온 Rust 프로젝트 HN 포스트 날짜 순으로 보여줘"
```

## DB Sync

CLI는 실행 시 자동으로 GitHub Releases(`db-latest`)에서 최신 `ossdive.db`를 `~/.ossdive/ossdive.db`로 다운로드합니다. 1시간 이내 재실행 시에는 캐시를 사용합니다.

## Migration from ossriff

- CLI/MCP 첫 실행 시 `~/.ossriff/ossriff.db` → `~/.ossdive/ossdive.db`로 자동 이전됩니다.
- 환경변수를 사용 중이라면 `OSSRIFF_DB` → `OSSDIVE_DB`로 변경하세요.
- Homebrew: `brew uninstall ossriff && brew install jongjinchoi/ossdive/ossdive`
- MCP 설정: `"ossriff"` 키와 `"command": "ossriff"`를 각각 `"ossdive"`로 변경하세요.
