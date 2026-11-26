-- Weblinks: a starter type in every workspace for saved web pages. Pasting a URL creates one with the page's
-- title, site and description filled in; its preview image becomes the cover (hidden `_cover`).
-- Ids follow the starter pattern: 'type_weblink' in Personal, 'type_weblink__<workspace id>' elsewhere.
-- Skipped for a workspace that already has a type named Weblink.
INSERT OR IGNORE INTO types (id, workspace_id, name, slug, icon, color, properties, sort_order, template, enabled, day_key)
SELECT CASE WHEN w.id = 'ws_personal' THEN 'type_weblink' ELSE 'type_weblink__' || w.id END,
       w.id, 'Weblink',
       CASE WHEN w.id = 'ws_personal' THEN 'weblink' ELSE 'weblink-' || lower(substr(w.id, 4)) END,
       'globe', '#0891b2',
       '[{"key":"url","label":"Link","kind":"url"},{"key":"site","label":"Site","kind":"text"},{"key":"description","label":"Description","kind":"text"}]',
       6, '[]', 1, NULL
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM types t WHERE t.workspace_id = w.id AND lower(t.name) = 'weblink');
