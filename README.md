# ossriff

[![Homebrew](https://img.shields.io/badge/homebrew-jongjinchoi%2Fossriff-orange?logo=homebrew)](https://github.com/jongjinchoi/homebrew-ossriff)
[![npm](https://img.shields.io/npm/v/ossriff)](https://www.npmjs.com/package/ossriff)
[![Release](https://img.shields.io/github/v/release/jongjinchoi/ossriff)](https://github.com/jongjinchoi/ossriff/releases)

HN에 등장한 오픈소스 프로젝트를 자동 수집·큐레이션하는 도구. HN 50점 이상 + GitHub 100스타 이상 프로젝트를 6시간마다 SQLite에 저장하고, CLI와 MCP 서버로 조회합니다.

## Install

```bash
# Homebrew (recommended)
brew install jongjinchoi/ossriff/ossriff

# npm
npm install -g ossriff

# Run directly from source
bun run cli/index.ts
```

## CLI Usage

```bash
# Interactive TUI (default)
ossriff

# List with filters
ossriff list --lang rust --min-stars 500 --since 30d
ossriff list --show-hn --sort stars
ossriff list --min-score 200 --no-tui   # plain text output

# Search
ossriff search auth
ossriff search "machine learning" -n 50

# Get details
ossriff get microsoft/VibeVoice

# Stats
ossriff stats

# Sync DB manually
ossriff update

# Start MCP server
ossriff mcp
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

HN Algolia API와 GitHub API로 데이터를 수집해 `ossriff.db`에 저장합니다.

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
ossriff mcp
```

### Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ossriff": {
      "command": "ossriff",
      "args": ["mcp"]
    }
  }
}
```

소스에서 실행 시:

```json
{
  "mcpServers": {
    "ossriff": {
      "command": "bun",
      "args": ["/Users/jongjinchoi/Documents/projects/ossriff/mcp/index.ts"],
      "env": {
        "OSSRIFF_DB": "/Users/jongjinchoi/Documents/projects/ossriff/ossriff.db"
      }
    }
  }
}
```

### 제공 Tools

| Tool | 설명 |
|---|---|
| `list_projects` | 필터/정렬로 프로젝트 목록 조회 (`lang`, `min_stars`, `min_score`, `since`, `is_show_hn`, `sort_by`) |
| `search_projects` | 키워드로 repo명/HN 제목/설명 검색 |
| `get_project` | `"owner/repo"` 형식으로 특정 프로젝트 상세 조회 |
| `get_stats` | 수집 현황 통계 (총 수, 언어 분포, 상위 starred) |

사용 예시:
```
"이번 주 HN에서 Rust로 만든 프로젝트 뭐 올라왔어?"
"스타 500개 이상이면서 Show HN인 것만 보여줘"
"auth 관련 프로젝트 찾아줘"
"ossriff에 수집된 프로젝트 통계 알려줘"
```

## DB Sync

CLI는 실행 시 자동으로 GitHub Releases(`db-latest`)에서 최신 `ossriff.db`를 `~/.ossriff/ossriff.db`로 다운로드합니다. 1시간 이내 재실행 시에는 캐시를 사용합니다.
