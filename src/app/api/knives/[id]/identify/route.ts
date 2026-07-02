import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identifyKnife } from "@/lib/gemini/identifyKnife";
import { buildSlotImageSet } from "@/lib/gemini/multiCrop";

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
    .select("id, upload_batch_id, slot_position")
    .eq("id", id)
    .single();

  if (fetchError || !knife) {
    return NextResponse.json({ error: "Knife not found." }, { status: 404 });
  }
  if (!knife.upload_batch_id || !knife.slot_position) {
    return NextResponse.json(
      { error: "This knife isn't linked to a batch/slot to identify." },
      { status: 400 },
    );
  }

  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .select("front_image_path, back_image_path")
    .eq("id", knife.upload_batch_id)
    .single();

  if (batchError || !batch || !batch.front_image_path || !batch.back_image_path) {
    return NextResponse.json({ error: "Could not find this batch's source photos." }, { status: 404 });
  }

  // Multi-crop generation reads from the original full-resolution batch
  // photo (not the already-cropped, already-recompressed per-slot image)
  // so the zoomed-in crops lose as little detail as possible.
  const [frontDownload, backDownload] = await Promise.all([
    supabase.storage.from("knife-photos").download(batch.front_image_path),
    supabase.storage.from("knife-photos").download(batch.back_image_path),
  ]);

  if (frontDownload.error || !frontDownload.data) {
    return NextResponse.json({ error: "Could not load the front batch photo." }, { status: 500 });
  }
  if (backDownload.error || !backDownload.data) {
    return NextResponse.json({ error: "Could not load the back batch photo." }, { status: 500 });
  }

  try {
    const [frontSet, backSet] = await Promise.all([
      buildSlotImageSet(Buffer.from(await frontDownload.data.arrayBuffer()), knife.slot_position),
      buildSlotImageSet(Buffer.from(await backDownload.data.arrayBuffer()), knife.slot_position),
    ]);

    const result = await identifyKnife(frontSet, backSet);

    if (!result.knifePresent) {
      // Clear out any stale identification from a previous run — otherwise
      // a knife that was identified once and then re-checked as "not
      // present" would keep showing its old (now contradicted) fields.
      const { data: updated, error: updateError } = await supabase
        .from("knives")
        .update({
          status: "not_identified",
          maker: null,
          maker_confidence: null,
          model: null,
          model_confidence: null,
          pattern: null,
          blade_steel: null,
          blade_steel_confidence: null,
          handle_material: null,
          handle_material_confidence: null,
          era: null,
          blade_length_in: null,
          overall_length_open_in: null,
          notes: null,
        })
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
        // Explicitly reset status in case a previous run had marked this
        // slot not_identified and this run found a knife after all.
        status: "draft",
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
      consistencyCheck: result.consistencyCheck,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Identification failed." },
      { status: 500 },
    );
  }
}
