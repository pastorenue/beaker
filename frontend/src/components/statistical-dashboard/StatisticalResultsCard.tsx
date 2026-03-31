import React from 'react';
import { SignificanceIndicator } from '../Common';

type DisplayResult = {
    variant_a: string;
    variant_b: string;
    effect_size: number;
    p_value: number;
    bayes_probability?: number;
    e_value?: number;
    sequential_threshold?: number;
    confidence_interval_lower: number;
    confidence_interval_upper: number;
    test_type: string;
};

type StatisticalResultsCardProps = {
    results: DisplayResult[];
    formatNumber: (value: number | null | undefined, decimals?: number, suffix?: string) => string;
    formatPercent: (value: number | null | undefined, decimals?: number) => string;
};

export const StatisticalResultsCard: React.FC<StatisticalResultsCardProps> = ({
    results,
    formatNumber,
    formatPercent,
}) => {
    return (
        <div className="card">
            <h3 className="mb-4">Statistical Analysis</h3>
            <div className="space-y-6">
                {results.map((result, idx) => (
                    <div key={idx} className="border-b border-slate-800/70 pb-6 last:border-0">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-lg font-semibold text-slate-100">
                                {result.variant_b} vs {result.variant_a}
                            </h4>
                            <SignificanceIndicator
                                pValue={result.p_value}
                                bayesProbability={result.bayes_probability}
                                eValue={result.e_value}
                                sequentialThreshold={result.sequential_threshold}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Effect Size</p>
                                <p className="text-xl font-semibold text-slate-100">
                                    {result.effect_size > 0 ? '+' : ''}
                                    {formatPercent(result.effect_size)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                    {result.e_value !== undefined
                                        ? 'Anytime P-Value'
                                        : result.bayes_probability !== undefined
                                          ? 'Posterior P'
                                          : 'P-Value'}
                                </p>
                                <p className="text-xl font-semibold text-slate-100">
                                    {result.bayes_probability !== undefined
                                        ? formatNumber(result.bayes_probability, 3)
                                        : formatNumber(result.p_value, 4)}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                    {result.bayes_probability !== undefined
                                        ? '95% Credible Interval'
                                        : '95% Confidence Interval'}
                                </p>
                                <p className="text-xl font-semibold text-slate-100">
                                    [{formatPercent(result.confidence_interval_lower)},{' '}
                                    {formatPercent(result.confidence_interval_upper)}]
                                </p>
                            </div>
                        </div>

                        <div className="mt-3">
                            <p className="text-xs text-slate-500">Test: {result.test_type}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
