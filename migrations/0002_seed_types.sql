INSERT INTO types (id, name, slug, icon, color, properties, sort_order) VALUES
('type_note', 'Note', 'note', '✎', '#5f7a61', '[]', 1),
('type_day', 'Day', 'day', '☀', '#c08a3e', '[]', 2),
('type_person', 'Person', 'person', '☺', '#b0605a', '[{"key":"email","label":"Email","kind":"text"},{"key":"phone","label":"Phone","kind":"text"},{"key":"company","label":"Company","kind":"text"},{"key":"birthday","label":"Birthday","kind":"date"},{"key":"website","label":"Website","kind":"url"}]', 3),
('type_project', 'Project', 'project', '◆', '#4f7391', '[{"key":"status","label":"Status","kind":"select","options":["Idea","Active","Paused","Done"]},{"key":"due","label":"Due","kind":"date"},{"key":"url","label":"Link","kind":"url"}]', 4),
('type_book', 'Book', 'book', '▤', '#8a6a9a', '[{"key":"author","label":"Author","kind":"text"},{"key":"status","label":"Status","kind":"select","options":["To read","Reading","Finished"]},{"key":"rating","label":"Rating","kind":"number"},{"key":"url","label":"Link","kind":"url"}]', 5),
('type_tag', 'Tag', 'tag', '#', '#7a7a6a', '[]', 6);
