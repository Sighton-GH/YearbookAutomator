// Unicode casefold differences from lowercase, generated with Python unicodedata.
const special: Record<string, string> = {"\u00b5": "\u03bc", "\u00df": "ss", "\u0149": "\u02bcn", "\u017f": "s", "\u01f0": "j\u030c", "\u0345": "\u03b9", "\u0390": "\u03b9\u0308\u0301", "\u03b0": "\u03c5\u0308\u0301", "\u03c2": "\u03c3", "\u03d0": "\u03b2", "\u03d1": "\u03b8", "\u03d5": "\u03c6", "\u03d6": "\u03c0", "\u03f0": "\u03ba", "\u03f1": "\u03c1", "\u03f5": "\u03b5", "\u0587": "\u0565\u0582", "\u13a0": "\u13a0", "\u13a1": "\u13a1", "\u13a2": "\u13a2", "\u13a3": "\u13a3", "\u13a4": "\u13a4", "\u13a5": "\u13a5", "\u13a6": "\u13a6", "\u13a7": "\u13a7", "\u13a8": "\u13a8", "\u13a9": "\u13a9", "\u13aa": "\u13aa", "\u13ab": "\u13ab", "\u13ac": "\u13ac", "\u13ad": "\u13ad", "\u13ae": "\u13ae", "\u13af": "\u13af", "\u13b0": "\u13b0", "\u13b1": "\u13b1", "\u13b2": "\u13b2", "\u13b3": "\u13b3", "\u13b4": "\u13b4", "\u13b5": "\u13b5", "\u13b6": "\u13b6", "\u13b7": "\u13b7", "\u13b8": "\u13b8", "\u13b9": "\u13b9", "\u13ba": "\u13ba", "\u13bb": "\u13bb", "\u13bc": "\u13bc", "\u13bd": "\u13bd", "\u13be": "\u13be", "\u13bf": "\u13bf", "\u13c0": "\u13c0", "\u13c1": "\u13c1", "\u13c2": "\u13c2", "\u13c3": "\u13c3", "\u13c4": "\u13c4", "\u13c5": "\u13c5", "\u13c6": "\u13c6", "\u13c7": "\u13c7", "\u13c8": "\u13c8", "\u13c9": "\u13c9", "\u13ca": "\u13ca", "\u13cb": "\u13cb", "\u13cc": "\u13cc", "\u13cd": "\u13cd", "\u13ce": "\u13ce", "\u13cf": "\u13cf", "\u13d0": "\u13d0", "\u13d1": "\u13d1", "\u13d2": "\u13d2", "\u13d3": "\u13d3", "\u13d4": "\u13d4", "\u13d5": "\u13d5", "\u13d6": "\u13d6", "\u13d7": "\u13d7", "\u13d8": "\u13d8", "\u13d9": "\u13d9", "\u13da": "\u13da", "\u13db": "\u13db", "\u13dc": "\u13dc", "\u13dd": "\u13dd", "\u13de": "\u13de", "\u13df": "\u13df", "\u13e0": "\u13e0", "\u13e1": "\u13e1", "\u13e2": "\u13e2", "\u13e3": "\u13e3", "\u13e4": "\u13e4", "\u13e5": "\u13e5", "\u13e6": "\u13e6", "\u13e7": "\u13e7", "\u13e8": "\u13e8", "\u13e9": "\u13e9", "\u13ea": "\u13ea", "\u13eb": "\u13eb", "\u13ec": "\u13ec", "\u13ed": "\u13ed", "\u13ee": "\u13ee", "\u13ef": "\u13ef", "\u13f0": "\u13f0", "\u13f1": "\u13f1", "\u13f2": "\u13f2", "\u13f3": "\u13f3", "\u13f4": "\u13f4", "\u13f5": "\u13f5", "\u13f8": "\u13f0", "\u13f9": "\u13f1", "\u13fa": "\u13f2", "\u13fb": "\u13f3", "\u13fc": "\u13f4", "\u13fd": "\u13f5", "\u1c80": "\u0432", "\u1c81": "\u0434", "\u1c82": "\u043e", "\u1c83": "\u0441", "\u1c84": "\u0442", "\u1c85": "\u0442", "\u1c86": "\u044a", "\u1c87": "\u0463", "\u1c88": "\ua64b", "\u1e96": "h\u0331", "\u1e97": "t\u0308", "\u1e98": "w\u030a", "\u1e99": "y\u030a", "\u1e9a": "a\u02be", "\u1e9b": "\u1e61", "\u1e9e": "ss", "\u1f50": "\u03c5\u0313", "\u1f52": "\u03c5\u0313\u0300", "\u1f54": "\u03c5\u0313\u0301", "\u1f56": "\u03c5\u0313\u0342", "\u1f80": "\u1f00\u03b9", "\u1f81": "\u1f01\u03b9", "\u1f82": "\u1f02\u03b9", "\u1f83": "\u1f03\u03b9", "\u1f84": "\u1f04\u03b9", "\u1f85": "\u1f05\u03b9", "\u1f86": "\u1f06\u03b9", "\u1f87": "\u1f07\u03b9", "\u1f88": "\u1f00\u03b9", "\u1f89": "\u1f01\u03b9", "\u1f8a": "\u1f02\u03b9", "\u1f8b": "\u1f03\u03b9", "\u1f8c": "\u1f04\u03b9", "\u1f8d": "\u1f05\u03b9", "\u1f8e": "\u1f06\u03b9", "\u1f8f": "\u1f07\u03b9", "\u1f90": "\u1f20\u03b9", "\u1f91": "\u1f21\u03b9", "\u1f92": "\u1f22\u03b9", "\u1f93": "\u1f23\u03b9", "\u1f94": "\u1f24\u03b9", "\u1f95": "\u1f25\u03b9", "\u1f96": "\u1f26\u03b9", "\u1f97": "\u1f27\u03b9", "\u1f98": "\u1f20\u03b9", "\u1f99": "\u1f21\u03b9", "\u1f9a": "\u1f22\u03b9", "\u1f9b": "\u1f23\u03b9", "\u1f9c": "\u1f24\u03b9", "\u1f9d": "\u1f25\u03b9", "\u1f9e": "\u1f26\u03b9", "\u1f9f": "\u1f27\u03b9", "\u1fa0": "\u1f60\u03b9", "\u1fa1": "\u1f61\u03b9", "\u1fa2": "\u1f62\u03b9", "\u1fa3": "\u1f63\u03b9", "\u1fa4": "\u1f64\u03b9", "\u1fa5": "\u1f65\u03b9", "\u1fa6": "\u1f66\u03b9", "\u1fa7": "\u1f67\u03b9", "\u1fa8": "\u1f60\u03b9", "\u1fa9": "\u1f61\u03b9", "\u1faa": "\u1f62\u03b9", "\u1fab": "\u1f63\u03b9", "\u1fac": "\u1f64\u03b9", "\u1fad": "\u1f65\u03b9", "\u1fae": "\u1f66\u03b9", "\u1faf": "\u1f67\u03b9", "\u1fb2": "\u1f70\u03b9", "\u1fb3": "\u03b1\u03b9", "\u1fb4": "\u03ac\u03b9", "\u1fb6": "\u03b1\u0342", "\u1fb7": "\u03b1\u0342\u03b9", "\u1fbc": "\u03b1\u03b9", "\u1fbe": "\u03b9", "\u1fc2": "\u1f74\u03b9", "\u1fc3": "\u03b7\u03b9", "\u1fc4": "\u03ae\u03b9", "\u1fc6": "\u03b7\u0342", "\u1fc7": "\u03b7\u0342\u03b9", "\u1fcc": "\u03b7\u03b9", "\u1fd2": "\u03b9\u0308\u0300", "\u1fd3": "\u03b9\u0308\u0301", "\u1fd6": "\u03b9\u0342", "\u1fd7": "\u03b9\u0308\u0342", "\u1fe2": "\u03c5\u0308\u0300", "\u1fe3": "\u03c5\u0308\u0301", "\u1fe4": "\u03c1\u0313", "\u1fe6": "\u03c5\u0342", "\u1fe7": "\u03c5\u0308\u0342", "\u1ff2": "\u1f7c\u03b9", "\u1ff3": "\u03c9\u03b9", "\u1ff4": "\u03ce\u03b9", "\u1ff6": "\u03c9\u0342", "\u1ff7": "\u03c9\u0342\u03b9", "\u1ffc": "\u03c9\u03b9", "\uab70": "\u13a0", "\uab71": "\u13a1", "\uab72": "\u13a2", "\uab73": "\u13a3", "\uab74": "\u13a4", "\uab75": "\u13a5", "\uab76": "\u13a6", "\uab77": "\u13a7", "\uab78": "\u13a8", "\uab79": "\u13a9", "\uab7a": "\u13aa", "\uab7b": "\u13ab", "\uab7c": "\u13ac", "\uab7d": "\u13ad", "\uab7e": "\u13ae", "\uab7f": "\u13af", "\uab80": "\u13b0", "\uab81": "\u13b1", "\uab82": "\u13b2", "\uab83": "\u13b3", "\uab84": "\u13b4", "\uab85": "\u13b5", "\uab86": "\u13b6", "\uab87": "\u13b7", "\uab88": "\u13b8", "\uab89": "\u13b9", "\uab8a": "\u13ba", "\uab8b": "\u13bb", "\uab8c": "\u13bc", "\uab8d": "\u13bd", "\uab8e": "\u13be", "\uab8f": "\u13bf", "\uab90": "\u13c0", "\uab91": "\u13c1", "\uab92": "\u13c2", "\uab93": "\u13c3", "\uab94": "\u13c4", "\uab95": "\u13c5", "\uab96": "\u13c6", "\uab97": "\u13c7", "\uab98": "\u13c8", "\uab99": "\u13c9", "\uab9a": "\u13ca", "\uab9b": "\u13cb", "\uab9c": "\u13cc", "\uab9d": "\u13cd", "\uab9e": "\u13ce", "\uab9f": "\u13cf", "\uaba0": "\u13d0", "\uaba1": "\u13d1", "\uaba2": "\u13d2", "\uaba3": "\u13d3", "\uaba4": "\u13d4", "\uaba5": "\u13d5", "\uaba6": "\u13d6", "\uaba7": "\u13d7", "\uaba8": "\u13d8", "\uaba9": "\u13d9", "\uabaa": "\u13da", "\uabab": "\u13db", "\uabac": "\u13dc", "\uabad": "\u13dd", "\uabae": "\u13de", "\uabaf": "\u13df", "\uabb0": "\u13e0", "\uabb1": "\u13e1", "\uabb2": "\u13e2", "\uabb3": "\u13e3", "\uabb4": "\u13e4", "\uabb5": "\u13e5", "\uabb6": "\u13e6", "\uabb7": "\u13e7", "\uabb8": "\u13e8", "\uabb9": "\u13e9", "\uabba": "\u13ea", "\uabbb": "\u13eb", "\uabbc": "\u13ec", "\uabbd": "\u13ed", "\uabbe": "\u13ee", "\uabbf": "\u13ef", "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st", "\ufb13": "\u0574\u0576", "\ufb14": "\u0574\u0565", "\ufb15": "\u0574\u056b", "\ufb16": "\u057e\u0576", "\ufb17": "\u0574\u056d"};
const casefold = (value: string): string => Array.from(value, ch => special[ch] ?? ch.toLowerCase()).join("");

import type { PersonRecord, TemplateSlots } from "../api";
import type { PlacementMode } from "../types";

export function computeSlotNumberToIndex(
  slots: TemplateSlots[],
  placementMode: PlacementMode,
  templateWidth: number | null | undefined,
): number[] {
  const identity = slots.map((_, i) => i);
  if (!slots.length) return identity;

  // For "simultaneous": the parse step already returns slots in correct reading order
  // across the full spread.
  if (placementMode === "simultaneous") return identity;

  // For "left_then_right": renumber slots so slot #1..#N fills the left page in reading
  // order, then the right page in reading order.
  const fallbackWidth = Math.max(1, ...slots.map((s) => s.mugshot.x + s.mugshot.width));
  const midX = (templateWidth ?? fallbackWidth) / 2;

  const heights = [...slots.map((s) => s.mugshot.height)].sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 1;
  const rowTol = Math.max(1, Math.round(medH * 0.6));

  type Item = { idx: number; cy: number; cx: number };

  const left: Item[] = [];
  const right: Item[] = [];
  slots.forEach((slot, idx) => {
    const b = slot.mugshot;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    (cx < midX ? left : right).push({ idx, cy, cx });
  });

  const orderSide = (items: Item[]): number[] => {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
    const rows: Item[][] = [];
    const rowCenters: number[] = [];
    for (const it of sorted) {
      if (!rows.length) {
        rows.push([it]);
        rowCenters.push(it.cy);
        continue;
      }
      const last = rowCenters[rowCenters.length - 1];
      if (Math.abs(it.cy - last) <= rowTol) {
        rows[rows.length - 1].push(it);
        const row = rows[rows.length - 1];
        rowCenters[rowCenters.length - 1] = row.reduce((sum, r) => sum + r.cy, 0) / row.length;
      } else {
        rows.push([it]);
        rowCenters.push(it.cy);
      }
    }

    const out: number[] = [];
    for (const row of rows) {
      row.sort((a, b) => a.cx - b.cx);
      out.push(...row.map((r) => r.idx));
    }
    return out;
  };

  return [...orderSide(left), ...orderSide(right)];
}

// Accent-folded, case-insensitive name key (NFKD, combining marks stripped).
// Must match `fold_name` in tool/server/app/services/placement.py.
// Nonzero canonical combining classes, matching Python unicodedata 13.0.0.
// Unicode Mark includes Indic vowels whose combining class is zero; preserve them.
const accentMarks = /[\u{300}-\u{34e}\u{350}-\u{36f}\u{483}-\u{487}\u{591}-\u{5bd}\u{5bf}\u{5c1}-\u{5c2}\u{5c4}-\u{5c5}\u{5c7}\u{610}-\u{61a}\u{64b}-\u{65f}\u{670}\u{6d6}-\u{6dc}\u{6df}-\u{6e4}\u{6e7}-\u{6e8}\u{6ea}-\u{6ed}\u{711}\u{730}-\u{74a}\u{7eb}-\u{7f3}\u{7fd}\u{816}-\u{819}\u{81b}-\u{823}\u{825}-\u{827}\u{829}-\u{82d}\u{859}-\u{85b}\u{8d3}-\u{8e1}\u{8e3}-\u{8ff}\u{93c}\u{94d}\u{951}-\u{954}\u{9bc}\u{9cd}\u{9fe}\u{a3c}\u{a4d}\u{abc}\u{acd}\u{b3c}\u{b4d}\u{bcd}\u{c4d}\u{c55}-\u{c56}\u{cbc}\u{ccd}\u{d3b}-\u{d3c}\u{d4d}\u{dca}\u{e38}-\u{e3a}\u{e48}-\u{e4b}\u{eb8}-\u{eba}\u{ec8}-\u{ecb}\u{f18}-\u{f19}\u{f35}\u{f37}\u{f39}\u{f71}-\u{f72}\u{f74}\u{f7a}-\u{f7d}\u{f80}\u{f82}-\u{f84}\u{f86}-\u{f87}\u{fc6}\u{1037}\u{1039}-\u{103a}\u{108d}\u{135d}-\u{135f}\u{1714}\u{1734}\u{17d2}\u{17dd}\u{18a9}\u{1939}-\u{193b}\u{1a17}-\u{1a18}\u{1a60}\u{1a75}-\u{1a7c}\u{1a7f}\u{1ab0}-\u{1abd}\u{1abf}-\u{1ac0}\u{1b34}\u{1b44}\u{1b6b}-\u{1b73}\u{1baa}-\u{1bab}\u{1be6}\u{1bf2}-\u{1bf3}\u{1c37}\u{1cd0}-\u{1cd2}\u{1cd4}-\u{1ce0}\u{1ce2}-\u{1ce8}\u{1ced}\u{1cf4}\u{1cf8}-\u{1cf9}\u{1dc0}-\u{1df9}\u{1dfb}-\u{1dff}\u{20d0}-\u{20dc}\u{20e1}\u{20e5}-\u{20f0}\u{2cef}-\u{2cf1}\u{2d7f}\u{2de0}-\u{2dff}\u{302a}-\u{302f}\u{3099}-\u{309a}\u{a66f}\u{a674}-\u{a67d}\u{a69e}-\u{a69f}\u{a6f0}-\u{a6f1}\u{a806}\u{a82c}\u{a8c4}\u{a8e0}-\u{a8f1}\u{a92b}-\u{a92d}\u{a953}\u{a9b3}\u{a9c0}\u{aab0}\u{aab2}-\u{aab4}\u{aab7}-\u{aab8}\u{aabe}-\u{aabf}\u{aac1}\u{aaf6}\u{abed}\u{fb1e}\u{fe20}-\u{fe2f}\u{101fd}\u{102e0}\u{10376}-\u{1037a}\u{10a0d}\u{10a0f}\u{10a38}-\u{10a3a}\u{10a3f}\u{10ae5}-\u{10ae6}\u{10d24}-\u{10d27}\u{10eab}-\u{10eac}\u{10f46}-\u{10f50}\u{11046}\u{1107f}\u{110b9}-\u{110ba}\u{11100}-\u{11102}\u{11133}-\u{11134}\u{11173}\u{111c0}\u{111ca}\u{11235}-\u{11236}\u{112e9}-\u{112ea}\u{1133b}-\u{1133c}\u{1134d}\u{11366}-\u{1136c}\u{11370}-\u{11374}\u{11442}\u{11446}\u{1145e}\u{114c2}-\u{114c3}\u{115bf}-\u{115c0}\u{1163f}\u{116b6}-\u{116b7}\u{1172b}\u{11839}-\u{1183a}\u{1193d}-\u{1193e}\u{11943}\u{119e0}\u{11a34}\u{11a47}\u{11a99}\u{11c3f}\u{11d42}\u{11d44}-\u{11d45}\u{11d97}\u{16af0}-\u{16af4}\u{16b30}-\u{16b36}\u{16ff0}-\u{16ff1}\u{1bc9e}\u{1d165}-\u{1d169}\u{1d16d}-\u{1d172}\u{1d17b}-\u{1d182}\u{1d185}-\u{1d18b}\u{1d1aa}-\u{1d1ad}\u{1d242}-\u{1d244}\u{1e000}-\u{1e006}\u{1e008}-\u{1e018}\u{1e01b}-\u{1e021}\u{1e023}-\u{1e024}\u{1e026}-\u{1e02a}\u{1e130}-\u{1e136}\u{1e2ec}-\u{1e2ef}\u{1e8d0}-\u{1e8d6}\u{1e944}-\u{1e94a}]/gu;

export function foldName(s: string | null | undefined): string {
  return casefold((s ?? "").trim().normalize("NFKD").replace(accentMarks, ""));
}

// Plain code-unit comparison so the order is identical to the backend's string sort.
const cmpFolded = (a: string, b: string): number => {
  const aa = Array.from(a, c => c.codePointAt(0)!);
  const bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
};

export function comparePeopleByLastName(a: PersonRecord, b: PersonRecord): number {
  const aLast = foldName(a.last_name);
  const bLast = foldName(b.last_name);
  const aLastEmpty = !aLast;
  const bLastEmpty = !bLast;
  if (aLastEmpty !== bLastEmpty) return aLastEmpty ? 1 : -1;

  const lastCmp = cmpFolded(aLast, bLast);
  if (lastCmp) return lastCmp;

  const firstCmp = cmpFolded(foldName(a.first_name), foldName(b.first_name));
  if (firstCmp) return firstCmp;

  // Stable fallback: spreadsheet row index
  return (a.index ?? 0) - (b.index ?? 0);
}
