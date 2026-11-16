-- Per-workspace order of types (sidebar, Types page, menus), as a JSON array of type ids.
-- Types not in the list follow, by their sort_order. Lives on the workspace because
-- Day and Tag are shared rows and must be orderable per workspace.
ALTER TABLE workspaces ADD COLUMN type_order TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(type_order));
