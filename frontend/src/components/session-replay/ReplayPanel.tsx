import React from 'react';
import type { ReplayEvent, Session } from '../../types';
import { ReplayViewport } from './ReplayViewport';

type HeatmapEvent = { [key: string]: unknown };

type ReplayPanelProps = {
    selectedSession: Session | undefined;
    selectedSessionId: string | null;
    replayEvents: ReplayEvent[];
    viewMode: 'replay' | 'heatmap';
    onToggleViewMode: () => void;
    isLoading: boolean;
    hasMoreReplay: boolean;
    onLoadMoreReplay: () => void;
    replayRenderKey: string;
    onMissingSnapshot: () => void;
    heatmapContainerRef: React.RefObject<HTMLDivElement>;
    heatmapCanvasRef: React.RefObject<HTMLCanvasElement>;
    heatmapEvents: HeatmapEvent[];
    isLoadingHeatmap: boolean;
    errorMessage: string | null;
};

export const ReplayPanel: React.FC<ReplayPanelProps> = ({
    selectedSession,
    selectedSessionId,
    replayEvents,
    viewMode,
    onToggleViewMode,
    isLoading,
    hasMoreReplay,
    onLoadMoreReplay,
    replayRenderKey,
    onMissingSnapshot,
    heatmapContainerRef,
    heatmapCanvasRef,
    heatmapEvents,
    isLoadingHeatmap,
    errorMessage,
}) => {
    return (
        <div className="card session-panel session-panel--replay">
            <div className="session-panel-header">
                <div>
                    <h3>Replay</h3>
                    <p>
                        {selectedSession ? `Session ${selectedSession.session_id.slice(0, 8)}` : 'Pick a session'}
                        {selectedSession?.user_id ? ` · ${selectedSession.user_id}` : ''}
                        {replayEvents.length > 0 ? ` · ${replayEvents.length} events` : ''}
                    </p>
                </div>
                <div className="session-status-row">
                    <div
                        className={`session-status ${
                            viewMode === 'replay' ? 'session-status--replay' : 'session-status--heatmap'
                        }`}
                    >
                        {isLoading ? 'Loading' : viewMode === 'replay' ? 'Live capture' : 'Heatmap'}
                    </div>
                    <button
                        type="button"
                        className={`session-toggle ${viewMode === 'replay' ? 'is-replay' : 'is-heatmap'}`}
                        onClick={onToggleViewMode}
                        aria-pressed={viewMode === 'replay'}
                        title={viewMode === 'replay' ? 'Switch to heatmap' : 'Switch to replay'}
                    >
                        <span className="session-toggle-thumb" />
                    </button>
                </div>
            </div>
            <div className="session-replay is-ready">
                {viewMode === 'replay' && (
                    <>
                        {replayEvents.length > 0 && replayEvents[0]?.type === 2 && (
                            <ReplayViewport
                                key={replayRenderKey}
                                replayEvents={replayEvents}
                                onMissingSnapshot={onMissingSnapshot}
                            />
                        )}
                        {replayEvents.length === 0 && !isLoading && (
                            <div className="session-empty session-empty--center">No replay data yet.</div>
                        )}
                    </>
                )}
                {viewMode === 'heatmap' && (
                    <div className="custom-display-container" ref={heatmapContainerRef}>
                        <canvas ref={heatmapCanvasRef} />
                        {!heatmapEvents.length && !isLoadingHeatmap && (
                            <div className="session-empty session-empty--center">No heatmap data yet.</div>
                        )}
                        {isLoadingHeatmap && <div className="session-empty">Loading heatmap...</div>}
                    </div>
                )}
            </div>
            {hasMoreReplay && replayEvents.length > 0 && selectedSessionId && (
                <button className="btn-secondary session-load-more" onClick={onLoadMoreReplay}>
                    Load more replay events
                </button>
            )}
            {errorMessage && <div className="session-error">{errorMessage}</div>}
        </div>
    );
};
