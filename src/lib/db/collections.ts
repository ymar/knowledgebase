import { db, nowIso } from './index';
import { newId } from '../ulid';

export interface Collection {
  id: string;
  type_id: string;
  name: string;
  count: number;
}

/** Collections of a type with their live member counts. */
export async function listCollections(typeId: string): Promise<Collection[]> {
  const { results } = await db()
    .prepare(
      `SELECT c.id, c.type_id, c.name,
              (SELECT COUNT(*) FROM collection_items ci JOIN objects o ON o.id = ci.object_id AND o.deleted_at IS NULL
               WHERE ci.collection_id = c.id) AS count
       FROM collections c WHERE c.type_id = ? AND c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE`,
    )
    .bind(typeId)
    .all<Collection>();
  return results;
}

export async function collectionsOf(objectId: string): Promise<{ id: string; name: string }[]> {
  const { results } = await db()
    .prepare(
      `SELECT c.id, c.name FROM collection_items ci JOIN collections c ON c.id = ci.collection_id AND c.deleted_at IS NULL
       WHERE ci.object_id = ? ORDER BY c.name COLLATE NOCASE`,
    )
    .bind(objectId)
    .all<{ id: string; name: string }>();
  return results;
}

/** Adds an object to the type's collection called `name`, creating the collection if needed. */
export async function addToCollectionByName(object: { id: string; type_id: string; workspace_id: string }, name: string): Promise<void> {
  const d = db();
  const existing = await d
    .prepare('SELECT id FROM collections WHERE type_id = ? AND deleted_at IS NULL AND name = ? COLLATE NOCASE')
    .bind(object.type_id, name)
    .first<{ id: string }>();
  const now = nowIso();
  const id = existing?.id ?? newId();
  await d.batch([
    ...(existing
      ? []
      : [d.prepare('INSERT INTO collections (id, workspace_id, type_id, name, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, object.workspace_id, object.type_id, name, now)]),
    d.prepare('INSERT OR IGNORE INTO collection_items (collection_id, object_id, added_at) VALUES (?, ?, ?)').bind(id, object.id, now),
  ]);
}

export async function removeFromCollection(objectId: string, collectionId: string): Promise<void> {
  await db().prepare('DELETE FROM collection_items WHERE collection_id = ? AND object_id = ?').bind(collectionId, objectId).run();
}

/** Soft-deletes a collection. Its objects stay; only the grouping goes. */
export async function deleteCollection(id: string): Promise<void> {
  await db().prepare('UPDATE collections SET deleted_at = ? WHERE id = ?').bind(nowIso(), id).run();
}

export async function getCollection(id: string): Promise<{ id: string; type_id: string; name: string } | null> {
  return db().prepare('SELECT id, type_id, name FROM collections WHERE id = ? AND deleted_at IS NULL').bind(id).first();
}
