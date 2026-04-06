export type FlowNode = {
    id: string;
    label: string;
    kind: 'trigger-start' | 'trigger-run' | 'experiment' | 'user-group' | 'hypothesis' | 'metric';
    x: number;
    y: number;
    data?: {
        experimentId?: string;
        groupId?: string;
        hypothesis?: string;
        metric?: string;
    };
};

export type FlowEdge = {
    from: string;
    to: string;
};

export type SimExperiment = {
    id: string;
    name: string;
    status: string;
    primary_metric?: string | null;
    variants: Array<{ name: string }>;
};

export type ExperimentGroupPair = {
    experimentNodeId: string;
    experimentId: string;
    experiment: SimExperiment;
    groupNodeId: string;
    groupId: string;
    groupName: string;
    groupSize: number;         // 0 = unlimited
    metricNodeIds: string[];   // deduplicated metric node IDs reachable from this group → run
};

export type ExperimentGroupPairForOutput = {
    experimentId: string;
    experimentName: string;
    groupId: string;
    groupName: string;
    variants: Array<{ name: string }>;
};
