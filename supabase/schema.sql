-- Create receipts table
CREATE TABLE IF NOT EXISTS receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  ai_extracted JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own receipts
CREATE POLICY "Users can view their own receipts"
  ON receipts
  FOR SELECT
  USING (true); -- For demo purposes, allow all reads. In production, use: auth.uid()::text = user_id

-- Create policy to allow users to insert their own receipts
CREATE POLICY "Users can insert their own receipts"
  ON receipts
  FOR INSERT
  WITH CHECK (true); -- For demo purposes, allow all inserts. In production, use: auth.uid()::text = user_id

-- Create policy to allow users to delete their own receipts
CREATE POLICY "Users can delete their own receipts"
  ON receipts
  FOR DELETE
  USING (true); -- For demo purposes, allow all deletes. In production, use: auth.uid()::text = user_id

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function on updates
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE receipts IS 'Stores receipt information with AI-extracted data';
COMMENT ON COLUMN receipts.id IS 'Unique identifier for the receipt';
COMMENT ON COLUMN receipts.user_id IS 'ID of the user who owns this receipt';
COMMENT ON COLUMN receipts.image_url IS 'URL to the receipt image';
COMMENT ON COLUMN receipts.ai_extracted IS 'JSON data extracted from the receipt using AI/OCR';
COMMENT ON COLUMN receipts.created_at IS 'Timestamp when the receipt was created';
COMMENT ON COLUMN receipts.updated_at IS 'Timestamp when the receipt was last updated';
