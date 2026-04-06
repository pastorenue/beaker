import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MetricsTable } from './MetricsTable';
import type { ExperimentGroupPairForOutput } from './types';

type Experiment = { id: string; status: string };

type SimulationOutputProps = {
    simulationSeries: Array<{ time: string; ts: number; [key: string]: string | number }>;
    filteredSeries: Array<{ time: string; ts: number; [key: string]: string | number }>;
    rangeStart: string;
    rangeEnd: string;
    setRangeStart: (value: string) => void;
    setRangeEnd: (value: string) => void;
    pickerOpen: 'start' | 'end' | null;
    setPickerOpen: (value: 'start' | 'end' | null) => void;
    pickerPos: { top: number; left: number } | null;
    setPickerPos: (value: { top: number; left: number } | null) => void;
    pickerRef: React.RefObject<HTMLDivElement>;
    startRef: React.RefObject<HTMLButtonElement>;
    endRef: React.RefObject<HTMLButtonElement>;
    pickerMonth: Date;
    setPickerMonth: (value: Date) => void;
    pickerValue: Date;
    setPickerValue: (value: Date) => void;
    renderCalendar: () => React.ReactNode;
    hours: number[];
    minutes: number[];
    applyPickerValue: (value: Date) => void;
    selectedExperiment: Experiment | null;
    experimentGroupPairs: ExperimentGroupPairForOutput[];
    hasMultipleExperiments: boolean;
    metricsSummary: Array<{
        id: string;
        label: string;
        groupName: string;
        experimentName: string;
        baseline: { rate: number; assign: number; conv: number };
        variation: { rate: number; assign: number; conv: number };
        lift: number;
        chanceToWin: number;
        pValue: number;
    }>;
    isSimulating: boolean;
    isPaused: boolean;
    flowConnected: boolean;
    isFlowReady: boolean;
    getGroupVariantKey: (groupId: string, variant: string) => string;
};

export const SimulationOutput: React.FC<SimulationOutputProps> = ({
    simulationSeries,
    filteredSeries,
    rangeStart,
    rangeEnd,
    setRangeStart,
    setRangeEnd,
    pickerOpen,
    setPickerOpen,
    pickerPos,
    setPickerPos,
    pickerRef,
    startRef,
    endRef,
    pickerMonth,
    setPickerMonth,
    pickerValue,
    setPickerValue,
    renderCalendar,
    hours,
    minutes,
    applyPickerValue,
    selectedExperiment,
    experimentGroupPairs,
    hasMultipleExperiments,
    metricsSummary,
    isSimulating,
    isPaused,
    flowConnected,
    isFlowReady,
    getGroupVariantKey,
}) => {
    return (
        <div className="simulation-output flow-surface mt-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
            <div className="mb-3 flex items-center justify-between text-xs title text-slate-500">
                <span>Simulation Output</span>
                <span
                    className={
                        isSimulating ? 'text-emerald-300' : isPaused ? 'text-amber-300' : 'text-slate-500'
                    }
                >
                    {isSimulating ? 'Running' : isPaused ? 'Paused' : ''}
                </span>
            </div>
            <div className="relative mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                    <span className="title text-slate-500">From</span>
                    <button
                        ref={startRef}
                        className="flow-pill rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs text-slate-200"
                        onClick={(event) => {
                            const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setPickerPos({ top: rect.bottom + 8, left: rect.left });
                            setPickerOpen('start');
                        }}
                    >
                        {rangeStart ? rangeStart.replace('T', ' ') : 'Select datetime'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="title text-slate-500">To</span>
                    <button
                        ref={endRef}
                        className="flow-pill rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs text-slate-200"
                        onClick={(event) => {
                            const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setPickerPos({ top: rect.bottom + 8, left: rect.left });
                            setPickerOpen('end');
                        }}
                    >
                        {rangeEnd ? rangeEnd.replace('T', ' ') : 'Select datetime'}
                    </button>
                </div>
                <button
                    className="btn-secondary"
                    onClick={() => {
                        setRangeStart('');
                        setRangeEnd('');
                    }}
                >
                    Clear
                </button>

                {pickerOpen && pickerPos && (
                    <div
                        ref={pickerRef}
                        className="flow-surface fixed z-50 w-[320px] rounded-2xl border border-slate-800/70 bg-slate-950/95 p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.9)]"
                        style={{ top: pickerPos.top, left: pickerPos.left }}
                    >
                        <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                            <button
                                className="btn-secondary"
                                onClick={() =>
                                    setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))
                                }
                            >
                                ◀
                            </button>
                            <span className="text-xs font-semibold text-slate-400">
                                {pickerMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                                className="btn-secondary"
                                onClick={() =>
                                    setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))
                                }
                            >
                                ▶
                            </button>
                        </div>
                        {renderCalendar()}
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <div className="text-[0.55rem] text-slate-500">Hour</div>
                                <select
                                    value={pickerValue.getHours()}
                                    onChange={(event) => {
                                        const next = new Date(pickerValue);
                                        next.setHours(Number(event.target.value));
                                        setPickerValue(next);
                                        applyPickerValue(next);
                                    }}
                                    className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-2 py-1 text-xs text-slate-200"
                                >
                                    {hours.map((hour) => (
                                        <option key={hour} value={hour}>
                                            {String(hour).padStart(2, '0')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[0.55rem] text-slate-500">Minute</div>
                                <select
                                    value={pickerValue.getMinutes() - (pickerValue.getMinutes() % 3)}
                                    onChange={(event) => {
                                        const next = new Date(pickerValue);
                                        next.setMinutes(Number(event.target.value));
                                        setPickerValue(next);
                                        applyPickerValue(next);
                                    }}
                                    className="w-full rounded-lg border border-slate-800/70 bg-slate-950/70 px-2 py-1 text-xs text-slate-200"
                                >
                                    {minutes.map((minute) => (
                                        <option key={minute} value={minute}>
                                            {String(minute).padStart(2, '0')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    if (pickerOpen === 'start') {
                                        setRangeStart('');
                                    } else {
                                        setRangeEnd('');
                                    }
                                    setPickerOpen(null);
                                }}
                            >
                                Clear
                            </button>
                            <div className="flex items-center gap-2">
                                <button className="btn-secondary" onClick={() => setPickerOpen(null)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={() => {
                                        applyPickerValue(pickerValue);
                                        setPickerOpen(null);
                                    }}
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {simulationSeries.length === 0 ? (
                <p className="text-sm text-slate-400">
                    {selectedExperiment?.status === 'stopped'
                        ? 'Selected experiment is stopped. Duplicate or create a new experiment to simulate.'
                        : flowConnected && !isFlowReady
                        ? 'Complete Start → Experiment → User Group → Metric → Run to start streaming.'
                        : 'Connect the Run trigger to start streaming results.'}
                </p>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {experimentGroupPairs.map((pair) => (
                            <div key={`${pair.experimentId}-${pair.groupId}`} className="flow-surface rounded-xl border border-slate-800/70 bg-slate-950/70 p-3">
                                <div className="mb-2 text-[0.65rem] font-semibold text-slate-400">
                                    {hasMultipleExperiments ? `${pair.experimentName} / ${pair.groupName}` : pair.groupName}
                                </div>
                                <div className="h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={filteredSeries}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                            <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                                    borderRadius: '12px',
                                                    color: '#e2e8f0',
                                                    fontSize: '11px',
                                                }}
                                            />
                                            {pair.variants.map((variant, variantIdx) => (
                                                <Line
                                                    key={`${pair.groupId}-${variant.name}`}
                                                    type="monotone"
                                                    dataKey={getGroupVariantKey(pair.groupId, variant.name)}
                                                    stroke={variantIdx % 2 === 0 ? '#38bdf8' : '#34d399'}
                                                    strokeWidth={2}
                                                    name={variant.name}
                                                    dot={false}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ))}
                    </div>
                    {isFlowReady && (isSimulating || isPaused) && metricsSummary.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-[0.65rem] font-semibold text-slate-500">Metrics (live)</div>
                            <MetricsTable rows={metricsSummary} hasMultipleExperiments={hasMultipleExperiments} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
