import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identifyKnife } from "@/lib/gemini/identifyKnife";

function mimeTypeForPath(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function POST(
  _request: Request,
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

  const { data: knife, error: fetchError } = await supabase
    .from("knives")
    .select("id, front_image_path, back_image_path")
    .eq("id", id)
    .single();

  if (fetchError || !knife) {
    return NextResponse.json({ error: "Knife not found." }, { status: 404 });
  }
  if (!knife.front_image_path || !knife.back_image_path) {
    return NextResponse.json(
      { error: "This knife has no front/back images to identify." },
      { status: 400 },
    );
  }

  const [frontDownload, backDownload] = await Promise.all([
    supabase.storage.from("knife-photos").download(knife.front_image_path),
    supabase.storage.from("knife-photos").download(knife.back_image_path),
  ]);

  if (frontDownload.error || !frontDownload.data) {
    return NextResponse.json({ error: "Could not load the front image." }, { status: 500 });
  }
  if (backDownload.error || !backDownload.data) {
    return NextResponse.json({ error: "Could not load the back image." }, { status: 500 });
  }

  try {
    const result = await identifyKnife(
      {
        buffer: Buffer.from(await frontDownload.data.arrayBuffer()),
        mimeType: mimeTypeForPath(knife.front_image_path),
      },
      {
        buffer: Buffer.from(await backDownload.data.arrayBuffer()),
        mimeType: mimeTypeForPath(knife.back_image_path),
      },
    );

    if (!result.knifePresent) {
      const { data: updated, error: updateError } = await supabase
        .from("knives")
        .update({ status: "not_identified" })
        .eq("id", id)
        .select()
        .single();
      if (updateError) throw updateError;

      return NextResponse.json({ knife: updated, presenceReason: result.presenceReason });
    }

    const { identification } = result;
    const { data: updated, error: updateError } = await supabase
      .from("knives")
      .update({
        maker: identification.maker,
        maker_confidence: identification.maker_confidence,
        model: identification.model,
        model_confidence: identification.model_confidence,
        pattern: identification.pattern,
        blade_steel: identification.blade_steel,
        blade_steel_confidence: identification.blade_steel_confidence,
        handle_material: identification.handle_material,
        handle_material_confidence: identification.handle_material_confidence,
        era: identification.era,
        blade_length_in: identification.blade_length_in,
        overall_length_open_in: identification.overall_length_open_in,
        notes: identification.notes,
      })
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({
      knife: updated,
      transcription: result.transcription,
      presenceReason: result.presenceReason,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Identification failed." },
      { status: 500 },
    );
  }
}
