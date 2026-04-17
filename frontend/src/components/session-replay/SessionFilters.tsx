import React from 'react';
import { FacetSearchBar, type FacetDef } from '../FacetSearchBar';

// ─── types ────────────────────────────────────────────────────────────────────

export type SessionFilterKey = 'status' | 'session' | 'user' | 'gate' | 'experiment';
export type SessionActiveFilter = { facet: SessionFilterKey; value: string };

// ─── constants ────────────────────────────────────────────────────────────────

const SESSION_FACETS: FacetDef[] = [
    { key: 'status',     label: 'Status',       placeholder: 'live, completed'    },
    { key: 'session',    label: 'Session ID',   placeholder: 'e.g. abc123'        },
    { key: 'user',       label: 'User ID',      placeholder: 'e.g. usr_abc123'    },
    { key: 'gate',       label: 'Feature Gate', placeholder: 'e.g. my_flag'       },
    { key: 'experiment', label: 'Experiment',   placeholder: 'e.g. My Experiment' },
];

// ─── main component ───────────────────────────────────────────────────────────

type SessionFiltersProps = {
    activeFilters: SessionActiveFilter[];
    onAdd: (facet: SessionFilterKey, value: string) => void;
    onRemove: (facet: SessionFilterKey) => void;
    onClearAll: () => void;
    suggestions: Record<SessionFilterKey, string[]>;
};

export const SessionFilters: React.FC<SessionFiltersProps> = ({ activeFilters, onAdd, onRemove, onClearAll, suggestions }) => (
    <FacetSearchBar
        facets={SESSION_FACETS}
        activeFilters={activeFilters}
        onAdd={(facet, value) => onAdd(facet as SessionFilterKey, value)}
        onRemove={(facet) => onRemove(facet as SessionFilterKey)}
        onClearAll={onClearAll}
        suggestions={suggestions}
        placeholder="Filter sessions…"
    />
);
