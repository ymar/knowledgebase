-- Recently opened (palette empty state, type dashboards) and sidebar pins.
ALTER TABLE objects ADD COLUMN opened_at TEXT;
ALTER TABLE objects ADD COLUMN pinned_at TEXT;
CREATE INDEX idx_objects_opened ON objects(opened_at DESC) WHERE opened_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_objects_pinned ON objects(pinned_at) WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;
