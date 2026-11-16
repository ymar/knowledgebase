-- Which date property ties a type to daily notes. NULL = the type has no quick-add button on daily notes.
-- Objects whose `day_key` property equals a date are listed on that day (Date references, calendar).
ALTER TABLE types ADD COLUMN day_key TEXT;

-- Projects (and every workspace's copy) start out on, using their Due date.
UPDATE types SET day_key = 'due'
WHERE (id = 'type_project' OR id LIKE 'type_project__%')
  AND EXISTS (
    SELECT 1 FROM json_each(types.properties) p
    WHERE json_extract(p.value, '$.key') = 'due' AND json_extract(p.value, '$.kind') = 'date'
  );
