import type { APIRoute } from 'astro';
import {
  addTag, addToCollectionByName, changeType, completeTask, isTaskType, mergeTags, removeFromCollection, typeBelongsTo, createObject, findByTitle, getObject, getTypeById, removeTag, renameObject,
  saveProperties, setPinned, setTypeTemplate, softDeleteObject,
} from '../../../lib/db';
import { parsePropertyForm } from '../../../lib/properties';
import { linkMention } from '../../../lib/unlinked';
import { TAG_TYPE_ID } from '../../../lib/schema';
import { requestTimeZone, todayIn } from '../../../lib/format';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const object = await getObject(id);
  if (!object) return new Response('Not found', { status: 404 });
  const type = (await getTypeById(object.type_id))!;
  const back = (notice?: string) => redirect(`/o/${id}${notice ? `?notice=${encodeURIComponent(notice)}` : ''}`, 303);

  const form = await request.formData();
  const field = (k: string) => String(form.get(k) ?? '').trim();

  switch (form.get('_action')) {
    case 'rename':
      if (type.id !== 'type_day') await renameObject(id, field('title'));
      break;
    case 'properties': {
      const values = parsePropertyForm(type.properties, form);
      await saveProperties(id, type.properties, values);
      // Ticking Done in the form behaves like the task list: recurrence and completion date.
      if (isTaskType(type.id) && 'done' in values && (values.done === true) !== (object.properties.done === true)) {
        await completeTask(id, values.done === true, todayIn(requestTimeZone(request)));
      }
      break;
    }
    case 'template':
      await setTypeTemplate(type.id, object.content);
      return back(`New ${type.name.toLowerCase()} objects will start with this document.`);
    case 'clear-template':
      await setTypeTemplate(type.id, []);
      break;
    case 'pin':
    case 'unpin':
      await setPinned(id, form.get('_action') === 'pin');
      break;
    case 'add-tag': {
      const title = field('tag').replace(/^#/, '');
      if (!title || type.id === TAG_TYPE_ID) break;
      const ws = object.workspace_id;
      const tagId = (await findByTitle(ws, TAG_TYPE_ID, title)) ?? (await createObject({ workspaceId: ws, typeId: TAG_TYPE_ID, title }));
      await addTag(id, tagId);
      break;
    }
    case 'add-collection': {
      const name = field('collection').slice(0, 80);
      if (name) await addToCollectionByName(object, name);
      break;
    }
    case 'remove-collection':
      await removeFromCollection(id, field('collectionId'));
      break;
    case 'remove-tag':
      await removeTag(id, field('tagId'));
      break;
    case 'change-type': {
      const target = await getTypeById(field('typeId'));
      if (!target || target.id === type.id || target.id === 'type_day' || type.id === 'type_day' || !typeBelongsTo(target, object.workspace_id) || !target.enabled) {
        return new Response('Cannot change to that type', { status: 400 });
      }
      const dropped = (await changeType(id, object.properties, target.id, target.properties))
        .map((k) => type.properties.find((d) => d.key === k)?.label ?? k);
      return back(dropped.length ? `Changed to ${target.name}. Removed: ${dropped.join(', ')}.` : `Changed to ${target.name}.`);
    }
    case 'link-mention':
      if (!(await linkMention(object, field('source')))) return back('That mention is no longer there.');
      break;
    case 'merge-tag': {
      if (type.id !== TAG_TYPE_ID) break;
      const into = field('into');
      try {
        await mergeTags(id, into);
      } catch (e) {
        return back((e as Error).message);
      }
      return redirect(`/o/${into}?notice=${encodeURIComponent(`Merged #${object.title} into this tag.`)}`, 303);
    }
    case 'delete':
      await softDeleteObject(id);
      return redirect(type.id === 'type_day' ? '/' : `/t/${type.slug}`, 303);
    default:
      return new Response('Bad action', { status: 400 });
  }
  return back();
};
