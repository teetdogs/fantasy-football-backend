-- Add ESPN credential columns to users table.
-- Idempotent: uses IF NOT EXISTS via a DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='espn_swid') THEN
    ALTER TABLE users ADD COLUMN espn_swid TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='espn_s2') THEN
    ALTER TABLE users ADD COLUMN espn_s2 TEXT;
  END IF;
END $$;
