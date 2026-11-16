-- Tasks, closer to Capacities: Status, Priority, Context (links to any objects), and recurrence.
-- Appended to every Task type's properties, each only if that key isn't there yet.
-- "Context" is a relation without a target type: it can link to any object in the workspace.

UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"status","label":"Status","kind":"select","options":["Not started","Next up","In progress","Blocked"]}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'status');

UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"priority","label":"Priority","kind":"select","options":["Low","Medium","High"]}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'priority');

UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"context","label":"Context","kind":"relation","multiple":true}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'context');

UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"repeat","label":"Repeat","kind":"select","options":["Daily","Weekdays","Weekly","Monthly","Yearly"]}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'repeat');

UPDATE types SET properties = json_insert(properties, '$[#]', json('{"key":"repeat_from","label":"Repeat from","kind":"select","options":["Schedule","Completion"]}'))
WHERE (id = 'type_task' OR id LIKE 'type_task__%')
  AND NOT EXISTS (SELECT 1 FROM json_each(types.properties) p WHERE json_extract(p.value, '$.key') = 'repeat_from');
