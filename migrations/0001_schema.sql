-- Cairn schema. Plain SQL, applied with `wrangler d1 migrations apply`.

CREATE TABLE types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT '•',
  color      TEXT NOT NULL DEFAULT '#8a8a7a',
  properties TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(properties)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE objects (
  rowid        INTEGER PRIMARY KEY AUTOINCREMENT,
  id           TEXT NOT NULL UNIQUE,
  type_id      TEXT NOT NULL REFERENCES types(id),
  title        TEXT NOT NULL DEFAULT '',
  properties   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties)),
  content      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(content)),
  text_content TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_objects_type_updated ON objects(type_id, deleted_at, updated_at DESC);
CREATE INDEX idx_objects_title ON objects(title COLLATE NOCASE);
CREATE UNIQUE INDEX idx_objects_day_unique ON objects(title)
  WHERE type_id = 'type_day' AND deleted_at IS NULL;

-- origin: 'content' (mention in the document), 'tag' (tag picker), 'property' (relation property).
-- Autosave only rewrites origin = 'content' rows.
CREATE TABLE links (
  source_id  TEXT NOT NULL REFERENCES objects(id),
  target_id  TEXT NOT NULL REFERENCES objects(id),
  origin     TEXT NOT NULL DEFAULT 'content' CHECK (origin IN ('content', 'tag', 'property')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, origin)
) WITHOUT ROWID;
CREATE INDEX idx_links_target ON links(target_id, source_id);

CREATE VIRTUAL TABLE objects_fts USING fts5(
  title, text_content,
  content = 'objects', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER objects_ai AFTER INSERT ON objects BEGIN
  INSERT INTO objects_fts(rowid, title, text_content)
  VALUES (new.rowid, new.title, new.text_content);
END;
CREATE TRIGGER objects_ad AFTER DELETE ON objects BEGIN
  INSERT INTO objects_fts(objects_fts, rowid, title, text_content)
  VALUES ('delete', old.rowid, old.title, old.text_content);
END;
CREATE TRIGGER objects_au AFTER UPDATE OF title, text_content ON objects BEGIN
  INSERT INTO objects_fts(objects_fts, rowid, title, text_content)
  VALUES ('delete', old.rowid, old.title, old.text_content);
  INSERT INTO objects_fts(rowid, title, text_content)
  VALUES (new.rowid, new.title, new.text_content);
END;
