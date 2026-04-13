import { record } from 'rrweb';

type EventPayload = Record<string, unknown>;

export interface BeakerTrackerConfig {
    endpoint?: string;
    userId?: string;
    sessionId?: string;
    apiKey?: string;
    autoTrack?: boolean;
    recordReplay?: boolean;
    replayBatchSize?: number;
    replayFlushIntervalMs?: number;
    replayMaxBatchBytes?: number;
    autoEndOnReload?: boolean;
    autoEndOnRouteChange?: boolean;
    autoRestartOnRouteChange?: boolean;
    replaySnapshotGraceMs?: number;
}

export class BeakerTracker {
    private endpoint: string;
    private userId?: string;
    private sessionId: string;
    private apiKey?: string;
    private autoTrack: boolean;
    private recordReplay: boolean;
    private replayBatchSize: number;
    private replayFlushIntervalMs: number;
    private replayMaxBatchBytes: number;
    private autoEndOnReload: boolean;
    private autoEndOnRouteChange: boolean;
    private autoRestartOnRouteChange: boolean;
    private replaySnapshotGraceMs: number;
    private replayBuffer: EventPayload[] = [];
    private replayBufferBytes = 0;
    private stopRecord?: () => void;
    private clickHandler?: (event: MouseEvent) => void;
    private flushTimer?: number;
    private pageHideHandler?: (event: Event) => void;
    private navigationHandler?: () => void;
    private originalHistory?: {
        pushState: History['pushState'];
        replaceState: History['replaceState'];
    };
    private lastUrl: string;
    private endInProgress = false;
    private replayHasFullSnapshot = false;
    private replayFullSnapshotPromise?: Promise<void>;
    private replayFullSnapshotResolve?: () => void;

    constructor(config: BeakerTrackerConfig = {}) {
        this.endpoint = config.endpoint ?? '/api/track';
        this.userId = config.userId;
        this.sessionId = config.sessionId ?? crypto.randomUUID();
        this.apiKey = config.apiKey;
        this.autoTrack = config.autoTrack ?? true;
        this.recordReplay = config.recordReplay ?? true;
        this.replayBatchSize = config.replayBatchSize ?? 120;
        this.replayFlushIntervalMs = config.replayFlushIntervalMs ?? 4000;
        this.replayMaxBatchBytes = config.replayMaxBatchBytes ?? 200_000;
        this.autoEndOnReload = config.autoEndOnReload ?? true;
        this.autoEndOnRouteChange = config.autoEndOnRouteChange ?? true;
        this.autoRestartOnRouteChange = config.autoRestartOnRouteChange ?? true;
        this.replaySnapshotGraceMs = config.replaySnapshotGraceMs ?? 1500;
        this.lastUrl = window.location.href;
    }

    async init() {
        await this.startSession();
        if (this.autoTrack) {
            this.trackPageView();
            this.bindClickTracking();
        }
        if (this.recordReplay) {
            this.startReplayRecording();
        }
        window.addEventListener('visibilitychange', this.handleVisibilityChange);
        this.bindNavigationHandlers();
    }

    identify(userId: string) {
        this.userId = userId;
    }

    getSessionId() {
        return this.sessionId;
    }

    async track(eventName: string, metadata: EventPayload = {}, eventType = 'custom') {
        const payload = {
            session_id: this.sessionId,
            user_id: this.userId,
            event_name: eventName,
            event_type: eventType,
            url: window.location.href,
            metadata,
            timestamp: new Date().toISOString(),
        };
        await this.send('/event', payload);
    }

    async end() {
        await this.endSession({ preserveListeners: false });
    }

    private async endSession(
        options: { preserveListeners: boolean; waitForSnapshot?: boolean } = { preserveListeners: false },
    ) {
        if (this.endInProgress) {
            return;
        }
        this.endInProgress = true;
        try {
            if (options.waitForSnapshot && this.recordReplay) {
                await this.waitForFullSnapshot();
            }
            this.stopReplayRecording();
            if (!options.preserveListeners) {
                this.unbindClickTracking();
                window.removeEventListener('visibilitychange', this.handleVisibilityChange);
                this.unbindNavigationHandlers();
            }
            await this.flushReplay();
            await this.send('/session/end', { session_id: this.sessionId, ended_at: new Date().toISOString() });
        } finally {
            this.endInProgress = false;
        }
    }

    private async startSession() {
        await this.send('/session/start', {
            session_id: this.sessionId,
            user_id: this.userId,
            entry_url: window.location.href,
            referrer: document.referrer || undefined,
            user_agent: navigator.userAgent,
            metadata: {
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight,
                language: navigator.language,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
        });
    }

    private trackPageView() {
        this.track('page_view', { path: window.location.pathname }, 'pageview');
    }

    private bindClickTracking() {
        this.clickHandler = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            this.send('/event', {
                session_id: this.sessionId,
                user_id: this.userId,
                event_name: 'click',
                event_type: 'click',
                url: window.location.href,
                selector: this.getSelector(target),
                x: event.clientX,
                y: event.clientY,
                metadata: {
                    screenWidth: window.innerWidth,
                    screenHeight: window.innerHeight,
                },
                timestamp: new Date().toISOString(),
            });
        };
        document.addEventListener('click', this.clickHandler);
    }

    private unbindClickTracking() {
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler);
        }
    }

    private startReplayRecording() {
        this.resetReplaySnapshotState();
        this.stopRecord = record({
            emit: (event: unknown) => {
                const payload = event as EventPayload;
                if (payload?.type === 2 && !this.replayHasFullSnapshot) {
                    this.replayHasFullSnapshot = true;
                    this.replayFullSnapshotResolve?.();
                }
                const serialized = JSON.stringify(payload);
                this.replayBuffer.push(payload);
                this.replayBufferBytes += serialized.length;
                if (payload?.type === 2) {
                    // Flush ASAP so full snapshots land before incrementals.
                    void this.flushReplay();
                    return;
                }
                if (this.replayBuffer.length >= this.replayBatchSize || this.replayBufferBytes >= this.replayMaxBatchBytes) {
                    void this.flushReplay();
                }
            },
            sampling: {
                mousemove: 200,
                scroll: 200,
                input: 'last',
                mouseInteraction: true,
            },
            recordCanvas: false,
            checkoutEveryNms: 30000,
            checkoutEveryNth: 1000,
        });
        this.flushTimer = window.setInterval(() => {
            this.flushReplay();
        }, this.replayFlushIntervalMs);
    }

    private stopReplayRecording() {
        if (this.stopRecord) {
            this.stopRecord();
            this.stopRecord = undefined;
        }
        if (this.flushTimer) {
            window.clearInterval(this.flushTimer);
        }
    }

    private handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            this.flushReplay();
        }
    };

    private bindNavigationHandlers() {
        if (this.autoEndOnReload && !this.pageHideHandler) {
            this.pageHideHandler = () => {
                void this.endSession({ preserveListeners: false, waitForSnapshot: true });
            };
            window.addEventListener('pagehide', this.pageHideHandler);
            window.addEventListener('beforeunload', this.pageHideHandler);
        }

        if (this.autoEndOnRouteChange && !this.navigationHandler) {
            this.navigationHandler = () => {
                if (window.location.href === this.lastUrl) {
                    return;
                }
                this.lastUrl = window.location.href;
                void this.handleRouteChange();
            };
            window.addEventListener('popstate', this.navigationHandler);
            window.addEventListener('hashchange', this.navigationHandler);
            if (!this.originalHistory) {
                const history = window.history;
                this.originalHistory = {
                    pushState: history.pushState,
                    replaceState: history.replaceState,
                };
                history.pushState = (...args: Parameters<History['pushState']>) => {
                    const result = this.originalHistory!.pushState.apply(history, args);
                    this.navigationHandler?.();
                    return result;
                };
                history.replaceState = (...args: Parameters<History['replaceState']>) => {
                    const result = this.originalHistory!.replaceState.apply(history, args);
                    this.navigationHandler?.();
                    return result;
                };
            }
        }
    }

    private unbindNavigationHandlers() {
        if (this.pageHideHandler) {
            window.removeEventListener('pagehide', this.pageHideHandler);
            window.removeEventListener('beforeunload', this.pageHideHandler);
            this.pageHideHandler = undefined;
        }
        if (this.navigationHandler) {
            window.removeEventListener('popstate', this.navigationHandler);
            window.removeEventListener('hashchange', this.navigationHandler);
            this.navigationHandler = undefined;
        }
        if (this.originalHistory) {
            const history = window.history;
            history.pushState = this.originalHistory.pushState;
            history.replaceState = this.originalHistory.replaceState;
            this.originalHistory = undefined;
        }
    }

    private async handleRouteChange() {
        if (this.endInProgress) {
            return;
        }
        await this.endSession({ preserveListeners: true, waitForSnapshot: true });
        if (!this.autoRestartOnRouteChange) {
            return;
        }
        this.sessionId = crypto.randomUUID();
        await this.startSession();
        if (this.autoTrack) {
            this.trackPageView();
        }
        if (this.recordReplay) {
            this.startReplayRecording();
        }
    }

    private resetReplaySnapshotState() {
        this.replayHasFullSnapshot = false;
        this.replayFullSnapshotPromise = new Promise((resolve) => {
            this.replayFullSnapshotResolve = resolve;
        });
    }

    private async waitForFullSnapshot() {
        if (this.replayHasFullSnapshot) {
            return;
        }
        if (!this.replayFullSnapshotPromise) {
            this.resetReplaySnapshotState();
        }
        await Promise.race([
            this.replayFullSnapshotPromise,
            new Promise<void>((resolve) => window.setTimeout(resolve, this.replaySnapshotGraceMs)),
        ]);
    }

    private async flushReplay() {
        if (this.replayBuffer.length === 0) {
            return;
        }
        const batch = this.replayBuffer.splice(0, this.replayBuffer.length);
        this.replayBufferBytes = 0;
        const ok = await this.send('/replay', { session_id: this.sessionId, events: batch });
        if (!ok) {
            // Requeue on failure so we can retry later.
            this.replayBuffer = batch.concat(this.replayBuffer);
            this.replayBufferBytes = batch.reduce((sum, item) => sum + JSON.stringify(item).length, 0);
        }
    }

    private async send(path: string, payload: EventPayload) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['x-beaker-key'] = this.apiKey;
        }
        const isReplay = path === '/replay';
        const controller = isReplay ? new AbortController() : undefined;
        const keepalive = path === '/session/end';
        const timeoutId = isReplay
            ? window.setTimeout(() => {
                controller?.abort();
            }, 10000)
            : undefined;
        try {
            const response = await fetch(`${this.endpoint}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                keepalive,
                signal: controller?.signal,
            });
            if (!response.ok && path === '/replay') {
                console.warn('Beaker replay upload failed', response.status, response.statusText);
            }
            return response.ok;
        } catch (error) {
            if (path === '/replay') {
                const err = error as { name?: string };
                if (err?.name === 'AbortError') {
                    console.warn('Beaker replay upload failed: timeout');
                } else {
                    console.warn('Beaker replay upload failed: network error');
                }
            }
            return false;
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    private getSelector(element: HTMLElement | null) {
        if (!element) {
            return undefined;
        }
        if (element.id) {
            return `#${element.id}`;
        }
        const className = element.className && typeof element.className === 'string' ? element.className.split(' ').filter(Boolean)[0] : '';
        return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
    }
}
