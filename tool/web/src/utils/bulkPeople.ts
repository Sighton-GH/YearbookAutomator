import type {PersonRecord} from "../api";
export type BulkAction = "clear-quotes" | "clear-baby" | "exclude" | "include" | "name-size" | "quote-size";
export function applyBulkPeople(people: PersonRecord[], selected: Set<number>, locked: Record<number, true>, action: BulkAction, size: number): PersonRecord[] {
  return people.map(p => {
    if (!selected.has(p.index) || locked[p.index]) return p;
    switch (action) {
      case "clear-quotes": return {...p, quote: "", quote_blank: true};
      case "clear-baby": return {...p, baby_photo_filename: null, hide_baby_photo: true};
      case "exclude": return {...p, excluded: true};
      case "include": return {...p, excluded: false};
      case "name-size": return {...p, name_font_size: size};
      case "quote-size": return {...p, quote_font_size: size};
    }
  });
}
