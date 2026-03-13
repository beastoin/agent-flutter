/**
 * text [query] [--json] [--press] [--fill "value"] — Extract and interact with visible text.
 *
 * Strategy (session-aware priority):
 * 1. If session active → Flutter semantics tree first (fast ~2s, works on animated pages)
 * 2. If no session OR semantics empty → UIAutomator dump (Android-only, no session needed)
 *
 * --press: Find text via UIAutomator, tap its bounds center via ADB.
 *          Works on system UI (Chrome, permission dialogs) and Flutter.
 * --fill:  Find text field by label via UIAutomator, tap to focus, type value via ADB.
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

  Actions:
    --press            Find text via UIAutomator and tap it (works on system UI)
    --fill "value"     Find text field by label, tap to focus, type value
    --focused          With --fill: type into currently focused field (no text match needed)

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
  const isPress = args.includes('--press');
  const isFocused = args.includes('--focused');
  const fillIdx = args.indexOf('--fill');
  const fillValue = fillIdx >= 0 && fillIdx + 1 < args.length ? args[fillIdx + 1] : null;
  const isFill = fillIdx >= 0;

  // Filter out flags and --fill value to get the query
  const skipNext = new Set<number>();
  if (fillIdx >= 0) skipNext.add(fillIdx + 1);
  const query = args.filter((a, i) => !a.startsWith('--') && !skipNext.has(i)).join(' ').trim() || null;

  const transport = resolveTransport();

  // --fill --focused: type into currently focused field without text matching
  if (isFill && isFocused && fillValue !== null) {
    if (transport.platform !== 'android') {
      if (isJson) {
        console.log(JSON.stringify({ error: 'fill --focused requires Android (ADB)' }));
      } else {
        console.error('fill --focused requires Android (ADB)');
      }
      process.exit(2);
      return;
    }
    transport.inputText(fillValue);
    if (isJson) {
      console.log(JSON.stringify({ action: 'fill', focused: true, value: fillValue }));
    } else {
      console.log(`Filled focused field with "${fillValue}"`);
    }
    return;
  }

  // For --press and --fill, we MUST use UIAutomator (need bounds for tap coordinates)
  if ((isPress || isFill) && query) {
    if (transport.platform !== 'android') {
      if (isJson) {
        console.log(JSON.stringify({ error: 'press/fill via text requires Android (UIAutomator)' }));
      } else {
        console.error('press/fill via text requires Android (UIAutomator)');
      }
      process.exit(2);
      return;
    }

    const uiEntries = transport.dumpText();
    const lowerQuery = query.toLowerCase();
    const match = uiEntries.find(e => e.text.toLowerCase().includes(lowerQuery));

    if (!match) {
      if (isJson) {
        console.log(JSON.stringify({ found: false, action: isPress ? 'press' : 'fill', query }));
      } else {
        console.log(`Not found: "${query}"`);
      }
      process.exit(1);
      return;
    }

    const [left, top, right, bottom] = match.bounds;
    const centerX = Math.round((left + right) / 2);
    const centerY = Math.round((top + bottom) / 2);

    if (isPress) {
      transport.tap(centerX, centerY);
      if (isJson) {
        console.log(JSON.stringify({ found: true, action: 'press', query, text: match.text, x: centerX, y: centerY }));
      } else {
        console.log(`Pressed: "${match.text}" at (${centerX}, ${centerY})`);
      }
      return;
    }

    if (isFill && fillValue !== null) {
      // Tap to focus the field
      transport.tap(centerX, centerY);
      // Brief pause for focus
      await new Promise(r => setTimeout(r, 300));
      // Type the value via ADB input text
      transport.inputText(fillValue);
      if (isJson) {
        console.log(JSON.stringify({ found: true, action: 'fill', query, text: match.text, value: fillValue, x: centerX, y: centerY }));
      } else {
        console.log(`Filled: "${match.text}" with "${fillValue}" at (${centerX}, ${centerY})`);
      }
      return;
    }
  }

  // Standard text extraction (no --press/--fill)
  let texts: string[] = [];
  let method: 'uiautomator' | 'semantics' = 'uiautomator';
  let uiEntries: TextEntry[] = [];
  let semEntries: SemanticsTextEntry[] = [];

  // Phase 1: Try semantics first when session is active (fast, works on animated pages)
  // Note: semantics requires TalkBack/accessibility enabled on the device.
  // Without it, this returns null and we fall back to UIAutomator.
  const session = loadSession();
  if (session) {
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
