/** Object icons (one emoji) and covers (an uploaded image or a preset gradient). Stored as hidden properties `_icon`, `_cover`. */

export const ICON_CHOICES = [
  '📝', '📌', '💡', '📚', '📖', '🎯', '🚀', '✅', '⭐', '❤️', '🔥', '🌱', '🌍', '🏠', '💼', '🧠',
  '🎨', '🎵', '🎬', '📷', '✈️', '🍽️', '☕', '🏃', '🧘', '💰', '📈', '🛠️', '🔬', '🗂️', '📅', '⏰',
  '🔑', '🎁', '🐶', '🌸', '☀️', '🌙', '⚡', '🧩', '🏆', '💬', '👥', '🙂', '🎓', '🏥', '🛒', '🧾',
];

/** Preset covers: soft two-tone gradients that work in light and dark mode. */
export const COVER_PRESETS: Record<string, string> = {
  'preset:sand': 'linear-gradient(135deg, #f5e6c8 0%, #e9c9a3 100%)',
  'preset:sky': 'linear-gradient(135deg, #cfe3f7 0%, #9cc3ea 100%)',
  'preset:mint': 'linear-gradient(135deg, #d4f0e2 0%, #9fd8bd 100%)',
  'preset:rose': 'linear-gradient(135deg, #f7d6dc 0%, #e9a5b3 100%)',
  'preset:lilac': 'linear-gradient(135deg, #e5dcf7 0%, #bfaeea 100%)',
  'preset:stone': 'linear-gradient(135deg, #e7e5e4 0%, #a8a29e 100%)',
  'preset:dusk': 'linear-gradient(135deg, #312e81 0%, #be185d 100%)',
  'preset:forest': 'linear-gradient(135deg, #14532d 0%, #65a30d 100%)',
};

/** The first emoji in `raw`, or null. Keeps one grapheme (flags, skin tones and ZWJ sequences stay whole). */
export function cleanEmoji(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)][0]?.segment ?? '';
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) && first.length <= 16 ? first : null;
}

/** A stored cover value is a preset name or a /files/ URL; anything else is ignored. */
export function coverStyle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (COVER_PRESETS[value]) return `background:${COVER_PRESETS[value]}`;
  if (/^\/files\/[A-Za-z0-9._\-/]+$/.test(value)) return `background:url("${value}") center/cover no-repeat`;
  return null;
}
