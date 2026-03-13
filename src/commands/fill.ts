/**
 * fill @ref "text" [--dry-run] — Enter text into element by ref.
 */
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';
import { connectWithReconnect } from '../reconnect.ts';

const HELP = `Usage: agent-flutter fill @ref "text"

  Enter text into a text field.
  @ref   Element reference from snapshot (e.g. @e5)
  text   The text to enter

Options:
  --dry-run  Resolve target without executing`;

export async function fillCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const positionals = args.filter((a) => a !== '--dry-run');

  if (positionals.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter fill @ref "text"');
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, 'Run: agent-flutter snapshot');

  const text = positionals[1];
  const method = el.key ? 'Key' : 'Coordinates';

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'fill',
      target: `@${el.ref}`,
      text,
      resolved: { type: el.type, key: el.key ?? null, method },
    }));
    return;
  }

  const client = await connectWithReconnect(session);
  try {
    if (el.key) {
      await client.enterText({ type: 'Key', keyValue: el.key }, text);
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.enterText({ type: 'Coordinates', x: cx, y: cy }, text);
    }
    console.log(`Filled @${el.ref} with "${text}"`);
  } finally {
    await client.disconnect();
  }
}
