interface HeaderProps {
  count: number
}

export function Header({ count }: HeaderProps) {
  return (
    <div className="header">
      <span className="title">ossriff</span>
      {count > 0 && <span className="count">{count}</span>}
      <span className="spacer" />
    </div>
  )
}
