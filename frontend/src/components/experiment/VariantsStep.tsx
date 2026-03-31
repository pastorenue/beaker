import React from 'react';
import type { CreateExperimentRequest, Variant } from '../../types';

type VariantsStepProps = {
    formData: CreateExperimentRequest;
    updateVariant: (index: number, field: keyof Variant, value: unknown) => void;
    removeVariant: (index: number) => void;
    addVariant: () => void;
};

export const VariantsStep: React.FC<VariantsStepProps> = ({
    formData,
    updateVariant,
    removeVariant,
    addVariant,
}) => {
    const totalAllocation = formData.variants.reduce((sum, v) => sum + v.allocation_percent, 0);

    return (
        <div className="space-y-4">
            {formData.variants.map((variant, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-semibold text-slate-100">
                            {variant.is_control && <span className="badge-info mr-2">Control</span>}
                            Variant {idx + 1}
                        </h4>
                        {!variant.is_control && formData.variants.length > 2 && (
                            <button onClick={() => removeVariant(idx)} className="text-rose-300 hover:text-rose-200">
                                Remove
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Name</label>
                            <input
                                type="text"
                                className="input"
                                value={variant.name}
                                onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="label">Allocation %</label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                className="input"
                                value={variant.allocation_percent}
                                onChange={(e) => updateVariant(idx, 'allocation_percent', parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="mt-2">
                        <label className="label">Description</label>
                        <input
                            type="text"
                            className="input"
                            value={variant.description}
                            onChange={(e) => updateVariant(idx, 'description', e.target.value)}
                            placeholder="Describe this variant"
                        />
                    </div>
                </div>
            ))}
            <button onClick={addVariant} className="btn-secondary w-full">
                + Add Variant
            </button>
            <div className="rounded-xl bg-gray-500/10 p-3 border border-cyan-500/20">
                <p className="text-sm text-slate-200">
                    Total Allocation:{' '}
                    <span className="font-bold">{totalAllocation.toFixed(1)}%</span>
                    {totalAllocation !== 100 && <span className="ml-2 text-amber-200">⚠ Must equal 100%</span>}
                </p>
            </div>
        </div>
    );
};
