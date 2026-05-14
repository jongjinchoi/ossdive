interface SearchBarProps {
  value: string
  onChange: (v: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-row">
      <div className="search-wrap">
        <svg className="search-ico" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Search projects…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}
