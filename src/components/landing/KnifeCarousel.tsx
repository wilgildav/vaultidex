const GRADIENTS = [
  "from-amber-200 to-orange-400 dark:from-amber-900 dark:to-orange-950",
  "from-zinc-300 to-zinc-500 dark:from-zinc-700 dark:to-zinc-900",
  "from-emerald-200 to-teal-400 dark:from-emerald-900 dark:to-teal-950",
  "from-rose-200 to-red-400 dark:from-rose-900 dark:to-red-950",
  "from-sky-200 to-blue-400 dark:from-sky-900 dark:to-blue-950",
  "from-yellow-200 to-amber-400 dark:from-yellow-900 dark:to-amber-950",
];

// Purely decorative sample data for the landing-page backdrop — generic
// pattern/maker names, not real inventory.
const SAMPLE_CARDS = [
  { label: "Trapper", maker: "Case" },
  { label: "Stockman", maker: "Schrade" },
  { label: "Peanut", maker: "Case XX" },
  { label: "Sowbelly", maker: "GEC" },
  { label: "Congress", maker: "Queen" },
  { label: "Barlow", maker: "Camillus" },
  { label: "Canoe", maker: "Remington" },
  { label: "Mariner", maker: "W.R. Case" },
];

function KnifeGlyph() {
  return (
    <svg viewBox="0 0 64 64" className="h-8 w-8 text-black/30 dark:text-white/30" fill="none">
      <path
        d="M6 40 L38 8 Q42 4 46 8 L56 18 Q60 22 56 26 L24 58 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M6 40 L16 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CarouselRow({
  animationClass,
  offset = 0,
}: {
  animationClass: string;
  offset?: number;
}) {
  const cards = [...SAMPLE_CARDS.slice(offset), ...SAMPLE_CARDS.slice(0, offset)];
  // Doubled so the track can translate exactly -50% and loop seamlessly.
  const doubled = [...cards, ...cards];

  return (
    <div className={`flex w-max gap-4 ${animationClass}`}>
      {doubled.map((card, i) => (
        <div
          key={`${card.label}-${i}`}
          className={`flex h-40 w-32 flex-shrink-0 flex-col items-center justify-center gap-2 rounded-lg bg-gradient-to-br p-3 shadow-md ${GRADIENTS[i % GRADIENTS.length]}`}
        >
          <KnifeGlyph />
          <div className="text-center">
            <p className="text-xs font-semibold text-black/60 dark:text-white/70">{card.label}</p>
            <p className="text-[10px] text-black/40 dark:text-white/50">{card.maker}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Decorative, Netflix-style horizontally-scrolling backdrop of placeholder
// knife cards for the logged-out landing page. Purely presentational — no
// real data, not interactive — so it's hidden from assistive tech and
// never intercepts clicks meant for the login card in front of it.
export default function KnifeCarousel() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-6 overflow-hidden opacity-60 dark:opacity-40"
    >
      <CarouselRow animationClass="animate-marquee-left" offset={0} />
      <CarouselRow animationClass="animate-marquee-right" offset={3} />
      <CarouselRow animationClass="animate-marquee-left-slow" offset={5} />
    </div>
  );
}
