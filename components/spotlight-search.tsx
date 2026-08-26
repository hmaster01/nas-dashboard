'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

type SpotlightSearchProps = {
  value: string
  onChange: (value: string) => void
  /** Fired on Enter when no service matches — used for the web-search fallback. */
  onSubmit: () => void
  resultCount: number
}

export function SpotlightSearch({ value, onChange, onSubmit, resultCount }: SpotlightSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K focuses the field, Escape clears it — the usual Spotlight reflexes.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const trimmed = value.trim()

  return (
    <div className="group relative flex items-center gap-3 rounded-2xl bg-white/4 px-4 py-3 ring-1 ring-white/10 backdrop-blur-2xl transition-[background-color,box-shadow] duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] focus-within:bg-white/7 focus-within:ring-sky-300/30 focus-within:shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
      <Search
        className="size-4 shrink-0 text-white/35 transition-colors duration-500 group-focus-within:text-sky-300"
        strokeWidth={2}
      />

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Don't submit while a CJK IME is still composing the input.
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') onSubmit()
          if (event.key === 'Escape') onChange('')
        }}
        placeholder="Dienste durchsuchen oder im Web suchen …"
        aria-label="Dienste durchsuchen oder im Web suchen"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {trimmed ? (
        <>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/30">
            {resultCount} Treffer
          </span>
          <button
            type="button"
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            aria-label="Suche löschen"
            className="grid size-6 shrink-0 place-items-center rounded-full bg-white/8 text-white/50 transition-colors duration-300 hover:bg-white/14 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </>
      ) : (
        <kbd className="hidden shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-white/40 sm:block">
          ⌘K
        </kbd>
      )}
    </div>
  )
}
