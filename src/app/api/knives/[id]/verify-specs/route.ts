import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySpecs } from "@/lib/gemini/verifySpecs";

// Separate from /identify on purpose: a grounded web search is the
// slowest single step in the whole pipeline, so the client calls this
// only after the base identification is already visible, instead of
// waiting for it before showing anything.
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
    .select("maker, model, pattern, maker_confidence, model_confidence")
    .eq("id", id)
    .single();

  if (fetchError || !knife) {
    return NextResponse.json({ error: "Knife not found." }, { status: 404 });
  }

  if (
    !knife.maker ||
    !knife.model ||
    knife.maker_confidence !== "high" ||
    knife.model_confidence !== "high"
  ) {
    return NextResponse.json({ skipped: true });
  }

  try {
    const verified = await verifySpecs(knife.maker, knife.model, knife.pattern);

    const { data: updated, error: updateError } = await supabase
      .from("knives")
      .update({
        blade_length_in_verified: verified.found ? verified.blade_length_in_verified : null,
        overall_length_open_in_verified: verified.found
          ? verified.overall_length_open_in_verified
          : null,
        blade_steel_verified: verified.found ? verified.blade_steel_verified : null,
        spec_verification_sources: verified.found ? verified.sources : null,
        spec_verification_notes: verified.notes,
      })
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({ knife: updated, verifiedSpecs: verified });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Spec verification failed." },
      { status: 500 },
    );
  }
}
