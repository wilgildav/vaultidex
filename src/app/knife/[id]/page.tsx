import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KnifeDetailView, { type DetailPhoto } from "@/components/knife/KnifeDetailView";
import AccountMenu from "@/components/nav/AccountMenu";

export default async function KnifeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: knife, error } = await supabase
    .from("knives")
    .select("*")
    .eq("id", id)
    .single();

  // RLS already limits reads to the owner or a public knife, but editing
  // (this page's whole purpose) only makes sense for the owner — a public
  // knife belonging to someone else should 404 here, not render a form
  // that would fail against RLS on save.
  if (error || !knife || knife.user_id !== user.id) {
    notFound();
  }

  const { data: extraPhotoRows } = await supabase
    .from("knife_extra_photos")
    .select("*")
    .eq("knife_id", id)
    .order("created_at", { ascending: true });

  const [frontUrl, backUrl, extraUrls] = await Promise.all([
    knife.front_image_path
      ? supabase.storage.from("knife-photos").createSignedUrl(knife.front_image_path, 3600)
      : Promise.resolve({ data: null }),
    knife.back_image_path
      ? supabase.storage.from("knife-photos").createSignedUrl(knife.back_image_path, 3600)
      : Promise.resolve({ data: null }),
    Promise.all(
      (extraPhotoRows ?? []).map((photo) =>
        supabase.storage.from("knife-photos").createSignedUrl(photo.storage_path, 3600),
      ),
    ),
  ]);

  const photos: DetailPhoto[] = [];
  if (knife.front_image_path) {
    photos.push({ key: "front", path: knife.front_image_path, url: frontUrl.data?.signedUrl });
  }
  if (knife.back_image_path) {
    photos.push({ key: "back", path: knife.back_image_path, url: backUrl.data?.signedUrl });
  }
  (extraPhotoRows ?? []).forEach((photo, i) => {
    photos.push({ key: photo.id, path: photo.storage_path, url: extraUrls[i]?.data?.signedUrl });
  });

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <AccountMenu userEmail={user.email ?? ""} />
      <div className="w-full max-w-xl">
        <KnifeDetailView knife={knife} initialPhotos={photos} />
      </div>
    </div>
  );
}
