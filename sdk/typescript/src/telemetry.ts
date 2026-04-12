export interface TelemetryClientConfig {
    endpoint?: string;
    apiKey: string;
}

export interface TelemetryEvent {
    id: string;
    definition_id: string;
    name: string;
    event_type: string;
    selector?: string;
    url_pattern?: string;
    visual_guide?: string;
}

export interface TelemetryDefinition {
    id: string;
    account_id: string;
    experiment_id: string;
    description: string;
    is_active: boolean;
    events: TelemetryEvent[];
    created_at: string;
    updated_at: string;
}

export interface TelemetryDefinitionsResponse {
    definitions: TelemetryDefinition[];
}

export class BeakerTelemetry {
    private endpoint: string;
    private apiKey: string;

    constructor(config: TelemetryClientConfig) {
        this.endpoint = config.endpoint ?? '/api/sdk/telemetry';
        this.apiKey = config.apiKey;
    }

    async fetchDefinitions(experimentId: string): Promise<TelemetryDefinitionsResponse> {
        const url = `${this.endpoint}?experiment_id=${encodeURIComponent(experimentId)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-beaker-key': this.apiKey,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Telemetry request failed: ${error}`);
        }

        return response.json();
    }

    async getActiveDefinitions(experimentId: string): Promise<TelemetryDefinition[]> {
        const result = await this.fetchDefinitions(experimentId);
        return result.definitions ?? [];
    }
}
