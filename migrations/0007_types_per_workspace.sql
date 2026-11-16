-- Types live inside a workspace. Day and Tag stay shared system types (workspace_id NULL):
-- daily notes and tags are referenced by fixed ids and can't be turned off.
ALTER TABLE types ADD COLUMN workspace_id TEXT;
ALTER TABLE types ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1));

-- Every other existing type belongs to Personal.
UPDATE types SET workspace_id = 'ws_personal' WHERE id NOT IN ('type_day', 'type_tag');

-- Every other workspace gets its own copy of the default types, plus any custom type
-- its objects already use. Copy ids are '<original id>__<workspace id>'; slugs get a
-- workspace suffix because slugs are unique across the table.
INSERT INTO types (id, name, slug, icon, color, properties, sort_order, template, workspace_id, enabled)
SELECT t.id || '__' || w.id, t.name, t.slug || '-' || lower(substr(w.id, 4)), t.icon, t.color,
       t.properties, t.sort_order, t.template, w.id, 1
FROM types t JOIN workspaces w ON w.id != 'ws_personal'
WHERE t.workspace_id = 'ws_personal'
  AND (t.id IN ('type_note', 'type_person', 'type_project', 'type_book')
       OR EXISTS (SELECT 1 FROM objects o WHERE o.type_id = t.id AND o.workspace_id = w.id));

-- Objects outside Personal move to their workspace's copy of their type.
UPDATE objects SET type_id = type_id || '__' || workspace_id
WHERE workspace_id != 'ws_personal'
  AND type_id IN (SELECT id FROM types WHERE workspace_id = 'ws_personal');

CREATE INDEX idx_types_ws ON types(workspace_id, sort_order);
