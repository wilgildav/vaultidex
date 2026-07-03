export type ConfidenceLevel = "high" | "medium" | "low" | null;

export type SpecSource = { title: string; uri: string };

export type Knife = {
  id: string;
  user_id: string;
  upload_batch_id: string | null;
  slot_position: number | null;
  maker: string | null;
  maker_confidence: ConfidenceLevel;
  model: string | null;
  model_confidence: ConfidenceLevel;
  model_number: string | null;
  model_number_confidence: ConfidenceLevel;
  blade_steel: string | null;
  blade_steel_confidence: ConfidenceLevel;
  handle_material: string | null;
  handle_material_confidence: ConfidenceLevel;
  year_start: number | null;
  year_end: number | null;
  year_confidence: ConfidenceLevel;
  blade_length_in: number | null;
  overall_length_open_in: number | null;
  blade_length_in_verified: number | null;
  overall_length_open_in_verified: number | null;
  blade_steel_verified: string | null;
  spec_verification_sources: SpecSource[] | null;
  spec_verification_notes: string | null;
  weight_oz: number | null;
  notes: string | null;
  ai_maker: string | null;
  ai_model: string | null;
  ai_model_number: string | null;
  ai_blade_steel: string | null;
  ai_handle_material: string | null;
  ai_year_start: number | null;
  ai_year_end: number | null;
  ai_blade_length_in: number | null;
  ai_overall_length_open_in: number | null;
  ai_notes: string | null;
  status: "draft" | "confirmed" | "not_identified";
  visibility: "private" | "public";
  favorite: boolean;
  front_image_path: string | null;
  back_image_path: string | null;
  key_photo_path: string | null;
  created_at: string;
  updated_at: string;
};

export type KnifeExtraPhoto = {
  id: string;
  knife_id: string;
  storage_path: string;
  created_at: string;
};
