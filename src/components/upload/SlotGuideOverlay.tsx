import { SLOT_COUNT } from "@/lib/upload/constants";

type Props = {
  tip?: string;
  mode?: "batch" | "single";
};

function Tip({ tip }: { tip?: string }) {
  if (!tip) return null;
  return (
    <div className="absolute inset-x-0 top-0 flex justify-center p-2">
      <span className="rounded-full bg-black/50 px-3 py-1 text-center text-xs font-medium text-white">
        {tip}
      </span>
    </div>
  );
}

export default function SlotGuideOverlay({ tip, mode = "batch" }: Props) {
  if (mode === "single") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <Tip tip={tip} />
        <div className="absolute inset-8 rounded-lg border-2 border-dashed border-white/70" />
      </div>
    );
  }

  const dividers = Array.from({ length: SLOT_COUNT - 1 }, (_, i) => i + 1);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

  return (
    <div className="pointer-events-none absolute inset-0">
      <Tip tip={tip} />
      {dividers.map((i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-l-2 border-dashed border-white/70"
          style={{ left: `${(i * 100) / SLOT_COUNT}%` }}
        />
      ))}
      <div className="absolute inset-0 flex">
        {slots.map((slot) => (
          <div key={slot} className="flex flex-1 items-end justify-center pb-2">
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
              {slot}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
