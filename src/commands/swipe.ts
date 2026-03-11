/**
 * swipe up|down|left|right [--distance 0.5] [--duration-ms 300] [--dry-run] — Swipe gesture.
 */
import { resolveTransport } from '../transport/index.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter swipe <direction> [options]

  swipe up|down|left|right

Options:
  --distance N      Fraction of screen to swipe (default: 0.5)
  --duration-ms N   Swipe duration in ms (default: 300)
  --dry-run         Show intended action without executing`;

export async function swipeCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  let distance = 0.5;
  let duration = 300;
  const positionals: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--distance' && i + 1 < args.length) {
      distance = parseFloat(args[i + 1]);
      i += 2;
    } else if (args[i] === '--duration-ms' && i + 1 < args.length) {
      duration = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === '--dry-run') {
      i++;
    } else {
      positionals.push(args[i]);
      i++;
    }
  }

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter swipe <up|down|left|right>');
  }

  const direction = positionals[0];
  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}. Use: up, down, left, right`);
  }

  const transport = resolveTransport();

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'swipe', direction, distance, duration, device: transport.deviceId, platform: transport.platform }));
    return;
  }

  // Get actual screen size instead of hardcoding
  const screen = transport.getScreenSize();
  const cx = screen.width / 2;
  const cy = screen.height / 2;

  let x1: number, y1: number, x2: number, y2: number;
  switch (direction) {
    case 'up':
      x1 = cx; y1 = cy + (screen.height * distance) / 2;
      x2 = cx; y2 = cy - (screen.height * distance) / 2;
      break;
    case 'down':
      x1 = cx; y1 = cy - (screen.height * distance) / 2;
      x2 = cx; y2 = cy + (screen.height * distance) / 2;
      break;
    case 'left':
      x1 = cx + (screen.width * distance) / 2; y1 = cy;
      x2 = cx - (screen.width * distance) / 2; y2 = cy;
      break;
    case 'right':
      x1 = cx - (screen.width * distance) / 2; y1 = cy;
      x2 = cx + (screen.width * distance) / 2; y2 = cy;
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}`);
  }

  transport.swipe(x1, y1, x2, y2, duration);
  console.log(`Swiped ${direction}`);
}
