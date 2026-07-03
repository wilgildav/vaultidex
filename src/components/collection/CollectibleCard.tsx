import Link from "next/link";
import type { Knife } from "@/types/knife";

export default function CollectibleCard({
  knife,
  thumbnailUrl,
}: {
  knife: Knife;
  thumbnailUrl?: string;
}) {
  const title = knife.model ?? "Untitled knife";

  return (
    <Link
      href={`/knife/${knife.id}`}
      className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-3 transition-colors hover:border-black/[.2] dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/[.3]"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed-URL thumbnail
          <img
            src={thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-600">
            No photo
          </div>
        )}
        {knife.favorite && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-amber-400">
            ★
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="truncate text-sm font-medium text-black dark:text-zinc-50">{title}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {knife.maker ?? "Unknown maker"}
        </span>
      </div>
    </Link>
  );
}
