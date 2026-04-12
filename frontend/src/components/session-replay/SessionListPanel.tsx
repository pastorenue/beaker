import React from 'react';
import type { Session } from '../../types';
import { SessionFilters } from './SessionFilters';
import type { SessionActiveFilter, SessionFilterKey } from './SessionFilters';

type SessionListPanelProps = {
    filteredSessions: Session[];
    selectedSession: string | null;
    onSelectSession: (sessionId: string) => void;
    onRefreshSessions: () => void;
    isLoadingSessions: boolean;
    sessionsPage: number;
    totalSessionPages: number;
    onGoToPage: (page: number) => void;
    copiedSessionId: string | null;
    onCopySessionId: (sessionId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
    getUrl: (value?: string) => string;
    activeFilters: SessionActiveFilter[];
    onAddFilter: (facet: SessionFilterKey, value: string) => void;
    onRemoveFilter: (facet: SessionFilterKey) => void;
    onClearAllFilters: () => void;
    filterSuggestions: Record<SessionFilterKey, string[]>;
};

const formatRelativeTime = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const SessionListPanel: React.FC<SessionListPanelProps> = ({
    filteredSessions,
    selectedSession,
    onSelectSession,
    onRefreshSessions,
    isLoadingSessions,
    sessionsPage,
    totalSessionPages,
    onGoToPage,
    copiedSessionId,
    onCopySessionId,
    getUrl,
    activeFilters,
    onAddFilter,
    onRemoveFilter,
    onClearAllFilters,
    filterSuggestions,
}) => {
    return (
        <div className="card session-panel session-panel--list">
            <div className="session-panel-header">
                <div>
                    <h3>Sessions</h3>
                    <p>Pick a session to replay and inspect activity.</p>
                </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex gap-2 px-3 pb-3">
                <SessionFilters
                    activeFilters={activeFilters}
                    onAdd={onAddFilter}
                    onRemove={onRemoveFilter}
                    onClearAll={onClearAllFilters}
                    suggestions={filterSuggestions}
                />
                <button
                    className="flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[9px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/40 shrink-0"
                    onClick={onRefreshSessions}
                    title="Refresh sessions"
                    aria-label="Refresh sessions"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 9A8 8 0 1 1 4 12" />
                    </svg>
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                        <tr className="text-left text-xs text-slate-400 border-b border-slate-700/60">
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Session ID</th>
                            <th className="px-3 py-2 font-medium">Entry URL</th>
                            <th className="px-3 py-2 font-medium">Started</th>
                            <th className="px-3 py-2 font-medium">Duration</th>
                            <th className="px-3 py-2 font-medium text-right">Events</th>
                            <th className="px-3 py-2 font-medium text-right">Clicks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSessions.map((session) => {
                            const isLive = !session.ended_at;
                            const isSelected = session.session_id === selectedSession;
                            return (
                                <tr
                                    key={session.session_id}
                                    className={`cursor-pointer border-b border-slate-700/30 transition-colors ${
                                        isSelected
                                            ? 'bg-slate-800'
                                            : 'hover:bg-slate-800/50'
                                    }`}
                                    onClick={() => onSelectSession(session.session_id)}
                                >
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        {isLive ? (
                                            <span className="flex items-center gap-1.5 text-emerald-400">
                                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                                Live
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-slate-400">
                                                <span className="inline-block w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                                                Done
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono text-xs text-slate-300 truncate max-w-[120px]">
                                                {session.session_id}
                                            </span>
                                            <button
                                                type="button"
                                                className={`session-copy shrink-0 ${copiedSessionId === session.session_id ? 'is-copied' : ''}`}
                                                onClick={(e) => onCopySessionId(session.session_id, e)}
                                                aria-label="Copy session id"
                                                title="Copy session id"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h10v10H9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className="max-w-[200px] truncate block text-slate-300">
                                            {getUrl(session.entry_url)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">
                                        {formatRelativeTime(session.started_at)}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">
                                        {formatDuration(session.duration_seconds)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-slate-400">
                                        {session.replay_events_count ?? 0}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-slate-400">
                                        {session.clicks_count ?? 0}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!filteredSessions.length && (
                    <div className="session-empty">No sessions yet.</div>
                )}
            </div>

            {totalSessionPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-700/60 px-4 py-3">
                    <span className="text-xs text-slate-500">
                        Page {sessionsPage + 1} of {totalSessionPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            className="btn-secondary text-xs disabled:opacity-40"
                            onClick={() => onGoToPage(sessionsPage - 1)}
                            disabled={sessionsPage === 0 || isLoadingSessions}
                        >
                            Prev
                        </button>
                        <button
                            className="btn-secondary text-xs disabled:opacity-40"
                            onClick={() => onGoToPage(sessionsPage + 1)}
                            disabled={sessionsPage >= totalSessionPages - 1 || isLoadingSessions}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
