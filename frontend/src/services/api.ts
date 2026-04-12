import axios from "axios";
import type {
  Account,
  AccountIntegration,
  ActivityEvent,
  AiChatRequest,
  AiChatResponse,
  AiModelsResponse,
  AnalyticsOverviewResponse,
  AssignUserRequest,
  AuthStatusResponse,
  AuthTokenResponse,
  AuthUserProfile,
  CreateExperimentRequest,
  CreateFeatureFlagRequest,
  CreateFeatureGateRequest,
  CreateInviteRequest,
  CreateJiraIssueRequest,
  CreateJiraIssueResponse,
  CreateUserGroupRequest,
  CupedConfig,
  CupedConfigRequest,
  DraftHypothesisRequest,
  DraftOnePagerRequest,
  EndSessionRequest,
  EvaluateFeatureGateRequest,
  Experiment,
  ExperimentAnalysis,
  ExperimentSuggestion,
  ExperimentSummaryResponse,
  FeatureFlag,
  FeatureGate,
  FeatureGateEvaluationResponse,
  HypothesisDraft,
  IngestEventRequest,
  InsightsListResponse,
  InsightsSummaryResponse,
  InviteDetailsResponse,
  JiraTestConnectionResponse,
  LinkJiraIssueRequest,
  ListSessionsResponse,
  LoginRequest,
  MetricEvent,
  MetricSuggestionsResponse,
  MoveUserGroupRequest,
  OnePagerDraft,
  RegisterRequest,
  RotateSdkTokensRequest,
  SdkTokensResponse,
  Session,
  StartSessionRequest,
  StartSessionResponse,
  SuggestMetricsRequest,
  SyncGroupResponse,
  TotpSetupResponse,
  TrackEventRequest,
  TrackReplayRequest,
  UpdateFeatureFlagRequest,
  UpdateUserGroupRequest,
  UpsertJiraIntegrationRequest,
  UpsertSlackIntegrationRequest,
  UserGroup,
  VerifyOtpRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  TelemetryEvent,
  CreateTelemetryEventRequest,
  UpdateTelemetryEventRequest,
  BulkCreateTelemetryEventRequest,
} from "../types";

const API_BASE = "http://localhost:8080/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("beaker-token");
  const accountId = window.localStorage.getItem("beaker-account-id");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (accountId) {
    config.headers = config.headers ?? {};
    config.headers["X-Account-Id"] = accountId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url ?? "";
    const token = window.localStorage.getItem("beaker-token");
    if (status === 401 && token) {
      if (!requestUrl.includes("/track/")) {
        window.localStorage.removeItem("beaker-token");
        window.localStorage.removeItem("beaker-user-id");
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(error);
  },
);

const getTrackingHeaders = () => {
  const envKey = import.meta.env.VITE_TRACKING_KEY as string | undefined;
  const storedKey =
    window.localStorage.getItem("beaker-tracking-key") ?? "";
  const fallbackKey = "beaker-demo-key";
  const key = storedKey || envKey || fallbackKey;
  return key ? { "x-beaker-key": key } : undefined;
};

// Experiments
export const experimentApi = {
  create: (data: CreateExperimentRequest) =>
    api.post<Experiment>("/experiments", data),

  list: () => api.get<Experiment[]>("/experiments"),

  get: (id: string) => api.get<Experiment>(`/experiments/${id}`),

  start: (id: string) => api.post<Experiment>(`/experiments/${id}/start`),

  restart: (id: string) => api.post<Experiment>(`experiments/${id}/restart`),

  pause: (id: string) => api.post<Experiment>(`/experiments/${id}/pause`),

  stop: (id: string) => api.post<Experiment>(`/experiments/${id}/stop`),

  getAnalysis: (id: string, useCuped = false) =>
    api.get<ExperimentAnalysis>(`/experiments/${id}/analysis`, {
      params: { use_cuped: useCuped },
    }),

  getCupedConfig: (id: string) =>
    api.get<CupedConfig>(`/experiments/${id}/cuped/config`),

  saveCupedConfig: (id: string, data: CupedConfigRequest) =>
    api.post<CupedConfig>(`/experiments/${id}/cuped/config`, data),

  createJiraIssue: (id: string, data: CreateJiraIssueRequest) =>
    api.post<CreateJiraIssueResponse>(`/experiments/${id}/jira/create-issue`, data),

  linkJiraIssue: (id: string, data: LinkJiraIssueRequest) =>
    api.put<{ ok: boolean }>(`/experiments/${id}/jira/link`, data),

  unlinkJiraIssue: (id: string) =>
    api.delete<{ ok: boolean }>(`/experiments/${id}/jira/link`),
};

// Events
export const eventApi = {
  ingest: (data: IngestEventRequest) => api.post<MetricEvent>("/events", data),
};

// User Groups
export const userGroupApi = {
  create: (data: CreateUserGroupRequest) =>
    api.post<UserGroup>("/user-groups", data),

  list: () => api.get<UserGroup[]>("/user-groups"),

  get: (id: string) => api.get<UserGroup>(`/user-groups/${id}`),

  update: (id: string, data: UpdateUserGroupRequest) =>
    api.put<UserGroup>(`/user-groups/${id}`, data),

  delete: (id: string) => api.delete<void>(`/user-groups/${id}`),

  move: (id: string, data: MoveUserGroupRequest) =>
    api.post(`/user-groups/${id}/move`, data),

  getMetrics: (id: string) => api.get(`/user-groups/${id}/metrics`),

  assign: (data: AssignUserRequest) => api.post("/user-groups/assign", data),

  sync: (id: string) =>
    api.post<SyncGroupResponse>(`/user-groups/${id}/sync`, {}),

  users: (id: string) => api.get<{ headers: string[]; rows: string[][] }>(`/user-groups/${id}/users`),
};

// Feature Flags
export const featureFlagApi = {
  create: (data: CreateFeatureFlagRequest) =>
    api.post<FeatureFlag>("/feature-flags", data),

  list: () => api.get<FeatureFlag[]>("/feature-flags"),

  get: (id: string) => api.get<FeatureFlag>(`/feature-flags/${id}`),

  update: (id: string, data: UpdateFeatureFlagRequest) =>
    api.put<FeatureFlag>(`/feature-flags/${id}`, data),

  delete: (id: string) => api.delete<void>(`/feature-flags/${id}`),
};

// Feature Gates
export const featureGateApi = {
  create: (data: CreateFeatureGateRequest) =>
    api.post<FeatureGate>("/feature-gates", data),

  list: (flagId?: string) =>
    api.get<FeatureGate[]>("/feature-gates", {
      params: flagId ? { flag_id: flagId } : {},
    }),

  get: (id: string) => api.get<FeatureGate>(`/feature-gates/${id}`),

  evaluate: (id: string, data: EvaluateFeatureGateRequest) =>
    api.post<FeatureGateEvaluationResponse>(
      `/feature-gates/${id}/evaluate`,
      data,
    ),
};

// Accounts
export const accountApi = {
  list: () => api.get<Account[]>("/accounts"),
  create: (name: string) => api.post("/accounts", { name }),
  createInvite: (accountId: string, data: CreateInviteRequest) =>
    api.post<{ token: string }>(`/accounts/${accountId}/invites`, data),
};

// Invites
export const inviteApi = {
  getDetails: (token: string) =>
    api.get<InviteDetailsResponse>(`/invites/${token}`),
  accept: (token: string) => api.post("/invites/accept", { token }),
};

// Tracking
export const trackApi = {
  startSession: (data: StartSessionRequest) =>
    api.post<StartSessionResponse>("/track/session/start", data, {
      headers: getTrackingHeaders(),
    }),

  endSession: (data: EndSessionRequest) =>
    api.post<Session>("/track/session/end", data, {
      headers: getTrackingHeaders(),
    }),

  trackEvent: (data: TrackEventRequest) =>
    api.post<ActivityEvent>("/track/event", data, {
      headers: getTrackingHeaders(),
    }),

  trackReplay: (data: TrackReplayRequest) =>
    api.post("/track/replay", data, { headers: getTrackingHeaders() }),

  listSessions: (limit = 20, offset = 0, signal?: AbortSignal) =>
    api.get<ListSessionsResponse>("/track/sessions", {
      params: { limit, offset },
      headers: getTrackingHeaders(),
      signal,
    }),

  getReplay: (
    sessionId: string,
    limit = 1200,
    offset = 0,
    signal?: AbortSignal,
  ) =>
    api.get<import("../types").ReplayEvent[]>(`/track/replay/${sessionId}`, {
      params: { limit, offset },
      headers: getTrackingHeaders(),
      signal,
    }),

  listEvents: (
    sessionId: string,
    eventType?: string,
    limit = 200,
    signal?: AbortSignal,
  ) =>
    api.get<ActivityEvent[]>("/track/events", {
      params: { session_id: sessionId, event_type: eventType, limit },
      headers: getTrackingHeaders(),
      signal,
    }),

  listAllEvents: (params?: {
    event_type?: string;
    event_name?: string;
    days_back?: number;
    limit?: number;
    offset?: number;
    experiment_id?: string;
  }) =>
    api.get<{ events: ActivityEvent[]; total: number }>("/track/events/all", { params }),
};

// Analytics
export const analyticsApi = {
  getOverview: () => api.get<AnalyticsOverviewResponse>("/analytics/overview"),
};

// AI Assist (LiteLLM proxy)
export const aiApi = {
  chat: (data: AiChatRequest) => api.post<AiChatResponse>("/ai/chat", data),
  models: () => api.get<AiModelsResponse>("/ai/models"),
};

// AI Strategist
export const aiStrategistApi = {
  suggestExperiments: () =>
    api.post<ExperimentSuggestion[]>("/ai/suggest-experiments"),
  draftHypothesis: (data: DraftHypothesisRequest) =>
    api.post<HypothesisDraft>("/ai/draft-hypothesis", data),
  draftOnePager: (data: DraftOnePagerRequest) =>
    api.post<OnePagerDraft>("/ai/draft-1pager", data),
  suggestMetrics: (data: SuggestMetricsRequest) =>
    api.post<MetricSuggestionsResponse>("/ai/suggest-metrics", data),
  summarizeExperiment: (id: string) =>
    api.post<ExperimentSummaryResponse>(`/ai/summarize-experiment/${id}`),
};

// AI Insights
export const aiInsightsApi = {
  list: (params?: {
    experiment_id?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }) => api.get<InsightsListResponse>("/ai/insights", { params }),
  summary: () => api.get<InsightsSummaryResponse>("/ai/insights/summary"),
  dismiss: (id: string) =>
    api.post<{ ok: boolean }>(`/ai/insights/${id}/dismiss`),
};

// Auth
export const authApi = {
  register: (data: RegisterRequest) =>
    api.post<AuthStatusResponse>("/auth/register", data),
  login: (data: LoginRequest) =>
    api.post<AuthStatusResponse>("/auth/login", data),
  verifyOtp: (data: VerifyOtpRequest) =>
    api.post<AuthTokenResponse>("/auth/verify-otp", data),
  setupTotp: (user_id: string) =>
    api.post<TotpSetupResponse>("/auth/totp/setup", { user_id }),
  verifyTotp: (user_id: string, code: string) =>
    api.post("/auth/totp/verify", { user_id, code }),
  disableTotp: (user_id: string) => api.post("/auth/totp/disable", { user_id }),
  me: (user_id: string) => api.get<AuthUserProfile>(`/auth/me/${user_id}`),
  forgotPassword: (data: ForgotPasswordRequest) =>
    api.post("/auth/forgot-password", data),
  resetPassword: (data: ResetPasswordRequest) =>
    api.post("/auth/reset-password", data),
};

// SDK Tokens
export const sdkApi = {
  getTokens: () => api.get<SdkTokensResponse>("/sdk/tokens"),
  rotateTokens: (data: RotateSdkTokensRequest) =>
    api.post<SdkTokensResponse>("/sdk/tokens/rotate", data),
};

// Integrations
export const integrationApi = {
  list: () => api.get<AccountIntegration[]>("/integrations"),
  upsertSlack: (data: UpsertSlackIntegrationRequest) =>
    api.put<AccountIntegration>("/integrations/slack", data),
  upsertJira: (data: UpsertJiraIntegrationRequest) =>
    api.put<AccountIntegration>("/integrations/jira", data),
  delete: (type: "slack" | "jira") =>
    api.delete<void>(`/integrations/${type}`),
  testJira: () =>
    api.post<JiraTestConnectionResponse>("/integrations/jira/test"),
};

// Telemetry
export const telemetryApi = {
  listAll: () =>
    api.get<TelemetryEvent[]>('/telemetry'),
  list: (experimentId: string) =>
    api.get<TelemetryEvent[]>(`/experiments/${experimentId}/telemetry`),
  create: (experimentId: string, data: CreateTelemetryEventRequest) =>
    api.post<TelemetryEvent>(`/experiments/${experimentId}/telemetry`, data),
  createBulk: (experimentId: string, data: BulkCreateTelemetryEventRequest) =>
    api.post<TelemetryEvent[]>(`/experiments/${experimentId}/telemetry/bulk`, data),
  update: (experimentId: string, eventId: string, data: UpdateTelemetryEventRequest) =>
    api.put<TelemetryEvent>(`/experiments/${experimentId}/telemetry/${eventId}`, data),
  delete: (experimentId: string, eventId: string) =>
    api.delete<void>(`/experiments/${experimentId}/telemetry/${eventId}`),
};

export default api;
