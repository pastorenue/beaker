export interface FeatureFlagClientConfig {
    endpoint?: string;
    apiKey: string;
}

export interface FeatureFlagEvaluationRequest {
    userId?: string;
    attributes?: Record<string, unknown>;
    flags?: string[];
    environment?: string;
}

export interface FeatureFlagEvaluation {
    name: string;
    enabled: boolean;
    gate_id?: string;
    reason: string;
}

export interface FeatureFlagEvaluationResponse {
    flags: FeatureFlagEvaluation[];
}

export class ExpothesisFeatureFlags {
    private endpoint: string;
    private apiKey: string;

    constructor(config: FeatureFlagClientConfig) {
        this.endpoint = config.endpoint ?? '/api/sdk/feature-flags/evaluate';
        this.apiKey = config.apiKey;
    }

    async evaluate(request: FeatureFlagEvaluationRequest = {}): Promise<FeatureFlagEvaluationResponse> {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-expothesis-key': this.apiKey,
            },
            body: JSON.stringify({
                user_id: request.userId,
                attributes: request.attributes,
                flags: request.flags,
                environment: request.environment,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Feature flags request failed: ${error}`);
        }

        return response.json();
    }

    async isEnabled(flagName: string, request: FeatureFlagEvaluationRequest = {}): Promise<boolean> {
        const result = await this.evaluate({ ...request, flags: [flagName] });
        return result.flags?.[0]?.enabled ?? false;
    }
}
