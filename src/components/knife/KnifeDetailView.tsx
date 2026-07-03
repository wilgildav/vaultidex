"use client";

import { useState } from "react";
import Link from "next/link";
import type { Knife } from "@/types/knife";
import { SpecField, YearRangeField } from "@/components/knife/SpecFields";

type Thumbnails = { front?: string; back?: string };

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
  favorite: boolean;
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
    favorite: knife.favorite,
  };
}

export default function KnifeDetailView({
  knife,
  thumbnails,
}: {
  knife: Knife;
  thumbnails: Thumbnails;
}) {
  const [current, setCurrent] = useState(knife);
  const [edits, setEdits] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const fields = edits ?? fieldsFromKnife(current);

  function setField<K extends keyof EditableFields>(field: K, value: EditableFields[K]) {
    setEdits({ ...fields, [field]: value });
    setJustSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    const res = await fetch(`/api/knives/${current.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const body = await res.json();

    if (!res.ok) {
      setSaveError(body.error ?? "Could not save this knife.");
    } else {
      setCurrent(body.knife);
      setEdits(null);
      setJustSaved(true);
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/collection"
        className="w-fit text-sm text-zinc-600 underline hover:text-black dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to Vault
      </Link>

      <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
            {current.model ?? "Untitled knife"}
          </h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {current.status}
            </span>
            <button
              type="button"
              onClick={() => setField("favorite", !fields.favorite)}
              aria-pressed={fields.favorite}
              aria-label={fields.favorite ? "Remove from favorites" : "Add to favorites"}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                fields.favorite
                  ? "border-amber-400 bg-amber-100 text-amber-600 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  : "border-black/[.15] text-zinc-400 hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {fields.favorite ? "★" : "☆"}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {thumbnails.front && (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
            <img
              src={thumbnails.front}
              alt="Front"
              className="h-40 w-32 rounded object-cover"
            />
          )}
          {thumbnails.back && (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
            <img
              src={thumbnails.back}
              alt="Back"
              className="h-40 w-32 rounded object-cover"
            />
          )}
          {!thumbnails.front && !thumbnails.back && (
            <div className="flex h-40 w-32 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
              No photo
            </div>
          )}
        </div>

        <SpecField
          label="Maker"
          value={fields.maker}
          onChange={(v) => setField("maker", v)}
          confidence={current.maker_confidence}
          aiOriginal={current.ai_maker}
        />
        <SpecField
          label="Model"
          value={fields.model}
          onChange={(v) => setField("model", v)}
          confidence={current.model_confidence}
          aiOriginal={current.ai_model}
        />
        <SpecField
          label="Model number"
          value={fields.model_number}
          onChange={(v) => setField("model_number", v)}
          confidence={current.model_number_confidence}
          aiOriginal={current.ai_model_number}
        />
        <SpecField
          label="Blade steel"
          value={fields.blade_steel}
          onChange={(v) => setField("blade_steel", v)}
          confidence={current.blade_steel_confidence}
          aiOriginal={current.ai_blade_steel}
          verified={current.blade_steel_verified}
        />
        <SpecField
          label="Handle material"
          value={fields.handle_material}
          onChange={(v) => setField("handle_material", v)}
          confidence={current.handle_material_confidence}
          aiOriginal={current.ai_handle_material}
        />
        <YearRangeField
          startValue={fields.year_start}
          endValue={fields.year_end}
          onStartChange={(v) => setField("year_start", v)}
          onEndChange={(v) => setField("year_end", v)}
          confidence={current.year_confidence}
          aiOriginalStart={current.ai_year_start}
          aiOriginalEnd={current.ai_year_end}
        />
        <SpecField
          label="Blade length"
          value={fields.blade_length_in}
          onChange={(v) => setField("blade_length_in", v)}
          aiOriginal={current.ai_blade_length_in}
          verified={current.blade_length_in_verified}
          unit="″"
          type="number"
        />
        <SpecField
          label="Overall length (open)"
          value={fields.overall_length_open_in}
          onChange={(v) => setField("overall_length_open_in", v)}
          aiOriginal={current.ai_overall_length_open_in}
          verified={current.overall_length_open_in_verified}
          unit="″"
          type="number"
        />
        <SpecField
          label="Notes"
          value={fields.notes}
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
                  fields.visibility === v
                    ? "bg-foreground text-background"
                    : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {v === "private" ? "Private" : "Public"}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {fields.visibility === "private"
              ? "Only you can see this knife."
              : "Anyone with a link will be able to see this knife once public sharing is built."}
          </p>
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        {justSaved && !saveError && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Changes saved.</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
