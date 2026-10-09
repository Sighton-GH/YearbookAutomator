import type { PersonRecord } from "../api";

export function editPersonName(person: PersonRecord, field: "first_name" | "last_name", value: string): PersonRecord {
  return { ...person, original_first_name: person.original_first_name ?? person.first_name,
    original_last_name: person.original_last_name ?? person.last_name, [field]: value };
}

export function hasNameEdit(person: PersonRecord): boolean {
  return person.original_first_name !== undefined &&
    (person.first_name !== person.original_first_name || person.last_name !== person.original_last_name);
}

// Row numbers alone are not identities. Only carry an edit when the fresh roster
// row still has the exact original name; reordered/replaced rows must not inherit it.
export function keepNameEdits(fresh: PersonRecord[], previous: PersonRecord[]): PersonRecord[] {
  return fresh.map(person => {
    const old = previous.find(p => p.index === person.index && hasNameEdit(p) &&
      p.original_first_name === person.first_name && p.original_last_name === person.last_name);
    return old ? { ...person, first_name: old.first_name, last_name: old.last_name,
      original_first_name: person.first_name, original_last_name: person.last_name } : person;
  });
}
