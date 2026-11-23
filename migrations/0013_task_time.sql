-- Tasks get a Time (HH:MM, text) next to their Date, e.g. from "Call Julie tomorrow 2pm".
UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"time","label":"Time","kind":"text"}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'time');
