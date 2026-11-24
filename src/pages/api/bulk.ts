import type { APIRoute } from 'astro';
import {
  addToCollectionByName, bulkAddListValue, bulkAddTag, bulkSetProperty, bulkTrash, completeTask, createObject,
  findByTitle, getTypeById, isTaskType, objectsInWorkspace,
} from '../../lib/db';
import { parsePropertyForm } from '../../lib/properties';
import { requestTimeZone, todayIn } from '../../lib/format';
import { TAG_TYPE_ID } from '../../lib/schema';

/**
 * Bulk actions on selected objects (form): ids (repeated), action, back, and per action:
 * set-property: key + value · add-tag: tag · add-collection: collection · trash.
 * Only objects in the current workspace are touched.
 */
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const form = await request.formData();
  const ws = locals.workspace.id;
  const rows = await objectsInWorkspace(ws, form.getAll('ids').map(String));
  const backRaw = String(form.get('back') ?? '/');
  const back = /^\/[a-z0-9/_?=&.%-]*$/i.test(backRaw) ? backRaw : '/';
  const done = (msg: string) => redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${encodeURIComponent(msg)}`, 303);
  if (!rows.length) return done('Nothing selected.');
  const n = rows.length;
  const plural = `${n} ${n === 1 ? 'object' : 'objects'}`;

  switch (form.get('action')) {
    case 'trash':
      await bulkTrash(rows.map((r) => r.id));
      return done(`Moved ${plural} to the trash.`);

    case 'add-tag': {
      const title = String(form.get('tag') ?? '').trim().replace(/^#/, '').slice(0, 80);
      if (!title) return done('Give a tag name.');
      const tagId = (await findByTitle(ws, TAG_TYPE_ID, title)) ?? (await createObject({ workspaceId: ws, typeId: TAG_TYPE_ID, title }));
      await bulkAddTag(rows.map((r) => r.id), tagId);
      return done(`Tagged ${plural} with #${title}.`);
    }

    case 'add-collection': {
      const name = String(form.get('collection') ?? '').trim().slice(0, 80);
      if (!name) return done('Give a collection name.');
      for (const r of rows) await addToCollectionByName({ id: r.id, type_id: r.type_id, workspace_id: ws }, name);
      return done(`Added ${plural} to ${name}.`);
    }

    case 'set-property': {
      const key = String(form.get('key') ?? '');
      const typeIds = [...new Set(rows.map((r) => r.type_id))];
      if (typeIds.length !== 1) return done('Select objects of one type to set a property.');
      const type = await getTypeById(typeIds[0]);
      const def = type?.properties.find((p) => p.key === key);
      if (!type || !def || def.kind === 'relation') return done('That property can’t be set in bulk.');
      const raw = String(form.get('value') ?? '');
      const ids = rows.map((r) => r.id);

      if (def.kind === 'multiselect') {
        if (!def.options?.includes(raw)) return done('Pick an option.');
        await bulkAddListValue(rows, key, raw);
        return done(`Added ${raw} to ${def.label} on ${plural}.`);
      }
      const fd = new FormData();
      fd.append(`p_${key}`, def.kind === 'checkbox' ? (raw === 'true' ? 'true' : 'false') : raw);
      const value = parsePropertyForm([def], fd)[key] ?? null;
      // Ticking tasks done goes through completeTask (repeating tasks move on, done dates recorded).
      if (key === 'done' && isTaskType(type.id)) {
        const today = todayIn(requestTimeZone(request));
        for (const id of ids) await completeTask(id, value === true, today);
      } else {
        await bulkSetProperty(ids, key, value);
      }
      const shown = value === null ? 'empty' : value === true ? 'yes' : value === false ? 'no' : String(value);
      return done(`Set ${def.label} to ${shown} on ${plural}.`);
    }
  }
  return done('Unknown action.');
};
