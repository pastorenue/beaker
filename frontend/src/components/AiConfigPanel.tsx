import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiConfigApi } from '../services/api';
import type { AiRuntimeConfig } from '../services/api';

export const AiConfigPanel: React.FC = () => {
    const [form, setForm] = React.useState<AiRuntimeConfig>({
        polling_enabled: true,
        polling_interval_minutes: 15,
        auto_stop_regressions: false,
        severe_regression_threshold: -0.1,
    });
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['ai-config'],
        queryFn: () => aiConfigApi.get().then((r) => r.data),
    });

    React.useEffect(() => {
        if (!data) return;
        setForm(data);
    }, [data]);

    const saveMutation = useMutation({
        mutationFn: () => aiConfigApi.patch({ ...form }),
        onSuccess: () => {
            setSuccess('AI config saved. Polling interval changes take effect on next server restart.');
            setError(null);
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { error?: string } } };
            setError(e.response?.data?.error || 'Failed to save AI config');
            setSuccess(null);
        },
    });

    if (isLoading) {
        return <p className="text-sm text-slate-400">Loading AI configuration…</p>;
    }

    return (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 space-y-4">
            <div>
                <p className="font-semibold text-slate-100 text-sm">AI Polling</p>
                <p className="text-xs text-slate-500">Configure automated AI insight polling behaviour.</p>
            </div>

            <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.polling_enabled}
                        onChange={(e) => setForm((f) => ({ ...f, polling_enabled: e.target.checked }))}
                        className="accent-indigo-500"
                    />
                    Polling enabled
                </label>

                <div className="space-y-1">
                    <label className="label text-xs">Polling interval (minutes)</label>
                    <input
                        className="input text-sm"
                        type="number"
                        min={1}
                        value={form.polling_interval_minutes}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, polling_interval_minutes: Number(e.target.value) }))
                        }
                    />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.auto_stop_regressions}
                        onChange={(e) => setForm((f) => ({ ...f, auto_stop_regressions: e.target.checked }))}
                        className="accent-indigo-500"
                    />
                    Auto-stop on regressions
                </label>

                <div className="space-y-1">
                    <label className="label text-xs">Severe regression threshold</label>
                    <input
                        className="input text-sm"
                        type="number"
                        step={0.01}
                        value={form.severe_regression_threshold}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, severe_regression_threshold: Number(e.target.value) }))
                        }
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    className="btn-primary h-8 px-3 text-xs"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                >
                    {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                {error && <p className="text-xs text-rose-300">{error}</p>}
                {success && <p className="text-xs text-emerald-300">{success}</p>}
            </div>
        </div>
    );
};
