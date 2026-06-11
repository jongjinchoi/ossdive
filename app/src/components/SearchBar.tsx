import { useState, useEffect, useRef } from "react"
import type { SortField } from "../lib/types"

const SORT_OPTIONS: { key: SortField; label: string }[] = [
  { key: "hn_created_at",  label: "Newest" },
  { key: "hn_score",       label: "HN Score" },
  { key: "stars",          label: "Stars" },
  { key: "last_commit_at", label: "Last Commit" },
]

interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  sort: SortField
  onSortChange: (s: SortField) => void
}

export function SearchBar({ value, onChange, sort, onSortChange }: SearchBarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort"

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

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
      <div className="sort-wrap" ref={sortRef}>
        <button
          className="sort-btn"
          onClick={(e) => { e.stopPropagation(); setSortOpen((o) => !o) }}
        >
          {sortLabel} ▾
        </button>
        {sortOpen && (
          <div className="sort-dropdown">
            {SORT_OPTIONS.map((o) => (
              <div
                key={o.key}
                className={`lang-dropdown-item${sort === o.key ? " active" : ""}`}
                onClick={() => { onSortChange(o.key); setSortOpen(false) }}
              >
                {o.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
