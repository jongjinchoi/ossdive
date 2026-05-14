export interface HNPost {
  objectID: string
  title: string
  url: string
  points: number
  num_comments: number
  created_at: string
  created_at_i: number
  author: string
  _tags: string[]
}

export interface GitHubRepo {
  html_url: string
  full_name: string
  description: string | null
  language: string | null
  license: { spdx_id: string } | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  pushed_at: string
  topics: string[]
}

export interface Project {
  id?: number
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
  collected_at?: string
  updated_at?: string
}
