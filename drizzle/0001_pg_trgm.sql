-- pg_trgm + GIN index for ILIKE / fuzzy search (§3 FR-13, §8.2 T-7)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 用 GIN 加速 trigram 相似度 + ILIKE 模糊搜尋
CREATE INDEX IF NOT EXISTS notes_title_trgm_idx
  ON notes USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS notes_content_trgm_idx
  ON notes USING GIN (content gin_trgm_ops);
