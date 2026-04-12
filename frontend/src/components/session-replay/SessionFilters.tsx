import React from 'react';

// ─── types ────────────────────────────────────────────────────────────────────

export type SessionFilterKey = 'status' | 'session' | 'user' | 'gate';
export type SessionActiveFilter = { facet: SessionFilterKey; value: string };

type FacetDef = { key: SessionFilterKey; label: string; placeholder: string };
type DropdownItem =
    | { kind: 'facet'; facet: FacetDef }
    | { kind: 'suggestion'; value: string }
    | { kind: 'add'; value: string };

// ─── constants ────────────────────────────────────────────────────────────────

const SESSION_FACETS: FacetDef[] = [
    { key: 'status',  label: 'Status',       placeholder: 'live, completed'  },
    { key: 'session', label: 'Session ID',   placeholder: 'e.g. abc123'      },
    { key: 'user',    label: 'User ID',      placeholder: 'e.g. usr_abc123'  },
    { key: 'gate',    label: 'Feature Gate', placeholder: 'e.g. my_flag'     },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [ref, onClose]);
}

function parseInput(input: string):
    | { mode: 'facet'; query: string }
    | { mode: 'value'; facet: string; query: string } {
    const colonIdx = input.indexOf(':');
    if (colonIdx === -1) return { mode: 'facet', query: input };
    return { mode: 'value', facet: input.slice(0, colonIdx), query: input.slice(colonIdx + 1) };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function FilterChip({
    prefix,
    value,
    onRemove,
}: {
    prefix: string;
    value: string;
    onRemove: () => void;
}) {
    return (
        <span className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-300 flex-shrink-0">
            <span className="text-cyan-500/60">{prefix}:</span>
            {value}
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="ml-0.5 leading-none text-cyan-400/50 hover:text-cyan-200 transition-colors"
                aria-label={`Remove ${prefix}:${value} filter`}
            >
                ×
            </button>
        </span>
    );
}

// ─── main component ───────────────────────────────────────────────────────────

type SessionFiltersProps = {
    activeFilters: SessionActiveFilter[];
    onAdd: (facet: SessionFilterKey, value: string) => void;
    onRemove: (facet: SessionFilterKey) => void;
    onClearAll: () => void;
    suggestions: Record<SessionFilterKey, string[]>;
};

export const SessionFilters: React.FC<SessionFiltersProps> = ({
    activeFilters,
    onAdd,
    onRemove,
    onClearAll,
    suggestions,
}) => {
    const [inputValue, setInputValue] = React.useState('');
    const [isOpen, setIsOpen] = React.useState(false);
    const [highlightedIdx, setHighlightedIdx] = React.useState(-1);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    useClickOutside(containerRef, () => { setIsOpen(false); setHighlightedIdx(-1); });

    const parsed = parseInput(inputValue);

    const dropdownItems: DropdownItem[] = React.useMemo(() => {
        if (parsed.mode === 'facet') {
            const q = parsed.query.toLowerCase();
            return SESSION_FACETS
                .filter(f => !q || f.key.includes(q) || f.label.toLowerCase().includes(q))
                .map(f => ({ kind: 'facet' as const, facet: f }));
        }
        const facetKey = parsed.facet as SessionFilterKey;
        const isValid = SESSION_FACETS.some(f => f.key === facetKey);
        const suggs = isValid ? (suggestions[facetKey] ?? []) : [];
        const q = parsed.query.toLowerCase();
        const filtered: DropdownItem[] = suggs
            .filter(s => !q || s.toLowerCase().includes(q))
            .map(s => ({ kind: 'suggestion' as const, value: s }));
        if (parsed.query) {
            filtered.push({ kind: 'add', value: parsed.query });
        }
        return filtered;
    }, [parsed, suggestions]);

    React.useEffect(() => { setHighlightedIdx(-1); }, [inputValue]);

    const commitFilter = React.useCallback((facet: SessionFilterKey, value: string) => {
        if (!value.trim()) return;
        onAdd(facet, value.trim());
        setInputValue('');
        setHighlightedIdx(-1);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [onAdd]);

    const handleItemClick = React.useCallback((item: DropdownItem) => {
        if (item.kind === 'facet') {
            setInputValue(`${item.facet.key}:`);
            setHighlightedIdx(-1);
            inputRef.current?.focus();
        } else {
            if (parsed.mode === 'value') {
                commitFilter(parsed.facet as SessionFilterKey, item.value);
            }
        }
    }, [parsed, commitFilter]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIdx(i => Math.min(i + 1, dropdownItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIdx(i => Math.max(i - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIdx >= 0 && highlightedIdx < dropdownItems.length) {
                handleItemClick(dropdownItems[highlightedIdx]);
            } else if (parsed.mode === 'value' && parsed.query) {
                commitFilter(parsed.facet as SessionFilterKey, parsed.query);
            } else if (parsed.mode === 'facet' && parsed.query) {
                const match = SESSION_FACETS.find(f => f.key === parsed.query);
                if (match) { setInputValue(`${match.key}:`); setHighlightedIdx(-1); }
            }
        } else if (e.key === 'Backspace' && inputValue === '' && activeFilters.length > 0) {
            onRemove(activeFilters[activeFilters.length - 1].facet);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setInputValue('');
            setHighlightedIdx(-1);
        }
    };

    const showDropdown = isOpen && dropdownItems.length > 0;

    return (
        <div className="relative flex-1" ref={containerRef}>
            {/* Tag-input container */}
            <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[7px] min-h-[42px] transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 cursor-text"
                onClick={() => { inputRef.current?.focus(); setIsOpen(true); }}
            >
                {/* Search icon */}
                <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 flex-shrink-0 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>

                {/* Active filter chips */}
                {activeFilters.map(f => (
                    <FilterChip
                        key={f.facet}
                        prefix={f.facet}
                        value={f.value}
                        onRemove={() => onRemove(f.facet)}
                    />
                ))}

                {/* Text input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeFilters.length === 0 ? 'Filter sessions…' : ''}
                    className="min-w-[120px] flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none py-0.5"
                />

                {/* Clear button */}
                {(inputValue || activeFilters.length > 0) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setInputValue('');
                            if (activeFilters.length > 0) onClearAll();
                        }}
                        className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Clear all filters"
                    >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {showDropdown && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 shadow-2xl">
                    <div className="sticky top-0 border-b border-slate-800/60 bg-slate-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        {parsed.mode === 'facet' ? 'Filter by' : `${parsed.facet}:`}
                    </div>
                    {dropdownItems.map((item, idx) => (
                        <button
                            key={idx}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleItemClick(item)}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                                idx === highlightedIdx
                                    ? 'bg-slate-800/80 text-slate-100'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                            }`}
                        >
                            {item.kind === 'facet' ? (
                                <>
                                    <span className="w-10 font-mono text-xs text-cyan-400/80">{item.facet.key}</span>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-slate-300">{item.facet.label}</span>
                                    <span className="ml-auto text-[10px] text-slate-600">{item.facet.placeholder}</span>
                                </>
                            ) : item.kind === 'suggestion' ? (
                                <span>{item.value}</span>
                            ) : (
                                <>
                                    <span className="text-slate-500 text-xs">↵ Add</span>
                                    <span className="font-mono text-xs text-cyan-300/80">
                                        {parsed.mode === 'value' ? `${parsed.facet}:${item.value}` : item.value}
                                    </span>
                                </>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
