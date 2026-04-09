import React from 'react';
import { Link } from 'react-router-dom';

type AssistCard = {
    title: string;
    badge: string;
    description: string;
    link: string;
    linkText: string;
    onAction?: () => Promise<void>;
    actionLabel?: string;
};

type AssistCardsProps = {
    cards?: AssistCard[];
    onSuggestExperiments?: () => Promise<void>;
    onDraftHypothesis?: () => Promise<void>;
    isBusy?: boolean;
};

export const AssistCards: React.FC<AssistCardsProps> = ({
    cards,
    onSuggestExperiments,
    onDraftHypothesis,
    isBusy = false,
}) => {
    const [loadingCard, setLoadingCard] = React.useState<string | null>(null);

    const DEFAULT_CARDS: AssistCard[] = [
        {
            title: 'Experiment Insights',
            badge: 'Auto-summary',
            description: 'Generate live summaries, highlight winners, and identify statistical risks.',
            link: '/dashboard',
            linkText: 'Open Experiments →',
            onAction: onSuggestExperiments,
            actionLabel: 'Suggest Experiments',
        },
        {
            title: 'Hypothesis + Metrics',
            badge: 'Create flow',
            description: 'Suggest primary metrics and auto-draft hypotheses based on experiment type.',
            link: '/dashboard?new=1',
            linkText: 'Create Experiment →',
            onAction: onDraftHypothesis,
            actionLabel: 'Draft Hypothesis',
        },
        {
            title: 'Alert Triage',
            badge: 'Insights',
            description: 'Summarize alert feeds, SRM risks, and guardrail anomalies.',
            link: '/insights',
            linkText: 'View Insights →',
        },
        {
            title: 'Targeting Rule Copilot',
            badge: 'User Groups',
            description: 'Convert plain-language targeting ideas into JSON rules.',
            link: '/user-groups',
            linkText: 'Manage User Groups →',
        },
        {
            title: 'Feature Gate Rollout Advisor',
            badge: 'Flags + Gates',
            description: 'Recommended rollout steps based on gate status, linked experiments, and guardrails.',
            link: '/feature-flags',
            linkText: 'Open Feature Flags →',
        },
    ];

    const activeCards = cards?.length ? cards : DEFAULT_CARDS;

    const handleAction = async (card: AssistCard) => {
        if (!card.onAction || isBusy) return;
        setLoadingCard(card.title);
        try {
            await card.onAction();
        } finally {
            setLoadingCard(null);
        }
    };

    return (
        <div className="space-y-0">
            {activeCards.map((card) => (
                <div key={card.title} className="card">
                    <div className="flex items-center justify-between">
                        <h3>{card.title}</h3>
                        <span className="badge-gray">{card.badge}</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{card.description}</p>
                    <div className="mt-4 flex items-center gap-4">
                        <Link to={card.link} className="inline-flex items-center text-slate-300 hover:text-slate-200">
                            {card.linkText}
                        </Link>
                        {card.onAction && card.actionLabel && (
                            <button
                                onClick={() => handleAction(card)}
                                disabled={isBusy || loadingCard === card.title}
                                className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingCard === card.title ? 'Loading…' : `✦ ${card.actionLabel}`}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
