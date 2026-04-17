import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { experimentApi, telemetryApi, trackApi, userFlowApi } from '../../services/api';
import { LoadingSpinner } from '../../components/Common';
import { useAccount } from '../../contexts/AccountContext';
import { useToast } from '../../contexts/ToastContext';
import { FacetSearchBar, type FacetDef } from '../../components/FacetSearchBar';
import type {
    TelemetryEvent,
    UpdateTelemetryEventRequest,
    BulkCreateTelemetryEventRequest,
    UserFlow,
    CreateUserFlowRequest,
    UpdateUserFlowRequest,
} from '../../types';

// ─── types ────────────────────────────────────────────────────────────────────

type FilterKey = 'status' | 'event_type' | 'name' | 'experiment';
type ActiveFilter = { facet: FilterKey; value: string };
type FlowFilter = { facet: string; value: string };

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

const FLOW_FACETS: FacetDef[] = [
    { key: 'experiment', label: 'Experiment', placeholder: 'e.g. My Experiment' },
    { key: 'status',     label: 'Status',     placeholder: 'active, inactive'   },
    { key: 'name',       label: 'Flow name',  placeholder: 'e.g. checkout flow' },
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

// ─── ImageLightbox ────────────────────────────────────────────────────────────

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <img src={src} alt="Visual guide" className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
    );
}

// ─── InfoTooltip ──────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
    return (
        <span className="group relative inline-flex items-center">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-500 cursor-default" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-48 -translate-x-1/2 rounded bg-slate-800 border border-slate-700/60 px-2 py-1 text-[11px] text-slate-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {text}
            </span>
        </span>
    );
}

// ─── ImageUpload ──────────────────────────────────────────────────────────────

function ImageUpload({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = e => onChange(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    if (value) {
        return (
            <div className={`relative overflow-hidden rounded border border-slate-700/60 bg-slate-800/60 ${compact ? 'h-10' : 'h-32'}`}>
                <img src={value} alt="Visual guide" className="h-full w-full object-cover" />
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/80 p-0.5 text-slate-300 hover:text-white transition-colors"
                    aria-label="Remove image"
                >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-slate-600/60 bg-slate-800/30 text-slate-500 hover:border-cyan-500/40 hover:text-slate-400 transition-colors ${compact ? 'h-10 flex-row' : 'h-32 flex-col'}`}
            >
                <svg viewBox="0 0 24 24" className={compact ? 'h-4 w-4 shrink-0' : 'h-6 w-6'} fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs">{compact ? 'Visual guide' : 'Upload image'}</span>
                {compact && <InfoTooltip text="Annotated UI screenshot showing which element this metric tracks" />}
            </button>
        </>
    );
}

// ─── FlowModal — create or edit a user flow ───────────────────────────────────

function guessEventType(name: string): 'click' | 'pageview' | 'other' {
    if (/click|tap|press|btn|button|cta/i.test(name)) return 'click';
    if (/view|page|screen|visit|load/i.test(name)) return 'pageview';
    return 'other';
}

const TYPE_DOT: Record<string, string> = {
    click:    'bg-blue-400',
    pageview: 'bg-emerald-400',
    other:    'bg-slate-500',
};

function FlowModal({
    experiments,
    initialExperimentId,
    existing,
    onClose,
    onSaved,
}: {
    experiments: import('../../types').Experiment[];
    initialExperimentId?: string;
    existing?: UserFlow;
    onClose: () => void;
    onSaved?: (experimentId: string) => void;
}) {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const [selectedExpId, setSelectedExpId] = React.useState(
        existing?.experiment_id ?? initialExperimentId ?? ''
    );
    const [name, setName] = React.useState(existing?.name ?? '');
    const [steps, setSteps] = React.useState<string[]>(existing?.steps ?? []);
    const [isActive, setIsActive] = React.useState(existing?.is_active ?? true);
    const [error, setError] = React.useState<string | null>(null);
    const [dragIdx, setDragIdx] = React.useState<number | null>(null);
    const [dropIdx, setDropIdx] = React.useState<number | null>(null);

    const { data: expEvents = [] } = useQuery({
        queryKey: ['telemetry', selectedExpId],
        queryFn: () => telemetryApi.list(selectedExpId).then(r => r.data),
        enabled: !!selectedExpId,
    });
    const stepSuggestions = React.useMemo(
        () => expEvents.map(e => e.name).sort(),
        [expEvents]
    );

    const saveMutation = useMutation({
        mutationFn: (data: CreateUserFlowRequest | UpdateUserFlowRequest) =>
            existing
                ? userFlowApi.update(selectedExpId, existing.id, data as UpdateUserFlowRequest)
                : userFlowApi.create(selectedExpId, data as CreateUserFlowRequest),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-flows'] });
            onSaved?.(selectedExpId);
            onClose();
            addToast('User flow saved', 'success');
        },
        onError: (err: unknown) => {
            setError(err instanceof Error ? err.message : 'Failed to save flow');
            addToast('Failed to save flow', 'error');
        },
    });

    const addStep = () => setSteps(prev => [...prev, '']);
    const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));
    const updateStep = (i: number, v: string) =>
        setSteps(prev => prev.map((s, idx) => idx === i ? v : s));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedExpId) { setError('Experiment is required.'); return; }
        if (!name.trim()) { setError('Name is required.'); return; }
        saveMutation.mutate({ name, steps, is_active: isActive });
    };

    const previewSteps = steps.filter(Boolean);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
                    <h3 className="text-lg font-medium text-slate-100">{existing ? 'Edit Flow' : 'New Flow'}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {/* Experiment */}
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Experiment <span className="text-rose-400">*</span>
                            </label>
                            <select
                                value={selectedExpId}
                                onChange={e => setSelectedExpId(e.target.value)}
                                disabled={!!existing}
                                required
                                className="input"
                            >
                                <option value="">— select experiment —</option>
                                {experiments.map(exp => (
                                    <option key={exp.id} value={exp.id}>{exp.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Name */}
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Name <span className="text-rose-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                placeholder="e.g. Checkout Flow"
                                className="input"
                            />
                        </div>

                        {/* Steps builder */}
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Steps
                            </label>
                            <div className="space-y-0">
                                {steps.map((step, i) => (
                                    <React.Fragment key={i}>
                                        <div
                                            draggable
                                            onDragStart={() => setDragIdx(i)}
                                            onDragOver={e => { e.preventDefault(); setDropIdx(i); }}
                                            onDrop={() => {
                                                if (dragIdx !== null && dragIdx !== i) {
                                                    setSteps(prev => {
                                                        const arr = [...prev];
                                                        const [item] = arr.splice(dragIdx, 1);
                                                        arr.splice(i, 0, item);
                                                        return arr;
                                                    });
                                                }
                                                setDragIdx(null); setDropIdx(null);
                                            }}
                                            onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                                            className={`flow-step-row flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-all ${
                                                dragIdx === i
                                                    ? 'opacity-30 scale-95 border-slate-700/40 bg-slate-800/30'
                                                    : dropIdx === i && dragIdx !== null
                                                        ? 'border-l-2 border-cyan-500 border-slate-700/40 bg-slate-800/50'
                                                        : 'border-slate-700/40 bg-slate-800/50'
                                            }`}
                                        >
                                            {/* Drag handle */}
                                            <span className="cursor-grab text-slate-600 hover:text-slate-400 shrink-0" title="Drag to reorder">
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                                    <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                                                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                                                    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                                                </svg>
                                            </span>
                                            {/* Step number badge */}
                                            <span className="flow-step-number flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-400">
                                                {i + 1}
                                            </span>
                                            {/* Event type dot */}
                                            <span className={`h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[guessEventType(step)]}`} />
                                            {/* Event selector */}
                                            <select
                                                value={step}
                                                onChange={e => updateStep(i, e.target.value)}
                                                className="input flex-1 !py-1 !px-2 !text-xs !rounded font-mono"
                                            >
                                                <option value="">— select event —</option>
                                                {stepSuggestions.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                                {step && !stepSuggestions.includes(step) && (
                                                    <option value={step}>{step}</option>
                                                )}
                                            </select>
                                            {/* Remove button */}
                                            <button
                                                type="button"
                                                onClick={() => removeStep(i)}
                                                className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"
                                                title="Remove step"
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        {/* Connector arrow between steps */}
                                        {i < steps.length - 1 && (
                                            <div className="flex justify-center py-1 text-slate-600 text-sm select-none">↓</div>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={addStep}
                                className="flow-add-step mt-3 flex items-center gap-1.5 text-xs text-cyan-800 hover:text-cyan-300 transition-colors"
                            >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                                </svg>
                                Add step
                            </button>

                            {previewSteps.length > 0 && (
                                <div className="flow-step-preview mt-3 rounded-lg bg-slate-800/50 border border-slate-700/40 p-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Preview</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {previewSteps.map((step, i) => (
                                            <React.Fragment key={i}>
                                                <span className="flow-step-badge px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">{step}</span>
                                                {i < previewSteps.length - 1 && <span className="text-slate-500 text-sm">→</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={e => setIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                            />
                            <span className="text-sm text-slate-300">Active</span>
                        </label>

                        {error && (
                            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-6 py-4">
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                        <button type="submit" disabled={saveMutation.isPending} className="btn-primary text-sm disabled:opacity-50">
                            {saveMutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create Flow'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── DefinitionModal — create multiple events at once ─────────────────────────

function DefinitionModal({
    experimentId,
    experiments,
    eventNameSuggestions,
    onClose,
    onCreateFlow,
}: {
    experimentId: string;
    experiments: import('../../types').Experiment[];
    eventNameSuggestions: string[];
    onClose: () => void;
    onCreateFlow?: (experimentId: string) => void;
}) {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const [selectedExpId, setSelectedExpId] = React.useState(
        experimentId || experiments[0]?.id || ''
    );
    const [isActive, setIsActive] = React.useState(true);
    const [rows, setRows] = React.useState<EventRow[]>([{ ...BLANK_ROW }]);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [createdExpId, setCreatedExpId] = React.useState<string | null>(null);

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
            queryClient.invalidateQueries({ queryKey: ['telemetry'] });
            setCreatedExpId(selectedExpId);
            addToast(`${rows.length} events created`, 'success');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create events');
            addToast('Failed to create events', 'error');
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

                {createdExpId !== null ? (
                    <>
                        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-4 text-center">
                            <span className="text-2xl text-emerald-400">✓</span>
                            <p className="text-slate-200 font-medium">Telemetry events created</p>
                            <p className="text-sm text-slate-400">Would you like to set up a user flow for these events?</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-6 py-4">
                            <button type="button" onClick={onClose} className="btn-secondary text-sm">Skip</button>
                            <button
                                type="button"
                                onClick={() => { onClose(); onCreateFlow?.(createdExpId); }}
                                className="btn-primary text-sm"
                            >
                                Create User Flow →
                            </button>
                        </div>
                    </>
                ) : (
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
                                            <ImageUpload
                                                compact
                                                value={row.visual_guide}
                                                onChange={v => updateRow(idx, 'visual_guide', v)}
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
                )}
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
    const { addToast } = useToast();
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
            queryClient.invalidateQueries({ queryKey: ['telemetry'] });
            onClose();
            addToast('Telemetry event updated', 'success');
        },
        onError: () => addToast('Failed to update event', 'error'),
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
                            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Visual guide
                                <InfoTooltip text="Annotated UI screenshot showing which element this metric tracks" />
                            </label>
                            <ImageUpload value={visualGuide} onChange={setVisualGuide} />
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
    const { activeAccountId } = useAccount();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = React.useState<'metrics' | 'flows'>('metrics');
    const [activeFilters, setActiveFilters] = React.useState<ActiveFilter[]>([]);
    const [page, setPage] = React.useState(0);
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [editingEvent, setEditingEvent] = React.useState<TelemetryEvent | null>(null);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
    const [showFlowModal, setShowFlowModal] = React.useState(false);
    const [editingFlow, setEditingFlow] = React.useState<UserFlow | null>(null);
    const [deletingFlowId, setDeletingFlowId] = React.useState<string | null>(null);
    const [flowFilters, setFlowFilters] = React.useState<FlowFilter[]>([]);

    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: () => experimentApi.list().then(r => r.data),
        enabled: !!activeAccountId,
    });

    const experimentNameFilter = activeFilters.find(f => f.facet === 'experiment')?.value;
    const experimentId = experiments.find(e => e.name === experimentNameFilter)?.id;

    const { data: events = [], isLoading } = useQuery({
        queryKey: ['telemetry', activeAccountId, experimentId],
        queryFn: () => experimentId
            ? telemetryApi.list(experimentId).then(r => r.data)
            : telemetryApi.listAll().then(r => r.data),
        enabled: !!activeAccountId,
    });

    // Tracked event names for the name combobox
    const { data: trackedData } = useQuery({
        queryKey: ['tracked-event-names', activeAccountId],
        queryFn: () => trackApi.listAllEvents({ limit: 500, offset: 0 }).then(r => r.data),
        staleTime: 5 * 60 * 1000,
        enabled: !!activeAccountId,
    });

    const eventNameSuggestions = React.useMemo(() => {
        const fromTracked = trackedData?.events?.map(e => e.event_name) ?? [];
        const fromTelemetry = events.map(e => e.name);
        return [...new Set([...fromTracked, ...fromTelemetry])].sort();
    }, [trackedData, events]);

    const deleteMutation = useMutation({
        mutationFn: (ev: TelemetryEvent) => telemetryApi.delete(ev.experiment_id, ev.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telemetry', activeAccountId] });
            setDeletingId(null);
            addToast('Telemetry event deleted', 'success');
        },
        onError: () => addToast('Failed to delete event', 'error'),
    });

    const toggleMutation = useMutation({
        mutationFn: (ev: TelemetryEvent) =>
            telemetryApi.update(ev.experiment_id, ev.id, { is_active: !ev.is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telemetry', activeAccountId] });
            addToast('Event status updated', 'success');
        },
        onError: () => addToast('Failed to update event status', 'error'),
    });

    const { data: allUserFlows = [], isLoading: flowsLoading } = useQuery({
        queryKey: ['user-flows', activeAccountId],
        queryFn: () => userFlowApi.listAll().then(r => r.data),
        enabled: !!activeAccountId,
    });

    const filteredFlows = React.useMemo(() => {
        let result = allUserFlows;
        for (const f of flowFilters) {
            if (f.facet === 'experiment') {
                const expId = experiments.find(e => e.name === f.value)?.id;
                if (expId) result = result.filter(fl => fl.experiment_id === expId);
            } else if (f.facet === 'status') {
                result = result.filter(fl => fl.is_active === (f.value === 'active'));
            } else if (f.facet === 'name') {
                result = result.filter(fl => fl.name.toLowerCase().includes(f.value.toLowerCase()));
            }
        }
        return result;
    }, [allUserFlows, flowFilters, experiments]);

    const flowSuggestions = React.useMemo(() => ({
        experiment: experiments.map(e => e.name),
        status:     ['active', 'inactive'],
        name:       [...new Set(allUserFlows.map(f => f.name))].slice(0, 20),
    }), [allUserFlows, experiments]);

    const deleteFlowMutation = useMutation({
        mutationFn: (flow: UserFlow) => userFlowApi.delete(flow.experiment_id, flow.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-flows', activeAccountId] });
            setDeletingFlowId(null);
            addToast('User flow deleted', 'success');
        },
        onError: () => addToast('Failed to delete flow', 'error'),
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

    const addFilter = React.useCallback((facet: string, value: string) => {
        setActiveFilters(prev => [...prev.filter(f => f.facet !== facet), { facet: facet as FilterKey, value }]);
    }, []);

    const removeFilter = React.useCallback((facet: string) => {
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

            {/* Tab bar */}
            <div className="flex gap-0 border-b border-slate-800/60 mt-4">
                <button
                    onClick={() => setActiveTab('metrics')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        activeTab === 'metrics'
                            ? 'border-cyan-500 text-cyan-300'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Telemetry Metrics
                </button>
                <button
                    onClick={() => setActiveTab('flows')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        activeTab === 'flows'
                            ? 'border-cyan-500 text-cyan-300'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    User Flows
                </button>
            </div>

            {activeTab === 'metrics' && (<>
            {/* Filter toolbar */}
            <div className="space-y-6 pt-4">
                <div className="flex gap-2">
                    <FacetSearchBar
                        facets={FACETS}
                        activeFilters={activeFilters}
                        onAdd={addFilter}
                        onRemove={removeFilter}
                        onClearAll={() => setActiveFilters([])}
                        suggestions={valueSuggestions}
                        placeholder="Filter by status, event type, or name…"
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
                                    <th className="px-4 py-3">Visual Guide</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {pageEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
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
                                                    {ev.visual_guide
                                                        ? <img src={ev.visual_guide} alt="Visual guide" className="h-8 w-8 object-cover rounded cursor-pointer" onClick={() => setLightboxSrc(ev.visual_guide ?? null)} />
                                                        : <span className="text-slate-600">—</span>
                                                    }
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
            </>)}

            {/* User Flows tab */}
            {activeTab === 'flows' && (
                <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-2 pt-4">
                        <FacetSearchBar
                            facets={FLOW_FACETS}
                            activeFilters={flowFilters}
                            onAdd={(facet, value) =>
                                setFlowFilters(prev => [...prev.filter(f => f.facet !== facet), { facet, value }])
                            }
                            onRemove={facet => setFlowFilters(prev => prev.filter(f => f.facet !== facet))}
                            onClearAll={() => setFlowFilters([])}
                            suggestions={flowSuggestions}
                            placeholder="Filter by experiment, status, or name…"
                        />
                        <button
                            onClick={() => setShowFlowModal(true)}
                            className="btn-primary flex items-center gap-2 text-sm shrink-0"
                        >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                            </svg>
                            New Flow
                        </button>
                    </div>
                    <div className="panel overflow-hidden p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800/60 text-left text-xs capitalize tracking-wide text-slate-500">
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Experiment</th>
                                    <th className="px-4 py-3">Steps</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {flowsLoading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-10 text-center">
                                            <LoadingSpinner />
                                        </td>
                                    </tr>
                                ) : filteredFlows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                            No flows yet — click New Flow to create one.
                                        </td>
                                    </tr>
                                ) : (
                                                filteredFlows.map((flow, idx) => (
                                                    <tr key={flow.id} className="transition-colors hover:bg-slate-800/30">
                                                        <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-200">{flow.name}</td>
                                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                                            {experiments.find(e => e.id === flow.experiment_id)?.name ?? flow.experiment_id.slice(0, 8)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                {flow.steps.length === 0 ? (
                                                                    <span className="text-slate-600 text-xs">No steps</span>
                                                                ) : (
                                                                    <>
                                                                        {flow.steps.slice(0, 5).map((step, i) => (
                                                                            <React.Fragment key={i}>
                                                                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300">{step}</span>
                                                                                {i < Math.min(flow.steps.length, 5) - 1 && <span className="text-slate-500 text-xs">→</span>}
                                                                            </React.Fragment>
                                                                        ))}
                                                                        {flow.steps.length > 5 && (
                                                                            <span className="text-slate-500 text-xs">+{flow.steps.length - 5} more</span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                                                                flow.is_active
                                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                                            }`}>
                                                                {flow.is_active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                                            {new Date(flow.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => setEditingFlow(flow)}
                                                                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                                                                    title="Edit"
                                                                >
                                                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                    </svg>
                                                                </button>
                                                                {deletingFlowId === flow.id ? (
                                                                    <button
                                                                        onClick={() => deleteFlowMutation.mutate(flow)}
                                                                        disabled={deleteFlowMutation.isPending}
                                                                        className="rounded px-2 py-0.5 text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-colors disabled:opacity-40"
                                                                    >
                                                                        Confirm?
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setDeletingFlowId(flow.id)}
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
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                    </div>
                </div>
            )}

            {/* Visual guide lightbox */}
            {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

            {/* Create modal (multi-event) */}
            {showCreateModal && (
                <DefinitionModal
                    experimentId={experimentId ?? ''}
                    experiments={experiments}
                    eventNameSuggestions={eventNameSuggestions}
                    onClose={() => setShowCreateModal(false)}
                    onCreateFlow={(expId) => {
                        const expName = experiments.find(e => e.id === expId)?.name;
                        if (expName) setFlowFilters([{ facet: 'experiment', value: expName }]);
                        setShowFlowModal(true);
                    }}
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

            {/* Flow modal (create / edit) */}
            {(showFlowModal || editingFlow) && (
                <FlowModal
                    experiments={experiments}
                    initialExperimentId={
                        experiments.find(e => e.name === (flowFilters.find(f => f.facet === 'experiment')?.value ?? ''))?.id ?? ''
                    }
                    existing={editingFlow ?? undefined}
                    onClose={() => { setShowFlowModal(false); setEditingFlow(null); }}
                />
            )}
        </div>
    );
};

export default TelemetryPage;
function formatEventDate(ev: TelemetryEvent): React.ReactNode {
    return ev.created_at ? new Date(ev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : <span className="text-slate-600">—</span>;
}

