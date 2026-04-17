import React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { experimentApi } from "../../services/api";
import { ExperimentCreator } from "../../components/ExperimentCreator";
import { LoadingSpinner } from "../../components/Common";
import { useAccount } from "../../contexts/AccountContext";
import { useToast } from "../../contexts/ToastContext";
import { Experiment, CreateExperimentRequest } from "../../types";
import { FacetSearchBar, type FacetDef, type ActiveFilter } from "../../components/FacetSearchBar";

import { ExperimentsHeader } from "./ExperimentsHeader";
import { ExperimentsTable } from "./ExperimentsTable";
import { EmptyState } from "./EmptyState";

const EXPERIMENT_FACETS: FacetDef[] = [
  { key: "status", label: "Status",  placeholder: "draft, running, paused, stopped" },
  { key: "name",   label: "Name",    placeholder: "e.g. checkout test"               },
  { key: "metric", label: "Metric",  placeholder: "e.g. cta_click"                   },
];

export function HomePage() {
  const { activeAccountId } = useAccount();
  const { addToast } = useToast();
  const [showCreator, setShowCreator] = React.useState(false);
  const [filters, setFilters] = React.useState<ActiveFilter[]>([]);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = React.useState<{
    key: "name" | "start_date";
    direction: "asc" | "desc";
  }>({
    key: "name",
    direction: "asc",
  });

  React.useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowCreator(true);
    }
  }, [searchParams]);

  const { data: experiments = [], isLoading } = useQuery({
    queryKey: ["experiments", activeAccountId],
    queryFn: async () => {
      const response = await experimentApi.list();
      return response.data;
    },
    enabled: !!activeAccountId,
  });

  const sortedExperiments = React.useMemo(() => {
    const data = [...experiments];
    if (sortConfig.key === "name") {
      data.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      data.sort((a, b) => {
        const aTime = a.start_date
          ? new Date(a.start_date).getTime()
          : Number.POSITIVE_INFINITY;
        const bTime = b.start_date
          ? new Date(b.start_date).getTime()
          : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
    }
    if (sortConfig.direction === "desc") {
      data.reverse();
    }
    return data;
  }, [experiments, sortConfig]);

  const experimentSuggestions = React.useMemo(() => ({
    status: ["draft", "running", "paused", "stopped"],
    name:   [...new Set(experiments.map((e) => e.name))].slice(0, 20),
    metric: [...new Set(experiments.map((e) => e.primary_metric).filter(Boolean))].slice(0, 20),
  }), [experiments]);

  const filteredExperiments = React.useMemo(() => {
    let result = sortedExperiments;
    for (const f of filters) {
      if (f.facet === "status") {
        result = result.filter((e) => e.status === f.value);
      } else if (f.facet === "name") {
        result = result.filter((e) => e.name.toLowerCase().includes(f.value.toLowerCase()));
      } else if (f.facet === "metric") {
        result = result.filter((e) => e.primary_metric?.toLowerCase().includes(f.value.toLowerCase()));
      }
    }
    return result;
  }, [sortedExperiments, filters]);

  const toggleSort = (key: "name" | "start_date") => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const startMutation = useMutation({
    mutationFn: (id: string) => experimentApi.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experiments", activeAccountId],
      });
      addToast("Experiment started", "success");
    },
    onError: () => addToast("Failed to start experiment", "error"),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => experimentApi.restart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experiments", activeAccountId],
      });
      addToast("Experiment restarted", "success");
    },
    onError: () => addToast("Failed to restart experiment", "error"),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => experimentApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experiments", activeAccountId],
      });
      addToast("Experiment paused", "success");
    },
    onError: () => addToast("Failed to pause experiment", "error"),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => experimentApi.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["experiments", activeAccountId],
      });
      addToast("Experiment stopped", "success");
    },
    onError: () => addToast("Failed to stop experiment", "error"),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateExperimentRequest) => experimentApi.create(data),
    onSuccess: (response) => {
      queryClient.setQueryData<Experiment[]>(
        ["experiments", activeAccountId],
        (oldData) => {
          const existing = Array.isArray(oldData) ? oldData : [];
          return [response.data, ...existing];
        },
      );
      setShowCreator(false);
      addToast("Experiment created", "success");
    },
    onError: () => addToast("Failed to create experiment", "error"),
  });

  if (isLoading) return <LoadingSpinner fullHeight />;

  if (showCreator) {
    return (
      <ExperimentCreator
        onSubmit={(data) => createMutation.mutate(data)}
        onCancel={() => setShowCreator(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ExperimentsHeader onNewClick={() => setShowCreator(true)} />

      {experiments.length === 0 ? (
        <EmptyState onNewClick={() => setShowCreator(true)} />
      ) : (
        <>
          <FacetSearchBar
            facets={EXPERIMENT_FACETS}
            activeFilters={filters}
            onAdd={(facet, value) => setFilters((prev) => [...prev.filter((f) => f.facet !== facet), { facet, value }])}
            onRemove={(facet) => setFilters((prev) => prev.filter((f) => f.facet !== facet))}
            onClearAll={() => setFilters([])}
            suggestions={experimentSuggestions}
            placeholder="Filter by status, name, or metric…"
          />
          <ExperimentsTable
            experiments={filteredExperiments}
          sortConfig={sortConfig}
          onSort={toggleSort}
          onNavigate={(id) => navigate(`/experiment/${id}`)}
          onStart={(id) => startMutation.mutate(id)}
          onPause={(id) => pauseMutation.mutate(id)}
          onStop={(id) => stopMutation.mutate(id)}
          onRestart={(id) => restartMutation.mutate(id)}
          />
        </>
      )}
    </div>
  );
}
