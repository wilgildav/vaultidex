import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Knife } from "@/types/knife";
import CollectibleCard from "@/components/collection/CollectibleCard";

type Shelf = { title: string; knives: Knife[] };

// Groups confirmed knives into "shelves": a pinned Favorites shelf (if any
// exist), then one shelf per maker, alphabetically, with unmade-attributed
// knives collected under "Unsorted" at the end.
function groupIntoShelves(knives: Knife[]): Shelf[] {
  const byCreatedDesc = [...knives].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const shelves: Shelf[] = [];
  const favorites = byCreatedDesc.filter((k) => k.favorite);
  if (favorites.length > 0) {
    shelves.push({ title: "Favorites", knives: favorites });
  }

  const byMaker = new Map<string, Knife[]>();
  for (const knife of byCreatedDesc) {
    const key = knife.maker?.trim() || "Unsorted";
    byMaker.set(key, [...(byMaker.get(key) ?? []), knife]);
  }

  const makerNames = [...byMaker.keys()].sort((a, b) => {
    if (a === "Unsorted") return 1;
    if (b === "Unsorted") return -1;
    return a.localeCompare(b);
  });
  for (const name of makerNames) {
    shelves.push({ title: name, knives: byMaker.get(name)! });
  }

  return shelves;
}

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: knives } = await supabase
    .from("knives")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  const confirmedKnives = knives ?? [];

  const thumbnails = Object.fromEntries(
    await Promise.all(
      confirmedKnives.map(async (knife) => {
        const path = knife.key_photo_path ?? knife.front_image_path;
        if (!path) return [knife.id, undefined] as const;
        const { data } = await supabase.storage.from("knife-photos").createSignedUrl(path, 3600);
        return [knife.id, data?.signedUrl] as const;
      }),
    ),
  );

  const shelves = groupIntoShelves(confirmedKnives);

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Your Vault</h1>
          <Link
            href="/upload"
            className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Upload knives
          </Link>
        </div>

        {shelves.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-black/[.08] bg-white p-8 text-center dark:border-white/[.145] dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your vault is empty. Upload a photo to identify and confirm your first knife.
            </p>
            <Link
              href="/upload"
              className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Upload knives
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-8">
            {shelves.map((shelf) => (
              <div key={shelf.title} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {shelf.title}
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {shelf.knives.map((knife) => (
                    <CollectibleCard
                      key={knife.id}
                      knife={knife}
                      thumbnailUrl={thumbnails[knife.id]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
