import type { PropertyDef } from './schema';

/**
 * The starter types every new workspace gets its own copy of (same as the seed
 * migrations 0002 + 0003). Copies get the id '<id>__<workspace id>'.
 */
export const DEFAULT_TYPES: {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sort: number;
  properties: PropertyDef[];
  /** Date property used on daily notes, if any. */
  dayKey?: string;
}[] = [
  { id: 'type_note', name: 'Note', slug: 'note', icon: 'file-text', color: '#2563eb', sort: 1, properties: [] },
  {
    id: 'type_person', name: 'Person', slug: 'person', icon: 'user', color: '#e11d48', sort: 3,
    properties: [
      { key: 'email', label: 'Email', kind: 'text' },
      { key: 'phone', label: 'Phone', kind: 'text' },
      { key: 'company', label: 'Company', kind: 'text' },
      { key: 'birthday', label: 'Birthday', kind: 'date' },
      { key: 'website', label: 'Website', kind: 'url' },
    ],
  },
  {
    id: 'type_project', name: 'Project', slug: 'project', icon: 'briefcase', color: '#7c3aed', sort: 4, dayKey: 'due',
    properties: [
      { key: 'status', label: 'Status', kind: 'select', options: ['Idea', 'Active', 'Paused', 'Done'] },
      { key: 'due', label: 'Due', kind: 'date' },
      { key: 'url', label: 'Link', kind: 'url' },
    ],
  },
  {
    id: 'type_book', name: 'Book', slug: 'book', icon: 'book', color: '#059669', sort: 5,
    properties: [
      { key: 'author', label: 'Author', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'select', options: ['To read', 'Reading', 'Finished'] },
      { key: 'rating', label: 'Rating', kind: 'number' },
      { key: 'url', label: 'Link', kind: 'url' },
    ],
  },
];
