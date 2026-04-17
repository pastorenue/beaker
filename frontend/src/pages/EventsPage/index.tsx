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
import { experimentApi, trackApi } from '../../services/api';
import { LoadingSpinner } from '../../components/Common';
import { useAccount } from '../../contexts/AccountContext';
import { FacetSearchBar, type FacetDef, type ActiveFilter } from '../../components/FacetSearchBar';

// ─── types ────────────────────────────────────────────────────────────────────

type TimeRange =
    | { type: 'preset'; days: number }
    | { type: 'custom'; from: string; to: string };


// ─── constants ────────────────────────────────────────────────────────────────

const tooltipStyles = {
    backgroundColor: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    color: 'var(--chart-tooltip-text)',
};

const PAGE_SIZE = 20;

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
    { key: 'type',       label: 'Event type', placeholder: 'click, pageview, custom' },
    { key: 'name',       label: 'Event name', placeholder: 'e.g. button_click'       },
    { key: 'user',       label: 'User ID',    placeholder: 'e.g. usr_abc123'         },
    { key: 'url',        label: 'Page URL',   placeholder: 'e.g. /dashboard'         },
    { key: 'experiment', label: 'Experiment', placeholder: 'e.g. My Experiment'      },
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

// ─── sub-components ───────────────────────────────────────────────────────────

function TimeRangePicker({
    value,
    onChange,
}: {
    value: TimeRange;
    onChange: (v: TimeRange) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [showCustom, setShowCustom] = React.useState(false);
    const [customFrom, setCustomFrom] = React.useState(value.type === 'custom' ? value.from : '');
    const [customTo, setCustomTo]     = React.useState(value.type === 'custom' ? value.to : '');
    const ref = React.useRef<HTMLDivElement>(null);
    useClickOutside(ref, () => { setOpen(false); setShowCustom(false); });

    React.useEffect(() => {
        if (value.type === 'custom') { setCustomFrom(value.from); setCustomTo(value.to); }
    }, [value]);

    const isCustom      = value.type === 'custom';
    const selectedPreset = value.type === 'preset' ? TIME_RANGES.find((r) => r.days === value.days) ?? TIME_RANGES[3] : null;

    const applyCustom = () => {
        if (customFrom && customTo) { onChange({ type: 'custom', from: customFrom, to: customTo }); setOpen(false); setShowCustom(false); }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[9px] text-sm hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            >
                {isCustom ? (
                    <>
                        <span className="font-mono text-xs font-bold text-cyan-400 tracking-wide">Custom</span>
                        <span className="text-slate-500 text-xs select-none">|</span>
                        <span className="text-slate-200 whitespace-nowrap">{value.from} → {value.to}</span>
                    </>
                ) : (
                    <>
                        <span className="font-mono text-xs font-bold text-cyan-400 tracking-wide">{selectedPreset?.short}</span>
                        <span className="text-slate-500 text-xs select-none">|</span>
                        <span className="text-slate-200 whitespace-nowrap">{selectedPreset?.label}</span>
                    </>
                )}
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
                <div className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[220px] overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 shadow-2xl">
                    <div className="border-b border-slate-800/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Time range
                    </div>
                    {!showCustom ? (
                        <>
                            {TIME_RANGES.map((r) => (
                                <button
                                    key={r.days}
                                    onClick={() => { onChange({ type: 'preset', days: r.days }); setOpen(false); }}
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-slate-800/60 ${
                                        value.type === 'preset' && value.days === r.days
                                            ? 'text-cyan-400 bg-cyan-500/5'
                                            : 'text-slate-300'
                                    }`}
                                >
                                    <span className="w-8 font-mono text-xs font-bold">{r.short}</span>
                                    <span>{r.label}</span>
                                    {value.type === 'preset' && value.days === r.days && (
                                        <svg className="ml-auto h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                            <button
                                onClick={() => setShowCustom(true)}
                                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-slate-800/60 ${
                                    isCustom ? 'text-cyan-400 bg-cyan-500/5' : 'text-slate-300'
                                }`}
                            >
                                <span className="w-8 font-mono text-xs font-bold">—</span>
                                <span>Custom</span>
                                {isCustom && (
                                    <svg className="ml-auto h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </>
                    ) : (
                        <div className="p-3 space-y-2">
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wide">From</label>
                                <input
                                    type="date"
                                    value={customFrom}
                                    onChange={(e) => setCustomFrom(e.target.value)}
                                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wide">To</label>
                                <input
                                    type="date"
                                    value={customTo}
                                    onChange={(e) => setCustomTo(e.target.value)}
                                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowCustom(false)}
                                    className="flex-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={applyCustom}
                                    disabled={!customFrom || !customTo}
                                    className="flex-1 rounded border border-cyan-600/50 bg-cyan-600/10 px-2 py-1 text-xs text-cyan-400 hover:bg-cyan-600/20 disabled:opacity-40"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── main page ────────────────────────────────────────────────────────────────

export const EventsPage: React.FC = () => {
    const { activeAccountId } = useAccount();
    const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);
    const [timeRange, setTimeRange]         = React.useState<TimeRange>({ type: 'preset', days: 30 });
    const [page, setPage]                   = React.useState(0);
    const [liveEnabled, setLiveEnabled]     = React.useState(true);

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments'],
        queryFn: () => experimentApi.list().then(r => r.data),
    });

    const typeFilter           = activeFilters.find(f => f.facet === 'type')?.value;
    const nameFilter           = activeFilters.find(f => f.facet === 'name')?.value;
    const experimentNameFilter = activeFilters.find(f => f.facet === 'experiment')?.value;
    const experimentId         = experiments.find(e => e.name === experimentNameFilter)?.id;

    React.useEffect(() => { setPage(0); }, [activeFilters, timeRange]);

    const timeParams = timeRange.type === 'preset'
        ? { days_back: timeRange.days }
        : { from_date: timeRange.from, to_date: timeRange.to };

    const queryParams = {
        event_type: typeFilter,
        event_name: nameFilter,
        ...timeParams,
        limit: 1000,
        offset: 0,
        experiment_id: experimentId,
    };

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['events-all', activeAccountId, queryParams],
        queryFn: async () => (await trackApi.listAllEvents(queryParams)).data,
        enabled: !!activeAccountId,
        refetchInterval: liveEnabled ? 60_000 : false,
    });

    const chartQueryParams = {
        event_type: typeFilter,
        event_name: nameFilter,
        ...timeParams,
        experiment_id: experimentId,
    };

    const { data: dailyCounts = [] } = useQuery({
        queryKey: ['events-daily', activeAccountId, chartQueryParams],
        queryFn: async () => (await trackApi.dailyEventCounts(chartQueryParams)).data,
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
    const valueSuggestions = React.useMemo(() => ({
        type:       ['click', 'pageview', 'custom'],
        name:       [...new Set(events.map(e => e.event_name))].slice(0, 20),
        user:       [...new Set(events.map(e => e.user_id).filter((v): v is string => !!v))].slice(0, 20),
        url:        [...new Set(events.map(e => e.url))].slice(0, 20),
        experiment: experiments.map(e => e.name),
    }), [events, experiments]);

    const topEventNames = React.useMemo(() => {
        const totals: Record<string, number> = {};
        for (const row of dailyCounts) totals[row.event_name] = (totals[row.event_name] ?? 0) + row.count;
        return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
    }, [dailyCounts]);

    const byDay = React.useMemo(() => {
        let days: string[];
        if (timeRange.type === 'preset') {
            const now = new Date();
            days = [];
            for (let i = timeRange.days - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                days.push(d.toISOString().slice(0, 10));
            }
        } else {
            days = [];
            const current = new Date(timeRange.from);
            const end     = new Date(timeRange.to);
            while (current <= end) {
                days.push(current.toISOString().slice(0, 10));
                current.setDate(current.getDate() + 1);
            }
        }
        const counts: Record<string, Record<string, number>> = {};
        for (const day of days) counts[day] = {};
        const allNames = new Set(topEventNames);
        for (const day of days)
            for (const name of allNames) counts[day][name] = 0;
        for (const row of dailyCounts) {
            if (row.day in counts) counts[row.day][row.event_name] = row.count;
        }
        return days.map(day => ({ date: day.slice(5), ...counts[day] }));
    }, [dailyCounts, timeRange, topEventNames]);

    const byType = React.useMemo(() => {
        const totals: Record<string, number> = {};
        for (const row of dailyCounts) totals[row.event_type] = (totals[row.event_type] ?? 0) + row.count;
        return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => ({ type, count }));
    }, [dailyCounts]);

    const pageCount  = Math.ceil(filteredEvents.length / PAGE_SIZE);
    const pageEvents = filteredEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const addFilter = React.useCallback((facet: string, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: string) => {
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
                        facets={FACETS}
                        activeFilters={activeFilters}
                        onAdd={addFilter}
                        onRemove={removeFilter}
                        onClearAll={clearAllFilters}
                        suggestions={valueSuggestions}
                        placeholder="Filter by type, name, user, or URL…"
                    />

                    {/* Time range picker */}
                    <TimeRangePicker value={timeRange} onChange={setTimeRange} />

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
                            {dailyCounts.length === 0 ? (
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
                                    <tr className="border-b border-slate-800/60 text-left text-xs capitalize tracking-wide text-slate-500">
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
                                                        <span className="rounded border border-slate-500/50 bg-slate-300/60 px-2 py-0.5 font-mono text-xs text-slate-200">
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
