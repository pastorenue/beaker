import './sdk-demo.css';
import { ExpothesisTracker } from './sdk/expothesis';

const endpointInput = document.querySelector<HTMLInputElement>('#endpoint');
const apiKeyInput = document.querySelector<HTMLInputElement>('#apiKey');
const userIdInput = document.querySelector<HTMLInputElement>('#userId');
const startButton = document.querySelector<HTMLButtonElement>('#startSession');
const endButton = document.querySelector<HTMLButtonElement>('#endSession');
const ctaButton = document.querySelector<HTMLButtonElement>('#ctaClick');
const featureButton = document.querySelector<HTMLButtonElement>('#featureToggle');
const pageStepButton = document.querySelector<HTMLButtonElement>('#pageStep');
const sessionIdEl = document.querySelector<HTMLDivElement>('#sessionId');
const sessionStateEl = document.querySelector<HTMLDivElement>('#sessionState');
const eventLogEl = document.querySelector<HTMLDivElement>('#eventLog');

let tracker: ExpothesisTracker | null = null;

const logEvent = (message: string) => {
    if (!eventLogEl) return;
    const entry = document.createElement('p');
    entry.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
    eventLogEl.prepend(entry);
};

const updateStatus = (state: string, sessionId?: string) => {
    if (sessionStateEl) sessionStateEl.textContent = state;
    if (sessionIdEl) sessionIdEl.textContent = sessionId ?? '—';
};

const createTracker = () => {
    tracker = new ExpothesisTracker({
        endpoint: endpointInput?.value || '/api/track',
        apiKey: apiKeyInput?.value || undefined,
        userId: userIdInput?.value || undefined,
        autoTrack: true,
        recordReplay: true,
    });
};

startButton?.addEventListener('click', async () => {
    if (!tracker) {
        createTracker();
    }
    if (!tracker) return;
    await tracker.init();
    updateStatus('Active', tracker.getSessionId());
    logEvent('Session started');
});

endButton?.addEventListener('click', async () => {
    if (!tracker) return;
    await tracker.end();
    updateStatus('Ended', tracker.getSessionId());
    logEvent('Session ended');
    tracker = null;
});

ctaButton?.addEventListener('click', async () => {
    if (!tracker) return;
    await tracker.track('cta_click', { label: 'Primary CTA' }, 'click');
    logEvent('CTA click tracked');
});

featureButton?.addEventListener('click', async () => {
    if (!tracker) return;
    await tracker.track('feature_toggle', { feature: 'beta-dashboard', enabled: true }, 'toggle');
    logEvent('Feature toggle tracked');
});

pageStepButton?.addEventListener('click', async () => {
    if (!tracker) return;
    await tracker.track('page_step', { step: Math.floor(Math.random() * 5) + 1 }, 'custom');
    logEvent('Page step tracked');
});
