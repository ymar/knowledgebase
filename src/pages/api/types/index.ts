import type { APIRoute } from 'astro';
import { createType, slugTaken } from '../../../lib/db';
import { slugify } from '../../../lib/type-form';
import { newId } from '../../../lib/ulid';
import { TYPE_COLORS } from '../../../lib/icons';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const base = slugify(name);
  if (!name || !base) return redirect(`/types?error=${encodeURIComponent('Give the type a name')}`, 303);
  let slug = base;
  for (let n = 2; await slugTaken(slug); n++) slug = `${base}-${n}`;
  const id = newId();
  await createType({ id, name, slug, icon: 'file-text', color: TYPE_COLORS[Math.floor(Math.random() * TYPE_COLORS.length)] });
  return redirect(`/types/${id}`, 303);
};
