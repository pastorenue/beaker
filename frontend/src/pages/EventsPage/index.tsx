import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { trackApi } from '../../services/api';
import { LoadingSpinner } from '../../components/Common';
import { useAccount } from '../../contexts/AccountContext';
import type { ActivityEvent } from '../../types';

// ─── types ────────────────────────────────────────────────────────────────────

type FilterKey = 'type' | 'name' | 'user' | 'url';
type ActiveFilter = { facet: FilterKey; value: string };
type FacetDef = { key: FilterKey; label: string; placeholder: string };
type DropdownItem =
    | { kind: 'facet'; facet: FacetDef }
    | { kind: 'suggestion'; value: string }
    | { kind: 'add'; value: string };

// ─── constants ────────────────────────────────────────────────────────────────

const tooltipStyles = {
    backgroundColor: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    color: 'var(--chart-tooltip-text)',
};

const PAGE_SIZE = 50;

const EVENT_TYPE_COLORS: Record<string, string> = {
    click: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    pageview: 'bg-green-500/20 text-green-300 border-green-500/30',
    custom: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const LINE_COLORS = [
    '#06b6d4', // cyan-500
    '#f59e0b', // amber-400
    '#8b5cf6', // violet-500
    '#10b981', // emerald-500
    '#f43f5e', // rose-500
    '#3b82f6', // blue-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
];

const TIME_RANGES = [
    { short: '1D',  label: 'Past 1 Day',   days: 1  },
    { short: '7D',  label: 'Past 7 Days',  days: 7  },
    { short: '14D', label: 'Past 14 Days', days: 14 },
    { short: '30D', label: 'Past 30 Days', days: 30 },
    { short: '90D', label: 'Past 90 Days', days: 90 },
];

const FACETS: FacetDef[] = [
    { key: 'type', label: 'Event type', placeholder: 'click, pageview, custom' },
    { key: 'name', label: 'Event name', placeholder: 'e.g. button_click'       },
    { key: 'user', label: 'User ID',    placeholder: 'e.g. usr_abc123'         },
    { key: 'url',  label: 'Page URL',   placeholder: 'e.g. /dashboard'         },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
}

function groupByDayPerName(
    events: ActivityEvent[],
    daysBack: number,
    names: string[],
): { date: string; [key: string]: number | string }[] {
    const now = new Date();
    const days: string[] = [];
    for (let i = daysBack - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    const counts: Record<string, Record<string, number>> = {};
    for (const day of days) {
        counts[day] = {};
        for (const name of names) counts[day][name] = 0;
    }
    for (const ev of events) {
        if (!names.includes(ev.event_name)) continue;
        const day = new Date(ev.timestamp).toISOString().slice(0, 10);
        if (day in counts) counts[day][ev.event_name]++;
    }
    return days.map(day => ({ date: day.slice(5), ...counts[day] }));
}

function groupByType(events: ActivityEvent[]): { type: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const ev of events) {
        counts[ev.event_type] = (counts[ev.event_type] ?? 0) + 1;
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([type, count]) => ({ type, count }));
}

/** Close a dropdown when clicking outside its ref element. */
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

function TimeRangePicker({
    daysBack,
    onChange,
}: {
    daysBack: number;
    onChange: (days: number) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    useClickOutside(ref, () => setOpen(false));

    const selected = TIME_RANGES.find((r) => r.days === daysBack) ?? TIME_RANGES[3];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[9px] text-sm hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            >
                <span className="font-mono text-xs font-bold text-cyan-400 tracking-wide">
                    {selected.short}
                </span>
                <span className="text-slate-500 text-xs select-none">|</span>
                <span className="text-slate-200 whitespace-nowrap">{selected.label}</span>
                <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[196px] overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 shadow-2xl">
                    <div className="border-b border-slate-800/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Time range
                    </div>
                    {TIME_RANGES.map((r) => (
                        <button
                            key={r.days}
                            onClick={() => { onChange(r.days); setOpen(false); }}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-slate-800/60 ${
                                daysBack === r.days
                                    ? 'text-cyan-400 bg-cyan-500/5'
                                    : 'text-slate-300'
                            }`}
                        >
                            <span className="w-8 font-mono text-xs font-bold">{r.short}</span>
                            <span>{r.label}</span>
                            {daysBack === r.days && (
                                <svg className="ml-auto h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function FacetSearchBar({
    activeFilters,
    onAdd,
    onRemove,
    onClearAll,
    suggestions,
}: {
    activeFilters: ActiveFilter[];
    onAdd: (facet: FilterKey, value: string) => void;
    onRemove: (facet: FilterKey) => void;
    onClearAll: () => void;
    suggestions: Record<FilterKey, string[]>;
}) {
    const [inputValue, setInputValue] = React.useState('');
    const [isOpen, setIsOpen]         = React.useState(false);
    const [highlightedIdx, setHighlightedIdx] = React.useState(-1);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef     = React.useRef<HTMLInputElement>(null);

    useClickOutside(containerRef, () => { setIsOpen(false); setHighlightedIdx(-1); });

    const parsed = parseInput(inputValue);

    const dropdownItems: DropdownItem[] = React.useMemo(() => {
        if (parsed.mode === 'facet') {
            const q = parsed.query.toLowerCase();
            return FACETS
                .filter(f => !q || f.key.includes(q) || f.label.toLowerCase().includes(q))
                .map(f => ({ kind: 'facet' as const, facet: f }));
        }
        // value mode
        const facetKey = parsed.facet as FilterKey;
        const isValid  = FACETS.some(f => f.key === facetKey);
        const suggs    = isValid ? (suggestions[facetKey] ?? []) : [];
        const q        = parsed.query.toLowerCase();
        const filtered: DropdownItem[] = suggs
            .filter(s => !q || s.toLowerCase().includes(q))
            .map(s => ({ kind: 'suggestion' as const, value: s }));
        if (parsed.query) {
            filtered.push({ kind: 'add', value: parsed.query });
        }
        return filtered;
    }, [parsed, suggestions]);

    // Reset highlight when items change
    React.useEffect(() => { setHighlightedIdx(-1); }, [inputValue]);

    const commitFilter = React.useCallback((facet: FilterKey, value: string) => {
        if (!value.trim()) return;
        onAdd(facet, value.trim());
        setInputValue('');
        setHighlightedIdx(-1);
        setIsOpen(true);
        // keep focus in input
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [onAdd]);

    const handleItemClick = React.useCallback((item: DropdownItem) => {
        if (item.kind === 'facet') {
            setInputValue(`${item.facet.key}:`);
            setHighlightedIdx(-1);
            inputRef.current?.focus();
        } else {
            // suggestion or add — parsed must be in value mode here
            if (parsed.mode === 'value') {
                commitFilter(parsed.facet as FilterKey, item.value);
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
                commitFilter(parsed.facet as FilterKey, parsed.query);
            } else if (parsed.mode === 'facet' && parsed.query) {
                const match = FACETS.find(f => f.key === parsed.query);
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

                {/* Text cursor */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeFilters.length === 0 ? 'Search by name or tags…' : ''}
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
}

// ─── main page ────────────────────────────────────────────────────────────────

export const EventsPage: React.FC = () => {
    const { activeAccountId } = useAccount();
    const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);
    const [daysBack, setDaysBack]           = React.useState(30);
    const [page, setPage]                   = React.useState(0);
    const [liveEnabled, setLiveEnabled]     = React.useState(true);

    const typeFilter = activeFilters.find(f => f.facet === 'type')?.value;
    const nameFilter = activeFilters.find(f => f.facet === 'name')?.value;

    React.useEffect(() => { setPage(0); }, [activeFilters, daysBack]);

    const queryParams = {
        event_type: typeFilter,
        event_name: nameFilter,
        days_back: daysBack,
        limit: 1000,
        offset: 0,
    };

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['events-all', activeAccountId, queryParams],
        queryFn: async () => (await trackApi.listAllEvents(queryParams)).data,
        enabled: !!activeAccountId,
        refetchInterval: liveEnabled ? 60_000 : false,
    });

    const events = data?.events ?? [];
    const total  = data?.total ?? 0;

    // Client-side filtering for user / url facets
    const filteredEvents = React.useMemo(() => {
        let result = events;
        for (const f of activeFilters) {
            if (f.facet === 'user') result = result.filter(ev => ev.user_id?.includes(f.value));
            if (f.facet === 'url')  result = result.filter(ev => ev.url.includes(f.value));
        }
        return result;
    }, [events, activeFilters]);

    // Value suggestions derived from the currently loaded (backend-filtered) events
    const valueSuggestions: Record<FilterKey, string[]> = React.useMemo(() => ({
        type: ['click', 'pageview', 'custom'],
        name: [...new Set(events.map(e => e.event_name))].slice(0, 20),
        user: [...new Set(events.map(e => e.user_id).filter((v): v is string => !!v))].slice(0, 20),
        url:  [...new Set(events.map(e => e.url))].slice(0, 20),
    }), [events]);

    const topEventNames = React.useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ev of filteredEvents) counts[ev.event_name] = (counts[ev.event_name] ?? 0) + 1;
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
    }, [filteredEvents]);

    const byDay = React.useMemo(
        () => groupByDayPerName(filteredEvents, daysBack, topEventNames),
        [filteredEvents, daysBack, topEventNames],
    );
    const byType = React.useMemo(() => groupByType(filteredEvents), [filteredEvents]);

    const pageCount  = Math.ceil(filteredEvents.length / PAGE_SIZE);
    const pageEvents = filteredEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const addFilter = React.useCallback((facet: FilterKey, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: FilterKey) => {
        setActiveFilters(prev => prev.filter(f => f.facet !== facet));
    }, []);

    const clearAllFilters = React.useCallback(() => setActiveFilters([]), []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-medium text-slate-100">Events</h2>
                <p className="mt-1 text-slate-400">
                    All tracked activity events across sessions for the active account.
                </p>
            </div>

            {/* ── Faceted filter toolbar ──────────────────────────────────────── */}
            <div className="space-y-2">
                {/* Row 1: facet search bar + time range + live toggle */}
                <div className="flex gap-2">
                    <FacetSearchBar
                        activeFilters={activeFilters}
                        onAdd={addFilter}
                        onRemove={removeFilter}
                        onClearAll={clearAllFilters}
                        suggestions={valueSuggestions}
                    />

                    {/* Time range picker */}
                    <TimeRangePicker daysBack={daysBack} onChange={setDaysBack} />

                    {/* Live / pause toggle */}
                    <button
                        onClick={() => { setLiveEnabled((v) => !v); if (!liveEnabled) refetch(); }}
                        title={liveEnabled ? 'Pause auto-refresh' : 'Resume auto-refresh'}
                        className={`flex items-center justify-center rounded-lg border px-3 py-[9px] transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                            liveEnabled
                                ? 'border-cyan-600/50 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20'
                                : 'border-slate-700/60 bg-slate-900/60 text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
                        }`}
                    >
                        {liveEnabled ? (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <rect x="6" y="5" width="4" height="14" rx="1" />
                                <rect x="14" y="5" width="4" height="14" rx="1" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <path d="M8 5.14v14l11-7-11-7z" />
                            </svg>
                        )}
                    </button>

                    {/* Manual refresh */}
                    <button
                        onClick={() => refetch()}
                        title="Refresh now"
                        className="flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[9px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 9A8 8 0 1 1 4 12" />
                        </svg>
                    </button>
                </div>

                {/* Row 2: count (chips now live inside the search bar) */}
                {!isLoading && (
                    <div className="flex items-center min-h-[20px]">
                        <span className="ml-auto text-xs text-slate-500">
                            {filteredEvents.length < total
                                ? `${filteredEvents.length.toLocaleString()} of ${total.toLocaleString()} event${total !== 1 ? 's' : ''}`
                                : `${total.toLocaleString()} event${total !== 1 ? 's' : ''}`
                            }
                        </span>
                    </div>
                )}
            </div>
            {/* ──────────────────────────────────────────────────────────────── */}

            {isLoading ? (
                <LoadingSpinner />
            ) : (
                <>
                    {/* Charts row */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="panel">
                            <p className="mb-3 text-sm font-medium text-slate-300">Events per day</p>
                            {filteredEvents.length === 0 ? (
                                <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                                    No events in range
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={byDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                                            interval={Math.floor(byDay.length / 5)}
                                        />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyles} />
                                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                                        {topEventNames.map((name, i) => (
                                            <Line
                                                key={name}
                                                type="monotone"
                                                dataKey={name}
                                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="panel">
                            <p className="mb-3 text-sm font-medium text-slate-300">Top event types</p>
                            {byType.length === 0 ? (
                                <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                                    No events in range
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={byType} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                        <XAxis dataKey="type" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyles} />
                                        <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="panel overflow-hidden p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="px-4 py-3">Event Name</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">User</th>
                                        <th className="px-4 py-3">URL</th>
                                        <th className="px-4 py-3">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {pageEvents.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                                                No events found
                                            </td>
                                        </tr>
                                    ) : (
                                        pageEvents.map((ev) => {
                                            const ts = new Date(ev.timestamp);
                                            const typeClass =
                                                EVENT_TYPE_COLORS[ev.event_type] ??
                                                'bg-slate-500/20 text-slate-300 border-slate-500/30';
                                            return (
                                                <tr
                                                    key={ev.event_id as unknown as string}
                                                    className="transition-colors hover:bg-slate-800/30"
                                                >
                                                    <td className="px-4 py-3">
                                                        <span className="rounded border border-slate-700/50 bg-slate-800/60 px-2 py-0.5 font-mono text-xs text-slate-200">
                                                            {ev.event_name}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeClass}`}>
                                                            {ev.event_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400">
                                                        {ev.user_id ? (
                                                            <span title={ev.user_id} className="block max-w-[120px] truncate">
                                                                {ev.user_id}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400">
                                                        <span title={ev.url} className="block max-w-[200px] truncate">
                                                            {ev.url}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400">
                                                        <span title={ts.toLocaleString()}>
                                                            {relativeTime(ts)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {pageCount > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3">
                                <span className="text-xs text-slate-500">
                                    Page {page + 1} of {pageCount} ({filteredEvents.length.toLocaleString()} loaded)
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                                        className="btn-secondary text-xs disabled:opacity-40"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        disabled={page >= pageCount - 1}
                                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                                        className="btn-secondary text-xs disabled:opacity-40"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default EventsPage;
