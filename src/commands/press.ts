/**
 * press @ref [--dry-run] — Tap element by ref.
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter press @ref

  Tap element by ref.
  @ref  Element reference from snapshot (e.g. @e3)

Options:
  --dry-run  Resolve target without executing`;

export async function pressCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const positionals = args.filter((a) => a !== '--dry-run');

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter press @ref');
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, 'Run: agent-flutter snapshot');

  const method = el.key ? 'Key' : el.text ? 'Text' : 'Coordinates';

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'press',
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null, method },
    }));
    return;
  }

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.tap({ type: 'Key', keyValue: el.key });
    } else if (el.text) {
      await client.tap({ type: 'Text', text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.tap({ type: 'Coordinates', x: cx, y: cy });
    }
    console.log(`Pressed @${el.ref}`);
  } finally {
    await client.disconnect();
  }
}
