/** Display source episode labels without changing the URL/index used for playback. */
export interface EpisodeLabel {
  number: number;
  /** The original non-redundant source label, including special/date/offset episode labels. */
  title?: string;
  /** Complete spoken/current-episode label. */
  label: string;
}

function ordinalNumber(raw: string): number | undefined {
  const value = raw.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));
  const match = value.match(/^(?:第\s*)?([0-9]+|[零〇一二两三四五六七八九十百千]+)\s*(?:集|话|話|期|章|回)?$/)
    ?? value.match(/^(?:episode|ep|e)\s*[._-]?\s*([0-9]+)$/i);
  if (!match) return undefined;
  const numeral = match[1];
  if (/^[0-9]+$/.test(numeral)) return Number(numeral);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百千]/.test(numeral)) return Number([...numeral].map((digit) => digits[digit]).join(''));
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const character of numeral) {
    if (character in units) {
      total += (current || 1) * units[character];
      current = 0;
    } else current = digits[character];
  }
  return total + current;
}

/**
 * Only suppress a plain ordinal when it equals this exact playback position.
 * Filtering can leave source 第03集 at index 1; that label must remain visible.
 */
export function describeEpisode(index: number, rawTitle?: string): EpisodeLabel {
  const number = index + 1;
  const original = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const title = original && ordinalNumber(original) !== number ? original : undefined;
  return { number, ...(title ? { title } : {}), label: `第${number}集${title ? ` · ${title}` : ''}` };
}

export function hasEpisodeTitles(titles: readonly string[] | undefined, count: number): boolean {
  return !!titles?.slice(0, count).some((title, index) => describeEpisode(index, title).title);
}
