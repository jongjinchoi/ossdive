import { openUrl } from "@tauri-apps/plugin-opener"
import type { Project } from "../lib/types"
import { formatRelative, fmt } from "../lib/format"

interface Props {
  project: Project
}

export function ProjectItem({ project: p }: Props) {
  const [owner, repo] = p.repo_name.includes("/")
    ? p.repo_name.split("/", 2)
    : ["", p.repo_name]

  function openGitHub(e: React.MouseEvent) {
    e.stopPropagation()
    openUrl(p.github_url)
  }

  function openHN(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    openUrl(p.hn_url)
  }

  return (
    <div className="item" onClick={openGitHub}>
      <div className="row1">
        <span className="repo">{owner ? <><span className="owner">{owner}/</span>{repo}</> : repo}</span>
        {p.is_show_hn && <span className="show-hn-badge">Show HN</span>}
        <span className="spacer-flex" />
        <span className="stars">★ {fmt(p.stars)}</span>
      </div>
      {p.description && (
        <div className="row2">
          <span className="desc">{p.description}</span>
        </div>
      )}
      <div className="row3">
        {p.language && <span className="m">{p.language}</span>}
        {p.language && <span className="mdot">·</span>}
        <span className="m">{formatRelative(p.hn_created_at)}</span>
        <a
          className="hn-link"
          href={p.hn_url}
          onClick={openHN}
        >
          HN {p.hn_score.toLocaleString()} pts · {p.hn_comments.toLocaleString()} comments ↗
        </a>
      </div>
    </div>
  )
}
