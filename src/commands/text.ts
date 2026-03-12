/**
 * text [query] [--json] — Extract visible text from the running app.
 *
 * Strategy (session-aware priority):
 * 1. If session active → Flutter semantics tree first (fast ~2s, works on animated pages)
 * 2. If no session OR semantics empty → UIAutomator dump (Android-only, no session needed)
 *
 * Exit codes: 0 = success/found, 1 = not found (search mode), 2 = error.
 */
import { resolveTransport } from '../transport/index.ts';
import { extractVisibleTexts } from '../text-parser.ts';
import { parseSemanticsTree, extractSemanticsTexts, type SemanticsTextEntry } from '../semantics-parser.ts';
import { loadSession } from '../session.ts';
import { VmServiceClient } from '../vm-client.ts';
import type { TextEntry } from '../transport/types.ts';

const HELP = `Usage: agent-flutter text [query] [options]

  List all visible text on screen.
  With query: check if text is visible (exit 0=found, 1=not found).

  Sources (session-aware priority):
    1. Flutter semantics tree (fast, needs active session — preferred)
    2. UIAutomator accessibility dump (Android, no session needed — fallback)

  Options:
    --json    JSON output
    --all     Include source/metadata (with --json)`;

export async function textCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isJson = args.includes('--json') || process.env.AGENT_FLUTTER_JSON === '1';
  const isAll = args.includes('--all');

  // Filter out flags to get the query
  const query = args.filter(a => !a.startsWith('--')).join(' ').trim() || null;

  let texts: string[] = [];
  let method: 'uiautomator' | 'semantics' = 'uiautomator';
  let uiEntries: TextEntry[] = [];
  let semEntries: SemanticsTextEntry[] = [];

  // Phase 1: Try semantics first when session is active (fast, works on animated pages)
  const transport = resolveTransport();
  const session = loadSession();
  if (session) {
    // Ensure accessibility service is active so Flutter generates semantics tree
    transport.ensureAccessibility();
    const result = await trySemantics(session.vmServiceUri);
    if (result) {
      texts = result.texts;
      semEntries = result.entries;
      method = 'semantics';
    }
  }

  // Phase 2: Fall back to UIAutomator if semantics unavailable or empty
  if (texts.length === 0) {
    if (transport.platform === 'android') {
      uiEntries = transport.dumpText();
      if (uiEntries.length > 0) {
        texts = extractVisibleTexts(uiEntries);
        method = 'uiautomator';
      }
    }
  }

  // Search mode
  if (query) {
    const lowerQuery = query.toLowerCase();
    const matches = texts.filter(t => t.toLowerCase().includes(lowerQuery));
    const found = matches.length > 0;

    if (isJson) {
      console.log(JSON.stringify({ found, matches, method }));
    } else {
      if (found) {
        console.log(`Found: ${matches.join(', ')}`);
      } else {
        console.log(`Not found: "${query}"`);
      }
    }

    if (!found) process.exit(1);
    return;
  }

  // List mode
  if (isJson) {
    if (isAll) {
      if (method === 'uiautomator') {
        console.log(JSON.stringify({ method, entries: uiEntries }));
      } else {
        console.log(JSON.stringify({ method, entries: semEntries }));
      }
    } else {
      console.log(JSON.stringify(texts));
    }
  } else {
    if (method === 'semantics' && texts.length > 0) {
      console.log('(via Flutter semantics tree)');
    }
    if (texts.length === 0) {
      console.log('(no text found — is a Flutter app running with an active session?)');
    }
    for (const t of texts) {
      console.log(t);
    }
  }
}

async function trySemantics(vmServiceUri: string): Promise<{ texts: string[]; entries: SemanticsTextEntry[] } | null> {
  let client: VmServiceClient | null = null;
  try {
    client = new VmServiceClient();
    await client.connect(vmServiceUri);
    const dump = await client.dumpSemanticsTree();
    if (!dump) return null;
    const entries = parseSemanticsTree(dump);
    const texts = extractSemanticsTexts(entries);
    return texts.length > 0 ? { texts, entries } : null;
  } catch {
    return null;
  } finally {
    if (client) {
      try { await client.disconnect(); } catch { /* ignore */ }
    }
  }
}
