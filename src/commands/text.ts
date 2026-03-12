/**
 * text [query] [--json] — Extract visible text from Android UIAutomator accessibility layer.
 *
 * No session required — works without `connect` (uses ADB directly).
 * Exit codes: 0 = success/found, 1 = not found (search mode), 2 = error.
 */
import { resolveTransport } from '../transport/index.ts';
import { extractVisibleTexts } from '../text-parser.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter text [query] [options]

  List all visible text on screen (via Android UIAutomator).
  With query: check if text is visible (exit 0=found, 1=not found).

  Options:
    --json    JSON output
    --all     Include source/class/bounds metadata (with --json)`;

export async function textCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isJson = args.includes('--json') || process.env.AGENT_FLUTTER_JSON === '1';
  const isAll = args.includes('--all');

  // Filter out flags to get the query
  const query = args.filter(a => !a.startsWith('--')).join(' ').trim() || null;

  const transport = resolveTransport();

  if (transport.platform === 'ios') {
    if (isJson) {
      console.log(JSON.stringify(query ? { found: false, matches: [] } : []));
    } else {
      console.log('(text extraction not available on iOS — UIAutomator is Android-only)');
    }
    if (query) process.exit(1);
    return;
  }

  const entries = transport.dumpText();

  if (query) {
    // Search mode: check if text is visible
    const texts = extractVisibleTexts(entries);
    const lowerQuery = query.toLowerCase();
    const matches = texts.filter(t => t.toLowerCase().includes(lowerQuery));
    const found = matches.length > 0;

    if (isJson) {
      console.log(JSON.stringify({ found, matches }));
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

  // List mode: show all visible text
  if (isJson) {
    if (isAll) {
      console.log(JSON.stringify(entries));
    } else {
      const texts = extractVisibleTexts(entries);
      console.log(JSON.stringify(texts));
    }
  } else {
    const texts = extractVisibleTexts(entries);
    for (const t of texts) {
      console.log(t);
    }
  }
}
