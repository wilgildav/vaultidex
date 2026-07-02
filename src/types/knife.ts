export type ConfidenceLevel = "high" | "medium" | "low" | null;

export type Knife = {
  id: string;
  user_id: string;
  upload_batch_id: string | null;
  slot_position: number | null;
  maker: string | null;
  maker_confidence: ConfidenceLevel;
  model: string | null;
  model_confidence: ConfidenceLevel;
  pattern: string | null;
  blade_steel: string | null;
  blade_steel_confidence: ConfidenceLevel;
  handle_material: string | null;
  handle_material_confidence: ConfidenceLevel;
  era: string | null;
  blade_length_in: number | null;
  overall_length_open_in: number | null;
  weight_oz: number | null;
  notes: string | null;
  status: "draft" | "confirmed" | "not_identified";
  visibility: "private" | "public";
  front_image_path: string | null;
  back_image_path: string | null;
  created_at: string;
  updated_at: string;
};
