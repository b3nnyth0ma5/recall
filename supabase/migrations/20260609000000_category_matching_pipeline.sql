-- Migration: robust category matching pipeline
-- Adds category_embedding to recollection_categories,
-- category_match_attempts to recalls,
-- increment_category_match_attempts RPC for atomic bounded retry.

ALTER TABLE recollection_categories
  ADD COLUMN IF NOT EXISTS category_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS category_embedding_updated_at timestamptz;

ALTER TABLE recalls
  ADD COLUMN IF NOT EXISTS category_match_attempts integer NOT NULL DEFAULT 0;

-- RPC for atomic increment of category_match_attempts
-- Also clears category_matching_at so the sweeper can re-pick it up if needed.
CREATE OR REPLACE FUNCTION increment_category_match_attempts(p_recall_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE recalls
  SET category_match_attempts = category_match_attempts + 1,
      category_matching_at = NULL
  WHERE id = p_recall_id
  RETURNING category_match_attempts INTO new_count;
  RETURN new_count;
END;
$$;
