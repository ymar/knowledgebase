import { db, nowIso, parseJson } from './index';
import { newId } from '../ulid';
import type { Filter, Show, Sort } from '../schema';

export interface ViewSpec {
  show?: Show;
  filters?: Filter[];
  sort?: Sort;
  view?: 'list' | 'cards';
  collection?: string;
}
export interface SavedView {
  id: string;
  workspace_id: string;
  type_id: string;
  name: string;
  spec: ViewSpec;
}
export interface ViewSummary {
  id: string;
  name: string;
  type_id: string;
  type_name: string;
  type_slug: string;
  type_icon: string;
  type_color: string;
}

const hydrate = (r: Omit<SavedView, 'spec'> & { spec: string }): SavedView => ({ ...r, spec: parseJson<ViewSpec>(r.spec, {}) });

export async function listViews(typeId: string): Promise<SavedView[]> {
  const { results } = await db()
    .prepare('SELECT id, workspace_id, type_id, name, spec FROM views WHERE type_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE')
    .bind(typeId)
    .all<Omit<SavedView, 'spec'> & { spec: string }>();
  return results.map(hydrate);
}

/** Saved views of a workspace, for the editor's "Query" block picker. */
export async function listWorkspaceViews(ws: string): Promise<ViewSummary[]> {
  const { results } = await db()
    .prepare(
      `SELECT v.id, v.name, v.type_id, t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
       FROM views v JOIN types t ON t.id = v.type_id
       WHERE v.workspace_id = ? AND v.deleted_at IS NULL ORDER BY t.name, v.name COLLATE NOCASE`,
    )
    .bind(ws)
    .all<ViewSummary>();
  return results;
}

export async function getView(id: string): Promise<SavedView | null> {
  const r = await db()
    .prepare('SELECT id, workspace_id, type_id, name, spec FROM views WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<Omit<SavedView, 'spec'> & { spec: string }>();
  return r ? hydrate(r) : null;
}

export async function createView(ws: string, typeId: string, name: string, spec: ViewSpec): Promise<string> {
  const id = newId();
  await db()
    .prepare('INSERT INTO views (id, workspace_id, type_id, name, spec, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, ws, typeId, name, JSON.stringify(spec), nowIso())
    .run();
  return id;
}

export async function deleteView(id: string): Promise<void> {
  await db().prepare('UPDATE views SET deleted_at = ? WHERE id = ?').bind(nowIso(), id).run();
}
