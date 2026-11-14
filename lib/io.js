// lib/io.js — read a JSON input that may be versioned only as .json.gz (large ERA5-derived intermediates).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/** Returns the parsed JSON at `base` (…/x.json) or at `base + '.gz'`, or null when neither exists. */
export function readJsonMaybeGz(base) {
  if (existsSync(base)) return JSON.parse(readFileSync(base, 'utf8'));
  if (existsSync(base + '.gz')) return JSON.parse(gunzipSync(readFileSync(base + '.gz')).toString('utf8'));
  return null;
}
