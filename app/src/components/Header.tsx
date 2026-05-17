import { openCli } from "../lib/api"

export function Header() {
  return (
    <div className="header">
      <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--icon-badge-bg)"/>
        <g transform="translate(32,32) scale(0.7) translate(-32,-32) translate(3.15,-0.14) rotate(30,32,26)">
          <path d="M10 33 C10 28 16 28 16 28 L48 28 Q56 28 56 33 Q56 39 48 39 L16 39 C10 39 10 33 10 33Z" fill="var(--icon-badge-fg)"/>
          <path d="M24 28 L24 19 Q24 17 26 17 L36 17 Q38 17 38 19 L38 28Z" fill="var(--icon-badge-fg)"/>
          <line x1="36" y1="17" x2="36" y2="11" stroke="var(--icon-badge-fg)" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="11" cy="33" r="3.5" fill="none" stroke="var(--icon-badge-fg)" strokeWidth="1.8"/>
          <line x1="11" y1="29.5" x2="11" y2="36.5" stroke="var(--icon-badge-fg)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="7.5" y1="33" x2="14.5" y2="33" stroke="var(--icon-badge-fg)" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      </svg>
      <span className="title">ossdive</span>
      <span className="spacer" />
      <button className="fcta" onClick={() => openCli()}>Open CLI ↗</button>
    </div>
  )
}
