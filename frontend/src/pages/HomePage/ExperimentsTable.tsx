import { ExperimentRow } from "./ExperimentRow";
import { Experiment } from "../../types";

interface ExperimentsTableProps {
  experiments: Experiment[];
  sortConfig: { key: "name" | "start_date"; direction: "asc" | "desc" };
  onSort: (key: "name" | "start_date") => void;
  onNavigate: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}

export function ExperimentsTable({
  experiments,
  sortConfig,
  onSort,
  onNavigate,
  onStart,
  onPause,
  onStop,
  onRestart,
}: ExperimentsTableProps) {
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[48px_1.4fr_1fr_120px_120px_120px_140px_140px_140px] gap-4 border-b border-slate-800/70 px-4 py-2 text-sm font-bold text-slate-300">
        <span>#</span>
        <button
          type="button"
          onClick={() => onSort("name")}
          className="flex items-center gap-2 text-left"
        >
          Name
          <span className="text-xs">
            {sortConfig.key === "name"
              ? sortConfig.direction === "asc"
                ? "▲"
                : "▼"
              : ""}
          </span>
        </button>
        <span>Primary Metric</span>
        <span>Gate</span>
        <button
          type="button"
          onClick={() => onSort("start_date")}
          className="flex items-center gap-2 text-left"
        >
          Timeline
          <span className="text-xs">
            {sortConfig.key === "start_date"
              ? sortConfig.direction === "asc"
                ? "▲"
                : "▼"
              : ""}
          </span>
        </button>
        <span>Owner</span>
        <span>Variants</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      <div className="divide-y divide-slate-800/70">
        {experiments.map((exp, index) => (
          <ExperimentRow
            key={exp.id}
            experiment={exp}
            index={index}
            onNavigate={onNavigate}
            onStart={onStart}
            onPause={onPause}
            onStop={onStop}
            onRestart={onRestart}
          />
        ))}
      </div>
    </div>
  );
}
