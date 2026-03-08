/**
 * wait exists|visible|text|gone <target> [--timeout-ms N] [--interval-ms N]
 * wait <ms>  — simple delay
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, saveSession, updateRefs, resolveRef } from '../session.ts';
import { formatSnapshot } from '../snapshot-fmt.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter wait <condition> <target> [options]

  wait exists @ref [--timeout-ms N] [--interval-ms N]   Wait for element to exist
  wait visible @ref [--timeout-ms N] [--interval-ms N]  Wait for element to be visible
  wait text "string" [--timeout-ms N] [--interval-ms N] Wait for text to appear
  wait gone @ref [--timeout-ms N] [--interval-ms N]     Wait for element to disappear
  wait <ms>                                              Simple delay in milliseconds

Options:
  --timeout-ms N    Maximum wait time (default: 10000)
  --interval-ms N   Poll interval (default: 250)`;

function parseFlags(args: string[]): { timeout: number; interval: number; positionals: string[] } {
  let timeout = process.env.AGENT_FLUTTER_TIMEOUT ? parseInt(process.env.AGENT_FLUTTER_TIMEOUT, 10) : 10000;
  let interval = 250;
  const positionals: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--timeout-ms' && i + 1 < args.length) {
      timeout = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === '--interval-ms' && i + 1 < args.length) {
      interval = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(HELP);
      process.exit(0);
    } else {
      positionals.push(args[i]);
      i++;
    }
  }
  return { timeout, interval, positionals };
}

export async function waitCommand(args: string[]): Promise<void> {
  const { timeout, interval, positionals } = parseFlags(args);

  if (positionals.length === 0) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter wait <condition> <target>');
  }

  // Simple delay: wait <ms>
  if (/^\d+$/.test(positionals[0])) {
    const ms = parseInt(positionals[0], 10);
    await new Promise((r) => setTimeout(r, ms));
    console.log(`Waited ${ms}ms`);
    return;
  }

  const condition = positionals[0];
  const target = positionals[1];

  if (!target) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Usage: agent-flutter wait ${condition} <target>`);
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);

  try {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const elements = await client.getInteractiveElements();
      const { refs } = formatSnapshot(elements);

      switch (condition) {
        case 'exists': {
          const refKey = target.startsWith('@') ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Found @${refKey}`);
            return;
          }
          break;
        }
        case 'visible': {
          const refKey = target.startsWith('@') ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (found?.visible) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Visible @${refKey}`);
            return;
          }
          break;
        }
        case 'text': {
          const lowerTarget = target.toLowerCase();
          const found = elements.some((el) => el.text?.toLowerCase().includes(lowerTarget));
          if (found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Found text "${target}"`);
            return;
          }
          break;
        }
        case 'gone': {
          const refKey = target.startsWith('@') ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (!found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Gone @${refKey}`);
            return;
          }
          break;
        }
        default:
          throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown wait condition: ${condition}. Use: exists, visible, text, gone`);
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    // Timeout
    throw new AgentFlutterError(ErrorCodes.TIMEOUT, `TIMEOUT: ${condition} "${target}" not met within ${timeout}ms`);
  } finally {
    await client.disconnect();
  }
}
