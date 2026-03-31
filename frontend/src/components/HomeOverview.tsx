import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { experimentApi, featureGateApi } from '../services/api';
import { LoadingSpinner } from './Common';
import { ExperimentStatus } from '../types';
import type { Experiment, FeatureGate } from '../types';
import { useAccount } from '../contexts/AccountContext';

const tooltipStyles = {
    backgroundColor: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    color: 'var(--chart-tooltip-text)',
};

const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

const buildWeeks = (count: number) => {
    const now = new Date();
    const currentWeek = startOfWeek(now);
    return Array.from({ length: count }, (_, index) => {
        const start = new Date(currentWeek);
        start.setDate(start.getDate() - (count - 1 - index) * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
    });
};

const isActiveInWeek = (experiment: Experiment, weekStart: Date, weekEnd: Date) => {
    if (experiment.status !== ExperimentStatus.Running) return false;
    const start = new Date(experiment.start_date || experiment.created_at);
    const end = experiment.end_date ? new Date(experiment.end_date) : new Date();
    return start < weekEnd && end >= weekStart;
};

export const HomeOverview: React.FC = () => {
    const { activeAccountId } = useAccount();
    const [timeframe, setTimeframe] = React.useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const { data: experiments = [], isLoading: experimentsLoading } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => (await experimentApi.list()).data,
        enabled: !!activeAccountId,
    });

    const { data: gates = [], isLoading: gatesLoading } = useQuery({
        queryKey: ['featureGates', activeAccountId],
        queryFn: async () => (await featureGateApi.list()).data,
        enabled: !!activeAccountId,
    });

    const buckets = React.useMemo(() => {
        if (timeframe === 'daily') {
            return Array.from({ length: 14 }, (_, index) => {
                const end = new Date();
                end.setHours(0, 0, 0, 0);
                const start = new Date(end);
                start.setDate(start.getDate() - (13 - index));
                const next = new Date(start);
                next.setDate(next.getDate() + 1);
                return { start, end: next };
            });
        }
        if (timeframe === 'monthly') {
            return Array.from({ length: 6 }, (_, index) => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
                const end = new Date(now.getFullYear(), now.getMonth() - (5 - index) + 1, 1);
                return { start, end };
            });
        }
        return buildWeeks(8);
    }, [timeframe]);

    const labelFormatter = React.useMemo(
        () =>
            timeframe === 'monthly'
                ? new Intl.DateTimeFormat('en-US', { month: 'short' })
                : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
        [timeframe],
    );

    const experimentSeries = React.useMemo(() => {
        return buckets.map(({ start, end }) => {
            const created = experiments.filter((exp) => {
                const createdAt = new Date(exp.created_at);
                return createdAt >= start && createdAt < end;
            }).length;
            const active = experiments.filter((exp) => isActiveInWeek(exp, start, end)).length;
            return {
                week: labelFormatter.format(start),
                created,
                active,
            };
        });
    }, [buckets, experiments, labelFormatter]);

    const gateSeries = React.useMemo(() => {
        return buckets.map(({ start, end }) => {
            const created = gates.filter((gate: FeatureGate) => {
                const createdAt = new Date(gate.created_at);
                return createdAt >= start && createdAt < end;
            }).length;
            return {
                week: labelFormatter.format(start),
                gates: created,
            };
        });
    }, [buckets, gates, labelFormatter]);

    const latestWeek = experimentSeries[experimentSeries.length - 1];
    const prevWeek = experimentSeries[experimentSeries.length - 2];
    const latestGates = gateSeries[gateSeries.length - 1];
    const prevGates = gateSeries[gateSeries.length - 2];

    const trendMeta = (current?: number, previous?: number) => {
        if (current === undefined || previous === undefined) {
            return { label: '—', className: 'text-slate-300', direction: 'neutral' as const };
        }
        const diff = current - previous;
        return {
            label: `${diff >= 0 ? '+' : ''}${diff}`,
            className: diff >= 0 ? 'text-emerald-400' : 'text-rose-400',
            badgeClass: diff >= 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15',
            direction: diff >= 0 ? ('up' as const) : ('down' as const),
        };
    };

    if (experimentsLoading || gatesLoading) {
        return <LoadingSpinner fullHeight />;
    }

    const activeTrend = trendMeta(latestWeek?.active, prevWeek?.active);
    const createdTrend = trendMeta(latestWeek?.created, prevWeek?.created);
    const gateTrend = trendMeta(latestGates?.gates, prevGates?.gates);

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <p className="text-xs text-slate-400">Welcome back</p>
                <h1 className="mt-2">Home</h1>
                <p className="mt-1 text-slate-400">Weekly pulse of experiment velocity and feature gate activity.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1.4fr_0.9fr]">
                <div className="card">
                    <div className="flex items-center justify-between">
                        <h3>Experiments ({timeframe[0].toUpperCase() + timeframe.slice(1)})</h3>
                        <div className="flex items-center gap-2">
                            <span className="badge-gray">Active vs Created</span>
                            <div className="flex items-center rounded-full border border-slate-800/70 bg-slate-900/60 p-1 text-[0.65rem] font-semibold text-slate-300">
                                {(['daily', 'weekly', 'monthly'] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setTimeframe(value)}
                                        className={`rounded-full px-2 py-1 transition ${timeframe === value ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        {value.slice(0, 1).toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={experimentSeries} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyles} />
                                <Line type="monotone" dataKey="active" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="created" stroke="#a855f7" strokeWidth={1.5} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center justify-between">
                        <h3>Feature Gates ({timeframe[0].toUpperCase() + timeframe.slice(1)})</h3>
                        <div className="flex items-center gap-2">
                            <span className="badge-gray">Created gates</span>
                            <div className="flex items-center rounded-full border border-slate-800/70 bg-slate-900/60 p-1 text-[0.65rem] font-semibold text-slate-300">
                                {(['daily', 'weekly', 'monthly'] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setTimeframe(value)}
                                        className={`rounded-full px-2 py-1 transition ${timeframe === value ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        {value.slice(0, 1).toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gateSeries} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyles} />
                                <Bar dataKey="gates" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card sticky top-6 self-start">
                    <div className="flex items-center justify-between">
                        <h3>Metrics Pulse</h3>
                        <span className="badge-gray">
                            {timeframe === 'daily' ? 'Today' : timeframe === 'monthly' ? 'This month' : 'This week'}
                        </span>
                    </div>
                    <div className="mt-4 space-y-4 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">Active experiments</span>
                            <span className="font-semibold text-slate-100">{latestWeek?.active ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>WoW change</span>
                            <span className={`badge ${activeTrend.className} ${activeTrend.badgeClass} border-transparent px-2 py-1 text-[0.65rem]`}>
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d={
                                            activeTrend.direction === 'down'
                                                ? 'M4 6l6 6 4-4 6 6'
                                                : 'M4 18l6-6 4 4 6-6'
                                        }
                                    />
                                </svg>
                                {activeTrend.label}
                            </span>
                        </div>
                        <div className="soft-divider" />
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">Created experiments</span>
                            <span className="font-semibold text-slate-100">{latestWeek?.created ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>WoW change</span>
                            <span className={`badge ${createdTrend.className} ${createdTrend.badgeClass} border-transparent px-2 py-1 text-[0.65rem]`}>
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d={
                                            createdTrend.direction === 'down'
                                                ? 'M4 6l6 6 4-4 6 6'
                                                : 'M4 18l6-6 4 4 6-6'
                                        }
                                    />
                                </svg>
                                {createdTrend.label}
                            </span>
                        </div>
                        <div className="soft-divider" />
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">Feature gates created</span>
                            <span className="font-semibold text-slate-100">{latestGates?.gates ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>WoW change</span>
                            <span className={`badge ${gateTrend.className} ${gateTrend.badgeClass} border-transparent px-2 py-1 text-[0.65rem]`}>
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d={
                                            gateTrend.direction === 'down'
                                                ? 'M4 6l6 6 4-4 6 6'
                                                : 'M4 18l6-6 4 4 6-6'
                                        }
                                    />
                                </svg>
                                {gateTrend.label}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
