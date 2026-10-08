import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
export default function setup() {
  const root = path.resolve('.e2e-data');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  execFileSync('../server/.venv/bin/python', ['../../scripts/make_synthetic_project.py', '--out', path.join(root, 'project'), '--students', '40', '--seed', '1']);
}
