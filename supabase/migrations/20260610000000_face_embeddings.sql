-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add face_embedding, match_confidence, suggested_person_id to recall_images_people
ALTER TABLE recall_images_people
  ADD COLUMN IF NOT EXISTS face_embedding vector(128),
  ADD COLUMN IF NOT EXISTS match_confidence float4,
  ADD COLUMN IF NOT EXISTS suggested_person_id uuid REFERENCES persons(id) ON DELETE SET NULL;

-- Add face_embedding to persons
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS face_embedding vector(128);

-- ivfflat cosine index for fast nearest-neighbour lookup on persons
CREATE INDEX IF NOT EXISTS persons_face_embedding_idx
  ON persons
  USING ivfflat (face_embedding vector_cosine_ops)
  WITH (lists = 100);

-- RPC: find the closest person by cosine similarity above a threshold
CREATE OR REPLACE FUNCTION match_face_to_person(
  p_embedding  vector(128),
  p_threshold  float4 DEFAULT 0.75
)
RETURNS TABLE (person_id uuid, similarity float4)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id          AS person_id,
    (1 - (p.face_embedding <=> p_embedding))::float4 AS similarity
  FROM persons p
  WHERE p.user_id = auth.uid()
    AND p.face_embedding IS NOT NULL
    AND (1 - (p.face_embedding <=> p_embedding)) >= p_threshold
  ORDER BY p.face_embedding <=> p_embedding
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION match_face_to_person(vector(128), float4) TO authenticated;

-- RPC: upsert a face embedding onto a person record (running average)
CREATE OR REPLACE FUNCTION upsert_person_face_embedding(
  p_person_id   uuid,
  new_embedding vector(128)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing vector(128);
BEGIN
  SELECT face_embedding INTO existing FROM persons WHERE id = p_person_id;
  IF existing IS NULL THEN
    UPDATE persons SET face_embedding = new_embedding WHERE id = p_person_id;
  ELSE
    UPDATE persons
    SET face_embedding = l2_normalize((existing + new_embedding) / 2.0)
    WHERE id = p_person_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_person_face_embedding(uuid, vector(128)) TO authenticated;
