import React from 'react';
import type { FlowEdge, FlowNode } from './types';

type SimulationConfigPanelProps = {
    nodes: FlowNode[];
    edges: FlowEdge[];
    importText: string;
    importError: string | null;
    setImportText: (value: string) => void;
    setImportError: (value: string | null) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    toYaml: (flow: { nodes: FlowNode[]; edges: FlowEdge[] }) => string;
    parseYaml: (input: string) => { nodes: FlowNode[]; edges: FlowEdge[] };
    normalizeFlow: (flow: unknown) => { nodes: FlowNode[]; edges: FlowEdge[] };
    downloadFile: (content: string, filename: string, type: string) => void;
    setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
    setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>;
};

export const SimulationConfigPanel: React.FC<SimulationConfigPanelProps> = ({
    nodes,
    edges,
    importText,
    importError,
    setImportText,
    setImportError,
    fileInputRef,
    toYaml,
    parseYaml,
    normalizeFlow,
    downloadFile,
    setNodes,
    setEdges,
}) => {
    return (
        <div className="flow-surface mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 px-5 py-4 text-sm text-slate-200">
            <div className="flex items-center gap-3">
                <span className="text-xs font-semibold title text-slate-100">
                    Simulation Config
                </span>
                <button
                    className="btn-secondary"
                    onClick={() =>
                        downloadFile(
                            JSON.stringify({ nodes, edges }, null, 2),
                            'flowstudio.json',
                            'application/json'
                        )
                    }
                >
                    Export JSON
                </button>
                <button
                    className="btn-secondary"
                    onClick={() =>
                        downloadFile(
                            toYaml({ nodes, edges }),
                            'flowstudio.yaml',
                            'text/yaml'
                        )
                    }
                >
                    Export YAML
                </button>
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                    Import File
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.yaml,.yml"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                            const content = String(reader.result || '');
                            setImportText(content);
                            try {
                                const parsed = content.trim().startsWith('{')
                                    ? JSON.parse(content)
                                    : parseYaml(content);
                                const normalized = normalizeFlow(parsed);
                                setNodes(normalized.nodes);
                                setEdges(normalized.edges);
                                setImportError(null);
                            } catch (error: unknown) {
                                const err = error as { message?: string };
                                setImportError(err?.message || 'Failed to load configuration.');
                            }
                        };
                        reader.readAsText(file);
                        event.target.value = '';
                    }}
                />
            </div>
            <div className="flex flex-1 items-center gap-3">
                <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder="Paste JSON or YAML flow here..."
                    className="min-h-[64px] flex-1 rounded-xl border border-slate-800/80 bg-slate-950/80 p-3 text-sm text-slate-100"
                />
                <button
                    className="btn-primary"
                    onClick={() => {
                        try {
                            const parsed = importText.trim().startsWith('{')
                                ? JSON.parse(importText)
                                : parseYaml(importText);
                            const normalized = normalizeFlow(parsed);
                            setNodes(normalized.nodes);
                            setEdges(normalized.edges);
                            setImportError(null);
                        } catch (error: unknown) {
                            const err = error as { message?: string };
                            setImportError(err?.message || 'Failed to load configuration.');
                        }
                    }}
                >
                    Load
                </button>
            </div>
            {importError && <div className="text-sm text-rose-300">{importError}</div>}
        </div>
    );
};
