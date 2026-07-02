"use client";

import { useMemo, useState } from "react";
import type { ConfidenceLevel, Knife } from "@/types/knife";

type Thumbnails = Record<string, { front?: string; back?: string }>;

type EditableFields = {
  maker: string;
  model: string;
  pattern: string;
  blade_steel: string;
  handle_material: string;
  blade_length_in: string;
  overall_length_open_in: string;
  notes: string;
  visibility: "private" | "public";
};

function fieldsFromKnife(knife: Knife): EditableFields {
  return {
    maker: knife.maker ?? "",
    model: knife.model ?? "",
    pattern: knife.pattern ?? "",
    blade_steel: knife.blade_steel ?? "",
    handle_material: knife.handle_material ?? "",
    blade_length_in: knife.blade_length_in != null ? String(knife.blade_length_in) : "",
    overall_length_open_in:
      knife.overall_length_open_in != null ? String(knife.overall_length_open_in) : "",
    notes: knife.notes ?? "",
    visibility: knife.visibility,
  };
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
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

const inputClasses =
  "rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-950 dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50";

// A single editable spec field. Shows the AI's confidence and (when the
// user hasn't yet changed the value) says nothing extra; once edited, it
// notes what the AI originally said so a correction is never silently
// destructive. A "verified" value (from grounded web search) is shown
// distinctly from the AI's own visual estimate, with a one-click way to
// adopt it into the editable value.
function SpecField({
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

export default function ReviewQueue({
  knives,
  thumbnails,
  onKnifeUpdated,
}: {
  knives: Knife[];
  thumbnails: Thumbnails;
  onKnifeUpdated: (knife: Knife) => void;
}) {
  const sorted = useMemo(
    () => [...knives].sort((a, b) => (a.slot_position ?? 0) - (b.slot_position ?? 0)),
    [knives],
  );
  const [showSkipped, setShowSkipped] = useState(false);
  const visible = useMemo(
    () => sorted.filter((k) => showSkipped || k.status !== "not_identified"),
    [sorted, showSkipped],
  );
  const skippedCount = sorted.filter((k) => k.status === "not_identified").length;

  const [rawIndex, setIndex] = useState(0);
  // Clamped at read time (rather than via an effect) so a shrinking
  // `visible` list — e.g. toggling "show skipped" off — never leaves the
  // index pointing past the end.
  const index = Math.min(rawIndex, Math.max(0, visible.length - 1));
  const current = visible[index] as Knife | undefined;

  const [edits, setEdits] = useState<Record<string, EditableFields>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentFields = current ? (edits[current.id] ?? fieldsFromKnife(current)) : null;

  function setField<K extends keyof EditableFields>(field: K, value: EditableFields[K]) {
    if (!current) return;
    setEdits((prev) => ({
      ...prev,
      [current.id]: { ...(prev[current.id] ?? fieldsFromKnife(current)), [field]: value },
    }));
  }

  async function handleSave() {
    if (!current || !currentFields) return;
    setSaving(true);
    setSaveError(null);

    const res = await fetch(`/api/knives/${current.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maker: currentFields.maker,
        model: currentFields.model,
        pattern: currentFields.pattern,
        blade_steel: currentFields.blade_steel,
        handle_material: currentFields.handle_material,
        blade_length_in: currentFields.blade_length_in,
        overall_length_open_in: currentFields.overall_length_open_in,
        notes: currentFields.notes,
        visibility: currentFields.visibility,
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      setSaveError(body.error ?? "Could not save this knife.");
    } else {
      onKnifeUpdated(body.knife);
      if (index < visible.length - 1) {
        setIndex(index + 1);
      }
    }
    setSaving(false);
  }

  const confirmedCount = visible.filter((k) => k.status === "confirmed").length;
  const allConfirmed = visible.length > 0 && confirmedCount === visible.length;

  if (visible.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 text-center dark:border-white/[.145] dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          All {sorted.length} knife{sorted.length === 1 ? "" : "s"} in this batch had no clear
          detection.
        </p>
        <button
          type="button"
          onClick={() => setShowSkipped(true)}
          className="mx-auto flex h-9 items-center justify-center rounded-full border border-solid border-black/[.15] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
        >
          Show them anyway
        </button>
      </div>
    );
  }

  if (!current || !currentFields) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/[.08] bg-zinc-100 p-3 text-xs text-zinc-600 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-400">
        Editing a field here only changes what&apos;s shown — the AI&apos;s original guess is
        kept for reference and never overwritten. Nothing is added to your vault until you press
        <span className="font-medium text-black dark:text-zinc-50"> Save to Vault</span>, which
        writes your edits and marks the knife &quot;confirmed&quot;.
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Knife {index + 1} of {visible.length}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.15] px-3 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(visible.length - 1, i + 1))}
            disabled={index === visible.length - 1}
            className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.15] px-3 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
          >
            Next
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {confirmedCount} of {visible.length} saved to your vault
        {skippedCount > 0 && (
          <>
            {" · "}
            {skippedCount} skipped (no knife detected){" "}
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              className="underline hover:text-black dark:hover:text-zinc-200"
            >
              {showSkipped ? "hide" : "show"}
            </button>
          </>
        )}
      </p>

      <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Slot {current.slot_position}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {current.status}
          </span>
        </div>

        <div className="flex gap-2">
          {thumbnails[current.id]?.front && (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
            <img
              src={thumbnails[current.id].front}
              alt={`Slot ${current.slot_position} front`}
              className="h-28 w-24 rounded object-cover"
            />
          )}
          {thumbnails[current.id]?.back && (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
            <img
              src={thumbnails[current.id].back}
              alt={`Slot ${current.slot_position} back`}
              className="h-28 w-24 rounded object-cover"
            />
          )}
        </div>

        <SpecField
          label="Maker"
          value={currentFields.maker}
          onChange={(v) => setField("maker", v)}
          confidence={current.maker_confidence}
          aiOriginal={current.ai_maker}
        />
        <SpecField
          label="Model"
          value={currentFields.model}
          onChange={(v) => setField("model", v)}
          confidence={current.model_confidence}
          aiOriginal={current.ai_model}
        />
        <SpecField
          label="Pattern"
          value={currentFields.pattern}
          onChange={(v) => setField("pattern", v)}
          aiOriginal={current.ai_pattern}
        />
        <SpecField
          label="Blade steel"
          value={currentFields.blade_steel}
          onChange={(v) => setField("blade_steel", v)}
          confidence={current.blade_steel_confidence}
          aiOriginal={current.ai_blade_steel}
          verified={current.blade_steel_verified}
        />
        <SpecField
          label="Handle material"
          value={currentFields.handle_material}
          onChange={(v) => setField("handle_material", v)}
          confidence={current.handle_material_confidence}
          aiOriginal={current.ai_handle_material}
        />
        <SpecField
          label="Blade length"
          value={currentFields.blade_length_in}
          onChange={(v) => setField("blade_length_in", v)}
          aiOriginal={current.ai_blade_length_in}
          verified={current.blade_length_in_verified}
          unit="″"
          type="number"
        />
        <SpecField
          label="Overall length (open)"
          value={currentFields.overall_length_open_in}
          onChange={(v) => setField("overall_length_open_in", v)}
          aiOriginal={current.ai_overall_length_open_in}
          verified={current.overall_length_open_in_verified}
          unit="″"
          type="number"
        />
        <SpecField
          label="Notes"
          value={currentFields.notes}
          onChange={(v) => setField("notes", v)}
          aiOriginal={current.ai_notes}
          multiline
        />

        {current.spec_verification_sources && current.spec_verification_sources.length > 0 && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Verified against:{" "}
            {current.spec_verification_sources.map((source, i) => (
              <span key={source.uri}>
                {i > 0 && ", "}
                <a
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-black dark:hover:text-zinc-200"
                >
                  {source.title}
                </a>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Visibility
          </label>
          <div className="inline-flex w-fit rounded-full border border-black/[.08] p-0.5 dark:border-white/[.145]">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setField("visibility", v)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  currentFields.visibility === v
                    ? "bg-foreground text-background"
                    : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {v === "private" ? "Private" : "Public"}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {currentFields.visibility === "private"
              ? "Only you can see this knife."
              : "Anyone with a link will be able to see this knife once public sharing is built."}
          </p>
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {saving
            ? "Saving…"
            : current.status === "confirmed"
              ? "Save changes"
              : "Save to Vault"}
        </button>
      </div>

      {allConfirmed && (
        <p className="text-center text-sm text-green-600 dark:text-green-500">
          You&apos;ve reviewed every knife in this batch.
        </p>
      )}
    </div>
  );
}
