// Per-operation fallback for config-import baby edit replay (P3-08).
// Pure helpers: no React, no network, so they can be unit tested with node --test.

type ReplayOp = { output_filename: string; input_filename: string; person_index?: number };
type NamedPerson = { index?: number; first_name?: string; last_name?: string; baby_photo_filename?: string | null };
type SessionWithBaby<P extends NamedPerson> = { people?: P[]; defaultBabyFilename?: string | null; babyEditHistory?: ReplayOp[] };

export type ReplayFailure = { op: ReplayOp };

function personLabel(p: NamedPerson | undefined): string {
  const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return name;
}

function personsForOp(op: ReplayOp, people: NamedPerson[]): NamedPerson[] {
  const byFile = people.filter((p) => p?.baby_photo_filename === op.output_filename);
  if (byFile.length) return byFile;
  if (typeof op.person_index === "number") {
    const byIndex = people.find((p) => p?.index === op.person_index) ?? people[op.person_index];
    if (byIndex) return [byIndex];
  }
  return [];
}

/** One plain-English warning per affected student (or one for the default photo). */
export function replayFailureWarnings(
  failures: ReplayFailure[],
  session: { people?: NamedPerson[]; defaultBabyFilename?: string | null }
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (m: string) => {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  };
  const people = session.people ?? [];
  for (const { op } of failures) {
    const named = personsForOp(op, people)
      .map(personLabel)
      .filter(Boolean);
    if (named.length) {
      for (const n of named) {
        add(`Couldn't re-apply the edits to the baby photo for ${n}; their original photo is used.`);
      }
    } else if (session.defaultBabyFilename && session.defaultBabyFilename === op.output_filename) {
      add("Couldn't re-apply the edits to the default baby photo; the original photo is used.");
    } else {
      add("Couldn't re-apply an edit to a baby photo; the original photo is used.");
    }
  }
  return out;
}

/** Point every reference to a failed edit's output at its (unedited) input instead. */
export function applyReplayFallbacks<P extends NamedPerson, S extends SessionWithBaby<P>>(
  session: S,
  failures: ReplayFailure[]
): S {
  if (!failures.length) return session;
  const remap = new Map<string, string>();
  for (const { op } of failures) remap.set(op.output_filename, op.input_filename);
  const resolve = (f: string): string => {
    let cur = f;
    for (let i = 0; i < 50 && remap.has(cur); i++) cur = remap.get(cur) as string;
    return cur;
  };
  const next: S = { ...session };
  if (session.people) {
    next.people = session.people.map((p) =>
      p?.baby_photo_filename && remap.has(p.baby_photo_filename)
        ? { ...p, baby_photo_filename: resolve(p.baby_photo_filename) }
        : p
    );
  }
  if (session.defaultBabyFilename && remap.has(session.defaultBabyFilename)) {
    next.defaultBabyFilename = resolve(session.defaultBabyFilename);
  }
  if (session.babyEditHistory) next.babyEditHistory = session.babyEditHistory.filter(op => !remap.has(op.output_filename));
  return next;
}
