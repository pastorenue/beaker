import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { eventApi, experimentApi, userGroupApi } from '../services/api';
import type { ExperimentAnalysis } from '../types';
import { SimulationHeader } from './simulation/SimulationHeader';
import { SimulationConfigPanel } from './simulation/SimulationConfigPanel';
import { NodePalette } from './simulation/NodePalette';
import { SimulationOutput } from './simulation/SimulationOutput';
import { SimulationDetails } from './simulation/SimulationDetails';
import type { FlowEdge, FlowNode } from './simulation/types';
import { useAccount } from '../contexts/AccountContext';

const nodeColorByKind: Record<FlowNode['kind'], { border: string; badge: string }> = {
    'trigger-start': { border: 'border-cyan-400/70', badge: 'bg-gray-500/20 text-slate-200 border-cyan-400/50' },
    'trigger-run': { border: 'border-emerald-400/70', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50' },
    experiment: { border: 'border-indigo-400/70', badge: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50' },
    'user-group': { border: 'border-amber-400/70', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/50' },
    hypothesis: { border: 'border-fuchsia-400/70', badge: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/50' },
    metric: { border: 'border-sky-400/70', badge: 'bg-sky-500/20 text-sky-200 border-sky-400/50' },
};

const nodeBadgeClass = (kind: FlowNode['kind']) =>
    `inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold title ${nodeColorByKind[kind].badge}`;

const NODE_WIDTH = 176;
const NODE_HEIGHT = 72;
const HANDLE_CENTER_OFFSET = 10;
const normalCdf = (z: number) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-0.5 * z * z);
    const prob =
        d *
        t *
        (0.3193815 +
            t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - prob : prob;
};

export const SimulationStudio: React.FC = () => {
    const { activeAccountId } = useAccount();
    const { data: experiments = [] } = useQuery({
        queryKey: ['experiments', activeAccountId],
        queryFn: async () => {
            const response = await experimentApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const { data: userGroups = [] } = useQuery({
        queryKey: ['userGroups', activeAccountId],
        queryFn: async () => {
            const response = await userGroupApi.list();
            return response.data;
        },
        enabled: !!activeAccountId,
    });

    const [isSimulating, setIsSimulating] = React.useState(false);
    const [isPaused, setIsPaused] = React.useState(false);
    const simulationRef = React.useRef<number | null>(null);
    const [simulationSeries, setSimulationSeries] = React.useState<
        { time: string; ts: number;[key: string]: string | number }[]
    >([]);
    const eventCounter = React.useRef<Record<string, number>>({});
    const variantCounter = React.useRef<Record<string, number>>({});
    const groupVariantCounter = React.useRef<Record<string, number>>({});
    const assignmentCounter = React.useRef<Record<string, number>>({});
    const conversionCounter = React.useRef<Record<string, number>>({});
    const groupRateRef = React.useRef<Record<string, number>>({});
    const currentExperimentIdRef = React.useRef<string | null>(null);
    const groupIdsRef = React.useRef<string[]>([]);
    const metricIdsRef = React.useRef<string[]>([]);
    const simulationKeyRef = React.useRef<string | null>(null);
    const [nodes, setNodes] = React.useState<FlowNode[]>([]);
    const [edges, setEdges] = React.useState<FlowEdge[]>([]);
    const [pendingFrom, setPendingFrom] = React.useState<string | null>(null);
    const [hoverTarget, setHoverTarget] = React.useState<string | null>(null);
    const pendingFromRef = React.useRef<string | null>(null);
    const hoverTargetRef = React.useRef<string | null>(null);
    const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
    const [errorTooltip, setErrorTooltip] = React.useState<{ x: number; y: number; message: string } | null>(null);
    const draggingRef = React.useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
    const panningRef = React.useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
    const reconnectRef = React.useRef<FlowEdge | null>(null);
    const canvasRef = React.useRef<HTMLDivElement | null>(null);
    const [zoom, setZoom] = React.useState(1);
    const zoomRef = React.useRef(1);
    const [pan, setPan] = React.useState({ x: 0, y: 0 });
    const panRef = React.useRef(pan);
    const [rangeStart, setRangeStart] = React.useState('');
    const [rangeEnd, setRangeEnd] = React.useState('');
    const [pickerOpen, setPickerOpen] = React.useState<'start' | 'end' | null>(null);
    const [pickerMonth, setPickerMonth] = React.useState(() => new Date());
    const [pickerPos, setPickerPos] = React.useState<{ top: number; left: number } | null>(null);
    const [importText, setImportText] = React.useState('');
    const [importError, setImportError] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const pickerRef = React.useRef<HTMLDivElement | null>(null);
    const startRef = React.useRef<HTMLButtonElement | null>(null);
    const endRef = React.useRef<HTMLButtonElement | null>(null);

    const experimentNode = nodes.find((node) => node.kind === 'experiment' && node.data?.experimentId);
    const metricNodes = nodes.filter((node) => node.kind === 'metric');
    const groupNodes = nodes.filter((node) => node.kind === 'user-group' && node.data?.groupId);
    const hypothesisNodes = nodes.filter((node) => node.kind === 'hypothesis');
    const startNode = nodes.find((node) => node.kind === 'trigger-start');
    const runNode = nodes.find((node) => node.kind === 'trigger-run');

    const selectedExperiment = experiments.find((exp) => exp.id === experimentNode?.data?.experimentId) || null;
    const selectedGroupIds = nodes
        .filter((node) => node.kind === 'user-group' && node.data?.groupId)
        .map((node) => node.data!.groupId!) as string[];
    const selectedGroups = userGroups.filter((group) => selectedGroupIds.includes(group.id));

    const { data: analysis } = useQuery({
        queryKey: ['analysis', selectedExperiment?.id, activeAccountId],
        queryFn: async () => {
            const response = await experimentApi.getAnalysis(selectedExperiment!.id);
            return response.data as ExperimentAnalysis;
        },
        enabled: !!selectedExperiment && selectedExperiment?.status === 'running' && !!activeAccountId,
        refetchInterval: 5000,
    });

    const signalCount = React.useMemo(() => {
        if (simulationSeries.length > 0) {
            const last = simulationSeries[simulationSeries.length - 1];
            return Object.entries(last).reduce((sum, [key, value]) => {
                if (key === 'time' || key === 'ts') return sum;
                return typeof value === 'number' ? sum + value : sum;
            }, 0);
        }
        return analysis?.sample_sizes?.reduce((sum, item) => sum + item.current_size, 0) ?? 0;
    }, [analysis, simulationSeries]);
    const topResults = analysis?.results?.slice(0, 3) ?? [];
    const formatDateTime = React.useCallback((date: Date) => {
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }, []);

    const parseDateTime = (value: string) => {
        if (!value) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    };

    const [pickerValue, setPickerValue] = React.useState<Date>(() => new Date());
    const applyPickerValue = React.useCallback(
        (next: Date, target: 'start' | 'end' | null = pickerOpen) => {
            if (!target) return;
            const formatted = formatDateTime(next);
            if (target === 'start') {
                setRangeStart(formatted);
            } else {
                setRangeEnd(formatted);
            }
        },
        [formatDateTime, pickerOpen]
    );

    React.useEffect(() => {
        if (!pickerOpen) return;
        const currentValue = pickerOpen === 'start' ? rangeStart : rangeEnd;
        const parsed = parseDateTime(currentValue);
        const next = parsed || new Date();
        setPickerValue(next);
        setPickerMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }, [pickerOpen, rangeStart, rangeEnd]);

    React.useEffect(() => {
        if (!pickerOpen) return;
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (pickerRef.current?.contains(target)) return;
            if (startRef.current?.contains(target)) return;
            if (endRef.current?.contains(target)) return;
            setPickerOpen(null);
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [pickerOpen]);
    const getGroupVariantKey = (groupId: string, variant: string) => `${groupId}::${variant}`;

    const filteredSeries = React.useMemo(() => {
        if (!rangeStart && !rangeEnd) return simulationSeries;
        const startMs = rangeStart ? new Date(rangeStart).getTime() : null;
        const endMs = rangeEnd ? new Date(rangeEnd).getTime() : null;
        return simulationSeries.filter((point) => {
            if (startMs !== null && point.ts < startMs) return false;
            if (endMs !== null && point.ts > endMs) return false;
            return true;
        });
    }, [simulationSeries, rangeStart, rangeEnd]);


    const renderCalendar = () => {
        const year = pickerMonth.getFullYear();
        const month = pickerMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: Array<{ day: number; current: boolean }> = [];
        for (let i = 0; i < startWeekday; i += 1) {
            days.push({ day: 0, current: false });
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            days.push({ day, current: true });
        }
        const activeDay = pickerValue.getDate();
        const activeMonth = pickerValue.getMonth();
        const activeYear = pickerValue.getFullYear();
        return (
            <div className="grid grid-cols-7 gap-1 text-xs text-slate-300">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
                    <div key={label} className="text-center text-[0.55rem] text-slate-500">
                        {label}
                    </div>
                ))}
                {days.map((item, idx) => {
                    if (!item.current) {
                        return <div key={`empty-${idx}`} className="h-7"></div>;
                    }
                    const isActive =
                        item.day === activeDay && month === activeMonth && year === activeYear;
                    return (
                        <button
                            key={`day-${item.day}`}
                            className={`h-7 rounded-md text-xs font-semibold ${isActive ? 'bg-emerald-500/30 text-emerald-100' : 'hover:bg-slate-800/80'
                                }`}
                            onClick={() => {
                                const next = new Date(pickerValue);
                                next.setFullYear(year, month, item.day);
                                setPickerValue(next);
                                applyPickerValue(next);
                            }}
                        >
                            {item.day}
                        </button>
                    );
                })}
            </div>
        );
    };

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 20 }, (_, i) => i * 3);

    React.useEffect(() => {
        return () => {
            if (simulationRef.current) {
                window.clearInterval(simulationRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        pendingFromRef.current = pendingFrom;
    }, [pendingFrom]);

    React.useEffect(() => {
        hoverTargetRef.current = hoverTarget;
    }, [hoverTarget]);

    React.useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    React.useEffect(() => {
        panRef.current = pan;
    }, [pan]);

    React.useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            if (!draggingRef.current || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const grid = 20;
            const nextXRaw =
                (event.clientX - rect.left - panRef.current.x) / zoomRef.current - draggingRef.current.offsetX;
            const nextYRaw =
                (event.clientY - rect.top - panRef.current.y) / zoomRef.current - draggingRef.current.offsetY;
            const nextX = Math.round(nextXRaw / grid) * grid;
            const nextY = Math.round(nextYRaw / grid) * grid;
            const panOffsetX = panRef.current.x / zoomRef.current;
            const panOffsetY = panRef.current.y / zoomRef.current;
            const maxX = Math.max(20, rect.width / zoomRef.current - NODE_WIDTH - panOffsetX);
            const maxY = Math.max(20, rect.height / zoomRef.current - NODE_HEIGHT - panOffsetY);
            const minX = Math.min(20, 20 - panOffsetX);
            const minY = Math.min(20, 20 - panOffsetY);

            setNodes((prev) =>
                prev.map((node) =>
                    node.id === draggingRef.current?.id
                        ? {
                            ...node,
                            x: Math.max(minX, Math.min(nextX, maxX)),
                            y: Math.max(minY, Math.min(nextY, maxY)),
                        }
                        : node
                )
            );
        };

        const handleUp = () => {
            draggingRef.current = null;
            panningRef.current = null;
            const pendingFromValue = pendingFromRef.current;
            const hoverTargetValue = hoverTargetRef.current;
            if (pendingFromValue && hoverTargetValue) {
                setEdges((prev) => {
                    const exists = prev.some(
                        (edge) => edge.from === pendingFromValue && edge.to === hoverTargetValue
                    );
                    return exists ? prev : [...prev, { from: pendingFromValue, to: hoverTargetValue }];
                });
                reconnectRef.current = null;
                setPendingFrom(null);
                setHoverTarget(null);
            }
        };

        const handlePanMove = (event: MouseEvent) => {
            if (!panningRef.current) return;
            const dx = event.clientX - panningRef.current.startX;
            const dy = event.clientY - panningRef.current.startY;
            setPan({ x: panningRef.current.panX + dx, y: panningRef.current.panY + dy });
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mousemove', handlePanMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mousemove', handlePanMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, []);

    const startDrag = (event: React.MouseEvent<HTMLDivElement>, nodeId: string) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const node = nodes.find((item) => item.id === nodeId);
        if (!node) return;
        draggingRef.current = {
            id: nodeId,
            offsetX: (event.clientX - rect.left - panRef.current.x) / zoomRef.current - node.x,
            offsetY: (event.clientY - rect.top - panRef.current.y) / zoomRef.current - node.y,
        };
    };

    const getNodeById = (nodeId?: string) => nodes.find((node) => node.id === nodeId);
    const hasIncoming = (nodeId?: string) => (nodeId ? edges.some((edge) => edge.to === nodeId) : false);
    const hasOutgoing = (nodeId?: string) => (nodeId ? edges.some((edge) => edge.from === nodeId) : false);
    const flowConnected = nodes.some((node) => node.kind === 'trigger-run' && hasIncoming(node.id));
    const runIds = nodes.filter((node) => node.kind === 'trigger-run').map((node) => node.id);

    const hasPath = React.useCallback(
        (fromId: string, toId: string) => {
            const visited = new Set<string>();
            const stack = [fromId];
            while (stack.length > 0) {
                const current = stack.pop()!;
                if (current === toId) return true;
                if (visited.has(current)) continue;
                visited.add(current);
                edges
                    .filter((edge) => edge.from === current)
                    .forEach((edge) => {
                        if (!visited.has(edge.to)) stack.push(edge.to);
                    });
            }
            return false;
        },
        [edges]
    );

    const isValidConnection = (fromId: string, toId: string) => {
        const fromNode = getNodeById(fromId);
        const toNode = getNodeById(toId);
        if (!fromNode || !toNode) return false;
        if (fromNode.kind === 'trigger-start' && toNode.kind === 'experiment') return true;
        if (fromNode.kind === 'experiment' && toNode.kind === 'user-group') return true;
        if (fromNode.kind === 'user-group' && (toNode.kind === 'metric' || toNode.kind === 'hypothesis')) return true;
        if (fromNode.kind === 'hypothesis' && toNode.kind === 'metric') return true;
        if (fromNode.kind === 'metric' && toNode.kind === 'trigger-run') return true;
        return false;
    };

    const reachableToRun = React.useMemo(() => {
        const runIds = nodes.filter((node) => node.kind === 'trigger-run').map((node) => node.id);
        if (runIds.length === 0) return new Set<string>();
        const reverse: Record<string, string[]> = {};
        edges.forEach((edge) => {
            if (!reverse[edge.to]) reverse[edge.to] = [];
            reverse[edge.to].push(edge.from);
        });
        const visited = new Set<string>();
        const stack = [...runIds];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const parents = reverse[current] || [];
            parents.forEach((parent) => {
                if (!visited.has(parent)) stack.push(parent);
            });
        }
        return visited;
    }, [nodes, edges]);

    const reachableFromStart = React.useMemo(() => {
        if (!startNode) return new Set<string>();
        const forward: Record<string, string[]> = {};
        edges.forEach((edge) => {
            if (!forward[edge.from]) forward[edge.from] = [];
            forward[edge.from].push(edge.to);
        });
        const visited = new Set<string>();
        const stack = [startNode.id];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const children = forward[current] || [];
            children.forEach((child) => {
                if (!visited.has(child)) stack.push(child);
            });
        }
        return visited;
    }, [edges, startNode]);

    const showError = React.useCallback((x: number, y: number, message: string) => {
        setErrorTooltip({ x, y, message });
        window.setTimeout(() => setErrorTooltip(null), 1600);
    }, []);

    const isDuplicateNode = (node: Omit<FlowNode, 'id' | 'x' | 'y'>) => {
        if (node.kind === 'trigger-start' || node.kind === 'trigger-run') {
            return nodes.some((existing) => existing.kind === node.kind);
        }
        if (node.kind === 'experiment') {
            return nodes.some(
                (existing) => existing.kind === node.kind && existing.data?.experimentId === node.data?.experimentId
            );
        }
        if (node.kind === 'user-group') {
            return nodes.some(
                (existing) => existing.kind === node.kind && existing.data?.groupId === node.data?.groupId
            );
        }
        if (node.kind === 'metric') {
            return nodes.some(
                (existing) => existing.kind === node.kind && existing.data?.metric === node.data?.metric
            );
        }
        if (node.kind === 'hypothesis') {
            return nodes.some(
                (existing) => existing.kind === node.kind && existing.data?.hypothesis === node.data?.hypothesis
            );
        }
        return false;
    };

    const adjustZoom = (next: number) => {
        setZoom(Math.max(0.6, Math.min(1.6, Number(next.toFixed(2)))));
    };

    const toYaml = (flow: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
        const indent = (level: number) => '  '.repeat(level);
        const lines: string[] = [];
        const writeObj = (obj: Record<string, unknown>, level: number) => {
            Object.entries(obj).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    lines.push(`${indent(level)}${key}:`);
                    writeObj(value as Record<string, unknown>, level + 1);
                } else {
                    lines.push(`${indent(level)}${key}: ${String(value)}`);
                }
            });
        };
        lines.push('nodes:');
        flow.nodes.forEach((node) => {
            lines.push(`${indent(1)}-`);
            writeObj(
                {
                    id: node.id,
                    label: node.label,
                    kind: node.kind,
                    x: node.x,
                    y: node.y,
                    data: node.data,
                },
                2
            );
        });
        lines.push('edges:');
        flow.edges.forEach((edge) => {
            lines.push(`${indent(1)}- from: ${edge.from}`);
            lines.push(`${indent(2)}to: ${edge.to}`);
        });
        return lines.join('\n');
    };

    const parseYaml = (input: string) => {
        const lines = input.split('\n');
        const result: { nodes: FlowNode[]; edges: FlowEdge[] } = { nodes: [], edges: [] };
        let section: 'nodes' | 'edges' | null = null;
        let current: Record<string, unknown> | null = null;
        let inData = false;

        const pushCurrent = () => {
            if (!current) return;
            if (section === 'nodes') result.nodes.push(current as FlowNode);
            if (section === 'edges') result.edges.push(current as FlowEdge);
            current = null;
        };

        const parseValue = (value: string) => {
            const trimmed = value.replace(/^['"]|['"]$/g, '');
            const num = Number(trimmed);
            return Number.isNaN(num) || trimmed === '' ? trimmed : num;
        };

        lines.forEach((raw) => {
            const line = raw.trim();
            if (!line) return;
            const leading = raw.length - raw.trimStart().length;
            if (line.startsWith('nodes:')) {
                pushCurrent();
                section = 'nodes';
                return;
            }
            if (line.startsWith('edges:')) {
                pushCurrent();
                section = 'edges';
                return;
            }
            if (line.startsWith('-')) {
                pushCurrent();
                current = {};
                inData = false;
                const rest = line.replace(/^-+\s*/, '');
                if (rest.includes(':')) {
                    const [key, ...valueParts] = rest.split(':');
                    current[key.trim()] = parseValue(valueParts.join(':').trim());
                }
                return;
            }
            if (!current || !section) return;
            if (inData && leading < 4) {
                inData = false;
            }
            const dataMatch = line.match(/^data:\s*$/);
            if (dataMatch) {
                current.data = current.data ?? {};
                inData = true;
                return;
            }
            const [key, ...valueParts] = line.split(':');
            const value = parseValue(valueParts.join(':').trim());
            if (inData) {
                const data = (current.data ?? {}) as Record<string, unknown>;
                data[key.trim()] = value;
                current.data = data;
            } else {
                current[key.trim()] = value;
            }
        });
        pushCurrent();
        return result;
    };

    const normalizeFlow = (flow: unknown) => {
        if (!flow || typeof flow !== 'object') {
            throw new Error('Invalid flow format. Expected nodes and edges arrays.');
        }
        const candidate = flow as { nodes?: unknown; edges?: unknown };
        if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
            throw new Error('Invalid flow format. Expected nodes and edges arrays.');
        }
        const nodes = candidate.nodes.map((node: FlowNode, index: number) => {
            const id = node.id ? String(node.id) : `imported-${node.kind}-${Date.now()}-${index}`;
            const x = Number.isFinite(Number(node.x)) ? Number(node.x) : 40 + (index % 3) * 220;
            const y = Number.isFinite(Number(node.y)) ? Number(node.y) : 60 + Math.floor(index / 3) * 120;
            return {
                id,
                label: String(node.label ?? node.kind ?? 'Node'),
                kind: node.kind,
                x,
                y,
                data: node.data ?? {},
            } as FlowNode;
        });
        const edges = candidate.edges.map((edge: FlowEdge) => ({
            from: String(edge.from),
            to: String(edge.to),
        }));
        return { nodes, edges };
    };

    const downloadFile = (content: string, filename: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleInputClick = (nodeId: string) => {
        if (!pendingFrom || pendingFrom === nodeId) return;
        if (!isValidConnection(pendingFrom, nodeId)) {
            if (!reconnectRef.current) {
                showError(cursor?.x ?? 0, cursor?.y ?? 0, 'Invalid connection for this flow.');
            }
            reconnectRef.current = null;
            setPendingFrom(null);
            setHoverTarget(null);
            return;
        }
        setEdges((prev) => {
            const exists = prev.some((edge) => edge.from === pendingFrom && edge.to === nodeId);
            return exists ? prev : [...prev, { from: pendingFrom, to: nodeId }];
        });
        reconnectRef.current = null;
        setPendingFrom(null);
    };

    const connectedGroupIds = edges
        .filter((edge) => {
            const from = getNodeById(edge.from);
            const to = getNodeById(edge.to);
            if (!from || !to || from.kind !== 'experiment' || to.kind !== 'user-group') return false;
            if (experimentNode && from.id !== experimentNode.id) return false;
            return true;
        })
        .map((edge) => getNodeById(edge.to)?.data?.groupId)
        .filter(Boolean) as string[];

    const connectedMetricIds = edges
        .filter((edge) => {
            const from = getNodeById(edge.from);
            const to = getNodeById(edge.to);
            return from?.kind === 'metric' && to?.kind === 'trigger-run';
        })
        .map((edge) => edge.from);

    React.useEffect(() => {
        metricIdsRef.current = connectedMetricIds;
    }, [connectedMetricIds]);

    const connectedGroupNodeIds = groupNodes
        .filter((node) => connectedGroupIds.includes(node.data!.groupId!))
        .map((node) => node.id);
    const fullyConnectedGroupIds = connectedGroupNodeIds
        .filter((nodeId) => reachableToRun.has(nodeId))
        .map((nodeId) => getNodeById(nodeId)?.data?.groupId)
        .filter(Boolean) as string[];
    const connectedMetricIdsKey = React.useMemo(
        () => connectedMetricIds.join(','),
        [connectedMetricIds],
    );
    const connectedGroups = userGroups.filter((group) => fullyConnectedGroupIds.includes(group.id));

    const metricAssignKey = React.useCallback((metricId: string, variant: string) => `${metricId}::${variant}::assign`, []);
    const metricConvKey = React.useCallback((metricId: string, variant: string) => `${metricId}::${variant}::conv`, []);

    const metricsSummary = React.useMemo(() => {
        if (!selectedExperiment) return [];
        const variants = selectedExperiment.variants.map((variant) => variant.name);
        if (variants.length < 2) return [];
        const control = variants[0];
        const latest = filteredSeries[filteredSeries.length - 1];
        if (!latest) return [];

        return metricNodes
            .filter((node) => connectedMetricIds.includes(node.id))
            .map((node) => {
                const metricId = node.id;
                const label = node.data?.metric || node.label;

                const getRateData = (variant: string) => {
                    const assign = Number(latest[metricAssignKey(metricId, variant)] ?? 0);
                    const conv = Number(latest[metricConvKey(metricId, variant)] ?? 0);
                    const rate = assign > 0 ? conv / assign : 0;
                    return { assign, conv, rate };
                };

                const base = getRateData(control);
                const variation = getRateData(variants[1]);
                const lift = base.rate > 0 ? (variation.rate - base.rate) / base.rate : 0;

                const p = Math.max(1e-9, (base.conv + variation.conv) / Math.max(1, base.assign + variation.assign));
                const se = Math.sqrt(p * (1 - p) * (1 / Math.max(1, base.assign) + 1 / Math.max(1, variation.assign)));
                const z = se > 0 ? (variation.rate - base.rate) / se : 0;
                const chance = normalCdf(z);
                const pValue = 2 * (1 - normalCdf(Math.abs(z)));

                return {
                    id: metricId,
                    label,
                    baseline: { rate: base.rate, assign: base.assign, conv: base.conv },
                    variation: { rate: variation.rate, assign: variation.assign, conv: variation.conv },
                    lift,
                    chanceToWin: chance,
                    pValue,
                };
            });
    }, [connectedMetricIds, filteredSeries, metricAssignKey, metricConvKey, metricNodes, selectedExperiment]);

    const startSatisfied = !startNode || hasOutgoing(startNode.id);
    const canAutoStart =
        selectedExperiment?.status === 'draft' || selectedExperiment?.status === 'paused';
    const canSimulate =
        !!selectedExperiment && (selectedExperiment.status === 'running' || canAutoStart);
    const startToRunConnected =
        !!startNode && runIds.length > 0 && runIds.some((runId) => hasPath(startNode.id, runId));
    const isFlowReady =
        !!selectedExperiment &&
        canSimulate &&
        fullyConnectedGroupIds.length > 0 &&
        connectedMetricIds.length > 0 &&
        !!runNode &&
        startSatisfied &&
        flowConnected &&
        startToRunConnected;

    const startSimulation = React.useCallback(async (reset = true) => {
        if (!selectedExperiment || !isFlowReady) return;

        if (selectedExperiment.status === 'stopped') {
            showError(24, 24, 'Cannot start a stopped experiment. Duplicate or create a new one.');
            return;
        }

        if (canAutoStart) {
            await experimentApi.start(selectedExperiment.id);
        }

        const groupIds = groupIdsRef.current;
        if (groupIds.length === 0) return;

        if (simulationRef.current && reset) {
            window.clearInterval(simulationRef.current);
            simulationRef.current = null;
        }

        if (reset) {
            setIsSimulating(true);
            setIsPaused(false);
            eventCounter.current = {};
            variantCounter.current = {};
            groupVariantCounter.current = {};
            groupRateRef.current = {};
            setSimulationSeries([]);
        } else {
            setIsSimulating(true);
            setIsPaused(false);
        }
        currentExperimentIdRef.current = selectedExperiment.id;
        const variants = selectedExperiment.variants.map((variant) => variant.name);
        const metricName = selectedExperiment.primary_metric || 'conversion';

        simulationRef.current = window.setInterval(() => {
            const run = async () => {
                try {
                    const now = new Date();
                    const timeLabel = now.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
                    const metricIds = metricIdsRef.current;
                    const activeGroupIds = groupIdsRef.current;

                    for (const groupId of activeGroupIds) {
                        if (!groupRateRef.current[groupId]) {
                            groupRateRef.current[groupId] = 0.6 + Math.random() * 1.4;
                        }
                        const rate = groupRateRef.current[groupId];
                        const batchSize = Math.max(1, Math.round(rate * (0.7 + Math.random() * 0.8)));
                        for (let i = 0; i < batchSize; i += 1) {
                            const userId = `flow_user_${Math.floor(Math.random() * 999999)}`;
                            const variant = variants[Math.floor(Math.random() * variants.length)];
                            try {
                                await userGroupApi.assign({
                                    user_id: userId,
                                    experiment_id: selectedExperiment.id,
                                    group_id: groupId,
                                });
                            } catch (error) {
                                console.warn('Flow simulation assign failed', error);
                            }

                            eventCounter.current[groupId] = (eventCounter.current[groupId] || 0) + 1;
                            const gvKey = getGroupVariantKey(groupId, variant);
                            groupVariantCounter.current[gvKey] = (groupVariantCounter.current[gvKey] || 0) + 1;

                            const baselineRate = variant.toLowerCase().includes('control') ? 0.1 : 0.12;
                            const didConvert = Math.random() < baselineRate;

                            const globalAssignKey = metricAssignKey('global', variant);
                            assignmentCounter.current[globalAssignKey] =
                                (assignmentCounter.current[globalAssignKey] || 0) + 1;
                            if (didConvert) {
                                const globalConvKey = metricConvKey('global', variant);
                                conversionCounter.current[globalConvKey] =
                                    (conversionCounter.current[globalConvKey] || 0) + 1;
                            }

                            metricIds.forEach((metricId: string) => {
                                const assignKey = metricAssignKey(metricId, variant);
                                assignmentCounter.current[assignKey] = (assignmentCounter.current[assignKey] || 0) + 1;
                                const metricRate = baselineRate * (1 + 0.1 * Math.random());
                                if (Math.random() < metricRate) {
                                    const convKey = metricConvKey(metricId, variant);
                                    conversionCounter.current[convKey] =
                                        (conversionCounter.current[convKey] || 0) + 1;
                                }
                            });

                            if (didConvert) {
                                try {
                                    await eventApi.ingest({
                                        experiment_id: selectedExperiment.id,
                                        user_id: userId,
                                        variant,
                                        metric_name: metricName,
                                        metric_value: 1.0,
                                        attributes: undefined,
                                    });
                                } catch (error) {
                                    console.warn('Flow simulation ingest failed', error);
                                }
                            }
                        }
                    }

                    setSimulationSeries((prev) => {
                        const last = prev[prev.length - 1] || {};
                        const nextPoint: { time: string; ts: number;[key: string]: string | number } = {
                            time: timeLabel,
                            ts: now.getTime(),
                        };

                        for (const groupId of activeGroupIds) {
                            for (const variant of variants) {
                                const key = getGroupVariantKey(groupId, variant);
                                const lastValue = typeof last[key] === 'number' ? (last[key] as number) : 0;
                                nextPoint[key] = groupVariantCounter.current[key] ?? lastValue;
                            }
                        }

                        metricIds.forEach((metricId: string) => {
                            for (const variant of variants) {
                                const assignKey = metricAssignKey(metricId, variant);
                                const convKey = metricConvKey(metricId, variant);
                                const lastAssign = typeof last[assignKey] === 'number' ? (last[assignKey] as number) : 0;
                                const lastConv = typeof last[convKey] === 'number' ? (last[convKey] as number) : 0;
                                nextPoint[assignKey] = assignmentCounter.current[assignKey] ?? lastAssign;
                                nextPoint[convKey] = conversionCounter.current[convKey] ?? lastConv;
                            }
                        });

                        return [...prev, nextPoint];
                    });
                } catch (error) {
                    console.error('Flow simulation error', error);
                }
            };
            void run();
        }, 800);
    }, [canAutoStart, isFlowReady, selectedExperiment, showError]);

    const stopSimulation = () => {
        if (simulationRef.current) {
            window.clearInterval(simulationRef.current);
        }
        simulationRef.current = null;
        setIsSimulating(false);
        setIsPaused(false);
        currentExperimentIdRef.current = null;
    };

    const pauseSimulation = () => {
        if (simulationRef.current) {
            window.clearInterval(simulationRef.current);
        }
        simulationRef.current = null;
        setIsSimulating(false);
        setIsPaused(true);
    };

    React.useEffect(() => {
        groupIdsRef.current = fullyConnectedGroupIds;
        if (flowConnected && isFlowReady && selectedExperiment) {
            if (isPaused) return;
            if (!simulationRef.current) {
                simulationKeyRef.current = selectedExperiment.id;
                void startSimulation(true);
                return;
            }
            if (currentExperimentIdRef.current && currentExperimentIdRef.current !== selectedExperiment.id) {
                stopSimulation();
                simulationKeyRef.current = selectedExperiment.id;
                void startSimulation(true);
                return;
            }
            return;
        }
        if ((!flowConnected || !isFlowReady) && (isSimulating || isPaused)) {
            simulationKeyRef.current = null;
            stopSimulation();
        }
    }, [
        flowConnected,
        isFlowReady,
        isPaused,
        isSimulating,
        selectedExperiment,
        fullyConnectedGroupIds,
        connectedMetricIdsKey,
        startSimulation,
    ]);

    React.useEffect(() => {
        if (!isSimulating || !selectedExperiment) return;
        const variants = selectedExperiment.variants.map((variant) => variant.name);
        const last = simulationSeries[simulationSeries.length - 1] || {};
        fullyConnectedGroupIds.forEach((groupId) => {
            if (!groupRateRef.current[groupId]) {
                groupRateRef.current[groupId] = 0.6 + Math.random() * 1.4;
            }
            if (!eventCounter.current[groupId]) {
                eventCounter.current[groupId] = 0;
            }
            variants.forEach((variant) => {
                const key = getGroupVariantKey(groupId, variant);
                if (groupVariantCounter.current[key] == null) {
                    groupVariantCounter.current[key] =
                        typeof last[key] === 'number' ? (last[key] as number) : 0;
                }
            });
        });
    }, [isSimulating, selectedExperiment, fullyConnectedGroupIds, simulationSeries]);

    const autoLayout = () => {
        setNodes((prev) =>
            prev.map((node, index) => ({
                ...node,
                x: 40 + (index % 2) * 240,
                y: 60 + Math.floor(index / 2) * 120,
            }))
        );
    };

    const clearCanvas = () => {
        setNodes([]);
        setEdges([]);
        setPendingFrom(null);
        setHoverTarget(null);
        setCursor(null);
        setSelectedNodeId(null);
        reconnectRef.current = null;
    };

    const addNode = (node: FlowNode) => {
        setNodes((prev) => [...prev, node]);
    };

    const createNode = (partial: Omit<FlowNode, 'id' | 'x' | 'y'>) => {
        if (isDuplicateNode(partial)) {
            showError(24, 24, `Only one "${partial.label}" node can be added.`);
            return;
        }
        const id = `${partial.kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const x = 40 + (nodes.length % 3) * 220;
        const y = 60 + Math.floor(nodes.length / 3) * 120;
        addNode({ id, x, y, ...partial });
    };

    const removeNode = (nodeId: string) => {
        setNodes((prev) => prev.filter((node) => node.id !== nodeId));
        setEdges((prev) => prev.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
        if (pendingFrom === nodeId) {
            setPendingFrom(null);
            setHoverTarget(null);
            setCursor(null);
        }
        if (selectedNodeId === nodeId) {
            setSelectedNodeId(null);
        }
    };

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

    return (
        <div className="flow-studio space-y-6 text-[15px] leading-relaxed">
            <SimulationHeader />

            <div className="card relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15)_0,transparent_45%)] opacity-60"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15)_0,transparent_40%)]"></div>
                <div className="relative text-[15px] leading-relaxed">
                    <SimulationConfigPanel
                        nodes={nodes}
                        edges={edges}
                        importText={importText}
                        importError={importError}
                        setImportText={setImportText}
                        setImportError={setImportError}
                        fileInputRef={fileInputRef}
                        toYaml={toYaml}
                        parseYaml={parseYaml}
                        normalizeFlow={normalizeFlow}
                        downloadFile={downloadFile}
                        setNodes={setNodes}
                        setEdges={setEdges}
                    />

                    <div className="flow-surface mt-6 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-6">
                        <div className="space-y-4">
                            <NodePalette
                                experiments={experiments}
                                userGroups={userGroups}
                                createNode={createNode}
                                nodeBadgeClass={nodeBadgeClass}
                            />

                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                                    <span>Drag nodes. Drag from right handles to connect. Click line to remove.</span>
                                    <div className="flex items-center gap-2">
                                        <button className="btn-secondary" onClick={autoLayout}>
                                            Auto Layout
                                        </button>
                                        <button className="btn-secondary" onClick={clearCanvas}>
                                            Clear Canvas
                                        </button>
                                        <span className={isFlowReady ? 'text-emerald-300' : 'text-amber-300'}>
                                            {isFlowReady ? 'Simulation Ready' : 'Connect required inputs'}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    ref={canvasRef}
                                    onWheel={(event) => {
                                        if (!event.ctrlKey && !event.metaKey) return;
                                        event.preventDefault();
                                        const direction = event.deltaY > 0 ? -0.1 : 0.1;
                                        adjustZoom(zoomRef.current + direction);
                                    }}
                                    onMouseDown={(event) => {
                                        if (event.button !== 0 || pendingFrom) return;
                                        const target = event.target as HTMLElement;
                                        if (target.closest('.flow-node') || target.closest('button') || target.closest('input')) {
                                            return;
                                        }
                                        event.preventDefault();
                                        panningRef.current = {
                                            startX: event.clientX,
                                            startY: event.clientY,
                                            panX: panRef.current.x,
                                            panY: panRef.current.y,
                                        };
                                    }}
                                    onMouseMove={(event) => {
                                        if (!canvasRef.current || !pendingFrom) return;
                                        const rect = canvasRef.current.getBoundingClientRect();
                                        const next = {
                                            x: (event.clientX - rect.left - panRef.current.x) / zoomRef.current,
                                            y: (event.clientY - rect.top - panRef.current.y) / zoomRef.current,
                                        };
                                        const target = nodes
                                            .filter((node) => node.id !== pendingFrom)
                                            .map((node) => {
                                                const handleX = node.x - HANDLE_CENTER_OFFSET;
                                                const handleY = node.y + NODE_HEIGHT / 2;
                                                const dx = next.x - handleX;
                                                const dy = next.y - handleY;
                                                return { node, distance: Math.hypot(dx, dy), handleX, handleY };
                                            })
                                            .sort((a, b) => a.distance - b.distance)[0];

                                        if (target && target.distance < 20 && isValidConnection(pendingFrom, target.node.id)) {
                                            setHoverTarget(target.node.id);
                                            setCursor({ x: target.handleX, y: target.handleY });
                                        } else {
                                            setHoverTarget(null);
                                            setCursor(next);
                                        }
                                    }}
                                    onClick={() => {
                                        if (pendingFrom) {
                                            reconnectRef.current = null;
                                            setPendingFrom(null);
                                            setHoverTarget(null);
                                            setCursor(null);
                                            return;
                                        }
                                        setSelectedNodeId(null);
                                    }}
                                    className="flow-canvas relative mt-4 min-h-[520px] overflow-hidden rounded-2xl border border-slate-800/70 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.5),rgba(2,6,23,0.9))] p-6"
                                >
                                    <div className="absolute right-6 top-6 z-20 flex items-center gap-3 rounded-full border border-slate-700/60 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 shadow-[0_12px_30px_-20px_rgba(15,23,42,0.7)]">
                                        <span className="text-[0.5rem] text-slate-400">Zoom</span>
                                        <input
                                            type="range"
                                            min={0.6}
                                            max={1.6}
                                            step={0.05}
                                            value={zoom}
                                            onChange={(event) => adjustZoom(Number(event.target.value))}
                                            className="h-1 w-24 accent-emerald-300"
                                        />
                                        <span className="min-w-[2.5rem] text-center text-emerald-200">
                                            {Math.round(zoom * 100)}%
                                        </span>
                                    </div>
                                    <div
                                        className="absolute inset-0 origin-top-left overflow-visible"
                                        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                                    >
                                        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px]"></div>

                                        <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible">
                                            {edges.map((edge) => {
                                                const fromNode = nodes.find((node) => node.id === edge.from);
                                                const toNode = nodes.find((node) => node.id === edge.to);
                                                if (!fromNode || !toNode) return null;
                                                const startX = fromNode.x + NODE_WIDTH - HANDLE_CENTER_OFFSET;
                                                const startY = fromNode.y + NODE_HEIGHT / 2;
                                                const endX = toNode.x - HANDLE_CENTER_OFFSET;
                                                const endY = toNode.y + NODE_HEIGHT / 2;
                                                const midX = (startX + endX) / 2;
                                                const isActiveEdge =
                                                    isSimulating &&
                                                    reachableToRun.has(edge.from) &&
                                                    reachableToRun.has(edge.to) &&
                                                    (!startNode || (reachableFromStart.has(edge.from) && reachableFromStart.has(edge.to)));
                                                return (
                                                    <path
                                                        key={`${edge.from}-${edge.to}`}
                                                        d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                                                        stroke="rgba(16,185,129,0.6)"
                                                        strokeWidth="1.5"
                                                        vectorEffect="non-scaling-stroke"
                                                        fill="none"
                                                        className={isActiveEdge ? 'flow-line' : ''}
                                                    />
                                                );
                                            })}
                                            {pendingFrom && cursor ? (
                                                (() => {
                                                    const fromNode = nodes.find((node) => node.id === pendingFrom);
                                                    if (!fromNode) return null;
                                                    const startX = fromNode.x + NODE_WIDTH - HANDLE_CENTER_OFFSET;
                                                    const startY = fromNode.y + NODE_HEIGHT / 2;
                                                    const midX = (startX + cursor.x) / 2;
                                                    return (
                                                        <path
                                                            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${cursor.y}, ${cursor.x} ${cursor.y}`}
                                                            stroke="rgba(56,189,248,0.6)"
                                                            strokeWidth="1.5"
                                                            vectorEffect="non-scaling-stroke"
                                                            fill="none"
                                                            strokeDasharray="6 6"
                                                        />
                                                    );
                                                })()
                                            ) : null}
                                        </svg>
                                        <svg className="absolute inset-0 h-full w-full overflow-visible">
                                            {edges.map((edge) => {
                                                const fromNode = nodes.find((node) => node.id === edge.from);
                                                const toNode = nodes.find((node) => node.id === edge.to);
                                                if (!fromNode || !toNode) return null;
                                                const startX = fromNode.x + NODE_WIDTH - HANDLE_CENTER_OFFSET;
                                                const startY = fromNode.y + NODE_HEIGHT / 2;
                                                const endX = toNode.x - HANDLE_CENTER_OFFSET;
                                                const endY = toNode.y + NODE_HEIGHT / 2;
                                                const midX = (startX + endX) / 2;
                                                return (
                                                    <path
                                                        key={`hit-${edge.from}-${edge.to}`}
                                                        d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                                                        stroke="transparent"
                                                        strokeWidth="12"
                                                        vectorEffect="non-scaling-stroke"
                                                        fill="none"
                                                        className="cursor-pointer"
                                                        onMouseDown={(event) => {
                                                            event.stopPropagation();
                                                            if (!canvasRef.current) return;
                                                            const rect = canvasRef.current.getBoundingClientRect();
                                                            const next = {
                                                                x: (event.clientX - rect.left - panRef.current.x) / zoomRef.current,
                                                                y: (event.clientY - rect.top - panRef.current.y) / zoomRef.current,
                                                            };
                                                            reconnectRef.current = edge;
                                                            setEdges((prev) => prev.filter((item) => !(item.from === edge.from && item.to === edge.to)));
                                                            setPendingFrom(edge.from);
                                                            setCursor(next);
                                                        }}
                                                        onDoubleClick={() => {
                                                            setEdges((prev) => prev.filter((item) => !(item.from === edge.from && item.to === edge.to)));
                                                        }}
                                                    />
                                                );
                                            })}
                                        </svg>

                                        {nodes.map((node) => {
                                            const incoming = hasIncoming(node.id);
                                            const outgoing = hasOutgoing(node.id);
                                            const canOutput = node.kind !== 'trigger-run';
                                            const canInput = node.kind !== 'trigger-start';
                                            const isRunNode = node.kind === 'trigger-run';
                                            return (
                                                <div
                                                    key={node.id}
                                                    className={`flow-node absolute h-[72px] w-44 cursor-grab select-none rounded-2xl border bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-200 shadow-[0_20px_30px_-25px_rgba(15,23,42,0.9)] ${nodeColorByKind[node.kind].border}`}
                                                    style={{ left: node.x, top: node.y }}
                                                    onMouseDown={(event) => startDrag(event, node.id)}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedNodeId(node.id);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="truncate">{node.label}</span>
                                                        <button
                                                            className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700/70 bg-slate-950 text-slate-400 hover:text-rose-400"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                removeNode(node.id);
                                                            }}
                                                            aria-label="Remove node"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                    {isRunNode && (
                                                        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
                                                            <div
                                                                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.6rem] ${isSimulating
                                                                    ? 'border-emerald-400/60 text-emerald-200 run-pulse'
                                                                    : isPaused
                                                                        ? 'border-amber-400/60 text-amber-200'
                                                                        : 'border-slate-700/70 text-slate-400'
                                                                    }`}
                                                                aria-label={isSimulating ? 'Simulation running' : isPaused ? 'Simulation paused' : 'Simulation idle'}
                                                            >
                                                                ●
                                                            </div>
                                                            <button
                                                                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[0.65rem] font-semibold ${isSimulating
                                                                    ? 'border-emerald-400/60 text-emerald-200'
                                                                    : isPaused
                                                                        ? 'border-amber-400/60 text-amber-200'
                                                                        : 'border-slate-700/70 text-slate-400'
                                                                    }`}
                                                                aria-label={isSimulating ? 'Pause simulation' : isPaused ? 'Resume simulation' : 'Run simulation'}
                                                                onMouseDown={(event) => event.stopPropagation()}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    if (!selectedExperiment || !isFlowReady) return;
                                                                    if (isSimulating) {
                                                                        pauseSimulation();
                                                                    } else {
                                                                        void startSimulation(!isPaused);
                                                                    }
                                                                }}
                                                            >
                                                                {isSimulating ? '⏸' : '▶'}
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex items-center justify-between text-[0.66rem] title text-slate-500">
                                                        <span>{node.kind.replace('-', ' ')}</span>
                                                        <span>{pendingFrom === node.id ? 'link' : ''}</span>
                                                    </div>
                                                    {canOutput && (
                                                        <button
                                                            className={`absolute -right-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-slate-950 ${pendingFrom === node.id
                                                                ? 'border-amber-400/70 text-amber-300'
                                                                : outgoing
                                                                    ? 'border-emerald-400/70 text-emerald-300'
                                                                    : 'border-emerald-400/40 text-emerald-200'
                                                                }`}
                                                            onMouseDown={(event) => {
                                                                event.stopPropagation();
                                                                setPendingFrom(node.id);
                                                                setCursor({ x: node.x + NODE_WIDTH - HANDLE_CENTER_OFFSET, y: node.y + NODE_HEIGHT / 2 });
                                                            }}
                                                            aria-label="Start connection"
                                                        >
                                                            {pendingFrom === node.id || outgoing ? '●' : '→'}
                                                        </button>
                                                    )}
                                                    {canInput && (
                                                        <button
                                                            className={`absolute -left-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-slate-950 ${hoverTarget === node.id
                                                                ? 'border-amber-400/70 text-amber-300'
                                                                : incoming
                                                                    ? 'border-emerald-400/70 text-emerald-300'
                                                                    : 'border-cyan-400/40 text-slate-200'
                                                                }`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleInputClick(node.id);
                                                            }}
                                                            onMouseDown={(event) => event.stopPropagation()}
                                                            onMouseEnter={() => setHoverTarget(node.id)}
                                                            onMouseLeave={() => setHoverTarget(null)}
                                                            aria-label="Complete connection"
                                                        >
                                                            {incoming || hoverTarget === node.id ? '●' : '+'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {errorTooltip && (
                                            <div
                                                className="absolute z-20 rounded-lg border border-amber-400/60 bg-amber-100/90 px-3 py-2 text-xs text-amber-900 shadow-[0_12px_30px_-20px_rgba(251,191,36,0.6)]"
                                                style={{ left: errorTooltip.x + 12, top: errorTooltip.y + 12 }}
                                            >
                                                {errorTooltip.message}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <SimulationOutput
                                    simulationSeries={simulationSeries}
                                    filteredSeries={filteredSeries}
                                    rangeStart={rangeStart}
                                    rangeEnd={rangeEnd}
                                    setRangeStart={setRangeStart}
                                    setRangeEnd={setRangeEnd}
                                    pickerOpen={pickerOpen}
                                    setPickerOpen={setPickerOpen}
                                    pickerPos={pickerPos}
                                    setPickerPos={setPickerPos}
                                    pickerRef={pickerRef}
                                    startRef={startRef}
                                    endRef={endRef}
                                    pickerMonth={pickerMonth}
                                    setPickerMonth={setPickerMonth}
                                    pickerValue={pickerValue}
                                    setPickerValue={setPickerValue}
                                    renderCalendar={renderCalendar}
                                    hours={hours}
                                    minutes={minutes}
                                    applyPickerValue={(value) => applyPickerValue(value)}
                                    selectedExperiment={selectedExperiment}
                                    connectedGroups={connectedGroups}
                                    metricsSummary={metricsSummary}
                                    isSimulating={isSimulating}
                                    isPaused={isPaused}
                                    flowConnected={flowConnected}
                                    isFlowReady={isFlowReady}
                                    getGroupVariantKey={getGroupVariantKey}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <SimulationDetails
                experiments={experiments}
                userGroups={userGroups}
                selectedExperiment={selectedExperiment}
                selectedGroups={selectedGroups}
                hypothesisNodes={hypothesisNodes}
                metricNodes={metricNodes}
                signalCount={signalCount}
                topResults={topResults}
                selectedNode={selectedNode}
                removeNode={removeNode}
            />
        </div>
    );
};
