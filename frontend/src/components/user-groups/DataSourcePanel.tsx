import React, { useRef } from 'react';
import type {
    CsvDataSourceConfig,
    DataSourceConfig,
    DataSourceType,
    LookerDataSourceConfig,
    PostgresDataSourceConfig,
} from '../../types';

type DataSourcePanelProps = {
    dataSourceType: DataSourceType;
    dataSourceConfig: DataSourceConfig;
    onChange: (type: DataSourceType, config: DataSourceConfig) => void;
};

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
    dataSourceType,
    dataSourceConfig,
    onChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const lookerConfig = dataSourceConfig as Partial<LookerDataSourceConfig>;
    const csvConfig = dataSourceConfig as Partial<CsvDataSourceConfig>;
    const postgresConfig = dataSourceConfig as Partial<PostgresDataSourceConfig>;

    const handleTypeChange = (type: DataSourceType) => {
        const defaultConfigs: Record<DataSourceType, DataSourceConfig> = {
            none: {},
            looker: { api_url: '', client_id: '', client_secret: '', look_id: '' },
            csv: { user_ids: [], headers: [], rows: [] },
            postgres_query: { is_internal: true, connection_string: undefined, query: '' },
        };
        onChange(type, defaultConfigs[type]);
    };

    const handleLookerChange = (field: keyof LookerDataSourceConfig, value: string) => {
        onChange(dataSourceType, { ...lookerConfig, [field]: value } as LookerDataSourceConfig);
    };

    const handlePostgresChange = (field: keyof PostgresDataSourceConfig, value: unknown) => {
        onChange(dataSourceType, { ...postgresConfig, [field]: value } as PostgresDataSourceConfig);
    };

    const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (lines.length === 0) return;

            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const numericPattern = /^\d+$/;
            const parseRow = (line: string) =>
                line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));

            const firstRow = parseRow(lines[0]);
            const hasHeader =
                !uuidPattern.test(firstRow[0]) && !numericPattern.test(firstRow[0]);

            const headers = hasHeader
                ? firstRow
                : firstRow.map((_, i) => (i === 0 ? 'user_id' : `col_${i + 1}`));
            const dataLines = hasHeader ? lines.slice(1) : lines;

            const rows = dataLines.map(parseRow);
            const user_ids = rows.map((r) => r[0]).filter(Boolean);

            onChange('csv', { user_ids, headers, rows });
        };
        reader.readAsText(file);
    };

    return (
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">Data Source</p>
            </div>
            <div>
                <label className="label">Source Type</label>
                <select
                    className="input"
                    value={dataSourceType}
                    onChange={(e) => handleTypeChange(e.target.value as DataSourceType)}
                >
                    <option value="none">None</option>
                    <option value="looker">Looker</option>
                    <option value="csv">CSV Upload</option>
                    <option value="postgres_query">PostgreSQL Query</option>
                </select>
            </div>

            {dataSourceType === 'looker' && (
                <div className="space-y-2">
                    <div>
                        <label className="label">API URL</label>
                        <input
                            type="text"
                            className="input"
                            value={lookerConfig.api_url ?? ''}
                            onChange={(e) => handleLookerChange('api_url', e.target.value)}
                            placeholder="https://your-instance.looker.com"
                        />
                    </div>
                    <div>
                        <label className="label">Client ID</label>
                        <input
                            type="text"
                            className="input"
                            value={lookerConfig.client_id ?? ''}
                            onChange={(e) => handleLookerChange('client_id', e.target.value)}
                            placeholder="Client ID"
                        />
                    </div>
                    <div>
                        <label className="label">Client Secret</label>
                        <input
                            type="password"
                            className="input"
                            value={lookerConfig.client_secret ?? ''}
                            onChange={(e) => handleLookerChange('client_secret', e.target.value)}
                            placeholder="Client Secret"
                        />
                    </div>
                    <div>
                        <label className="label">Look ID</label>
                        <input
                            type="text"
                            className="input"
                            value={lookerConfig.look_id ?? ''}
                            onChange={(e) => handleLookerChange('look_id', e.target.value)}
                            placeholder="12345"
                        />
                    </div>
                </div>
            )}

            {dataSourceType === 'csv' && (
                <div className="space-y-2">
                    <div>
                        <label className="label">Upload CSV</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            className="input"
                            onChange={handleCsvFile}
                        />
                    </div>
                    {(csvConfig.user_ids?.length ?? 0) > 0 && (
                        <p className="text-sm text-cyan-400">
                            {csvConfig.user_ids!.length.toLocaleString()} user IDs detected
                        </p>
                    )}
                </div>
            )}

            {dataSourceType === 'postgres_query' && (
                <div className="space-y-2">
                    <div>
                        <label className="label">Connection Type</label>
                        <div className="flex gap-4 text-sm text-slate-300">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="pg_connection_type"
                                    checked={postgresConfig.is_internal !== false}
                                    onChange={() => handlePostgresChange('is_internal', true)}
                                />
                                Internal (app DB)
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="pg_connection_type"
                                    checked={postgresConfig.is_internal === false}
                                    onChange={() => handlePostgresChange('is_internal', false)}
                                />
                                External
                            </label>
                        </div>
                    </div>
                    {postgresConfig.is_internal === false && (
                        <div>
                            <label className="label">Connection String</label>
                            <input
                                type="text"
                                className="input"
                                value={postgresConfig.connection_string ?? ''}
                                onChange={(e) => handlePostgresChange('connection_string', e.target.value || undefined)}
                                placeholder="postgresql://user:password@host:5432/db"
                            />
                        </div>
                    )}
                    <div>
                        <label className="label">SELECT Query</label>
                        <textarea
                            className="input font-mono text-sm"
                            rows={4}
                            value={postgresConfig.query ?? ''}
                            onChange={(e) => handlePostgresChange('query', e.target.value)}
                            placeholder="SELECT user_id FROM users WHERE active = true LIMIT 10000"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
