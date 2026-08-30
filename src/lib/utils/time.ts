export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function clockTime(ms: number, locale?: string) {
  return new Date(ms).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function timeRange(start: number, stop: number, locale?: string) {
  return `${clockTime(start, locale)} – ${clockTime(stop, locale)}`;
}

export function dayLabel(ms: number, locale?: string) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return 'Today';
  const tomorrow = new Date(today.getTime() + 24 * HOUR);
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  )
    return 'Tomorrow';
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Round a timestamp down to the nearest half hour — the guide grid origin. */
export function floorToHalfHour(ms: number) {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.getTime();
}

export function formatDuration(secs: number | null | undefined) {
  if (!secs || secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Parse XMLTV timestamps: `20260830183000 +0200`. */
export function parseXmltvTime(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/.exec(value.trim());
  if (!m) {
    const fallback = Date.parse(value);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s, tz] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}`;
  if (!tz) {
    const t = Date.parse(`${iso}Z`);
    return Number.isNaN(t) ? null : t;
  }
  const offset = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const t = Date.parse(`${iso}${offset}`);
  return Number.isNaN(t) ? null : t;
}
