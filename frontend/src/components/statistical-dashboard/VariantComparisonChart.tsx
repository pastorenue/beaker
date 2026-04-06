import React from 'react';

type VariantComparisonDatum = {
    name: string;
    variantA: string;
    variantB: string;
    meanA: number;
    meanB: number;
    effectSize: number;
    ciLower: number;
    ciUpper: number;
    pValue: number;
    adjustedPValue?: number | null;
    posterior?: number | null;
};

type VariantComparisonChartProps = {
    data: VariantComparisonDatum[];
};

const Violin: React.FC<{ id: string; percent: number }> = ({ id, percent }) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const paddingX = 12;
    const paddingY = 6;
    const height = 120;
    const width = 120;

    // Build a synthetic smooth density centered at the percent to get a more organic shape.
    const sigma = 18; // controls spread of the violin
    const density: Array<{ y: number; d: number }> = [];
    for (let y = 0; y <= 100; y += 2) {
        const z = (y - clamped) / sigma;
        const d = Math.exp(-0.5 * z * z);
        density.push({ y, d });
    }
    const maxD = Math.max(...density.map((p) => p.d)) || 1;
    const scaleX = (w: number) => paddingX + (w / maxD) * ((width - paddingX * 2) / 2);
    const scaleY = (y: number) => paddingY + ((100 - y) / 100) * (height - paddingY * 2);

    const leftPath = density
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.d).toFixed(2)} ${scaleY(p.y).toFixed(2)}`)
        .join(' ');
    const rightPath = density
        .slice()
        .reverse()
        .map((p) => `L ${(width - scaleX(p.d)).toFixed(2)} ${scaleY(p.y).toFixed(2)}`)
        .join(' ');
    const path = `${leftPath} ${rightPath} Z`;

    // Jittered dots to mimic real sample points around the center value.
    const dots = Array.from({ length: 18 }, () => {
        const y = clamped + (Math.random() - 0.5) * sigma * 1.6;
        const x = width / 2 + (Math.random() - 0.5) * 22;
        return { x, y: Math.max(0, Math.min(100, y)) };
    });

    const markerX = width / 2;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
                <linearGradient id={`violin-${id}`} x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                    <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.9" />
                </linearGradient>
            </defs>
            <path d={path} fill={`url(#violin-${id})`} stroke="#38bdf8" strokeWidth="1.2" opacity="0.95" />
            {dots.map((d, idx) => (
                <circle
                    key={idx}
                    cx={d.x}
                    cy={scaleY(d.y)}
                    r={2.4}
                    fill="#7dd3fc"
                    opacity="0.85"
                />
            ))}
            <line x1={markerX} x2={markerX} y1={paddingY} y2={height - paddingY} stroke="#38bdf8" strokeWidth="1.4" />
            <circle cx={markerX} cy={scaleY(clamped)} r={5} fill="#0ea5e9" />
            <g fontSize="10" fill="#bae6fd" fontFamily="ui-sans-serif, system-ui">
                <text x="6" y={height - 2}>0</text>
                <text x={width / 2 - 10} y={height - 2}>50</text>
                <text x={width - 24} y={height - 2}>100</text>
            </g>
        </svg>
    );
};

export const VariantComparisonChart: React.FC<VariantComparisonChartProps> = ({ data }) => {
    const hasAdjusted = data.some((d) => d.adjustedPValue !== undefined && d.adjustedPValue !== null);
    const hasPosterior = data.some((d) => d.posterior !== undefined && d.posterior !== null);
    const [metric, setMetric] = React.useState<'p' | 'adjusted' | 'posterior'>(hasAdjusted ? 'adjusted' : 'p');

    const metricLabel =
        metric === 'p' ? 'p-value' : metric === 'adjusted' ? 'Adjusted p-value' : 'Posterior';

    return (
        <div className="card">
            <h3 className="mb-4">Variant Performance Comparison</h3>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Violin shows:</span>
                <div className="flex gap-2">
                    <button
                        className={`chip ${metric === 'p' ? 'chip-active' : ''}`}
                        onClick={() => setMetric('p')}
                    >
                        p-value
                    </button>
                    {hasAdjusted && (
                        <button
                            className={`chip ${metric === 'adjusted' ? 'chip-active' : ''}`}
                            onClick={() => setMetric('adjusted')}
                        >
                            Adjusted p
                        </button>
                    )}
                    {hasPosterior && (
                        <button
                            className={`chip ${metric === 'posterior' ? 'chip-active' : ''}`}
                            onClick={() => setMetric('posterior')}
                        >
                            Posterior
                        </button>
                    )}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-200">
                    <thead className="bg-slate-900/60 text-xs text-slate-500">
                        <tr>
                            <th className="px-3 py-2 text-left">Pair</th>
                            <th className="px-3 py-2 text-left">Means (A/B)</th>
                            <th className="px-3 py-2 text-left">Lift</th>
                            <th className="px-3 py-2 text-left">95% CI</th>
                            <th className="px-3 py-2 text-left">p-value</th>
                            {hasAdjusted && <th className="px-3 py-2 text-left">Adj. p</th>}
                            {hasPosterior && <th className="px-3 py-2 text-left">Posterior</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => {
                            const lift = row.effectSize * 100;
                            const positive = lift >= 0;
                            return (
                                <tr key={row.name}>
                                    <td className="px-3 py-3 font-semibold text-slate-100">{row.name}</td>
                                    <td className="px-3 py-3 text-slate-200">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-400">{row.variantA}:</span>
                                            <span className="font-medium">{row.meanA.toFixed(3)}</span>
                                            <span className="text-slate-500">/</span>
                                            <span className="text-slate-400">{row.variantB}:</span>
                                            <span className="font-medium">{row.meanB.toFixed(3)}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className={positive ? 'text-emerald-300' : 'text-rose-300'}>
                                            {positive ? '↑' : '↓'} {lift.toFixed(2)}%
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-slate-200">
                                        [{row.ciLower.toFixed(3)}, {row.ciUpper.toFixed(3)}]
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-slate-200">p = {row.pValue.toFixed(4)}</span>
                                            {metric === 'p' && (
                                                <Violin id={`${row.name}-p`} percent={row.pValue * 100} />
                                            )}
                                        </div>
                                    </td>
                                    {hasAdjusted && (
                                        <td className="px-3 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-slate-200">
                                                    {row.adjustedPValue !== undefined && row.adjustedPValue !== null
                                                        ? `p_adj = ${row.adjustedPValue.toFixed(4)}`
                                                        : '—'}
                                                </span>
                                                {metric === 'adjusted' &&
                                                    row.adjustedPValue !== undefined &&
                                                    row.adjustedPValue !== null && (
                                                        <Violin
                                                            id={`${row.name}-adj`}
                                                            percent={row.adjustedPValue * 100}
                                                        />
                                                    )}
                                            </div>
                                        </td>
                                    )}
                                    {hasPosterior && (
                                        <td className="px-3 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-slate-200">
                                                    {row.posterior !== undefined && row.posterior !== null
                                                        ? `post = ${row.posterior.toFixed(4)}`
                                                        : '—'}
                                                </span>
                                                {metric === 'posterior' &&
                                                    row.posterior !== undefined &&
                                                    row.posterior !== null && (
                                                        <Violin
                                                            id={`${row.name}-post`}
                                                            percent={(1 - row.posterior) * 100}
                                                        />
                                                    )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 text-xs text-slate-500">
                Violin reflects current {metricLabel}. Switch metric to see distribution update.
            </div>
        </div>
    );
};
