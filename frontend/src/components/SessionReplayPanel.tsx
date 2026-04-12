import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ActivityEvent, ReplayEvent, Session } from '../types';
import { experimentApi, trackApi, aiStrategistApi } from '../services/api';
import { ReplayPanel } from './session-replay/ReplayPanel';
import { SessionListPanel } from './session-replay/SessionListPanel';
import type { SessionActiveFilter, SessionFilterKey } from './session-replay/SessionFilters';
import { useAccount } from '../contexts/AccountContext';

const formatOffset = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const getPath = (url: string): string => {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
};

export function SessionReplayPanel() {
    const { activeAccountId } = useAccount();
    type HeatmapEvent = {
        x?: number;
        y?: number;
        metadata?: { screenWidth?: number; screenHeight?: number };
        [key: string]: unknown;
    };

    const replayLimit = 200;
    const SESSION_PAGE_SIZE = 20;
    const [sessions, setSessions] = React.useState<Session[]>([]);
    const [sessionsPage, setSessionsPage] = React.useState(0);
    const [sessionsTotalCount, setSessionsTotalCount] = React.useState(0);
    const [selectedSession, setSelectedSession] = React.useState<string | null>(null);
    const [replayEvents, setReplayEvents] = React.useState<ReplayEvent[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isLoadingSessions, setIsLoadingSessions] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'replay' | 'heatmap'>('replay');
    const [heatmapEvents, setHeatmapEvents] = React.useState<HeatmapEvent[]>([]);
    const [isLoadingHeatmap, setIsLoadingHeatmap] = React.useState(false);
    const [hasMoreReplay, setHasMoreReplay] = React.useState(true);
    const isLoadingSessionsRef = React.useRef(false);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
    const replayAbortRef = React.useRef<AbortController | null>(null);
    const replayOffsetRef = React.useRef(0);
    const heatmapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const heatmapContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [activeFilters, setActiveFilters] = React.useState<SessionActiveFilter[]>([]);

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments'],
        queryFn: () => experimentApi.list().then(r => r.data),
    });

    // Events drawer state
    const EVENTS_PAGE_SIZE = 20;
    const [eventsDrawerOpen, setEventsDrawerOpen] = React.useState(false);
    const [activityEvents, setActivityEvents] = React.useState<ActivityEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = React.useState(false);
    const [eventsPage, setEventsPage] = React.useState(0);

    // AI Journey state
    const [aiJourney, setAiJourney] = React.useState<string | null>(null);
    const [isGeneratingJourney, setIsGeneratingJourney] = React.useState(false);
    const [journeyError, setJourneyError] = React.useState<string | null>(null);

    const handleMissingSnapshot = React.useCallback(() => {
        setErrorMessage('Replay missing full snapshot. Start a new session to capture a snapshot.');
    }, []);

    const loadReplay = React.useCallback(
        async (sessionId: string, reset = false) => {
            setIsLoading(true);
            setErrorMessage(null);
            replayAbortRef.current?.abort();
            const controller = new AbortController();
            replayAbortRef.current = controller;
            try {
                const offset = reset ? 0 : replayOffsetRef.current;
                const replayResponse = await trackApi.getReplay(sessionId, replayLimit, offset, controller.signal);
                const replayData = replayResponse.data as ReplayEvent[];
                setReplayEvents((prev) => (reset ? replayData : [...prev, ...replayData]));
                const nextOffset = offset + replayData.length;
                replayOffsetRef.current = nextOffset;
                setHasMoreReplay(replayData.length === replayLimit);
            } catch (error) {
                const err = error as { name?: string };
                if (err?.name !== 'CanceledError') {
                    setErrorMessage('Replay data failed to load. Try refreshing or reduce the session size.');
                }
            } finally {
                setIsLoading(false);
            }
        },
        [replayLimit],
    );

    const loadSessions = React.useCallback(async (page: number) => {
        if (isLoadingSessionsRef.current) return;
        isLoadingSessionsRef.current = true;
        setIsLoadingSessions(true);
        try {
            const response = await trackApi.listSessions(SESSION_PAGE_SIZE, page * SESSION_PAGE_SIZE);
            const payload = response.data;
            setSessions(payload.sessions);
            setSessionsTotalCount(payload.total);
            setSessionsPage(page);
        } catch (error) {
            setErrorMessage('Failed to load sessions.');
        } finally {
            isLoadingSessionsRef.current = false;
            setIsLoadingSessions(false);
        }
    }, [SESSION_PAGE_SIZE]);

    React.useEffect(() => {
        loadSessions(0);
    }, [loadSessions, activeAccountId]);

    React.useEffect(() => {
        if (selectedSession) {
            setReplayEvents([]);
            replayOffsetRef.current = 0;
            setHasMoreReplay(true);
            loadReplay(selectedSession, true);
        }
    }, [selectedSession, loadReplay]);

    React.useEffect(() => {
        if (!selectedSession || viewMode !== 'heatmap') {
            return;
        }
        const loadHeatmap = async () => {
            setIsLoadingHeatmap(true);
            try {
                const response = await trackApi.listEvents(selectedSession, 'click', 2000);
                setHeatmapEvents(
                    response.data.map((event: ActivityEvent): HeatmapEvent => ({
                        x: event.x,
                        y: event.y,
                        metadata: event.metadata as HeatmapEvent['metadata'],
                    })),
                );
            } catch (error) {
                setErrorMessage('Failed to load heatmap data.');
            } finally {
                setIsLoadingHeatmap(false);
            }
        };
        loadHeatmap();
    }, [selectedSession, viewMode]);

    React.useEffect(() => {
        if (!heatmapCanvasRef.current || !heatmapContainerRef.current || !heatmapEvents.length) {
            return;
        }
        const canvas = heatmapCanvasRef.current;
        const container = heatmapContainerRef.current;

        const renderHeatmap = () => {
            const rect = container.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return;
            }
            canvas.width = Math.floor(rect.width);
            canvas.height = Math.floor(rect.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            heatmapEvents.forEach((event) => {
                const x = event.x ?? 0;
                const y = event.y ?? 0;
                const meta = event.metadata || {};
                const sw = meta.screenWidth || canvas.width;
                const sh = meta.screenHeight || canvas.height;
                const px = (x / sw) * canvas.width;
                const py = (y / sh) * canvas.height;
                const radius = 18;
                const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
                gradient.addColorStop(0, 'rgba(45, 212, 191, 0.35)');
                gradient.addColorStop(1, 'rgba(45, 212, 191, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        };

        renderHeatmap();
        const resizeObserver = new ResizeObserver(renderHeatmap);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [heatmapEvents]);

    const getFeatureGate = (session: Session): string | undefined => {
        const meta = session.metadata as Record<string, unknown> | undefined;
        const value =
            meta?.feature_gate ??
            meta?.featureGate ??
            meta?.feature_gate_id ??
            meta?.gate ??
            undefined
            ;
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return undefined;
    };

    const addFilter = React.useCallback((facet: SessionFilterKey, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: SessionFilterKey) => {
        setActiveFilters(prev => prev.filter(f => f.facet !== facet));
    }, []);

    const clearAllFilters = React.useCallback(() => setActiveFilters([]), []);

    const filterSuggestions: Record<SessionFilterKey, string[]> = React.useMemo(() => ({
        status:     ['live', 'completed'],
        session:    [],
        user:       Array.from(new Set(sessions.map(s => s.user_id).filter((v): v is string => !!v))).slice(0, 20),
        gate:       Array.from(new Set(sessions.map(s => getFeatureGate(s)).filter((v): v is string => !!v))).slice(0, 20),
        experiment: experiments.map(e => e.name),
    }), [sessions, experiments]);

    const filteredSessions = sessions.filter((session) => {
        for (const f of activeFilters) {
            if (f.facet === 'status') {
                const isLive = !session.ended_at;
                if (f.value === 'live' && !isLive) return false;
                if (f.value === 'completed' && isLive) return false;
            }
            if (f.facet === 'session' && !session.session_id.toLowerCase().includes(f.value.toLowerCase())) return false;
            if (f.facet === 'user' && !(session.user_id || '').toLowerCase().includes(f.value.toLowerCase())) return false;
            if (f.facet === 'gate') {
                const gate = getFeatureGate(session) || '';
                if (!gate.toLowerCase().includes(f.value.toLowerCase())) return false;
            }
            if (f.facet === 'experiment') {
                const expId = experiments.find(e => e.name === f.value)?.id;
                if (expId && session.experiment_id !== expId) return false;
            }
        }
        return true;
    });

    const replayRenderKey = `${selectedSession ?? 'none'}`;
    const selected = sessions.find((session) => session.session_id === selectedSession);
    const getUrl = (url?: string) => (url && url.trim().length > 0 ? url : 'unknown');

    const handleCopySessionId = async (sessionId: string, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(sessionId);
            setCopiedSessionId(sessionId);
            window.setTimeout(() => {
                setCopiedSessionId((prev) => (prev === sessionId ? null : prev));
            }, 1200);
        } catch (error) {
            console.warn('Failed to copy session id', error);
        }
    };

    const handleCloseDrawer = () => {
        setSelectedSession(null);
        setReplayEvents([]);
        replayOffsetRef.current = 0;
        setEventsDrawerOpen(false);
        setActivityEvents([]);
    };

    const handleOpenEventsDrawer = async () => {
        if (!selectedSession) return;
        setEventsPage(0);
        setAiJourney(null);
        setJourneyError(null);
        setEventsDrawerOpen(true);
        setIsLoadingEvents(true);
        try {
            const res = await trackApi.listEvents(selectedSession, undefined, 2000);
            setActivityEvents(res.data);
        } finally {
            setIsLoadingEvents(false);
        }
    };

    const handleGenerateJourney = async () => {
        if (!selected || sortedActivityEvents.length === 0) return;
        setIsGeneratingJourney(true);
        setJourneyError(null);
        setAiJourney(null);
        try {
            const sessionStartMs = new Date(selected.started_at).getTime();
            const events = sortedActivityEvents.map((e) => ({
                offset_seconds: (new Date(e.timestamp).getTime() - sessionStartMs) / 1000,
                event_name: e.event_name,
                event_type: e.event_type,
                url: e.url,
                selector: e.selector,
                x: e.x,
                y: e.y,
            }));
            const res = await aiStrategistApi.summarizeSession({
                session_id: selected.session_id,
                user_id: selected.user_id,
                entry_url: selected.entry_url,
                referrer: selected.referrer,
                user_agent: selected.user_agent,
                duration_seconds: selected.duration_seconds,
                started_at: selected.started_at,
                events,
            });
            setAiJourney(res.data.journey);
        } catch {
            setJourneyError('Failed to generate journey. Check that the AI service is configured.');
        } finally {
            setIsGeneratingJourney(false);
        }
    };

    const sortedActivityEvents = React.useMemo(
        () => [...activityEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
        [activityEvents],
    );

    const totalEventPages = Math.ceil(sortedActivityEvents.length / EVENTS_PAGE_SIZE);
    const paginatedEvents = sortedActivityEvents.slice(
        eventsPage * EVENTS_PAGE_SIZE,
        (eventsPage + 1) * EVENTS_PAGE_SIZE,
    );

    const sessionStartMs = selected ? new Date(selected.started_at).getTime() : 0;

    const CHART_COLORS = ['#2dd4bf', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399', '#fbbf24'];

    const eventsOverTime = React.useMemo(() => {
        const eventNames = Array.from(new Set(sortedActivityEvents.map((e) => e.event_name)));
        const buckets = new Map<number, Record<string, number>>();
        for (const event of sortedActivityEvents) {
            const bucket = Math.floor(new Date(event.timestamp).getTime() / 10000) * 10000;
            if (!buckets.has(bucket)) buckets.set(bucket, {});
            const b = buckets.get(bucket)!;
            b[event.event_name] = (b[event.event_name] ?? 0) + 1;
        }
        const data = Array.from(buckets.entries())
            .sort(([a], [b]) => a - b)
            .map(([ts, counts]) => ({
                time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                ...counts,
            }));
        return { data, eventNames };
    }, [sortedActivityEvents]);

    return (
        <div>
            <SessionListPanel
                filteredSessions={filteredSessions}
                selectedSession={selectedSession}
                onSelectSession={setSelectedSession}
                onRefreshSessions={() => loadSessions(0)}
                isLoadingSessions={isLoadingSessions}
                sessionsPage={sessionsPage}
                totalSessionPages={Math.ceil(sessionsTotalCount / SESSION_PAGE_SIZE)}
                onGoToPage={loadSessions}
                copiedSessionId={copiedSessionId}
                onCopySessionId={handleCopySessionId}
                getUrl={getUrl}
                activeFilters={activeFilters}
                onAddFilter={addFilter}
                onRemoveFilter={removeFilter}
                onClearAllFilters={clearAllFilters}
                filterSuggestions={filterSuggestions}
            />

            {/* Replay drawer */}
            <div
                className={`fixed top-0 right-0 z-50 h-full w-3/4 bg-slate-900 border-l border-slate-700/60 shadow-2xl flex flex-col transition-transform duration-300 ${
                    selectedSession ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Drawer header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 shrink-0">
                    <div>
                        <p className="text-sm font-semibold text-slate-100">Session Replay</p>
                        {selected && (
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">{selected.session_id}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="btn-secondary text-xs px-3 h-8"
                            onClick={handleOpenEventsDrawer}
                        >
                            View Events
                        </button>
                        <button
                            className="btn-secondary h-8 w-8 p-0"
                            onClick={handleCloseDrawer}
                            aria-label="Close replay"
                        >
                            <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Drawer body */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4">
                    <ReplayPanel
                        selectedSession={selected}
                        selectedSessionId={selectedSession}
                        replayEvents={replayEvents}
                        viewMode={viewMode}
                        onToggleViewMode={() => setViewMode(viewMode === 'replay' ? 'heatmap' : 'replay')}
                        isLoading={isLoading}
                        hasMoreReplay={hasMoreReplay}
                        onLoadMoreReplay={() => loadReplay(selectedSession!, false)}
                        replayRenderKey={replayRenderKey}
                        onMissingSnapshot={handleMissingSnapshot}
                        heatmapContainerRef={heatmapContainerRef}
                        heatmapCanvasRef={heatmapCanvasRef}
                        heatmapEvents={heatmapEvents}
                        isLoadingHeatmap={isLoadingHeatmap}
                        errorMessage={errorMessage}
                    />
                </div>
            </div>

            {/* Events drawer */}
            <div
                className={`fixed top-0 right-0 z-[60] h-full w-2/3 bg-slate-950 border-l border-slate-700/60 shadow-2xl flex flex-col transition-transform duration-300 ${
                    eventsDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 shrink-0">
                    <p className="text-sm font-semibold text-slate-100">Activity Events</p>
                    <button
                        className="btn-secondary h-8 w-8 p-0"
                        onClick={() => setEventsDrawerOpen(false)}
                        aria-label="Close events"
                    >
                        <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* Table section */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-auto px-6 pt-6">
                            {isLoadingEvents ? (
                                <div className="flex items-center justify-center py-12">
                                    <svg className="animate-spin h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                </div>
                            ) : sortedActivityEvents.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-12">No events recorded for this session.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-slate-950">
                                            <tr className="text-left text-xs text-slate-400 border-b border-slate-700/60">
                                                <th className="px-3 py-2 font-medium">Time</th>
                                                <th className="px-3 py-2 font-medium">Event Name</th>
                                                <th className="px-3 py-2 font-medium">Type</th>
                                                <th className="px-3 py-2 font-medium">URL</th>
                                                <th className="px-3 py-2 font-medium">Position</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedEvents.map((event) => {
                                                const offsetMs = new Date(event.timestamp).getTime() - sessionStartMs;
                                                const hasPosition = event.x != null && event.y != null;
                                                return (
                                                    <tr
                                                        key={event.event_id}
                                                        className="border-b border-slate-700/30 hover:bg-slate-900/50"
                                                    >
                                                        <td className="px-3 py-2 font-mono text-xs text-slate-400 whitespace-nowrap">
                                                            {formatOffset(offsetMs)}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-200">
                                                            {event.event_name}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700/60">
                                                                {event.event_type}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="max-w-[240px] truncate block text-slate-400 text-xs font-mono">
                                                                {getPath(event.url)}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap text-slate-400 text-xs">
                                                            {hasPosition ? `${event.x}, ${event.y}` : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Pagination bar */}
                        {totalEventPages > 1 && (
                            <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-slate-700/60">
                                <span className="text-xs text-slate-400">
                                    Page {eventsPage + 1} of {totalEventPages} · {sortedActivityEvents.length} events
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        className="btn-secondary h-7 px-2 text-xs"
                                        onClick={() => setEventsPage((p) => p - 1)}
                                        disabled={eventsPage === 0}
                                    >← Prev</button>
                                    <button
                                        className="btn-secondary h-7 px-2 text-xs"
                                        onClick={() => setEventsPage((p) => p + 1)}
                                        disabled={eventsPage === totalEventPages - 1}
                                    >Next →</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Journey section */}
                    {!isLoadingEvents && sortedActivityEvents.length > 0 && (
                        <div className="shrink-0 border-t border-slate-700/60 px-6 py-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                                    </svg>
                                    <span className="text-xs font-semibold text-slate-200">AI User Journey</span>
                                </div>
                                <button
                                    className="flex items-center gap-1.5 rounded-lg border border-violet-800/40 bg-violet-800/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500/20 hover:text-violet-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleGenerateJourney}
                                    disabled={isGeneratingJourney}
                                >
                                    {isGeneratingJourney ? (
                                        <>
                                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                            Generating…
                                        </>
                                    ) : aiJourney ? 'Regenerate' : 'Generate Journey'}
                                </button>
                            </div>
                            {journeyError && (
                                <p className="text-xs text-red-400">{journeyError}</p>
                            )}
                            {aiJourney && (
                                <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 max-h-64 overflow-y-auto">
                                    {aiJourney.split('\n\n').map((para, i) => (
                                        <p
                                            key={i}
                                            className={`text-sm text-slate-300 leading-relaxed${i > 0 ? ' mt-3' : ''}`}
                                            dangerouslySetInnerHTML={{ __html: para }}
                                        />
                                    ))}
                                </div>
                            )}
                            {!aiJourney && !isGeneratingJourney && !journeyError && (
                                <p className="text-xs text-slate-500">
                                    Generate an AI-powered narrative of this user's session based on their events and timeline.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Chart section */}
                    {!isLoadingEvents && eventsOverTime.data.length > 0 && (
                        <div className="shrink-0 h-72 border-t border-slate-700/60 px-4 pt-3 pb-6">
                            <p className="text-xs text-slate-400 mb-2">Events over time</p>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={eventsOverTime.data} margin={{ top: 4, right: 8, bottom: 48, left: 0 }}>
                                    <CartesianGrid vertical={false} stroke="#1e293b" />
                                    <XAxis
                                        dataKey="time"
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        interval="preserveStartEnd"
                                        angle={-30}
                                        textAnchor="end"
                                    />
                                    <YAxis
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                        width={28}
                                    />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--chart-tooltip-text)' }}
                                        labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                                        cursor={{ stroke: 'rgba(128,128,128,0.15)', strokeWidth: 1 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }} />
                                    {eventsOverTime.eventNames.map((name, i) => (
                                        <Line
                                            key={name}
                                            type="monotone"
                                            dataKey={name}
                                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4 }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
