import type { ConfidenceLevel } from "@/types/knife";

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  if (!level) return null;
  const styles: Record<NonNullable<ConfidenceLevel>, string> = {
    high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[level]}`}
    >
      {level}
    </span>
  );
}

export const inputClasses =
  "rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-950 dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50";

// A single editable spec field. Shows the AI's confidence and (when the
// user hasn't yet changed the value) says nothing extra; once edited, it
// notes what the AI originally said so a correction is never silently
// destructive. A "verified" value (from grounded web search) is shown
// distinctly from the AI's own visual estimate, with a one-click way to
// adopt it into the editable value.
export function SpecField({
  label,
  value,
  onChange,
  confidence,
  aiOriginal,
  verified,
  unit,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  confidence?: ConfidenceLevel;
  aiOriginal?: string | number | null;
  verified?: string | number | null;
  unit?: string;
  type?: "text" | "number";
  multiline?: boolean;
}) {
  const aiOriginalStr = aiOriginal != null && aiOriginal !== "" ? String(aiOriginal) : null;
  const showAiHint = aiOriginalStr != null && aiOriginalStr !== value.trim();
  const verifiedStr = verified != null ? String(verified) : null;
  const showVerifiedAction = verifiedStr != null && verifiedStr !== value.trim();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
        <div className="flex items-center gap-1.5">
          {verifiedStr != null && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800 dark:bg-green-900 dark:text-green-300">
              ✓ verified: {verifiedStr}
              {unit}
            </span>
          )}
          <ConfidenceBadge level={confidence ?? null} />
        </div>
      </div>

      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputClasses}
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            type={type}
            step={type === "number" ? "0.01" : undefined}
            min={type === "number" ? "0" : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`flex-1 ${inputClasses}`}
          />
          {unit && <span className="text-sm text-zinc-500 dark:text-zinc-400">{unit}</span>}
        </div>
      )}

      {showVerifiedAction && (
        <button
          type="button"
          onClick={() => onChange(verifiedStr)}
          className="self-start text-xs font-medium text-black underline dark:text-zinc-50"
        >
          Use verified value ({verifiedStr}
          {unit})
        </button>
      )}
      {showAiHint && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          AI originally said: {aiOriginalStr}
          {unit}
        </p>
      )}
    </div>
  );
}

// Production year range: two inputs (start/end) sharing one confidence
// badge, since the AI estimates them together as a single range rather
// than as two independent guesses.
export function YearRangeField({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  confidence,
  aiOriginalStart,
  aiOriginalEnd,
}: {
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  confidence?: ConfidenceLevel;
  aiOriginalStart?: number | null;
  aiOriginalEnd?: number | null;
}) {
  const aiStartStr = aiOriginalStart != null ? String(aiOriginalStart) : null;
  const aiEndStr = aiOriginalEnd != null ? String(aiOriginalEnd) : null;
  const showAiHint =
    (aiStartStr != null && aiStartStr !== startValue.trim()) ||
    (aiEndStr != null && aiEndStr !== endValue.trim());

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Production year(s)
        </label>
        <ConfidenceBadge level={confidence ?? null} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Start"
          value={startValue}
          onChange={(e) => onStartChange(e.target.value)}
          className={`flex-1 ${inputClasses}`}
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">to</span>
        <input
          type="number"
          placeholder="End"
          value={endValue}
          onChange={(e) => onEndChange(e.target.value)}
          className={`flex-1 ${inputClasses}`}
        />
      </div>
      {showAiHint && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          AI originally said: {aiStartStr ?? "?"}–{aiEndStr ?? "?"}
        </p>
      )}
    </div>
  );
}
