-- Line-icon names (rendered by src/components/Icon.astro) and the new type palette.
UPDATE types SET icon = 'file-text', color = '#2563eb' WHERE id = 'type_note';
UPDATE types SET icon = 'calendar',  color = '#d97706' WHERE id = 'type_day';
UPDATE types SET icon = 'user',      color = '#e11d48' WHERE id = 'type_person';
UPDATE types SET icon = 'briefcase', color = '#7c3aed' WHERE id = 'type_project';
UPDATE types SET icon = 'book',      color = '#059669' WHERE id = 'type_book';
UPDATE types SET icon = 'hash',      color = '#57534e' WHERE id = 'type_tag';
