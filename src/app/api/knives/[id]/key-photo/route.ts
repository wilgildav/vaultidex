import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sets which photo shows up on the collection card and detail page header.
// The candidate path must be one this knife actually owns — its original
// front/back capture or one of its uploaded extras — never an arbitrary
// storage path passed in by the client.
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

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  if (!path) {
    return NextResponse.json({ error: "No photo path provided." }, { status: 400 });
  }

  const { data: knife, error: knifeError } = await supabase
    .from("knives")
    .select("id, user_id, front_image_path, back_image_path")
    .eq("id", id)
    .single();
  if (knifeError || !knife || knife.user_id !== user.id) {
    return NextResponse.json({ error: "Knife not found." }, { status: 404 });
  }

  let allowed = path === knife.front_image_path || path === knife.back_image_path;
  if (!allowed) {
    const { data: extra } = await supabase
      .from("knife_extra_photos")
      .select("id")
      .eq("knife_id", id)
      .eq("storage_path", path)
      .maybeSingle();
    allowed = !!extra;
  }
  if (!allowed) {
    return NextResponse.json({ error: "That photo doesn't belong to this knife." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("knives")
    .update({ key_photo_path: path })
    .eq("id", id)
    .select()
    .single();
  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update key photo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ knife: updated });
}
