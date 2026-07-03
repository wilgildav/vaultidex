import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultBrowser from "@/components/collection/VaultBrowser";
import AccountMenu from "@/components/nav/AccountMenu";

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
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

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <AccountMenu userEmail={user.email ?? ""} />
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

        {confirmedKnives.length === 0 ? (
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
          <VaultBrowser knives={confirmedKnives} thumbnails={thumbnails} />
        )}
      </div>
    </div>
  );
}
