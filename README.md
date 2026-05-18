<img src="branding/ossdive-logo.png" width="72" alt="ossdive logo" />

# ossdive

[![Homebrew](https://img.shields.io/badge/homebrew-jongjinchoi%2Fossdive-orange?logo=homebrew)](https://github.com/jongjinchoi/homebrew-ossdive)
[![npm](https://img.shields.io/npm/v/ossdive)](https://www.npmjs.com/package/ossdive)
[![Release](https://img.shields.io/github/v/release/jongjinchoi/ossdive)](https://github.com/jongjinchoi/ossdive/releases)

Automatically collects and curates open-source projects from Hacker News. Projects with HN score ≥ 50 and GitHub stars ≥ 100 are synced to SQLite every 6 hours, queryable via CLI and MCP server.

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

# Trending on HN (last 7 days by default)
ossdive trending
ossdive trending --since 30d --no-tui

# Compare repos side by side
ossdive compare vercel/ai langchain-ai/langchainjs

# Find similar projects
ossdive similar vercel/ai

# Hot projects — rapidly increasing HN engagement vs last 3 days
ossdive hot
ossdive hot --since 7d --no-tui

# Bookmarks — save and manage favourite projects
ossdive bookmark add vercel/ai
ossdive bookmark list          # interactive TUI (d to remove)
ossdive bookmark list --no-tui
ossdive bookmark remove vercel/ai

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
| `d` | Remove bookmark (bookmark list only) |
| `q` / `Esc` | Quit |

## Setup (from source)

```bash
bun install
```

## Collector

Fetches data from the HN Algolia API and GitHub API, storing results in `ossdive.db`.

```bash
# Resume from last collected point
bun run collect

# Backfill from a specific date
COLLECT_SINCE=2025-01-01 bun run collect
```

Environment variables (`.env.local`):
```bash
GITHUB_TOKEN=ghp_...     # raises rate limit from 60 to 5,000/h
COLLECT_SINCE=2025-01-01 # backfill start date for first run
```

## MCP Server

Query collected projects in natural language from Claude Desktop or Claude Code.

```bash
bun run mcp
# or via CLI:
ossdive mcp
```

### Claude Desktop Setup

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

When running from source:

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

### Available Tools

| Tool | Description |
|---|---|
| `list_projects` | List projects with filters and sorting (`lang`, `min_stars`, `min_score`, `since`, `is_show_hn`, `sort_by`: `hn_score`\|`stars`\|`last_commit_at`\|`collected_at`\|`hn_created_at`) |
| `search_projects` | FTS5 full-text search (relevance ranked) across repo name, HN title, and description |
| `get_project` | Get details for a specific project by `"owner/repo"` |
| `get_stats` | Collection stats: total count, language breakdown, top starred |
| `get_trending` | Projects recently trending on HN, ranked by score + comments (`since`, `limit`) |
| `get_hot` | Projects with rapidly increasing HN engagement vs N days ago (`since` default: 3d) |
| `compare_projects` | Side-by-side comparison of 2–4 repos (`repos: ["owner/repo", ...]`) |
| `find_similar` | Find projects similar to a given repo by language, size, and keyword overlap |
| `add_bookmark` | Save a project to your bookmark list |
| `remove_bookmark` | Remove a project from bookmarks |
| `list_bookmarks` | List all bookmarked projects with current stats |

Example queries:
```
"What Rust projects appeared on HN this week?"
"Show me Show HN projects with over 500 stars"
"Find projects related to auth"
"Give me ossdive collection stats"
"List Rust projects from HN this week, sorted by post date"
```

## DB Sync

On startup, the CLI automatically downloads the latest `ossdive.db` from GitHub Releases (`db-latest`) to `~/.ossdive/ossdive.db`. Subsequent runs within 1 hour use the cached version.
