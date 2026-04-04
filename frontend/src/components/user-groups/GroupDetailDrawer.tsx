import React, { useEffect, useRef, useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { DataSourceConfig, DataSourceType, UserGroup } from '../../types';
import { DataSourcePanel } from './DataSourcePanel';
import { userGroupApi } from '../../services/api';

type GroupFormData = {
    name: string;
    description: string;
    assignment_rule: string;
    data_source_type: DataSourceType;
    data_source_config: DataSourceConfig;
};

export type GroupDetailDrawerProps = {
    selectedGroup: UserGroup | null;
    isOpen: boolean;
    onClose: () => void;
    isEditing: boolean;
    editForm: GroupFormData;
    editRulePrompt: string;
    onToggleEdit: () => void;
    onDelete: () => void;
    onEditFormChange: (next: GroupFormData) => void;
    onEditRulePromptChange: (value: string) => void;
    onSave: () => void;
    onCancelEdit: () => void;
    onSync: (groupId: string) => void;
    buildRuleFromText: (value: string) => string;
};

type Tab = 'details' | 'explorer';

// ---------------------------------------------------------------------------
// Data Explorer
// ---------------------------------------------------------------------------

type ExplorerStatus = 'idle' | 'loading' | 'ready' | 'error';

const DataExplorer: React.FC<{ group: UserGroup }> = ({ group }) => {
    const [status, setStatus] = useState<ExplorerStatus>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [recordCount, setRecordCount] = useState(0);
    const [sql, setSql] = useState('SELECT * FROM users LIMIT 100');
    const [results, setResults] = useState<Array<Record<string, string>> | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const dbRef = useRef<duckdb.AsyncDuckDB | null>(null);
    const connRef = useRef<duckdb.AsyncDuckDBConnection | null>(null);
    const workerUrlRef = useRef<string | null>(null);

    const initDuckDB = async (): Promise<duckdb.AsyncDuckDB> => {
        if (dbRef.current) return dbRef.current;
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        if (!bundle.mainWorker) throw new Error('DuckDB WASM: no suitable worker bundle found');
        const workerUrl = URL.createObjectURL(
            new Blob([`importScripts("${bundle.mainWorker}")`], { type: 'text/javascript' }),
        );
        workerUrlRef.current = workerUrl;
        const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), new Worker(workerUrl));
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        dbRef.current = db;
        return db;
    };

    const loadIntoDb = async (userIds: string[]) => {
        setStatus('loading');
        setErrorMsg(null);
        try {
            const db = await initDuckDB();
            const conn = await db.connect();
            connRef.current = conn;

            await conn.query('DROP TABLE IF EXISTS users');
            await conn.query('CREATE TABLE users (user_id VARCHAR)');

            const batchSize = 1000;
            for (let i = 0; i < userIds.length; i += batchSize) {
                const batch = userIds.slice(i, i + batchSize);
                const values = batch.map((id) => `('${id.replace(/'/g, "''")}')`).join(',');
                await conn.query(`INSERT INTO users VALUES ${values}`);
            }

            setRecordCount(userIds.length);
            setStatus('ready');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setStatus('error');
        }
    };

    // Auto-load CSV on mount
    useEffect(() => {
        if (group.data_source_type === 'csv') {
            const cfg = group.data_source_config as { user_ids?: string[] };
            loadIntoDb(cfg.user_ids ?? []);
        }
        return () => {
            const cleanup = async () => {
                if (connRef.current) {
                    await connRef.current.close();
                    connRef.current = null;
                }
                if (dbRef.current) {
                    await dbRef.current.terminate();
                    dbRef.current = null;
                }
                if (workerUrlRef.current) {
                    URL.revokeObjectURL(workerUrlRef.current);
                    workerUrlRef.current = null;
                }
            };
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group.id]);

    const handleLoadData = async () => {
        try {
            setStatus('loading');
            const response = await userGroupApi.users(group.id);
            await loadIntoDb(response.data);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setStatus('error');
        }
    };

    const runQuery = async () => {
        if (!connRef.current || status !== 'ready') return;
        setIsRunning(true);
        setQueryError(null);
        setResults(null);
        try {
            const result = await connRef.current.query(sql);
            const schema = result.schema.fields.map((f) => f.name);
            setColumns(schema);
            const allRows = result.toArray();
            const rows = allRows.slice(0, 500).map((row) => {
                const obj: Record<string, string> = {};
                for (const col of schema) {
                    const val = (row as Record<string, unknown>)[col];
                    obj[col] = val !== null && val !== undefined ? String(val) : '';
                }
                return obj;
            });
            setResults(rows);
        } catch (err) {
            setQueryError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsRunning(false);
        }
    };

    const needsLoad = group.data_source_type !== 'csv' && group.data_source_type !== 'none';

    return (
        <div className="space-y-3 pt-2">
            {/* Status line */}
            {status === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    Loading data…
                </div>
            )}
            {status === 'ready' && (
                <p className="text-sm text-cyan-400">{recordCount.toLocaleString()} records loaded</p>
            )}
            {status === 'error' && errorMsg && (
                <span className="badge-danger inline-block">{errorMsg}</span>
            )}

            {/* Load button for non-CSV sources */}
            {status === 'idle' && needsLoad && (
                <button onClick={handleLoadData} className="btn-secondary">
                    Load Data
                </button>
            )}

            {(status === 'ready' || status === 'error') && (
                <>
                    <textarea
                        className="input font-mono text-sm"
                        rows={5}
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault();
                                runQuery();
                            }
                        }}
                    />
                    <button
                        onClick={runQuery}
                        className="btn-primary"
                        disabled={isRunning || status !== 'ready'}
                    >
                        {isRunning ? 'Running…' : 'Run Query'}
                    </button>

                    {queryError && (
                        <span className="badge-danger inline-block">{queryError}</span>
                    )}

                    {results && results.length > 0 && (
                        <div className="overflow-auto rounded-lg border border-slate-800/60">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800/60 bg-slate-900/80">
                                        {columns.map((col) => (
                                            <th
                                                key={col}
                                                className="px-3 py-2 text-left font-medium text-slate-400"
                                            >
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((row, i) => (
                                        <tr key={i} className="border-b border-slate-800/30">
                                            {columns.map((col) => (
                                                <td
                                                    key={col}
                                                    className="px-3 py-1.5 font-mono text-slate-300"
                                                >
                                                    {row[col]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {results.length === 500 && (
                                <p className="px-3 py-2 text-xs text-slate-500">
                                    Showing first 500 rows
                                </p>
                            )}
                        </div>
                    )}

                    {results && results.length === 0 && (
                        <p className="text-sm text-slate-500">Query returned no rows.</p>
                    )}
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

export const GroupDetailDrawer: React.FC<GroupDetailDrawerProps> = ({
    selectedGroup,
    isOpen,
    onClose,
    isEditing,
    editForm,
    editRulePrompt,
    onToggleEdit,
    onDelete,
    onEditFormChange,
    onEditRulePromptChange,
    onSave,
    onCancelEdit,
    onSync,
    buildRuleFromText,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('details');

    // Reset to details tab when a different group opens
    useEffect(() => {
        if (isOpen) setActiveTab('details');
    }, [selectedGroup?.id, isOpen]);

    const hasDataSource =
        selectedGroup !== null &&
        selectedGroup.data_source_type !== 'none';

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-slate-950/40 transition-opacity duration-300 ${
                    isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
                onClick={onClose}
            />

            {/* Slide-in panel */}
            <div
                className={`fixed top-0 right-0 z-50 flex h-full w-[480px] flex-col bg-slate-900 border-l border-slate-700/60 shadow-2xl transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {selectedGroup && (
                    <>
                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 px-4 py-3">
                            <h3 className="truncate text-sm font-semibold text-slate-100">
                                {selectedGroup.name}
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onToggleEdit}
                                    className="btn-secondary text-xs"
                                >
                                    {isEditing ? 'Close' : 'Edit'}
                                </button>
                                {hasDataSource && (
                                    <button
                                        onClick={() => onSync(selectedGroup.id)}
                                        className="btn-secondary text-xs"
                                    >
                                        Sync
                                    </button>
                                )}
                                <button onClick={onDelete} className="btn-danger text-xs">
                                    Delete
                                </button>
                                <button
                                    onClick={onClose}
                                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                                    aria-label="Close"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        className="h-4 w-4"
                                    >
                                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Tab strip */}
                        <div className="flex shrink-0 border-b border-slate-700/60">
                            <button
                                className={`px-4 py-2 text-sm font-medium transition-colors ${
                                    activeTab === 'details'
                                        ? 'border-b-2 border-cyan-400 text-cyan-400'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                                onClick={() => setActiveTab('details')}
                            >
                                Details
                            </button>
                            {hasDataSource && (
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                                        activeTab === 'explorer'
                                            ? 'border-b-2 border-cyan-400 text-cyan-400'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                    onClick={() => setActiveTab('explorer')}
                                >
                                    Data Explorer
                                </button>
                            )}
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {activeTab === 'details' && (
                                <>
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="label">Group Name</label>
                                                <input
                                                    type="text"
                                                    className="input"
                                                    value={editForm.name}
                                                    onChange={(e) =>
                                                        onEditFormChange({ ...editForm, name: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className="label">Description</label>
                                                <textarea
                                                    className="input"
                                                    rows={2}
                                                    value={editForm.description}
                                                    onChange={(e) =>
                                                        onEditFormChange({
                                                            ...editForm,
                                                            description: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className="label">Assignment Mode</label>
                                                <select
                                                    className="input"
                                                    value={
                                                        editForm.assignment_rule.startsWith('{')
                                                            ? 'custom'
                                                            : editForm.assignment_rule
                                                    }
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === 'custom') {
                                                            onEditFormChange({
                                                                ...editForm,
                                                                assignment_rule:
                                                                    '{\n  "version": "1",\n  "conditions": []\n}',
                                                            });
                                                        } else {
                                                            onEditFormChange({
                                                                ...editForm,
                                                                assignment_rule: val,
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <option value="random">Random Assignment</option>
                                                    <option value="hash">Hash-Based (Consistent)</option>
                                                    <option value="manual">Manual Assignment</option>
                                                    <option value="custom">Custom Rule (JSON)</option>
                                                </select>
                                            </div>
                                            <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs text-slate-400">AI Rule Copilot</p>
                                                    <span className="badge-gray">Draft JSON</span>
                                                </div>
                                                <p className="mt-2 text-sm text-slate-300">
                                                    Describe your targeting rule in plain language.
                                                </p>
                                                <div className="mt-3 flex flex-col gap-2">
                                                    <input
                                                        type="text"
                                                        className="input"
                                                        value={editRulePrompt}
                                                        onChange={(e) =>
                                                            onEditRulePromptChange(e.target.value)
                                                        }
                                                        placeholder="e.g., Email ends with @example.com"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        onClick={() =>
                                                            onEditFormChange({
                                                                ...editForm,
                                                                assignment_rule:
                                                                    buildRuleFromText(editRulePrompt),
                                                            })
                                                        }
                                                    >
                                                        Generate JSON Rule
                                                    </button>
                                                </div>
                                            </div>
                                            {(editForm.assignment_rule.startsWith('{') ||
                                                editForm.assignment_rule === 'custom') && (
                                                <div>
                                                    <label className="label">Rule Definition (JSON)</label>
                                                    <textarea
                                                        className="input font-mono text-sm"
                                                        rows={6}
                                                        value={editForm.assignment_rule}
                                                        onChange={(e) =>
                                                            onEditFormChange({
                                                                ...editForm,
                                                                assignment_rule: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                            <DataSourcePanel
                                                dataSourceType={editForm.data_source_type}
                                                dataSourceConfig={editForm.data_source_config}
                                                onChange={(type, config) =>
                                                    onEditFormChange({
                                                        ...editForm,
                                                        data_source_type: type,
                                                        data_source_config: config,
                                                    })
                                                }
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={onSave} className="btn-success">
                                                    Save Changes
                                                </button>
                                                <button onClick={onCancelEdit} className="btn-secondary">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <p className="text-sm text-slate-300">
                                                {selectedGroup.description || (
                                                    <span className="italic text-slate-500">No description</span>
                                                )}
                                            </p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-xs text-slate-400">Total Users</p>
                                                    <p className="text-2xl font-bold text-slate-100">
                                                        {selectedGroup.size.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-400">Created</p>
                                                    <p className="font-medium text-slate-100">
                                                        {new Date(
                                                            selectedGroup.created_at,
                                                        ).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-400">Assignment Rule</p>
                                                    <p className="font-medium text-slate-100">
                                                        {selectedGroup.assignment_rule}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-400">Data Source</p>
                                                    <p className="font-medium capitalize text-slate-100">
                                                        {selectedGroup.data_source_type === 'none'
                                                            ? 'None'
                                                            : selectedGroup.data_source_type}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {activeTab === 'explorer' && hasDataSource && (
                                <DataExplorer group={selectedGroup} />
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
};
