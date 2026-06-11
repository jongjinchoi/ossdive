import { useState, useEffect, useRef } from "react"
import type { LangCount } from "../lib/types"

const TOP_LANGS = 2

function langToKey(lang: string): string {
  return lang === "C/C++" ? "c" : lang.toLowerCase()
}

interface FilterChipsProps {
  languages: LangCount[]
  filter: string
  onChange: (f: string) => void
}

export function FilterChips({ languages, filter, onChange }: FilterChipsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const top = languages.slice(0, TOP_LANGS)
  const rest = languages.slice(TOP_LANGS)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  function select(key: string) {
    onChange(key)
    setDropdownOpen(false)
  }

  return (
    <div className="filters-wrap" ref={wrapRef}>
      <div className="filters-row">
        <div className="filters">
          <button
            className={`chip${filter === "all" ? " active" : ""}`}
            onClick={() => select("all")}
          >
            All
          </button>
          {top.map(({ lang, count }) => {
            const key = langToKey(lang)
            return (
              <button
                key={key}
                className={`chip${filter === key ? " active" : ""}`}
                onClick={() => select(key)}
              >
                {lang} <span style={{ opacity: 0.4 }}>{count}</span>
              </button>
            )
          })}
        </div>
        {rest.length > 0 && (
          <button
            className="more-btn"
            onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o) }}
          >
            +{rest.length} more ▾
          </button>
        )}
      </div>
      {dropdownOpen && rest.length > 0 && (
        <div className="lang-dropdown">
          {rest.map(({ lang, count }) => (
            <div
              key={lang}
              className="lang-dropdown-item"
              onClick={() => select(langToKey(lang))}
            >
              {lang}
              <span className="dlang-count">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
