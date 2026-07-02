"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Knife } from "@/types/knife";

type Thumbnails = Record<string, { front?: string; back?: string }>;

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;
  return <span className="text-xs text-zinc-500 dark:text-zinc-400">({level})</span>;
}

export default function BatchReview({ initialKnives }: { initialKnives: Knife[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [knives, setKnives] = useState(initialKnives);
  const [thumbnails, setThumbnails] = useState<Thumbnails>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  async function handleIdentify(knifeId: string) {
    setIdentifying((prev) => ({ ...prev, [knifeId]: true }));
    setErrors((prev) => ({ ...prev, [knifeId]: "" }));

    const res = await fetch(`/api/knives/${knifeId}/identify`, { method: "POST" });
    const body = await res.json();

    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [knifeId]: body.error ?? "Identification failed." }));
    } else {
      setKnives((prev) => prev.map((k) => (k.id === knifeId ? body.knife : k)));
    }
    setIdentifying((prev) => ({ ...prev, [knifeId]: false }));
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
        Draft knives from this batch
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {knives.map((knife) => (
          <div
            key={knife.id}
            className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                Slot {knife.slot_position}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {knife.status}
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
                {knife.blade_steel && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-600 dark:text-zinc-400">Steel</dt>
                    <dd className="text-right font-medium text-black dark:text-zinc-50">
                      {knife.blade_steel}{" "}
                      <ConfidenceBadge level={knife.blade_steel_confidence} />
                    </dd>
                  </div>
                )}
                {knife.handle_material && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-600 dark:text-zinc-400">Handle</dt>
                    <dd className="text-right font-medium text-black dark:text-zinc-50">
                      {knife.handle_material}{" "}
                      <ConfidenceBadge level={knife.handle_material_confidence} />
                    </dd>
                  </div>
                )}
                {knife.blade_length_in != null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-600 dark:text-zinc-400">Blade length</dt>
                    <dd className="text-right font-medium text-black dark:text-zinc-50">
                      {knife.blade_length_in}&Prime;
                    </dd>
                  </div>
                )}
                {knife.overall_length_open_in != null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-600 dark:text-zinc-400">Overall (open)</dt>
                    <dd className="text-right font-medium text-black dark:text-zinc-50">
                      {knife.overall_length_open_in}&Prime;
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {errors[knife.id] && <p className="text-xs text-red-600">{errors[knife.id]}</p>}

            <button
              type="button"
              onClick={() => handleIdentify(knife.id)}
              disabled={identifying[knife.id]}
              className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.15] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
            >
              {identifying[knife.id]
                ? "Identifying…"
                : knife.maker || knife.status === "not_identified"
                  ? "Re-identify"
                  : "Identify"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
