/**
 * scroll @ref|up|down|left|right [amount] [--dry-run] — Scroll element into view or page scroll.
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, resolveRef } from '../session.ts';
import { resolveTransport } from '../transport/index.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter scroll <target>

  scroll @ref              Scroll element into view via Marionette
  scroll down [amount]     Scroll down (amount: multiplier, default 1)
  scroll up [amount]       Scroll up
  scroll left [amount]     Scroll left
  scroll right [amount]    Scroll right

Options:
  --dry-run  Show intended action without executing`;

const DIRECTIONS = ['down', 'up', 'left', 'right'];

export async function scrollCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const positionals = args.filter((a) => a !== '--dry-run');

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter scroll <@ref|up|down|left|right>');
  }

  const target = positionals[0];

  // Direction-based scroll via transport
  if (DIRECTIONS.includes(target)) {
    const transport = resolveTransport();

    if (isDryRun) {
      console.log(JSON.stringify({ dryRun: true, command: 'scroll', direction: target, device: transport.deviceId, platform: transport.platform }));
      return;
    }

    const amount = positionals[1] ? parseFloat(positionals[1]) : 1;
    const screen = transport.getScreenSize();
    const cx = screen.width / 2;

    // Compute swipe coords based on direction and screen size
    let x1: number, y1: number, x2: number, y2: number;
    const scrollDist = screen.height * 0.5 * amount; // vertical scroll distance
    const hScrollDist = screen.width * 0.7 * amount; // horizontal scroll distance

    switch (target) {
      case 'down':
        x1 = cx; y1 = Math.round(screen.height * 0.75);
        x2 = cx; y2 = Math.round(screen.height * 0.75 - scrollDist);
        break;
      case 'up':
        x1 = cx; y1 = Math.round(screen.height * 0.25);
        x2 = cx; y2 = Math.round(screen.height * 0.25 + scrollDist);
        break;
      case 'left':
        x1 = Math.round(screen.width * 0.8); y1 = Math.round(screen.height / 2);
        x2 = Math.round(screen.width * 0.8 - hScrollDist); y2 = Math.round(screen.height / 2);
        break;
      case 'right':
        x1 = Math.round(screen.width * 0.2); y1 = Math.round(screen.height / 2);
        x2 = Math.round(screen.width * 0.2 + hScrollDist); y2 = Math.round(screen.height / 2);
        break;
      default:
        throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${target}`);
    }

    transport.swipe(x1, y1, x2, y2, 300);
    console.log(`Scrolled ${target}`);
    return;
  }

  // @ref-based Marionette scroll
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, target);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${target}`, 'Run: agent-flutter snapshot');

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'scroll',
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null },
    }));
    return;
  }

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.scrollTo({ type: 'Key', keyValue: el.key });
    } else if (el.text) {
      await client.scrollTo({ type: 'Text', text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.scrollTo({ type: 'Coordinates', x: cx, y: cy });
    }
    console.log(`Scrolled to @${el.ref}`);
  } finally {
    await client.disconnect();
  }
}
