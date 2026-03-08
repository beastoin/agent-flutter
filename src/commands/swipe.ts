/**
 * swipe up|down|left|right [--distance 0.5] [--duration-ms 300] [--dry-run] — Swipe gesture via ADB.
 */
import { execSync } from 'node:child_process';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter swipe <direction> [options]

  swipe up|down|left|right

Options:
  --distance N      Fraction of screen to swipe (default: 0.5)
  --duration-ms N   Swipe duration in ms (default: 300)
  --dry-run         Show intended action without executing`;

const CX = 540;
const CY = 960;
const SCREEN_W = 1080;
const SCREEN_H = 1920;

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
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}. Use: up, down, left, right`);
  }

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'swipe', direction, distance, duration, device: deviceId }));
    return;
  }

  let x1: number, y1: number, x2: number, y2: number;
  switch (direction) {
    case 'up':
      x1 = CX; y1 = CY + (SCREEN_H * distance) / 2;
      x2 = CX; y2 = CY - (SCREEN_H * distance) / 2;
      break;
    case 'down':
      x1 = CX; y1 = CY - (SCREEN_H * distance) / 2;
      x2 = CX; y2 = CY + (SCREEN_H * distance) / 2;
      break;
    case 'left':
      x1 = CX + (SCREEN_W * distance) / 2; y1 = CY;
      x2 = CX - (SCREEN_W * distance) / 2; y2 = CY;
      break;
    case 'right':
      x1 = CX - (SCREEN_W * distance) / 2; y1 = CY;
      x2 = CX + (SCREEN_W * distance) / 2; y2 = CY;
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}`);
  }

  execSync(`adb -s ${deviceId} shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${duration}`, {
    timeout: 5000,
  });
  console.log(`Swiped ${direction}`);
}
