-- Saved views: a named filter/sort of one type's list. Opened on the type page and
-- embedded in notes as a live "query" block. `spec` is JSON: { show, filters, sort, view }.
CREATE TABLE views (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type_id      TEXT NOT NULL REFERENCES types(id),
  name         TEXT NOT NULL,
  spec         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(spec)),
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_views_type ON views(type_id, deleted_at);

-- Collections: hand-picked groups of objects within one type.
CREATE TABLE collections (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type_id      TEXT NOT NULL REFERENCES types(id),
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_collections_type ON collections(type_id, deleted_at);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  object_id     TEXT NOT NULL REFERENCES objects(id),
  added_at      TEXT NOT NULL,
  PRIMARY KEY (collection_id, object_id)
) WITHOUT ROWID;
CREATE INDEX idx_collection_items_object ON collection_items(object_id);
