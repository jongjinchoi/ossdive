import { openCli } from "../lib/api"

export function Header() {
  return (
    <div className="header">
      <span className="title">ossriff</span>
      <span className="spacer" />
      <button className="fcta" onClick={() => openCli()}>Open CLI ↗</button>
    </div>
  )
}
