import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

function tryRead(p: string): string | null {
  try {
    const text = readFileSync(p, 'utf-8');
    return JSON.parse(text).version ?? null;
  } catch {
    return null;
  }
}

export function readPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'package.json'),
    path.resolve(here, '..', 'package.json'),
  ];
  for (const p of candidates) {
    const v = tryRead(p);
    if (v) return v;
  }
  return '0.0.0';
}
