/**
 * Session persistence for agent-flutter.
 * Stores connection state, refs, and last snapshot in a JSON file.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { FlutterElement } from './vm-client.ts';
import type { RefElement } from './snapshot-fmt.ts';

export type SessionData = {
  vmServiceUri: string;
  isolateId: string;
  refs: Record<string, RefElement>;
  lastSnapshot: FlutterElement[];
  connectedAt: string;
};

const SESSION_DIR = process.env.AGENT_FLUTTER_HOME ?? join(process.env.HOME ?? '/tmp', '.agent-flutter');
const SESSION_FILE = join(SESSION_DIR, 'session.json');

function ensureDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadSession(): SessionData | null {
  try {
    const data = readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(data) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionData): void {
  ensureDir();
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export function clearSession(): void {
  try {
    unlinkSync(SESSION_FILE);
  } catch {
    // Already gone
  }
}

export function updateRefs(session: SessionData, refs: RefElement[]): void {
  session.refs = {};
  for (const ref of refs) {
    session.refs[ref.ref] = ref;
  }
}

export function resolveRef(session: SessionData, refStr: string): RefElement | null {
  // Accept @e1 or e1
  const key = refStr.startsWith('@') ? refStr.slice(1) : refStr;
  return session.refs[key] ?? null;
}
