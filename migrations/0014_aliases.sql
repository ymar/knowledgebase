-- Aliases: other names for an object (one per line), e.g. "Bob" for "Robert Smith".
-- Used by @ search, Cmd+K full-text search, [[links]] from MCP and unlinked mentions.
ALTER TABLE objects ADD COLUMN aliases TEXT NOT NULL DEFAULT '';

-- Rebuild the full-text index with an aliases column. It's derived data: 'rebuild' refills it from objects.
DROP TRIGGER objects_ai;
DROP TRIGGER objects_ad;
DROP TRIGGER objects_au;
DROP TABLE objects_fts;

CREATE VIRTUAL TABLE objects_fts USING fts5(
  title, aliases, text_content,
  content = 'objects', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER objects_ai AFTER INSERT ON objects BEGIN
  INSERT INTO objects_fts(rowid, title, aliases, text_content)
  VALUES (new.rowid, new.title, new.aliases, new.text_content);
END;
CREATE TRIGGER objects_ad AFTER DELETE ON objects BEGIN
  INSERT INTO objects_fts(objects_fts, rowid, title, aliases, text_content)
  VALUES ('delete', old.rowid, old.title, old.aliases, old.text_content);
END;
CREATE TRIGGER objects_au AFTER UPDATE OF title, aliases, text_content ON objects BEGIN
  INSERT INTO objects_fts(objects_fts, rowid, title, aliases, text_content)
  VALUES ('delete', old.rowid, old.title, old.aliases, old.text_content);
  INSERT INTO objects_fts(rowid, title, aliases, text_content)
  VALUES (new.rowid, new.title, new.aliases, new.text_content);
END;
INSERT INTO objects_fts(objects_fts) VALUES ('rebuild');
