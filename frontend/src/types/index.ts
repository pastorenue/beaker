export enum ExperimentStatus {
    Draft = 'draft',
    Running = 'running',
    Paused = 'paused',
    Stopped = 'stopped',
}

export enum ExperimentType {
    AbTest = 'abtest',
    Multivariate = 'multivariate',
    FeatureGate = 'featuregate',
    Holdout = 'holdout',
}

export enum SamplingMethod {
    Hash = 'hash',
    Random = 'random',
    Stratified = 'stratified',
}

export enum AnalysisEngine {
    Frequentist = 'frequentist',
    Bayesian = 'bayesian',
    Sequential = 'sequential',
}

export enum HealthCheckDirection {
    AtLeast = 'atleast',
    AtMost = 'atmost',
    Between = 'between',
}

export enum MetricType {
    Proportion = 'proportion',
    Continuous = 'continuous',
    Count = 'count',
}

export type DataSourceType = 'none' | 'looker' | 'csv' | 'postgres_query';

export interface LookerDataSourceConfig {
    api_url: string;
    client_id: string;
    client_secret: string;
    look_id: string;
}

export interface CsvDataSourceConfig {
    user_ids: string[];
}

export interface PostgresDataSourceConfig {
    is_internal: boolean;
    connection_string?: string;
    query: string;
}

export type DataSourceConfig = LookerDataSourceConfig | CsvDataSourceConfig | PostgresDataSourceConfig | Record<string, never>;

export interface SyncGroupResponse {
    group_id: string;
    synced_user_count: number;
    data_source_type: DataSourceType;
}

export interface Hypothesis {
    null_hypothesis: string;
    alternative_hypothesis: string;
    expected_effect_size: number;
    metric_type: MetricType;
    significance_level: number;
    power: number;
    minimum_sample_size?: number;
}

export interface HealthCheck {
    metric_name: string;
    direction: HealthCheckDirection;
    min?: number;
    max?: number;
}

export interface Variant {
    name: string;
    description: string;
    allocation_percent: number;
    is_control: boolean;
}

export interface Experiment {
    id: string;
    name: string;
    description: string;
    status: ExperimentStatus;
    experiment_type: ExperimentType;
    sampling_method: SamplingMethod;
    analysis_engine: AnalysisEngine;
    sampling_seed: number;
    feature_flag_id?: string;
    feature_gate_id?: string;
    health_checks: HealthCheck[];
    hypothesis?: Hypothesis;
    variants: Variant[];
    user_groups: string[];
    primary_metric: string;
    start_date?: string;
    end_date?: string;
    jira_issue_key?: string;
    requires_existing_users: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserGroup {
    id: string;
    name: string;
    description: string;
    assignment_rule: string;
    size: number;
    data_source_type: DataSourceType;
    data_source_config: DataSourceConfig;
    created_at: string;
    updated_at: string;
}

export interface StatisticalResult {
    experiment_id: string;
    variant_a: string;
    variant_b: string;
    metric_name: string;
    sample_size_a: number;
    sample_size_b: number;
    mean_a: number;
    mean_b: number;
    std_dev_a?: number;
    std_dev_b?: number;
    effect_size: number;
    p_value: number;
    bayes_probability?: number;
    e_value?: number;
    sequential_threshold?: number;
    confidence_interval_lower: number;
    confidence_interval_upper: number;
    is_significant: boolean;
    test_type: string;
    analysis_engine: AnalysisEngine;
    calculated_at: string;
}

export interface VariantSampleSize {
    variant: string;
    current_size: number;
    required_size: number;
}

export interface HealthCheckResult {
    metric_name: string;
    direction: HealthCheckDirection;
    min?: number;
    max?: number;
    current_value?: number;
    is_passing: boolean;
}

export interface CupedConfig {
    experiment_id: string;
    covariate_metric: string;
    lookback_days: number;
    min_sample_size: number;
    created_at: string;
    updated_at: string;
}

export interface CupedConfigRequest {
    covariate_metric: string;
    lookback_days?: number;
    min_sample_size?: number;
}

export interface CupedAdjustedResult {
    variant_a: string;
    variant_b: string;
    metric_name: string;
    theta: number;
    adjusted_mean_a: number;
    adjusted_mean_b: number;
    adjusted_effect_size: number;
    adjusted_p_value: number;
    adjusted_ci_lower: number;
    adjusted_ci_upper: number;
    variance_reduction_percent: number;
    original_variance_a: number;
    original_variance_b: number;
    adjusted_variance_a: number;
    adjusted_variance_b: number;
    is_significant: boolean;
    n_matched_users_a: number;
    n_matched_users_b: number;
}

export interface ExperimentAnalysis {
    experiment: Experiment;
    results: StatisticalResult[];
    sample_sizes: VariantSampleSize[];
    health_checks: HealthCheckResult[];
    cuped_adjusted_results?: CupedAdjustedResult[];
    cuped_error?: string;
}

export interface CreateExperimentRequest {
    name: string;
    description: string;
    experiment_type?: ExperimentType;
    sampling_method?: SamplingMethod;
    analysis_engine?: AnalysisEngine;
    feature_flag_id?: string;
    feature_gate_id?: string;
    health_checks?: HealthCheck[];
    hypothesis: Hypothesis;
    variants: Variant[];
    primary_metric: string;
    user_groups: string[];
    end_date?: string;
    requires_existing_users?: boolean;
}

export interface CreateUserGroupRequest {
    name: string;
    description: string;
    assignment_rule: string;
    data_source_type?: DataSourceType;
    data_source_config?: DataSourceConfig;
}

export interface UpdateUserGroupRequest {
    name?: string;
    description?: string;
    assignment_rule?: string;
    data_source_type?: DataSourceType;
    data_source_config?: DataSourceConfig;
}

export interface AiChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AiChatRequest {
    model?: string;
    messages: AiChatMessage[];
    temperature?: number;
    max_tokens?: number;
}

export interface AiChatResponse {
    model: string;
    message: AiChatMessage;
    usage?: Record<string, unknown>;
}

export interface AiModelsResponse {
    models: string[];
}

export interface Account {
    id: string;
    name: string;
    created_at: string;
    role: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    invite_token?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface VerifyOtpRequest {
    email: string;
    code: string;
    totp_code?: string;
}

export interface CreateInviteRequest {
    email: string;
    role: string;
}

export interface InviteDetailsResponse {
    email: string;
    account_id: string;
    account_name: string;
}

export interface AuthStatusResponse {
    requires_otp: boolean;
    totp_enabled: boolean;
    dev_code?: string;
    token?: string;
    user_id?: string;
}

export interface AuthTokenResponse {
    token: string;
    user_id: string;
}

export interface TotpSetupResponse {
    secret: string;
    otpauth_url: string;
}

export interface AuthUserProfile {
    id: string;
    email: string;
    totp_enabled: boolean;
    created_at: string;
}

export interface SdkTokensResponse {
    tracking_api_key?: string | null;
    feature_flags_api_key?: string | null;
}

export interface RotateSdkTokensRequest {
    kind: 'tracking' | 'feature_flags' | 'all';
}

export interface MoveUserGroupRequest {
    from_experiment_id: string;
    to_experiment_id: string;
}
export interface IngestEventRequest {
    experiment_id: string;
    user_id: string;
    variant: string;
    metric_name: string;
    metric_value: number;
    attributes?: Record<string, unknown>;
}

export interface Session {
    session_id: string;
    user_id?: string;
    entry_url: string;
    referrer?: string;
    user_agent?: string;
    metadata?: Record<string, unknown>;
    started_at: string;
    ended_at?: string;
    duration_seconds?: number;
    clicks_count?: number;
    replay_events_count?: number;
}

export interface ActivityEvent {
    event_id: string;
    session_id: string;
    user_id?: string;
    event_name: string;
    event_type: string;
    url: string;
    selector?: string;
    x?: number;
    y?: number;
    metadata?: Record<string, unknown>;
    timestamp: string;
}

export type ReplayEvent = {
    type: number;
    timestamp: number;
    data: unknown;
    [key: string]: unknown;
};

export interface StartSessionRequest {
    session_id?: string;
    user_id?: string;
    entry_url: string;
    referrer?: string;
    user_agent?: string;
    metadata?: Record<string, unknown>;
}

export interface StartSessionResponse {
    session_id: string;
    started_at: string;
}

export interface EndSessionRequest {
    session_id: string;
    ended_at?: string;
}

export interface TrackEventRequest {
    session_id: string;
    user_id?: string;
    event_name: string;
    event_type: string;
    url: string;
    selector?: string;
    x?: number;
    y?: number;
    metadata?: Record<string, unknown>;
    timestamp?: string;
}

export interface TrackReplayRequest {
    session_id: string;
    events: Record<string, unknown>[];
}

export interface ListSessionsResponse {
    sessions: Session[];
    total: number;
    limit: number;
    offset: number;
}

export interface AssignUserRequest {
    user_id: string;
    experiment_id: string;
    group_id: string;
    attributes?: Record<string, unknown>;
}

export enum FeatureFlagStatus {
    Active = 'active',
    Inactive = 'inactive',
}

export enum FeatureGateStatus {
    Active = 'active',
    Inactive = 'inactive',
}

export interface FeatureFlag {
    id: string;
    name: string;
    description: string;
    status: FeatureFlagStatus;
    tags: string[];
    environment: string;
    owner: string;
    user_groups: string[];
    created_at: string;
    updated_at: string;
}

export interface FeatureGate {
    id: string;
    flag_id: string;
    name: string;
    description: string;
    status: FeatureGateStatus;
    rule: string;
    default_value: boolean;
    pass_value: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreateFeatureFlagRequest {
    name: string;
    description: string;
    status?: FeatureFlagStatus;
    tags?: string[];
    environment?: string;
    owner?: string;
    user_groups?: string[];
}

export interface UpdateFeatureFlagRequest {
    name?: string;
    description?: string;
    status?: FeatureFlagStatus;
    tags?: string[];
    environment?: string;
    owner?: string;
    user_groups?: string[];
}

export interface CreateFeatureGateRequest {
    flag_id: string;
    name: string;
    description: string;
    status?: FeatureGateStatus;
    rule: string;
    default_value: boolean;
    pass_value: boolean;
}

export interface EvaluateFeatureGateRequest {
    attributes?: Record<string, unknown>;
}

export interface FeatureGateEvaluationResponse {
    gate_id: string;
    flag_id: string;
    pass: boolean;
    reason: string;
}

export interface MetricEvent {
    id: string;
    experiment_id: string;
    user_id: string;
    variant: string;
    metric_name: string;
    metric_value: number;
    attributes?: Record<string, unknown>;
    timestamp: string;
}

export interface AnalyticsSummary {
    active_experiments: number;
    active_experiments_delta: number;
    daily_exposures: number;
    exposures_delta_percent: number;
    primary_conversion_rate: number;
    primary_conversion_delta_pp: number;
    guardrail_breaches: number;
    guardrail_breaches_detail: string;
    environment: string;
    data_freshness_seconds: number;
    last_updated: string;
}

export interface AnalyticsThroughputPoint {
    time: string;
    exposures: number;
    assignments: number;
    conversions: number;
}

export interface AnalyticsMetricCoverageSlice {
    name: string;
    value: number;
}

export interface AnalyticsMetricCoverageTotals {
    total_metrics: number;
    guardrails: number;
    diagnostics: number;
    holdout_metrics: number;
}

export interface AnalyticsPrimaryMetricPoint {
    day: string;
    conversion: number;
    revenue: number;
    retention: number;
}

export interface AnalyticsGuardrailPoint {
    day: string;
    latency: number;
    error_rate: number;
    crash_rate: number;
}

export interface AnalyticsSrmVariant {
    variant: string;
    expected: number;
    observed: number;
}

export interface AnalyticsSrmSummary {
    p_value: number;
    allocation_drift: number;
    experiment_id?: string;
    experiment_name?: string;
}

export interface AnalyticsSrmResponse {
    variants: AnalyticsSrmVariant[];
    summary: AnalyticsSrmSummary;
}

export interface AnalyticsFunnelStep {
    step: string;
    users: number;
}

export interface AnalyticsAnomalyPoint {
    day: string;
    critical: number;
    warning: number;
    info: number;
}

export interface AnalyticsSegmentLiftPoint {
    segment: string;
    lift: number;
}

export interface AnalyticsMetricInventoryItem {
    name: string;
    category: string;
    freshness_seconds: number;
    owner: string;
    status: string;
    guardrail?: string;
}

export interface AnalyticsAlertItem {
    title: string;
    time: string;
    severity: string;
    detail: string;
}

export interface AnalyticsSystemHealth {
    data_freshness_seconds: number;
    sdk_error_rate: number;
    evaluation_latency_ms: number;
}

export interface AnalyticsOverviewResponse {
    summary: AnalyticsSummary;
    throughput: AnalyticsThroughputPoint[];
    metric_coverage: AnalyticsMetricCoverageSlice[];
    metric_coverage_totals: AnalyticsMetricCoverageTotals;
    primary_metric_trend: AnalyticsPrimaryMetricPoint[];
    guardrail_health: AnalyticsGuardrailPoint[];
    srm: AnalyticsSrmResponse;
    funnel: AnalyticsFunnelStep[];
    anomaly_alerts: AnalyticsAnomalyPoint[];
    segment_lift: AnalyticsSegmentLiftPoint[];
    metric_inventory: AnalyticsMetricInventoryItem[];
    alert_feed: AnalyticsAlertItem[];
    system_health: AnalyticsSystemHealth;
}

// ── AI Strategist types ────────────────────────────────────────────────────────

export interface VariantSuggestion {
    name: string;
    description: string;
    allocation_percent: number;
    is_control: boolean;
}

export interface ExperimentSuggestion {
    name: string;
    description: string;
    hypothesis_draft: string;
    primary_metric: string;
    predicted_impact_score: number;
    experiment_type: ExperimentType;
    variants: VariantSuggestion[];
    telemetry_touchpoints: string[];
}

export interface OnePagerDraft {
    experiment_name: string;
    objective: string;
    hypothesis: string;
    success_metrics: string[];
    guardrail_metrics: string[];
    estimated_duration_days: number;
    sample_size_estimate: number;
    risks: string[];
}

export interface HypothesisDraft {
    null_hypothesis: string;
    alternative_hypothesis: string;
    expected_effect_size: number;
    metric_type: string;
    significance_level: number;
    power: number;
    rationale: string;
}

export interface MetricSuggestion {
    metric_name: string;
    telemetry_event: string;
    metric_type: string;
    description: string;
}

export interface MetricSuggestionsResponse {
    primary_metrics: MetricSuggestion[];
    guardrail_metrics: MetricSuggestion[];
}

export interface ExperimentSummaryResponse {
    experiment_id: string;
    experiment_name: string;
    summary: string;
    status: string;
}

export interface DraftHypothesisRequest {
    experiment_description: string;
    metric_type: string;
}

export interface DraftOnePagerRequest {
    experiment_id: string;
}

export interface SuggestMetricsRequest {
    experiment_description: string;
}

// ── AI Insights types ──────────────────────────────────────────────────────────

export interface AiPollingInsight {
    id: string;
    account_id: string;
    experiment_id: string;
    polled_at: string;
    severity: 'info' | 'warning' | 'critical';
    insight_type: 'regression' | 'winner' | 'srm' | 'guardrail' | 'progress';
    headline: string;
    detail: string;
    ai_narrative?: string;
    p_value?: number;
    effect_size?: number;
    sample_size?: number;
    auto_actioned: boolean;
    dismissed_at?: string;
    created_at: string;
}

export interface InsightsListResponse {
    insights: AiPollingInsight[];
    total: number;
}

export interface InsightsSummaryResponse {
    info: number;
    warning: number;
    critical: number;
    total: number;
}

// ── Integrations types ────────────────────────────────────────────────────────

export type IntegrationType = 'slack' | 'jira';

export interface SlackIntegrationConfig {
    webhook_url: string;
}

export interface JiraIntegrationConfig {
    site_url: string;
    email: string;
    api_token: string;
    project_key?: string;
}

export interface AccountIntegration {
    id: string;
    account_id: string;
    integration_type: IntegrationType;
    enabled: boolean;
    config: SlackIntegrationConfig | JiraIntegrationConfig | Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface UpsertSlackIntegrationRequest {
    enabled?: boolean;
    config: SlackIntegrationConfig;
}

export interface UpsertJiraIntegrationRequest {
    enabled?: boolean;
    config: JiraIntegrationConfig;
}

export interface CreateJiraIssueRequest {
    summary: string;
    description?: string;
    issue_type?: string;
    project_key?: string;
}

export interface CreateJiraIssueResponse {
    issue_key: string;
    issue_url: string;
}

export interface LinkJiraIssueRequest {
    jira_issue_key: string;
}

export interface JiraTestConnectionResponse {
    ok: boolean;
    display_name: string;
}
