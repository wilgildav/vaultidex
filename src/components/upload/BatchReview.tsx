"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Knife } from "@/types/knife";
import ReviewQueue from "@/components/review/ReviewQueue";

type Thumbnails = Record<string, { front?: string; back?: string }>;

export default function BatchReview({ initialKnives }: { initialKnives: Knife[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [knives, setKnives] = useState(initialKnives);
  const [thumbnails, setThumbnails] = useState<Thumbnails>({});
  const [identifying, setIdentifying] = useState<Record<string, boolean>>({});
  const [, setVerifying] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allIdentifyAttempted, setAllIdentifyAttempted] = useState(false);

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
  // is created, instead of making the user click through each one. Once
  // every slot has been attempted at least once, hand off to the
  // one-at-a-time review queue where fields actually get confirmed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all(initialKnives.map((knife) => identify(knife.id)));
      if (!cancelled) setAllIdentifyAttempted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialKnives, identify]);

  if (!allIdentifyAttempted) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Identifying this batch…
        </h2>
        <div className="flex flex-col gap-2">
          {knives.map((knife) => (
            <div
              key={knife.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
            >
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Slot {knife.slot_position}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {identifying[knife.id]
                  ? "identifying…"
                  : knife.status === "not_identified"
                    ? "no knife detected"
                    : "identified"}
              </span>
            </div>
          ))}
        </div>
        {knives.map(
          (knife) =>
            errors[knife.id] && (
              <p key={knife.id} className="text-xs text-red-600">
                Slot {knife.slot_position}: {errors[knife.id]}
              </p>
            ),
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
        Review &amp; confirm
      </h2>
      <ReviewQueue
        knives={knives}
        thumbnails={thumbnails}
        onKnifeUpdated={(updated) =>
          setKnives((prev) => prev.map((k) => (k.id === updated.id ? updated : k)))
        }
      />
    </div>
  );
}
