"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Knife } from "@/types/knife";

type Thumbnails = Record<string, { front?: string; back?: string }>;

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;
  return <span className="text-xs text-zinc-500 dark:text-zinc-400">({level})</span>;
}

// Shows a spec that may have a "verified" (grounded web search) value in
// addition to the original visual estimate — clearly labeled so a verified
// fact and an AI guess are never confused for one another.
function SpecRow({
  label,
  estimated,
  verified,
  unit,
}: {
  label: string;
  estimated: string | number | null;
  verified: string | number | null;
  unit?: string;
}) {
  if (estimated == null && verified == null) return null;
  const isVerified = verified != null;
  const displayValue = verified ?? estimated;

  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="text-right font-medium text-black dark:text-zinc-50">
        <div className="inline-flex items-center gap-1.5">
          <span>
            {displayValue}
            {unit}
          </span>
          {isVerified ? (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800 dark:bg-green-900 dark:text-green-300">
              ✓ verified
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-300">
              estimated
            </span>
          )}
        </div>
        {isVerified && estimated != null && String(estimated) !== String(verified) && (
          <div className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            visual estimate: {estimated}
            {unit}
          </div>
        )}
      </dd>
    </div>
  );
}

export default function BatchReview({ initialKnives }: { initialKnives: Knife[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [knives, setKnives] = useState(initialKnives);
  const [thumbnails, setThumbnails] = useState<Thumbnails>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnails() {
      const entries = await Promise.all(
        initialKnives.map(async (knife) => {
          const [front, back] = await Promise.all([
            knife.front_image_path
              ? supabase.storage
                  .from("knife-photos")
                  .createSignedUrl(knife.front_image_path, 3600)
              : Promise.resolve({ data: null }),
            knife.back_image_path
              ? supabase.storage
                  .from("knife-photos")
                  .createSignedUrl(knife.back_image_path, 3600)
              : Promise.resolve({ data: null }),
          ]);
          return [
            knife.id,
            { front: front.data?.signedUrl, back: back.data?.signedUrl },
          ] as const;
        }),
      );
      if (!cancelled) {
        setThumbnails(Object.fromEntries(entries));
      }
    }

    loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [initialKnives, supabase]);

  // Fact verification (grounded web search) is the slowest step in the
  // whole pipeline, so it's a separate follow-up call rather than part of
  // identify() below — the base result shows up immediately, and specs
  // upgrade to "verified" in place once this resolves, instead of the user
  // staring at "Identifying…" for a minute or more waiting on a web search.
  const verifySpecsForKnife = useCallback(async (knifeId: string) => {
    setVerifying((prev) => ({ ...prev, [knifeId]: true }));
    const res = await fetch(`/api/knives/${knifeId}/verify-specs`, { method: "POST" });
    const body = await res.json();
    if (res.ok && body.knife) {
      setKnives((prev) => prev.map((k) => (k.id === knifeId ? body.knife : k)));
    }
    setVerifying((prev) => ({ ...prev, [knifeId]: false }));
  }, []);

  const identify = useCallback(
    async (knifeId: string) => {
      setIdentifying((prev) => ({ ...prev, [knifeId]: true }));
      setErrors((prev) => ({ ...prev, [knifeId]: "" }));

      const res = await fetch(`/api/knives/${knifeId}/identify`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [knifeId]: body.error ?? "Identification failed." }));
      } else {
        setKnives((prev) => prev.map((k) => (k.id === knifeId ? body.knife : k)));
        // Collapse slots the model thinks are empty; expand everything else.
        setExpanded((prev) => ({ ...prev, [knifeId]: body.knife.status !== "not_identified" }));
        if (body.knife.maker_confidence === "high" && body.knife.model_confidence === "high") {
          // Not awaited — this runs in the background after identify()
          // has already resolved and updated the UI.
          verifySpecsForKnife(knifeId);
        }
      }
      setIdentifying((prev) => ({ ...prev, [knifeId]: false }));
    },
    [verifySpecsForKnife],
  );

  // Run identification automatically for every slot as soon as the batch
  // is created, instead of making the user click through each one.
  useEffect(() => {
    initialKnives.forEach((knife) => {
      identify(knife.id);
    });
  }, [initialKnives, identify]);

  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
        Draft knives from this batch
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {knives.map((knife) => {
          const isCollapsed = knife.status === "not_identified" && !expanded[knife.id];

          if (isCollapsed) {
            return (
              <div
                key={knife.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Slot {knife.slot_position} — no knife detected
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [knife.id]: true }))}
                  className="shrink-0 text-sm font-medium text-black underline dark:text-zinc-50"
                >
                  Show anyway
                </button>
              </div>
            );
          }

          return (
            <div
              key={knife.id}
              className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  Slot {knife.slot_position}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {identifying[knife.id] ? "identifying…" : knife.status}
                </span>
              </div>

              <div className="flex gap-2">
                {thumbnails[knife.id]?.front && (
                  // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
                  <img
                    src={thumbnails[knife.id].front}
                    alt={`Slot ${knife.slot_position} front`}
                    className="h-24 w-20 rounded object-cover"
                  />
                )}
                {thumbnails[knife.id]?.back && (
                  // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
                  <img
                    src={thumbnails[knife.id].back}
                    alt={`Slot ${knife.slot_position} back`}
                    className="h-24 w-20 rounded object-cover"
                  />
                )}
              </div>

              {knife.status === "not_identified" ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No knife detected in this slot.
                </p>
              ) : (
                <dl className="flex flex-col gap-1 text-sm">
                  {knife.maker && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-600 dark:text-zinc-400">Maker</dt>
                      <dd className="text-right font-medium text-black dark:text-zinc-50">
                        {knife.maker} <ConfidenceBadge level={knife.maker_confidence} />
                      </dd>
                    </div>
                  )}
                  {knife.model && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-600 dark:text-zinc-400">Model</dt>
                      <dd className="text-right font-medium text-black dark:text-zinc-50">
                        {knife.model} <ConfidenceBadge level={knife.model_confidence} />
                      </dd>
                    </div>
                  )}
                  {knife.pattern && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-600 dark:text-zinc-400">Pattern</dt>
                      <dd className="text-right font-medium text-black dark:text-zinc-50">
                        {knife.pattern}
                      </dd>
                    </div>
                  )}
                  <SpecRow
                    label="Steel"
                    estimated={knife.blade_steel}
                    verified={knife.blade_steel_verified}
                  />
                  {knife.handle_material && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-600 dark:text-zinc-400">Handle</dt>
                      <dd className="text-right font-medium text-black dark:text-zinc-50">
                        {knife.handle_material}{" "}
                        <ConfidenceBadge level={knife.handle_material_confidence} />
                      </dd>
                    </div>
                  )}
                  <SpecRow
                    label="Blade length"
                    estimated={knife.blade_length_in}
                    verified={knife.blade_length_in_verified}
                    unit="″"
                  />
                  <SpecRow
                    label="Overall (open)"
                    estimated={knife.overall_length_open_in}
                    verified={knife.overall_length_open_in_verified}
                    unit="″"
                  />
                </dl>
              )}

              {verifying[knife.id] && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Verifying specs against real sources…
                </p>
              )}

              {knife.spec_verification_sources && knife.spec_verification_sources.length > 0 && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sources:{" "}
                  {knife.spec_verification_sources.map((source, i) => (
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

              {errors[knife.id] && <p className="text-xs text-red-600">{errors[knife.id]}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => identify(knife.id)}
                  disabled={identifying[knife.id]}
                  className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.15] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
                >
                  {identifying[knife.id] ? "Identifying…" : "Re-identify"}
                </button>
                {knife.maker_confidence === "high" && knife.model_confidence === "high" && (
                  <button
                    type="button"
                    onClick={() => verifySpecsForKnife(knife.id)}
                    disabled={verifying[knife.id] || identifying[knife.id]}
                    className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.15] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
                  >
                    {verifying[knife.id] ? "Verifying…" : "Re-verify specs"}
                  </button>
                )}
                {knife.status === "not_identified" && (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [knife.id]: false }))}
                    className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-[#1a1a1a]"
                  >
                    Collapse
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
