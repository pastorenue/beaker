import type { CreateExperimentRequest } from '../../types';
import { MetricType, ExperimentSuggestion } from '../../types';

export function suggestionToFormData(s: ExperimentSuggestion): Partial<CreateExperimentRequest> {
    return {
        name: s.name,
        description: s.description,
        experiment_type: s.experiment_type,
        primary_metric: s.primary_metric,
        variants: s.variants,
        hypothesis: {
            null_hypothesis: s.hypothesis_draft,
            alternative_hypothesis: s.hypothesis_draft,
            expected_effect_size: 0.05,
            metric_type: MetricType.Proportion,
            significance_level: 0.05,
            power: 0.8,
        },
    };
}
