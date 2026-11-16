-- Workspaces: separate sets of objects (e.g. Personal and Work). Types are shared.
CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO workspaces (id, name, color, sort_order, created_at) VALUES
  ('ws_personal', 'Personal', '#059669', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('ws_work',     'Work',     '#2563eb', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Existing objects land in Personal. No REFERENCES clause: SQLite refuses a
-- foreign-key column added with a non-NULL default, so the app enforces it.
ALTER TABLE objects ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws_personal';

CREATE INDEX idx_objects_ws_type ON objects(workspace_id, type_id, deleted_at, updated_at DESC);

-- One daily note per date per workspace (was: per date).
DROP INDEX idx_objects_day_unique;
CREATE UNIQUE INDEX idx_objects_day_unique ON objects(workspace_id, title)
  WHERE type_id = 'type_day' AND deleted_at IS NULL;
