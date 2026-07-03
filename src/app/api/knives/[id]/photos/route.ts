import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Uploads an extra photo for a knife — a close-up, a maker's mark, an
// alternate angle — beyond the original front/back pair captured at
// upload time. Works for a knife in any status: still useful mid-review
// (e.g. attaching a clearer shot after a failed identification) as well
// as on an already-confirmed knife from the vault.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: knife, error: knifeError } = await supabase
    .from("knives")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (knifeError || !knife || knife.user_id !== user.id) {
    return NextResponse.json({ error: "Knife not found." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided." }, { status: 400 });
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const photoId = randomUUID();
  const storagePath = `${user.id}/knives/${id}/extra/${photoId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("knife-photos")
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "image/jpeg",
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: photo, error: insertError } = await supabase
    .from("knife_extra_photos")
    .insert({ id: photoId, knife_id: id, storage_path: storagePath })
    .select()
    .single();
  if (insertError || !photo) {
    return NextResponse.json(
      { error: insertError?.message ?? "Could not save the photo record." },
      { status: 500 },
    );
  }

  const { data: signed } = await supabase.storage
    .from("knife-photos")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    photo: { id: photo.id, path: storagePath, url: signed?.signedUrl },
  });
}
