/**
 * snapshot [-i] [-c] [-d N] [--json] [--diff] — Capture widget tree with @refs.
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, saveSession, updateRefs } from '../session.ts';
import { formatSnapshot, formatSnapshotJson, filterInteractive } from '../snapshot-fmt.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter snapshot [options]

  -i, --interactive   Show only interactive elements (buttons, textfields, etc.)
  -c, --compact       Compact one-line format
  -d N, --depth N     Limit tree depth (accepted, currently flat)
  --json              Output as JSON array
  --diff              Show changes since last snapshot`;

export async function snapshotCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const session = loadSession();
  if (!session) {
    throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');
  }

  const isJson = args.includes('--json') || process.env.AGENT_FLUTTER_JSON === '1';
  const isDiff = args.includes('--diff');
  const isInteractive = args.includes('-i') || args.includes('--interactive');
  const isCompact = args.includes('-c') || args.includes('--compact');
  // Accept -d N / --depth N (no-op for flat tree but don't error)

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);

  try {
    let elements = await client.getInteractiveElements();

    if (isInteractive) {
      elements = filterInteractive(elements);
    }

    if (isJson) {
      console.log(JSON.stringify(formatSnapshotJson(elements)));
      return;
    }

    if (isDiff) {
      const prev = session.lastSnapshot;
      const { lines: currentLines } = formatSnapshot(elements);

      if (prev.length === 0) {
        console.log('(baseline initialized)');
      } else {
        let prevElements = prev;
        if (isInteractive) prevElements = filterInteractive(prevElements);
        const { lines: prevLines } = formatSnapshot(prevElements);
        const added = currentLines.filter((l) => !prevLines.includes(l));
        const removed = prevLines.filter((l) => !currentLines.includes(l));

        if (added.length === 0 && removed.length === 0) {
          console.log('No changes');
        } else {
          for (const line of removed) console.log(`- ${line}`);
          for (const line of added) console.log(`+ ${line}`);
        }
      }
    } else {
      const { lines, refs } = formatSnapshot(elements);
      if (isCompact) {
        console.log(lines.join(' | '));
      } else {
        for (const line of lines) console.log(line);
      }
      updateRefs(session, refs);
    }

    session.lastSnapshot = elements;
    // Update isolateId in case it changed
    session.isolateId = client.currentIsolateId!;
    saveSession(session);
  } finally {
    await client.disconnect();
  }
}
