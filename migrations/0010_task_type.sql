-- Tasks: a starter type in every workspace with Done (checkbox), Date (when to do it) and Deadline.
-- Date is its daily-notes property, so "+ Task" on a day plans the task for that day.
-- Ids follow the starter pattern: 'type_task' in Personal, 'type_task__<workspace id>' elsewhere.
-- Skipped for a workspace that already has a type named Task, or if the slug is taken.
INSERT OR IGNORE INTO types (id, workspace_id, name, slug, icon, color, properties, sort_order, template, enabled, day_key)
SELECT CASE WHEN w.id = 'ws_personal' THEN 'type_task' ELSE 'type_task__' || w.id END,
       w.id, 'Task',
       CASE WHEN w.id = 'ws_personal' THEN 'task' ELSE 'task-' || lower(substr(w.id, 4)) END,
       'check-square', '#0f766e',
       '[{"key":"done","label":"Done","kind":"checkbox"},{"key":"date","label":"Date","kind":"date"},{"key":"deadline","label":"Deadline","kind":"date"}]',
       2, '[]', 1, 'date'
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM types t WHERE t.workspace_id = w.id AND lower(t.name) = 'task');
