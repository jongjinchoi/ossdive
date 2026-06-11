export interface Project {
  id: number
  github_url: string
  repo_name: string
  description: string | null
  language: string | null
  license: string | null
  stars: number
  forks: number
  open_issues: number
  last_commit_at: string | null
  hn_title: string
  hn_score: number
  hn_comments: number
  hn_url: string
  is_show_hn: boolean
  hn_created_at: string | null
  collected_at: string
  updated_at: string
}

export interface LangCount {
  lang: string
  count: number
}

export interface DateRange {
  first: string
  last: string
}

export interface Stats {
  total: number
  show_hn_count: number
  by_language: LangCount[]
  top5_stars: { repo_name: string; stars: number }[]
  collected_at_range: DateRange | null
}

export type SortField = 'hn_score' | 'stars' | 'last_commit_at' | 'collected_at' | 'hn_created_at'

export interface ListOpts {
  sort_by?: SortField
  query?: string
  filter?: string
  limit?: number
}

export type SyncStatus = 'fresh' | 'cached' | 'updated' | 'offline' | 'missing' | 'syncing'
