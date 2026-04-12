import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { experimentApi } from '../../services/api';
import type { VariantActivityBucket } from '../../types';

type PivotedBucket = {
    time: string;
    [eventName: string]: string | number;
};

const EVENT_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15'];

function pivotByEventName(
    rows: VariantActivityBucket[],
    variant: string,
): PivotedBucket[] {
    const filtered = rows.filter((r) => r.variant === variant);
    const byBucket = new Map<number, PivotedBucket>();
    for (const row of filtered) {
        if (!byBucket.has(row.bucket)) {
            const label = new Date(row.bucket * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            byBucket.set(row.bucket, { time: label });
        }
        const entry = byBucket.get(row.bucket)!;
        const prev = (entry[row.event_name] as number | undefined) ?? 0;
        entry[row.event_name] = prev + row.event_count;
    }
    return Array.from(byBucket.entries())
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry);
}

type Props = {
    experimentId: string;
    variants: string[];
    tooltipStyles: React.CSSProperties;
};

export const VariantEventsChart: React.FC<Props> = ({
    experimentId,
    variants,
    tooltipStyles,
}) => {
    const [selectedVariant, setSelectedVariant] = useState<string>(
        variants[0] ?? '',
    );

    const { data, isLoading } = useQuery({
        queryKey: ['variant-activity', experimentId],
        queryFn: () =>
            experimentApi.variantActivity(experimentId).then((r) => r.data),
        staleTime: 30_000,
    });

    const eventNames = useMemo(() => {
        if (!data) return [];
        return Array.from(
            new Set(
                data
                    .filter((r) => r.variant === selectedVariant)
                    .map((r) => r.event_name),
            ),
        );
    }, [data, selectedVariant]);

    const chartData = useMemo(
        () => (data ? pivotByEventName(data, selectedVariant) : []),
        [data, selectedVariant],
    );

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3>Events Over Time</h3>
                {variants.length > 1 && (
                    <div className="flex gap-1">
                        {variants.map((v) => (
                            <button
                                key={v}
                                onClick={() => setSelectedVariant(v)}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                    v === selectedVariant
                                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                        : 'text-slate-400 border border-slate-700 hover:border-slate-500'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {isLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400" />
                </div>
            ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-slate-500 text-sm">
                    No event data yet.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                    >
                        <CartesianGrid
                            vertical={false}
                            stroke="rgba(148,163,184,0.07)"
                        />
                        <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <Tooltip contentStyle={tooltipStyles} />
                        <Legend
                            wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }}
                        />
                        {eventNames.map((name, i) => (
                            <Line
                                key={name}
                                type="monotone"
                                dataKey={name}
                                stroke={EVENT_COLORS[i % EVENT_COLORS.length]}
                                strokeWidth={1.5}
                                dot={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};
