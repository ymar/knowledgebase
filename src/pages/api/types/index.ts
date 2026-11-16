import type { APIRoute } from 'astro';
import { createType, freeSlug } from '../../../lib/db';
import { slugify } from '../../../lib/type-form';
import { newId } from '../../../lib/ulid';
import { TYPE_COLORS } from '../../../lib/icons';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const base = slugify(name);
  if (!name || !base) return redirect(`/types?error=${encodeURIComponent('Give the type a name')}`, 303);
  const slug = await freeSlug(base);
  const id = newId();
  await createType({ id, workspaceId: locals.workspace.id, name, slug, icon: 'file-text', color: TYPE_COLORS[Math.floor(Math.random() * TYPE_COLORS.length)] });
  return redirect(`/types/${id}`, 303);
};
