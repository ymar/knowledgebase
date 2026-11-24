-- A "time" property kind (HH:MM). The Task type's Time field becomes one; its stored values are already HH:MM.
-- Calendar views show an object's time from its type's first time property, next to its daily-notes date.
UPDATE types
SET properties = (
  SELECT json_group_array(
    CASE WHEN json_extract(p.value, '$.key') = 'time' AND json_extract(p.value, '$.kind') = 'text'
         THEN json_set(p.value, '$.kind', 'time') ELSE json(p.value) END)
  FROM json_each(types.properties) p
)
WHERE id = 'type_task' OR id LIKE 'type\_task\_\_%' ESCAPE '\';
