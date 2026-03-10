#!/usr/bin/env node
/**
 * agent-flutter CLI — Control Flutter apps via Marionette.
 * Usage: agent-flutter [--device <id>] [--json] [--no-json] <command> [args...]
 */

import { connectCommand } from './commands/connect.ts';
import { disconnectCommand } from './commands/disconnect.ts';
import { statusCommand } from './commands/status.ts';
import { snapshotCommand } from './commands/snapshot.ts';
import { AgentFlutterError, ErrorCodes, formatError } from './errors.ts';
import { getSchema } from './command-schema.ts';
import { validateRef, validateTextArg, validatePathArg, validateDeviceId } from './validate.ts';

const HELP = `agent-flutter — Control Flutter apps via Marionette

Usage: agent-flutter [--device <id>] [--json] [--no-json] <command> [args...]

Commands:
  connect [uri]            Connect to Flutter VM Service (auto-detect if no URI)
  disconnect               Disconnect from Flutter app
  status                   Show connection state
  snapshot [-i] [-c] [-d N] [--json] [--diff]  Widget tree with @refs
  press @ref [--adb]       Tap element by ref (or via ADB with --adb)
  fill @ref "text"         Enter text by ref
  get text|type|key @ref   Read element property
  find <locator> <value> [action] [arg]   Find + optional action
  wait exists|visible|text|gone <target> [--timeout-ms N] [--interval-ms N]
  wait <ms>                Simple delay
  is exists|visible @ref   Assert element state (exit 0=true, 1=false)
  scroll @ref|up|down      Scroll element or page
  swipe up|down|left|right Swipe gesture via ADB
  back                     Android back button
  home                     Android home button
  screenshot [path]        Capture screenshot
  reload                   Hot reload the Flutter app
  logs                     Get Flutter app logs
  press <x> <y>            Tap at coordinates via ADB
  dismiss [--check]        Dismiss Android system dialog via ADB
  schema [cmd]             Show command schema (JSON)
  doctor                   Check prerequisites and diagnose issues
  diff snapshot            Show changes since last snapshot

Global flags:
  --device <id>            ADB device ID (default: emulator-5554)
  --json                   Machine-readable JSON output on all commands
  --no-json                Force human-readable output (overrides env/TTY)
  --dry-run                Resolve targets without executing (mutating commands)
  --help                   Show this help
`;

export type GlobalFlags = {
  deviceId: string;
  json: boolean;
  noJson: boolean;
  dryRun: boolean;
};

function parseGlobalFlags(args: string[]): { flags: GlobalFlags; rest: string[] } {
  const flags: GlobalFlags = { deviceId: '', json: false, noJson: false, dryRun: false };
  const rest: string[] = [];
  let i = 0;
  while (i < args.length) {
    if ((args[i] === '--device' || args[i] === '--serial') && i + 1 < args.length) {
      flags.deviceId = args[i + 1];
      i += 2;
    } else if (args[i] === '--json') {
      flags.json = true;
      i++;
    } else if (args[i] === '--no-json') {
      flags.noJson = true;
      i++;
    } else if (args[i] === '--dry-run') {
      flags.dryRun = true;
      i++;
    } else {
      rest.push(args[i]);
      i++;
    }
  }
  return { flags, rest };
}

/** Resolve effective JSON mode: flag > env > TTY detection */
function resolveJsonMode(flags: GlobalFlags): boolean {
  // Explicit flags take highest precedence
  if (flags.noJson) return false;
  if (flags.json) return true;
  // Env var
  if (process.env.AGENT_FLUTTER_JSON === '1') return true;
  // TTY detection: non-TTY defaults to JSON
  if (!process.stdout.isTTY) return true;
  return false;
}

/** Resolve device ID: flag > env > default */
function resolveDeviceId(flags: GlobalFlags): string {
  if (flags.deviceId) return flags.deviceId;
  if (process.env.AGENT_FLUTTER_DEVICE) return process.env.AGENT_FLUTTER_DEVICE;
  return 'emulator-5554';
}

/** Validate inputs before dispatch based on command type */
function validateInputs(command: string, cmdArgs: string[]): void {
  // Validate device ID (already resolved and stored in env)
  const deviceId = process.env.AGENT_FLUTTER_DEVICE;
  if (deviceId) validateDeviceId(deviceId);

  // Commands that take a ref as arg
  if (command === 'press') {
    // Skip ref validation when first arg is a number (coordinate mode)
    if (cmdArgs[0] && !cmdArgs[0].startsWith('-') && !/^\d+$/.test(cmdArgs[0])) validateRef(cmdArgs[0]);
  }
  if (command === 'get') {
    // get <property> @ref — ref is second arg
    if (cmdArgs[1] && !cmdArgs[1].startsWith('-')) validateRef(cmdArgs[1]);
  }
  if (command === 'is') {
    // is <condition> @ref — ref is second arg
    if (cmdArgs[1] && !cmdArgs[1].startsWith('-')) validateRef(cmdArgs[1]);
  }

  // fill: validate ref (arg 0) and text (arg 1)
  if (command === 'fill') {
    if (cmdArgs[0] && !cmdArgs[0].startsWith('-')) validateRef(cmdArgs[0]);
    if (cmdArgs[1] && !cmdArgs[1].startsWith('-')) validateTextArg(cmdArgs[1]);
  }

  // scroll: validate ref if starts with @
  if (command === 'scroll' && cmdArgs[0]?.startsWith('@')) {
    validateRef(cmdArgs[0]);
  }

  // wait: validate ref for exists/visible/gone
  if (command === 'wait' && ['exists', 'visible', 'gone'].includes(cmdArgs[0])) {
    if (cmdArgs[1] && !cmdArgs[1].startsWith('-')) validateRef(cmdArgs[1]);
  }

  // screenshot: validate path
  if (command === 'screenshot' && cmdArgs[0] && !cmdArgs[0].startsWith('-')) {
    validatePathArg(cmdArgs[0]);
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { flags, rest } = parseGlobalFlags(rawArgs);

  // Resolve effective modes
  const jsonMode = resolveJsonMode(flags);
  const deviceId = resolveDeviceId(flags);

  // Store global flags for all commands
  process.env.AGENT_FLUTTER_DEVICE = deviceId;
  if (jsonMode) process.env.AGENT_FLUTTER_JSON = '1';
  else delete process.env.AGENT_FLUTTER_JSON;
  if (flags.dryRun) process.env.AGENT_FLUTTER_DRY_RUN = '1';

  // Handle --help and --help --json
  const hasHelp = rawArgs.includes('--help') || rawArgs.includes('-h');
  const hasCommand = rest.some((a) => !a.startsWith('-'));

  if (rawArgs.length === 0 || (hasHelp && !hasCommand)) {
    if (jsonMode) {
      console.log(JSON.stringify(getSchema()));
    } else {
      console.log(HELP.trim());
    }
    return;
  }

  if (rest.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify(getSchema()));
    } else {
      console.log(HELP.trim());
    }
    return;
  }

  const command = rest[0];
  const cmdArgs = rest.slice(1);

  try {
    // Schema command
    if (command === 'schema') {
      const subCmd = cmdArgs.find((a) => !a.startsWith('-'));
      const result = getSchema(subCmd);
      if (subCmd && !result) {
        throw new Error(`Unknown command: ${subCmd}`);
      }
      console.log(JSON.stringify(result, null, jsonMode ? undefined : 2));
      return;
    }

    // Skip validation for --help requests
    if (!cmdArgs.includes('--help') && !cmdArgs.includes('-h')) {
      validateInputs(command, cmdArgs);
    }

    switch (command) {
      case 'connect':
        await connectCommand(cmdArgs);
        break;
      case 'disconnect':
        await disconnectCommand();
        break;
      case 'status':
        statusCommand();
        break;
      case 'snapshot':
        await snapshotCommand(cmdArgs);
        break;
      case 'press':
        await (await import('./commands/press.ts')).pressCommand(cmdArgs);
        break;
      case 'fill':
        await (await import('./commands/fill.ts')).fillCommand(cmdArgs);
        break;
      case 'get':
        (await import('./commands/get.ts')).getCommand(cmdArgs);
        break;
      case 'find':
        await (await import('./commands/find.ts')).findCommand(cmdArgs);
        break;
      case 'wait':
        await (await import('./commands/wait.ts')).waitCommand(cmdArgs);
        break;
      case 'is':
        await (await import('./commands/is.ts')).isCommand(cmdArgs);
        break;
      case 'scroll':
        await (await import('./commands/scroll.ts')).scrollCommand(cmdArgs);
        break;
      case 'swipe':
        await (await import('./commands/swipe.ts')).swipeCommand(cmdArgs);
        break;
      case 'back':
        await (await import('./commands/back.ts')).backCommand(cmdArgs);
        break;
      case 'home':
        await (await import('./commands/home.ts')).homeCommand(cmdArgs);
        break;
      case 'screenshot':
        await (await import('./commands/screenshot.ts')).screenshotCommand(cmdArgs);
        break;
      case 'reload':
        await (await import('./commands/reload.ts')).reloadCommand(cmdArgs);
        break;
      case 'logs':
        await (await import('./commands/logs.ts')).logsCommand(cmdArgs);
        break;
      case 'dismiss':
        await (await import('./commands/dismiss.ts')).dismissCommand(cmdArgs);
        break;
      case 'doctor':
        await (await import('./commands/doctor.ts')).doctorCommand(cmdArgs);
        break;
      case 'diff':
        if (cmdArgs[0] === 'snapshot') {
          await snapshotCommand(['--diff']);
        } else {
          console.error(`Unknown diff target: ${cmdArgs[0]}`);
          process.exit(2);
        }
        break;
      default: {
        // Suggest renamed/merged commands so agents auto-recover
        const suggestions: Record<string, string> = {
          tap: 'Use "press <x> <y>" for coordinate tap, or "press @ref --adb" for ADB ref tap',
        };
        const hint = suggestions[command] ?? "Run 'agent-flutter --help' for usage";
        const unknownErr = formatError(
          new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown command: ${command}`, hint),
          jsonMode,
        );
        if (jsonMode) console.log(unknownErr); else console.error(unknownErr);
        process.exit(2);
      }
    }
  } catch (err) {
    const errOutput = formatError(err, jsonMode);
    // JSON errors go to stdout for machine consumption; human errors to stderr
    if (jsonMode) {
      console.log(errOutput);
    } else {
      console.error(errOutput);
    }
    process.exit(2);
  }
}

main();
