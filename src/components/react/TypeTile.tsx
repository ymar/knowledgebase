import { PATHS } from '../../lib/icons';

export function TypeTile({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
  const path = PATHS[icon];
  const px = Math.round(size * 0.68);
  return (
    <span
      className="tile inline-flex shrink-0 items-center justify-center rounded-md"
      style={{ ['--c' as string]: color, width: size, height: size }}
    >
      {path ? (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />
      ) : (
        <span aria-hidden="true" style={{ fontSize: px, lineHeight: 1 }}>{icon}</span>
      )}
    </span>
  );
}
