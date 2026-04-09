import React from 'react';
import type { CupedAdjustedResult, ExperimentAnalysis, StatisticalResult } from '../types';
import { CupedImpactAnalysis } from './statistical-dashboard/CupedImpactAnalysis';
import { EffectSizeChart } from './statistical-dashboard/EffectSizeChart';
import { EventIngestionCard } from './statistical-dashboard/EventIngestionCard';
import { HealthChecksPanel } from './statistical-dashboard/HealthChecksPanel';
import { KeyMetricsGrid } from './statistical-dashboard/KeyMetricsGrid';
import { SampleSizeProgressCard } from './statistical-dashboard/SampleSizeProgressCard';
import { StatisticalResultsCard } from './statistical-dashboard/StatisticalResultsCard';
import { VarianceReductionGrid } from './statistical-dashboard/VarianceReductionGrid';
import { VariantComparisonChart } from './statistical-dashboard/VariantComparisonChart';

interface StatisticalDashboardProps {
    analysis: ExperimentAnalysis;
    useCuped?: boolean;
}

export const StatisticalDashboard: React.FC<StatisticalDashboardProps> = ({
    analysis,
    useCuped = false,
}) => {
    const tooltipStyles = {
        backgroundColor: 'var(--chart-tooltip-bg)',
        border: '1px solid var(--chart-tooltip-border)',
        borderRadius: '12px',
        color: 'var(--chart-tooltip-text)',
    };

    const { experiment, results, sample_sizes, cuped_adjusted_results } = analysis;

    // Determine which results to display
    const activeResults: Array<StatisticalResult | CupedAdjustedResult> =
        useCuped && cuped_adjusted_results ? cuped_adjusted_results : results;

    // Helper to map CupedAdjustedResult to shape compatible with display logic if needed,
    // or just use directly if properties align.
    // CupedAdjustedResult has adjusted_mean_a/b instead of mean_a/b.
    // Let's normalize for display.
    type DisplayResult = StatisticalResult & {
        n_matched_users_a?: number;
        n_matched_users_b?: number;
        variance_reduction?: number;
    };

    const displayResults: DisplayResult[] = activeResults.map((result) => {
        if ('adjusted_mean_a' in result) {
            const cuped = result as CupedAdjustedResult;
            return {
                experiment_id: experiment.id,
                variant_a: cuped.variant_a,
                variant_b: cuped.variant_b,
                metric_name: cuped.metric_name,
                sample_size_a: cuped.n_matched_users_a,
                sample_size_b: cuped.n_matched_users_b,
                mean_a: cuped.adjusted_mean_a,
                mean_b: cuped.adjusted_mean_b,
                std_dev_a: undefined,
                std_dev_b: undefined,
                effect_size: cuped.adjusted_effect_size,
                p_value: cuped.adjusted_p_value,
                confidence_interval_lower: cuped.adjusted_ci_lower,
                confidence_interval_upper: cuped.adjusted_ci_upper,
                is_significant: cuped.is_significant,
                test_type: experiment.analysis_engine,
                analysis_engine: experiment.analysis_engine,
                calculated_at: experiment.updated_at,
                n_matched_users_a: cuped.n_matched_users_a,
                n_matched_users_b: cuped.n_matched_users_b,
                variance_reduction: cuped.variance_reduction_percent,
            };
        }

        const standard = result as StatisticalResult;
        return {
            ...standard,
            mean_a: standard.mean_a,
            mean_b: standard.mean_b,
            std_dev_a: standard.std_dev_a,
            std_dev_b: standard.std_dev_b,
            effect_size: standard.effect_size,
            p_value: standard.p_value,
            confidence_interval_lower: standard.confidence_interval_lower,
            confidence_interval_upper: standard.confidence_interval_upper,
        };
    });

    const formatNumber = (value: number | null | undefined, decimals: number = 2, suffix: string = '') => {
        if (value === null || value === undefined || isNaN(value)) return '—';
        return `${value.toFixed(decimals)}${suffix}`;
    };

    const formatPercent = (value: number | null | undefined, decimals: number = 2) => {
        if (value === null || value === undefined || isNaN(value)) return '—';
        return `${(value * 100).toFixed(decimals)}%`;
    };


    // Prepare data for charts
    const variantComparison = displayResults.map((result) => ({
        name: `${result.variant_b} vs ${result.variant_a}`,
        variantA: result.variant_a,
        variantB: result.variant_b,
        meanA: result.mean_a,
        meanB: result.mean_b,
        effectSize: result.effect_size,
        ciLower: result.confidence_interval_lower,
        ciUpper: result.confidence_interval_upper,
        pValue: result.p_value,
        adjustedPValue: (cuped_adjusted_results || []).find(
            (r) => r.variant_a === result.variant_a && r.variant_b === result.variant_b
        )?.adjusted_p_value,
        posterior: result.bayes_probability ?? null,
    }));

    return (
        <div className="space-y-6 animate-fade-in">

            {/* Key Metrics Grid */}
            <KeyMetricsGrid results={displayResults} formatNumber={formatNumber} />

            {/* CUPED Variance Reduction Stats */}
            {useCuped && cuped_adjusted_results && (
                <VarianceReductionGrid results={displayResults} formatPercent={formatPercent} />
            )}

            {/* Statistical Results + AI Insights (inside same card) */}
            <StatisticalResultsCard
                results={displayResults}
                analysis={analysis}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
            />

            {/* Conversion Rate Comparison Chart */}
            <VariantComparisonChart data={variantComparison} />

            {/* CUPED Impact Analysis Graphs */}
            {useCuped && cuped_adjusted_results && (
                <CupedImpactAnalysis
                    analysisResults={analysis.results}
                    cupedResults={cuped_adjusted_results}
                    formatNumber={formatNumber}
                />
            )}

            {/* Effect Size with CI */}
            <EffectSizeChart data={variantComparison} tooltipStyles={tooltipStyles} />

            {/* Sample Size Progress */}
            <SampleSizeProgressCard sampleSizes={sample_sizes} />

            <HealthChecksPanel checks={analysis.health_checks} formatNumber={formatNumber} />

            {/* Event Ingestion (Debug/Test) */}
            <EventIngestionCard experiment={experiment} />

            {/* Hypothesis Summary */}
        </div>
    );
};
