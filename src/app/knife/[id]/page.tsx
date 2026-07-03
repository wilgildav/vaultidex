import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KnifeDetailView from "@/components/knife/KnifeDetailView";

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
    redirect("/login");
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

  const [frontUrl, backUrl] = await Promise.all([
    knife.front_image_path
      ? supabase.storage.from("knife-photos").createSignedUrl(knife.front_image_path, 3600)
      : Promise.resolve({ data: null }),
    knife.back_image_path
      ? supabase.storage.from("knife-photos").createSignedUrl(knife.back_image_path, 3600)
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="w-full max-w-xl">
        <KnifeDetailView
          knife={knife}
          thumbnails={{ front: frontUrl.data?.signedUrl, back: backUrl.data?.signedUrl }}
        />
      </div>
    </div>
  );
}
