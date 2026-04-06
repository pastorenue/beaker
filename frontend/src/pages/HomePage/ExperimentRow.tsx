import { StatusBadge } from "../../components/Common";
import { Experiment } from "../../types";

interface ExperimentRowProps {
  experiment: Experiment;
  index: number;
  onNavigate: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}

export function ExperimentRow({
  experiment: exp,
  index,
  onNavigate,
  onStart,
  onPause,
  onStop,
  onRestart,
}: ExperimentRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(exp.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(exp.id);
        }
      }}
      className="table-row grid grid-cols-[48px_1.4fr_1fr_120px_120px_120px_140px_140px_140px] gap-4 px-4 py-2 text-sm leading-none text-slate-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <span className="text-slate-400">{index + 1}</span>
      <div className="font-semibold text-slate-100">{exp.name}</div>
      <span className="text-slate-300">{exp.primary_metric}</span>
      <span className="text-slate-300">
        {exp.feature_gate_id ? <span className="badge-info">Linked</span> : "—"}
      </span>
      <div className="text-slate-300">
        {(() => {
          const startFormatted = exp.start_date
            ? new Date(exp.start_date).toLocaleDateString()
            : "—";
          const endFormatted = exp.end_date
            ? new Date(exp.end_date).toLocaleDateString()
            : null;
          const progress = (() => {
            if (!exp.start_date || !exp.end_date) return null;
            const start = new Date(exp.start_date).getTime();
            const end = new Date(exp.end_date).getTime();
            if (end <= start) return 0;
            const now = Date.now();
            return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
          })();
          return (
            <>
              <span className="text-xs text-slate-400">
                {startFormatted} → {endFormatted ?? "—"}
              </span>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-700">
                {progress !== null ? (
                  <div
                    className="h-1.5 rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${Math.max(progress, 2)}%` }}
                  />
                ) : (
                  <div className="h-1.5 w-full rounded-full bg-slate-600 opacity-40" />
                )}
              </div>
            </>
          );
        })()}
      </div>
      <span className="text-slate-300">Unassigned</span>
      <span className="text-slate-300">{exp.variants.length}</span>
      <StatusBadge status={exp.status} format="title" />
      <div className="flex items-center gap-2">
        {(exp.status === "draft" || exp.status === "paused") && (
          <button
            className="btn-secondary h-7 w-7 p-0"
            onClick={(event) => {
              event.stopPropagation();
              onStart(exp.id);
            }}
            aria-label="Start experiment"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 5l11 7-11 7V5z"
              />
            </svg>
          </button>
        )}
        {exp.status === "running" && (
          <button
            className="btn-secondary h-7 w-7 p-0 relative"
            onClick={(event) => {
              event.stopPropagation();
              onPause(exp.id);
            }}
            aria-label="Pause experiment"
          >
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="absolute h-6 w-6 animate-ping rounded-full bg-emerald-400/25"></span>
            </span>
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6v12m4-12v12"
              />
            </svg>
          </button>
        )}
        {exp.status !== "stopped" && (
          <button
            className="btn-secondary h-7 w-7 p-0"
            onClick={(event) => {
              event.stopPropagation();
              onStop(exp.id);
            }}
            aria-label="Stop experiment"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        )}
        {exp.status === "stopped" && (
          <button
            className="btn-secondary h-7 w-7 p-0"
            onClick={(event) => {
              event.stopPropagation();
              onRestart(exp.id);
            }}
            aria-label="Stop experiment"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 5l11 7-11 7V5z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
