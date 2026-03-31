import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import type { CupedAdjustedResult, ExperimentAnalysis, StatisticalResult } from '../../types';

type CupedImpactAnalysisProps = {
    analysisResults: ExperimentAnalysis['results'];
    cupedResults: NonNullable<ExperimentAnalysis['cuped_adjusted_results']>;
    formatNumber: (value: number | null | undefined, decimals?: number, suffix?: string) => string;
};

type TooltipEntry = {
    name?: string;
    color?: string;
    value?: number | string;
};

type TooltipProps = {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
    formatNumber: (value: number | null | undefined, decimals?: number, suffix?: string) => string;
};

const CustomTooltip = ({ active, payload, label, formatNumber }: TooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-950/95 border border-slate-700/50 p-3 rounded-xl shadow-xl backdrop-blur-md theme-light:bg-white/95 theme-light:border-slate-200/80 theme-light:text-slate-800">
                <p className="font-medium mb-2 text-slate-200 theme-light:text-slate-900">{label}</p>
                <div className="space-y-1">
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-slate-400 theme-light:text-slate-500">{entry.name}:</span>
                            <span className="font-mono font-medium text-slate-200 theme-light:text-slate-900">
                                {typeof entry.value === 'number' ? formatNumber(entry.value, 3) : entry.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export const CupedImpactAnalysis: React.FC<CupedImpactAnalysisProps> = ({
    analysisResults,
    cupedResults,
    formatNumber,
}) => {
    return (
        <div className="card animate-fade-in">
            <h3 className="mb-4">CUPED Impact Analysis</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-4 text-center">
                        Metric Mean (Original vs Adjusted)
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                            data={(() => {
                                const variantData: Record<string, { name: string; Original?: number; CUPED?: number }> = {};

                                analysisResults.forEach((r: StatisticalResult) => {
                                    if (!variantData[r.variant_a]) variantData[r.variant_a] = { name: r.variant_a };
                                    variantData[r.variant_a].Original = r.mean_a;

                                    if (!variantData[r.variant_b]) variantData[r.variant_b] = { name: r.variant_b };
                                    variantData[r.variant_b].Original = r.mean_b;
                                });

                                cupedResults.forEach((r: CupedAdjustedResult) => {
                                    if (variantData[r.variant_a]) variantData[r.variant_a].CUPED = r.adjusted_mean_a;
                                    if (variantData[r.variant_b]) variantData[r.variant_b].CUPED = r.adjusted_mean_b;
                                });

                                return Object.values(variantData);
                            })()}
                            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                        >
                            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip content={<CustomTooltip formatNumber={formatNumber} />} />
                            <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
                            <Bar dataKey="Original" fill="#64748b" name="Original Mean" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="CUPED" fill="#818cf8" name="CUPED Mean" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 mt-2 text-center">Adjusted means remove pre-experiment bias.</p>
                </div>

                <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-4 text-center">
                        Variance (Lower is Better)
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                            data={(() => {
                                const variantData: Record<string, { name: string; Original?: number; CUPED?: number }> = {};

                                cupedResults.forEach((r: CupedAdjustedResult) => {
                                    if (!variantData[r.variant_a]) variantData[r.variant_a] = { name: r.variant_a };
                                    variantData[r.variant_a].Original = r.original_variance_a;
                                    variantData[r.variant_a].CUPED = r.adjusted_variance_a;

                                    if (!variantData[r.variant_b]) variantData[r.variant_b] = { name: r.variant_b };
                                    variantData[r.variant_b].Original = r.original_variance_b;
                                    variantData[r.variant_b].CUPED = r.adjusted_variance_b;
                                });

                                return Object.values(variantData);
                            })()}
                            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                        >
                            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                            />
                            <Tooltip content={<CustomTooltip formatNumber={formatNumber} />} />
                            <Legend wrapperStyle={{ color: '#e2e8f0', fontSize: 12 }} />
                            <Bar dataKey="Original" fill="#64748b" name="Original Variance" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="CUPED" fill="#34d399" name="CUPED Variance" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                        Lower variance = higher sensitivity & faster results.
                    </p>
                </div>
            </div>
        </div>
    );
};
