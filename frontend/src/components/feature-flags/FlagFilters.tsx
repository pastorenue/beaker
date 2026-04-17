import React from 'react';
import { FacetSearchBar, type FacetDef } from '../FacetSearchBar';

// ─── types ────────────────────────────────────────────────────────────────────

export type FilterKey = 'status' | 'environment' | 'owner' | 'tag' | 'experiment';
export type ActiveFilter = { facet: FilterKey; value: string };

// ─── constants ────────────────────────────────────────────────────────────────

const FACETS: FacetDef[] = [
    { key: 'status',      label: 'Status',      placeholder: 'active, inactive'   },
    { key: 'environment', label: 'Environment', placeholder: 'e.g. production'    },
    { key: 'owner',       label: 'Owner',       placeholder: 'e.g. team-platform' },
    { key: 'tag',         label: 'Tag',         placeholder: 'e.g. rollout'       },
    { key: 'experiment',  label: 'Experiment',  placeholder: 'e.g. My Experiment' },
];

// ─── main component ───────────────────────────────────────────────────────────

type FlagFiltersProps = {
    activeFilters: ActiveFilter[];
    onAdd: (facet: FilterKey, value: string) => void;
    onRemove: (facet: FilterKey) => void;
    onClearAll: () => void;
    suggestions: Record<FilterKey, string[]>;
};

export const FlagFilters: React.FC<FlagFiltersProps> = ({ activeFilters, onAdd, onRemove, onClearAll, suggestions }) => (
    <FacetSearchBar
        facets={FACETS}
        activeFilters={activeFilters}
        onAdd={(facet, value) => onAdd(facet as FilterKey, value)}
        onRemove={(facet) => onRemove(facet as FilterKey)}
        onClearAll={onClearAll}
        suggestions={suggestions}
        placeholder="Filter flags…"
    />
);
