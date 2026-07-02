import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identifyKnife } from "@/lib/gemini/identifyKnife";

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

  // Crops are generated from the original full-resolution batch photo (not
  // the already-cropped, already-recompressed per-slot image) so any
  // zoomed-in crops lose as little detail as possible.
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
    const result = await identifyKnife(
      Buffer.from(await frontDownload.data.arrayBuffer()),
      Buffer.from(await backDownload.data.arrayBuffer()),
      knife.slot_position,
    );

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
          blade_length_in_verified: null,
          overall_length_open_in_verified: null,
          blade_steel_verified: null,
          spec_verification_sources: null,
          spec_verification_notes: null,
          notes: null,
          ai_maker: null,
          ai_model: null,
          ai_pattern: null,
          ai_blade_steel: null,
          ai_handle_material: null,
          ai_blade_length_in: null,
          ai_overall_length_open_in: null,
          ai_notes: null,
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
        // Snapshot of the AI's own answer, kept alongside the editable
        // fields above so a later correction in the review queue never
        // overwrites what the AI originally said.
        ai_maker: identification.maker,
        ai_model: identification.model,
        ai_pattern: identification.pattern,
        ai_blade_steel: identification.blade_steel,
        ai_handle_material: identification.handle_material,
        ai_blade_length_in: identification.blade_length_in,
        ai_overall_length_open_in: identification.overall_length_open_in,
        ai_notes: identification.notes,
        // Verification runs separately (POST .../verify-specs) after the
        // client sees this response, so any previously-verified specs are
        // now stale (maker/model may have just changed) — clear them here
        // rather than leaving mismatched data behind.
        blade_length_in_verified: null,
        overall_length_open_in_verified: null,
        blade_steel_verified: null,
        spec_verification_sources: null,
        spec_verification_notes: null,
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
