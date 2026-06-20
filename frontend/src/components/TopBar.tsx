import { useEffect, useRef, useState } from "react";

import { useLocationSearch } from "../hooks/useLocationSearch";
import type { UserLocation } from "../types/parking";
import type { SearchResult, SearchSuggestion } from "../types/search";

interface TopBarProps {
  location: UserLocation | null;
  onSelectResult: (result: SearchResult) => void;
  // Bumped by a parent (e.g. the Sidebar's empty-state "Search Nearby"
  // button) to imperatively focus the search input from outside.
  focusSignal?: number;
  placeholder?: string;
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-textMuted"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ResultRow({
  suggestion,
  onSelect,
}: {
  suggestion: SearchSuggestion;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="truncate text-sm font-bold text-textPrimary">{suggestion.name}</span>
      {suggestion.full_address && (
        <span className="truncate text-xs text-textMuted">{suggestion.full_address}</span>
      )}
    </button>
  );
}

export function TopBar({
  location,
  onSelectResult,
  focusSignal,
  placeholder = "Search for parking…",
}: TopBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const { suggestions, loading, error, retrieve } = useLocationSearch(query, location);
  const [showSearchError, setShowSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // Surface a transient inline notice on failure; auto-dismiss after 3s so
  // it doesn't linger and block the user from continuing to search.
  useEffect(() => {
    if (!error) return;
    setShowSearchError(true);
    const timer = setTimeout(() => setShowSearchError(false), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const trimmedQuery = query.trim();
  // Mirrors useLocationSearch's own 2-char minimum — below that it never
  // calls the API, so the dropdown should stay silently closed, not show
  // a "no results" message for a query that was never searched.
  const showDropdown = isOpen && trimmedQuery.length >= 2 && !error;

  const handleSelect = async (suggestion: SearchSuggestion) => {
    setIsOpen(false);
    setRetrieving(true);
    const result = await retrieve(suggestion.mapbox_id);
    setRetrieving(false);
    if (result) {
      setQuery(result.name);
      onSelectResult(result);
    }
  };

  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/98 via-background/60 to-transparent" />

      <div className="relative px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-glass sm:gap-4 sm:px-4 sm:py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-glow sm:h-12 sm:w-12">
            <svg
              width="24"
              height="24"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 24V8H17C20.3137 8 23 10.6863 23 14C23 17.3137 20.3137 20 17 20H11"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="hidden shrink-0 flex-col leading-tight sm:flex">
            <span className="text-lg font-bold tracking-tight text-textPrimary">
              Park<span className="text-primary">Smart</span>
            </span>
            <span className="text-[11px] text-textMuted">
              Smart parking, hands-free
            </span>
          </div>

          <div className="relative flex-1">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setIsOpen(false)}
              placeholder={placeholder}
              className="w-full rounded-full border border-white/8 bg-black/50 py-3 pl-11 pr-5 text-sm text-textPrimary shadow-inner shadow-black/40 placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/50 sm:text-sm"
            />
            {(loading || retrieving) && <Spinner />}

            {showSearchError && (
              <p className="absolute left-1 top-full mt-1.5 text-xs text-red-400">
                Search unavailable — try again
              </p>
            )}

            {showDropdown && (
              <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-white/8 bg-surface p-1.5 shadow-2xl shadow-black/60 backdrop-blur-glass">
                {suggestions.length === 0 && !loading && (
                  <p className="px-3 py-2.5 text-xs text-textMuted">
                    No results found for &quot;{trimmedQuery}&quot;.
                  </p>
                )}
                {suggestions.map((s) => (
                  <ResultRow key={s.mapbox_id} suggestion={s} onSelect={() => handleSelect(s)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
