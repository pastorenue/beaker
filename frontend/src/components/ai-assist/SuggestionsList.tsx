import React from 'react';
import type { ExperimentSuggestion } from '../../types';

type SuggestionsListProps = {
    suggestions: ExperimentSuggestion[];
    onUse: (suggestion: ExperimentSuggestion) => void;
};

export const SuggestionsList: React.FC<SuggestionsListProps> = ({ suggestions, onUse }) => {
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">AI Experiment Suggestions</h3>
            <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                    <div key={index} className="card">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-semibold text-slate-100">{suggestion.name}</p>
                                <p className="mt-1 text-sm text-slate-300">{suggestion.description}</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                    <span>Metric: <span className="text-slate-400">{suggestion.primary_metric}</span></span>
                                    <span>Impact: <span className="text-slate-400">{Math.round(suggestion.predicted_impact_score * 100)}%</span></span>
                                </div>
                            </div>
                            <button
                                onClick={() => onUse(suggestion)}
                                className="shrink-0 text-sm text-indigo-400 hover:text-indigo-300"
                            >
                                Create Experiment
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
