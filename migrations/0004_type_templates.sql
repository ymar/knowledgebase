-- Default document (BlockNote JSON) that new objects of a type start with.
ALTER TABLE types ADD COLUMN template TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(template));
