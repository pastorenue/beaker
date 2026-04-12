import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { experimentApi, telemetryApi, trackApi } from '../../services/api';
import { LoadingSpinner } from '../../components/Common';
import type {
    TelemetryEvent,
    UpdateTelemetryEventRequest,
    BulkCreateTelemetryEventRequest,
} from '../../types';

// ─── types ────────────────────────────────────────────────────────────────────

type FilterKey = 'status' | 'event_type' | 'name' | 'experiment';
type ActiveFilter = { facet: FilterKey; value: string };
type FacetDef = { key: FilterKey; label: string; placeholder: string };
type DropdownItem =
    | { kind: 'facet'; facet: FacetDef }
    | { kind: 'suggestion'; value: string }
    | { kind: 'add'; value: string };

interface EventRow {
    name: string;
    description: string;
    event_type: string;
    selector: string;
    url_pattern: string;
    visual_guide: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
    click:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
    pageview: 'bg-green-500/20 text-green-300 border-green-500/30',
    custom:   'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const FACETS: FacetDef[] = [
    { key: 'status',     label: 'Status',     placeholder: 'active, inactive' },
    { key: 'event_type', label: 'Event type', placeholder: 'click, pageview, custom' },
    { key: 'name',       label: 'Event name', placeholder: 'e.g. cta_click' },
    { key: 'experiment', label: 'Experiment', placeholder: 'e.g. My Experiment' },
];

const PAGE_SIZE = 20;

const BLANK_ROW: EventRow = {
    name: '', description: '', event_type: 'custom',
    selector: '', url_pattern: '', visual_guide: '',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [ref, onClose]);
}

function parseInput(input: string):
    | { mode: 'facet'; query: string }
    | { mode: 'value'; facet: string; query: string } {
    const colonIdx = input.indexOf(':');
    if (colonIdx === -1) return { mode: 'facet', query: input };
    return { mode: 'value', facet: input.slice(0, colonIdx), query: input.slice(colonIdx + 1) };
}


// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({ prefix, value, onRemove }: { prefix: string; value: string; onRemove: () => void }) {
    return (
        <span className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-300 flex-shrink-0">
            <span className="text-cyan-500/60">{prefix}:</span>
            {value}
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="ml-0.5 leading-none text-cyan-400/50 hover:text-cyan-200 transition-colors"
                aria-label={`Remove ${prefix}:${value} filter`}
            >×</button>
        </span>
    );
}

// ─── FacetSearchBar ───────────────────────────────────────────────────────────

function FacetSearchBar({
    activeFilters, onAdd, onRemove, onClearAll, suggestions,
}: {
    activeFilters: ActiveFilter[];
    onAdd: (facet: FilterKey, value: string) => void;
    onRemove: (facet: FilterKey) => void;
    onClearAll: () => void;
    suggestions: Record<FilterKey, string[]>;
}) {
    const [inputValue, setInputValue] = React.useState('');
    const [isOpen, setIsOpen] = React.useState(false);
    const [highlightedIdx, setHighlightedIdx] = React.useState(-1);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    useClickOutside(containerRef, () => { setIsOpen(false); setHighlightedIdx(-1); });

    const parsed = parseInput(inputValue);

    const dropdownItems: DropdownItem[] = React.useMemo(() => {
        if (parsed.mode === 'facet') {
            const q = parsed.query.toLowerCase();
            return FACETS
                .filter(f => !q || f.key.includes(q) || f.label.toLowerCase().includes(q))
                .map(f => ({ kind: 'facet' as const, facet: f }));
        }
        const facetKey = parsed.facet as FilterKey;
        const isValid = FACETS.some(f => f.key === facetKey);
        const suggs = isValid ? (suggestions[facetKey] ?? []) : [];
        const q = parsed.query.toLowerCase();
        const filtered: DropdownItem[] = suggs
            .filter(s => !q || s.toLowerCase().includes(q))
            .map(s => ({ kind: 'suggestion' as const, value: s }));
        if (parsed.query) filtered.push({ kind: 'add', value: parsed.query });
        return filtered;
    }, [parsed, suggestions]);

    React.useEffect(() => { setHighlightedIdx(-1); }, [inputValue]);

    const commitFilter = React.useCallback((facet: FilterKey, value: string) => {
        if (!value.trim()) return;
        onAdd(facet, value.trim());
        setInputValue('');
        setHighlightedIdx(-1);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [onAdd]);

    const handleItemClick = React.useCallback((item: DropdownItem) => {
        if (item.kind === 'facet') {
            setInputValue(`${item.facet.key}:`);
            setHighlightedIdx(-1);
            inputRef.current?.focus();
        } else if (parsed.mode === 'value') {
            commitFilter(parsed.facet as FilterKey, item.value);
        }
    }, [parsed, commitFilter]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIdx(i => Math.min(i + 1, dropdownItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIdx(i => Math.max(i - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIdx >= 0 && highlightedIdx < dropdownItems.length) {
                handleItemClick(dropdownItems[highlightedIdx]);
            } else if (parsed.mode === 'value' && parsed.query) {
                commitFilter(parsed.facet as FilterKey, parsed.query);
            } else if (parsed.mode === 'facet' && parsed.query) {
                const match = FACETS.find(f => f.key === parsed.query);
                if (match) { setInputValue(`${match.key}:`); setHighlightedIdx(-1); }
            }
        } else if (e.key === 'Backspace' && inputValue === '' && activeFilters.length > 0) {
            onRemove(activeFilters[activeFilters.length - 1].facet);
        } else if (e.key === 'Escape') {
            setIsOpen(false); setInputValue(''); setHighlightedIdx(-1);
        }
    };

    return (
        <div className="relative flex-1" ref={containerRef}>
            <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-[7px] min-h-[42px] transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 cursor-text"
                onClick={() => { inputRef.current?.focus(); setIsOpen(true); }}
            >
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
                {activeFilters.map(f => (
                    <FilterChip key={f.facet} prefix={f.facet} value={f.value} onRemove={() => onRemove(f.facet)} />
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeFilters.length === 0 ? 'Filter by status, event type, or name…' : ''}
                    className="min-w-[160px] flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none py-0.5"
                />
                {(inputValue || activeFilters.length > 0) && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setInputValue(''); if (activeFilters.length > 0) onClearAll(); }}
                        className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Clear all filters"
                    >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {isOpen && dropdownItems.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 shadow-2xl">
                    <div className="sticky top-0 border-b border-slate-800/60 bg-slate-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        {parsed.mode === 'facet' ? 'Filter by' : `${parsed.facet}:`}
                    </div>
                    {dropdownItems.map((item, idx) => (
                        <button
                            key={idx}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleItemClick(item)}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                                idx === highlightedIdx ? 'bg-slate-800/80 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60'
                            }`}
                        >
                            {item.kind === 'facet' ? (
                                <>
                                    <span className="shrink-0 font-mono text-xs text-cyan-400/80">{item.facet.key}</span>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-slate-300">{item.facet.label}</span>
                                    <span className="ml-auto text-[10px] text-slate-600">{item.facet.placeholder}</span>
                                </>
                            ) : item.kind === 'suggestion' ? (
                                <span>{item.value}</span>
                            ) : (
                                <>
                                    <span className="text-slate-500 text-xs">↵ Add</span>
                                    <span className="font-mono text-xs text-cyan-300/80">
                                        {parsed.mode === 'value' ? `${parsed.facet}:${item.value}` : item.value}
                                    </span>
                                </>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── NameCombobox — searchable event-name picker ──────────────────────────────

function NameCombobox({
    value,
    onChange,
    suggestions,
    required,
}: {
    value: string;
    onChange: (v: string) => void;
    suggestions: string[];
    required?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    useClickOutside(ref, () => setOpen(false));

    const filtered = React.useMemo(() => {
        const q = value.toLowerCase();
        return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 12);
    }, [value, suggestions]);

    return (
        <div className="relative flex-1 min-w-0" ref={ref}>
            <input
                required={required}
                type="text"
                value={value}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Select or type event name"
                className="input w-full !py-1.5 !px-2 !text-xs !rounded font-mono"
            />
            {open && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+2px)] z-40 max-h-48 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-900 shadow-2xl">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-800/60">
                        Tracked events
                    </div>
                    {filtered.map(s => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onChange(s); setOpen(false); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors font-mono"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── DefinitionModal — create multiple events at once ─────────────────────────

function DefinitionModal({
    experimentId,
    experiments,
    eventNameSuggestions,
    onClose,
}: {
    experimentId: string;
    experiments: import('../../types').Experiment[];
    eventNameSuggestions: string[];
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [selectedExpId, setSelectedExpId] = React.useState(
        experimentId || experiments[0]?.id || ''
    );
    const [isActive, setIsActive] = React.useState(true);
    const [rows, setRows] = React.useState<EventRow[]>([{ ...BLANK_ROW }]);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const updateRow = (idx: number, field: keyof EventRow, value: string) =>
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

    const addRow = () => setRows(prev => [...prev, { ...BLANK_ROW }]);
    const removeRow = (idx: number) => {
        if (rows.length <= 1) return;
        setRows(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedExpId) {
            setError('Please select an experiment.');
            return;
        }
        setSubmitting(true);
        try {
            await telemetryApi.createBulk(selectedExpId, {
                events: rows.map(row => ({
                    name: row.name,
                    description: row.description || undefined,
                    event_type: row.event_type || undefined,
                    selector: row.selector || undefined,
                    url_pattern: row.url_pattern || undefined,
                    visual_guide: row.visual_guide || undefined,
                    is_active: isActive,
                })),
            } as BulkCreateTelemetryEventRequest);
            queryClient.invalidateQueries({ queryKey: ['telemetry', selectedExpId] });
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create events');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
                    <h3 className="text-lg font-medium text-slate-100">New Telemetry</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {/* Experiment selector */}
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                                Experiment
                            </label>
                            <select
                                value={selectedExpId}
                                onChange={e => setSelectedExpId(e.target.value)}
                                required
                                className="input !py-1.5 !px-2 !text-sm !rounded shrink-0"
                            >
                                {experiments.map(exp => (
                                    <option key={exp.id} value={exp.id}>{exp.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Is Active */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={e => setIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                            />
                            <span className="text-sm text-slate-300">Active</span>
                        </label>

                        {/* Event rows */}
                        <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Events
                            </div>
                            <div className="space-y-3">
                                {rows.map((row, idx) => (
                                    <div key={idx} className="card rounded-lg p-3 space-y-2">
                                        {/* Row header */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 w-4 text-center">{idx + 1}</span>

                                            {/* Name — searchable */}
                                            <NameCombobox
                                                required
                                                value={row.name}
                                                onChange={v => updateRow(idx, 'name', v)}
                                                suggestions={eventNameSuggestions}
                                            />

                                            {/* Event type */}
                                            <select
                                                value={row.event_type}
                                                onChange={e => updateRow(idx, 'event_type', e.target.value)}
                                                className="input !py-1.5 !px-2 !text-xs !rounded !w-28 shrink-0"
                                            >
                                                <option value="custom">custom</option>
                                                <option value="click">click</option>
                                                <option value="pageview">pageview</option>
                                            </select>

                                            {/* Remove */}
                                            <button
                                                type="button"
                                                onClick={() => removeRow(idx)}
                                                disabled={rows.length <= 1}
                                                className="ml-auto text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-30"
                                                aria-label="Remove row"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Description */}
                                        <input
                                            type="text"
                                            value={row.description}
                                            onChange={e => updateRow(idx, 'description', e.target.value)}
                                            placeholder="Description (optional)"
                                            className="input !py-1.5 !px-2 !text-xs !rounded"
                                        />

                                        {/* Optional fields */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <input
                                                type="text"
                                                value={row.selector}
                                                onChange={e => updateRow(idx, 'selector', e.target.value)}
                                                placeholder="Selector"
                                                className="input !py-1.5 !px-2 !text-xs !rounded font-mono"
                                            />
                                            <input
                                                type="text"
                                                value={row.url_pattern}
                                                onChange={e => updateRow(idx, 'url_pattern', e.target.value)}
                                                placeholder="URL pattern"
                                                className="input !py-1.5 !px-2 !text-xs !rounded"
                                            />
                                            <input
                                                type="text"
                                                value={row.visual_guide}
                                                onChange={e => updateRow(idx, 'visual_guide', e.target.value)}
                                                placeholder="Visual guide"
                                                className="input !py-1.5 !px-2 !text-xs !rounded"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={addRow}
                                className="mt-2 flex items-center gap-1.5 text-xs text-cyan-800 hover:text-cyan-300 transition-colors"
                            >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                                </svg>
                                Add event
                            </button>
                        </div>

                        {error && (
                            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-6 py-4">
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                        <button type="submit" disabled={submitting} className="btn-primary text-sm disabled:opacity-50">
                            {submitting ? 'Creating…' : 'Create Telemetry'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── EventModal — edit a single event ────────────────────────────────────────

function EventModal({
    experimentId,
    existing,
    eventNameSuggestions,
    onClose,
}: {
    experimentId: string;
    existing: TelemetryEvent;
    eventNameSuggestions: string[];
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [name, setName] = React.useState(existing.name);
    const [description, setDescription] = React.useState(existing.description);
    const [eventType, setEventType] = React.useState(existing.event_type);
    const [selector, setSelector] = React.useState(existing.selector ?? '');
    const [urlPattern, setUrlPattern] = React.useState(existing.url_pattern ?? '');
    const [visualGuide, setVisualGuide] = React.useState(existing.visual_guide ?? '');
    const [isActive, setIsActive] = React.useState(existing.is_active);

    const updateMutation = useMutation({
        mutationFn: (data: UpdateTelemetryEventRequest) =>
            telemetryApi.update(experimentId, existing.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telemetry', experimentId] });
            onClose();
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateMutation.mutate({
            name,
            description: description || undefined,
            event_type: eventType,
            selector: selector || '',
            url_pattern: urlPattern || '',
            visual_guide: visualGuide || '',
            is_active: isActive,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-lg rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
                    <h3 className="text-lg font-medium text-slate-100">Edit Event</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <div className="px-6 py-4 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Name <span className="text-rose-400">*</span>
                            </label>
                            <NameCombobox
                                required
                                value={name}
                                onChange={setName}
                                suggestions={eventNameSuggestions}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Optional description"
                                className="input"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Event type</label>
                            <select
                                value={eventType}
                                onChange={e => setEventType(e.target.value)}
                                className="input"
                            >
                                <option value="custom">custom</option>
                                <option value="click">click</option>
                                <option value="pageview">pageview</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Selector</label>
                                <input type="text" value={selector} onChange={e => setSelector(e.target.value)} placeholder="#btn-cta"
                                    className="input font-mono" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">URL pattern</label>
                                <input type="text" value={urlPattern} onChange={e => setUrlPattern(e.target.value)} placeholder="/checkout/*"
                                    className="input" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Visual guide</label>
                            <input type="text" value={visualGuide} onChange={e => setVisualGuide(e.target.value)} placeholder="Optional screenshot URL or note"
                                className="input" />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30" />
                            <span className="text-sm text-slate-300">Active</span>
                        </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-6 py-4">
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                        <button type="submit" disabled={updateMutation.isPending} className="btn-primary text-sm disabled:opacity-50">
                            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── main page ────────────────────────────────────────────────────────────────

export const TelemetryPage: React.FC = () => {
    const queryClient = useQueryClient();
    const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);
    const [page, setPage] = React.useState(0);
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [editingEvent, setEditingEvent] = React.useState<TelemetryEvent | null>(null);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments'],
        queryFn: () => experimentApi.list().then(r => r.data),
    });

    const experimentNameFilter = activeFilters.find(f => f.facet === 'experiment')?.value;
    const experimentId = experiments.find(e => e.name === experimentNameFilter)?.id;

    const { data: events = [], isLoading } = useQuery({
        queryKey: ['telemetry', experimentId],
        queryFn: () => experimentId
            ? telemetryApi.list(experimentId).then(r => r.data)
            : telemetryApi.listAll().then(r => r.data),
    });

    // Tracked event names for the name combobox
    const { data: trackedData } = useQuery({
        queryKey: ['tracked-event-names'],
        queryFn: () => trackApi.listAllEvents({ limit: 500, offset: 0 }).then(r => r.data),
        staleTime: 5 * 60 * 1000,
    });

    const eventNameSuggestions = React.useMemo(() => {
        const fromTracked = trackedData?.events?.map(e => e.event_name) ?? [];
        const fromTelemetry = events.map(e => e.name);
        return [...new Set([...fromTracked, ...fromTelemetry])].sort();
    }, [trackedData, events]);

    const deleteMutation = useMutation({
        mutationFn: (ev: TelemetryEvent) => telemetryApi.delete(ev.experiment_id, ev.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telemetry', experimentId] });
            setDeletingId(null);
        },
    });

    const toggleMutation = useMutation({
        mutationFn: (ev: TelemetryEvent) =>
            telemetryApi.update(ev.experiment_id, ev.id, { is_active: !ev.is_active }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telemetry', experimentId] }),
    });

    const valueSuggestions: Record<FilterKey, string[]> = React.useMemo(() => ({
        status:     ['active', 'inactive'],
        event_type: [...new Set(events.map(e => e.event_type))],
        name:       [...new Set(events.map(e => e.name))].slice(0, 20),
        experiment: experiments.map(e => e.name),
    }), [events, experiments]);

    const filteredEvents = React.useMemo(() => {
        let result = events;
        for (const f of activeFilters) {
            if (f.facet === 'status') {
                result = result.filter(e => e.is_active === (f.value === 'active'));
            } else if (f.facet === 'event_type') {
                result = result.filter(e => e.event_type === f.value);
            } else if (f.facet === 'name') {
                result = result.filter(e => e.name.includes(f.value));
            }
        }
        return result;
    }, [events, activeFilters]);

    React.useEffect(() => { setPage(0); }, [activeFilters, experimentId]);

    const pageCount  = Math.ceil(filteredEvents.length / PAGE_SIZE);
    const pageEvents = filteredEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const addFilter = React.useCallback((facet: FilterKey, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: FilterKey) => {
        setActiveFilters(prev => prev.filter(f => f.facet !== facet));
    }, []);

    return (
        <div className="space-y-0">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-3xl font-medium text-slate-100">Telemetry Metrics</h2>
                    <p className="mt-1 text-slate-400">
                        All telemetry metrics tracked for the selected account.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary flex items-center gap-2 text-sm"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                    </svg>
                    New Telemetry
                </button>
            </div>

            {/* Filter toolbar */}
            <div className="space-y-6">
                <div className="flex gap-2">
                    <FacetSearchBar
                        activeFilters={activeFilters}
                        onAdd={addFilter}
                        onRemove={removeFilter}
                        onClearAll={() => setActiveFilters([])}
                        suggestions={valueSuggestions}
                    />
                </div>

                {!isLoading && (
                    <div className="flex items-center min-h-[20px]">
                        <span className="ml-auto text-xs text-slate-500">
                            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                            {filteredEvents.length < events.length ? ` of ${events.length}` : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Table */}
            {isLoading ? (
                <LoadingSpinner />
            ) : (
                <div className="panel overflow-hidden p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800/60 text-left text-xs capitalize tracking-wide text-slate-500">
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Selector</th>
                                    <th className="px-4 py-3">URL Pattern</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {pageEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                                            No events found
                                        </td>
                                    </tr>
                                ) : (
                                    pageEvents.map(ev => {
                                        const typeClass = EVENT_TYPE_COLORS[ev.event_type] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
                                        return (
                                            <tr key={ev.id} className="transition-colors hover:bg-slate-800/30">
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-0.5 text-sm font-mono text-slate-200">
                                                        {ev.name}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px]">
                                                    <span className="block truncate" title={ev.description}>
                                                        {ev.description || <span className="text-slate-600">—</span>}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeClass}`}>
                                                        {ev.event_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                                                    {ev.selector || <span className="text-slate-600">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs">
                                                    {ev.url_pattern || <span className="text-slate-600">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                                                        ev.is_active
                                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                                    }`}>
                                                        {ev.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs">
                                                    {formatEventDate(ev)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => setEditingEvent(ev)}
                                                            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                                                            title="Edit"
                                                        >
                                                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>

                                                        <button
                                                            onClick={() => toggleMutation.mutate(ev)}
                                                            disabled={toggleMutation.isPending}
                                                            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors disabled:opacity-40"
                                                            title={ev.is_active ? 'Deactivate' : 'Activate'}
                                                        >
                                                            {ev.is_active ? (
                                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z" />
                                                                </svg>
                                                            ) : (
                                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                                                </svg>
                                                            )}
                                                        </button>

                                                        {deletingId === ev.id ? (
                                                            <button
                                                                onClick={() => deleteMutation.mutate(ev)}
                                                                disabled={deleteMutation.isPending}
                                                                className="rounded px-2 py-0.5 text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-colors disabled:opacity-40"
                                                            >
                                                                Confirm?
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setDeletingId(ev.id)}
                                                                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                                                                title="Delete"
                                                            >
                                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {pageCount > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3">
                            <span className="text-xs text-slate-500">
                                Page {page + 1} of {pageCount} ({filteredEvents.length.toLocaleString()} events)
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={page === 0}
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    className="btn-secondary text-xs disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <button
                                    disabled={page >= pageCount - 1}
                                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                                    className="btn-secondary text-xs disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Create modal (multi-event) */}
            {showCreateModal && (
                <DefinitionModal
                    experimentId={experimentId ?? ''}
                    experiments={experiments}
                    eventNameSuggestions={eventNameSuggestions}
                    onClose={() => setShowCreateModal(false)}
                />
            )}

            {/* Edit modal (single event) */}
            {editingEvent && (
                <EventModal
                    experimentId={experimentId ?? ''}
                    existing={editingEvent}
                    eventNameSuggestions={eventNameSuggestions}
                    onClose={() => setEditingEvent(null)}
                />
            )}
        </div>
    );
};

export default TelemetryPage;
function formatEventDate(ev: TelemetryEvent): React.ReactNode {
    return ev.created_at ? new Date(ev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : <span className="text-slate-600">—</span>;
}

