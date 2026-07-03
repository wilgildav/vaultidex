"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Knife } from "@/types/knife";
import { SpecField, YearRangeField } from "@/components/knife/SpecFields";
import AddPhotoButton, { type UploadedPhoto } from "@/components/knife/AddPhotoButton";

type Thumbnails = Record<string, { front?: string; back?: string }>;

type EditableFields = {
  maker: string;
  model: string;
  model_number: string;
  blade_steel: string;
  handle_material: string;
  year_start: string;
  year_end: string;
  blade_length_in: string;
  overall_length_open_in: string;
  notes: string;
  visibility: "private" | "public";
};

function fieldsFromKnife(knife: Knife): EditableFields {
  return {
    maker: knife.maker ?? "",
    model: knife.model ?? "",
    model_number: knife.model_number ?? "",
    blade_steel: knife.blade_steel ?? "",
    handle_material: knife.handle_material ?? "",
    year_start: knife.year_start != null ? String(knife.year_start) : "",
    year_end: knife.year_end != null ? String(knife.year_end) : "",
    blade_length_in: knife.blade_length_in != null ? String(knife.blade_length_in) : "",
    overall_length_open_in:
      knife.overall_length_open_in != null ? String(knife.overall_length_open_in) : "",
    notes: knife.notes ?? "",
    visibility: knife.visibility,
  };
}

// The stopping point once every knife in the batch has either been
// confirmed or left as an explicit "no knife detected" skip. Deliberately
// plain — no animation or celebratory color — since this is a routine
// checkpoint the user will hit at the end of every upload, not a rare win.
function BatchComplete({
  confirmedCount,
  skippedCount,
  totalCount,
}: {
  confirmedCount: number;
  skippedCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-black/[.08] bg-white p-8 text-center dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Batch reviewed</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {confirmedCount} of {totalCount} knife{totalCount === 1 ? "" : "s"} saved to your vault
        {skippedCount > 0 &&
          ` · ${skippedCount} skipped (no knife detected)`}
        .
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/collection"
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Back to Vault
        </Link>
        <Link
          href="/upload"
          className="flex h-11 items-center justify-center rounded-full border border-solid border-black/[.15] px-5 font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
        >
          Upload another batch
        </Link>
      </div>
    </div>
  );
}

// A "draft" knife with every field still null almost always means
// identify() never actually finished for it (a transient API error, most
// commonly Gemini returning 503 under load) rather than the AI genuinely
// finding nothing — the identification prompt always attempts to fill in
// something when it thinks a knife is present. Without this, a failed
// call is indistinguishable from a real accuracy miss.
function isUnprocessed(knife: Knife): boolean {
  return (
    knife.status === "draft" &&
    knife.maker == null &&
    knife.model == null &&
    knife.model_number == null &&
    knife.blade_steel == null &&
    knife.handle_material == null &&
    knife.year_start == null &&
    knife.year_end == null &&
    knife.blade_length_in == null &&
    knife.overall_length_open_in == null &&
    knife.notes == null
  );
}

export default function ReviewQueue({
  knives,
  thumbnails,
  errors,
  retrying,
  onRetryIdentify,
  onKnifeUpdated,
}: {
  knives: Knife[];
  thumbnails: Thumbnails;
  errors: Record<string, string>;
  retrying: Record<string, boolean>;
  onRetryIdentify: (knifeId: string) => void;
  onKnifeUpdated: (knife: Knife) => void;
}) {
  const sorted = useMemo(
    () => [...knives].sort((a, b) => (a.slot_position ?? 0) - (b.slot_position ?? 0)),
    [knives],
  );
  const [showSkipped, setShowSkipped] = useState(false);
  // A "not_identified" knife is the AI's call, not the user's — so it stays
  // in the active queue (giving the user a chance to add a better photo and
  // retry, or fill it in by hand) until explicitly dismissed. Once
  // dismissed it behaves like the old "skipped" concept: hidden by default,
  // revealable with the show/hide toggle below.
  const [dismissedSkips, setDismissedSkips] = useState<Record<string, boolean>>({});
  const visible = useMemo(
    () =>
      sorted.filter(
        (k) => showSkipped || k.status !== "not_identified" || !dismissedSkips[k.id],
      ),
    [sorted, showSkipped, dismissedSkips],
  );
  const dismissedCount = sorted.filter(
    (k) => k.status === "not_identified" && dismissedSkips[k.id],
  ).length;

  const [rawIndex, setIndex] = useState(0);
  // Clamped at read time (rather than via an effect) so a shrinking
  // `visible` list — e.g. toggling "show skipped" off — never leaves the
  // index pointing past the end.
  const index = Math.min(rawIndex, Math.max(0, visible.length - 1));
  const current = visible[index] as Knife | undefined;

  const [edits, setEdits] = useState<Record<string, EditableFields>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Extra photos (e.g. a closer shot of a tang stamp) a user attaches
  // mid-review — kept client-side only here since nothing else in this
  // screen needs to read them back; the detail page re-fetches its own
  // list from the database once the knife is confirmed.
  const [extraPhotos, setExtraPhotos] = useState<Record<string, UploadedPhoto[]>>({});

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
        model_number: currentFields.model_number,
        blade_steel: currentFields.blade_steel,
        handle_material: currentFields.handle_material,
        year_start: currentFields.year_start,
        year_end: currentFields.year_end,
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
  const confirmedTotal = sorted.filter((k) => k.status === "confirmed").length;
  const allReviewed = sorted.length > 0 && confirmedTotal + dismissedCount === sorted.length;

  if (allReviewed) {
    return (
      <BatchComplete
        confirmedCount={confirmedTotal}
        skippedCount={dismissedCount}
        totalCount={sorted.length}
      />
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
        {dismissedCount > 0 && (
          <>
            {" · "}
            {dismissedCount} skipped (no knife detected){" "}
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

        {(errors[current.id] || isUnprocessed(current) || current.status === "not_identified") && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">
              {current.status === "not_identified" && !errors[current.id]
                ? "No knife was detected here."
                : "Identification didn't finish for this knife."}
            </p>
            {errors[current.id] && <p className="mt-1 text-xs">{errors[current.id]}</p>}
            <p className="mt-1 text-xs">
              If the photo was unclear, add a closer shot below, then retry.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onRetryIdentify(current.id)}
                disabled={retrying[current.id]}
                className="flex h-8 items-center justify-center rounded-full border border-solid border-amber-400 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                {retrying[current.id] ? "Retrying…" : "Retry identification"}
              </button>
              {current.status === "not_identified" && (
                <button
                  type="button"
                  onClick={() => {
                    setDismissedSkips((prev) => ({ ...prev, [current.id]: true }));
                    if (index < visible.length - 1) setIndex(index + 1);
                  }}
                  className="flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-amber-900 underline transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  Skip — no knife here
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
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
          {(extraPhotos[current.id] ?? []).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
            <img
              key={photo.id}
              src={photo.url}
              alt={`Slot ${current.slot_position} extra`}
              className="h-28 w-24 rounded object-cover"
            />
          ))}
          <AddPhotoButton
            knifeId={current.id}
            onUploaded={(photo) =>
              setExtraPhotos((prev) => ({
                ...prev,
                [current.id]: [...(prev[current.id] ?? []), photo],
              }))
            }
          />
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
          label="Model number"
          value={currentFields.model_number}
          onChange={(v) => setField("model_number", v)}
          confidence={current.model_number_confidence}
          aiOriginal={current.ai_model_number}
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
        <YearRangeField
          startValue={currentFields.year_start}
          endValue={currentFields.year_end}
          onStartChange={(v) => setField("year_start", v)}
          onEndChange={(v) => setField("year_end", v)}
          confidence={current.year_confidence}
          aiOriginalStart={current.ai_year_start}
          aiOriginalEnd={current.ai_year_end}
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
    </div>
  );
}
