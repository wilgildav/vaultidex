import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The only place a knife's status can become "confirmed" — the review
// queue calls this once the user has looked at (and optionally corrected)
// every field. It only ever writes the user-editable fields plus
// visibility and status; confidence levels, the ai_* originals, and the
// verified-spec columns are left untouched.
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const asNullableString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };

  const asNullableNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const asNullableInt = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const visibility = body.visibility === "public" ? "public" : "private";

  const { data: updated, error } = await supabase
    .from("knives")
    .update({
      maker: asNullableString(body.maker),
      model: asNullableString(body.model),
      model_number: asNullableString(body.model_number),
      blade_steel: asNullableString(body.blade_steel),
      handle_material: asNullableString(body.handle_material),
      year_start: asNullableInt(body.year_start),
      year_end: asNullableInt(body.year_end),
      blade_length_in: asNullableNumber(body.blade_length_in),
      overall_length_open_in: asNullableNumber(body.overall_length_open_in),
      notes: asNullableString(body.notes),
      visibility,
      status: "confirmed",
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Knife not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ knife: updated });
}
