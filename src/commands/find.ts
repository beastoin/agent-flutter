/**
 * find <locator> <value> [action] [arg] — Find element + optional chained action.
 * Locators: key, text, type
 * Actions: press, fill, get (text|type|key|attrs)
 */
import { loadSession, saveSession, resolveRef, updateRefs } from '../session.ts';
import { formatSnapshot, normalizeType } from '../snapshot-fmt.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';
import { connectWithReconnect } from '../reconnect.ts';
import type { RefElement } from '../snapshot-fmt.ts';
import type { FlutterElement } from '../vm-client.ts';

const HELP = `Usage: agent-flutter find <locator> <value> [action] [arg]

  Locators: key, text, type
  Actions: press, fill "text", get text|type|key|attrs
  Options: --index N  Select Nth match (0-based, default 0)`;

function findAllMatches(elements: FlutterElement[], locator: string, value: string): FlutterElement[] {
  switch (locator) {
    case 'key':
      return elements.filter((el) => el.key === value);
    case 'text':
      return elements.filter((el) => el.text?.includes(value));
    case 'type':
      return elements.filter((el) => el.type === value || normalizeType(el.type) === value);
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown locator: ${locator}. Use: key, text, type`);
  }
}

function findElement(elements: FlutterElement[], locator: string, value: string, index = 0): FlutterElement | null {
  const matches = findAllMatches(elements, locator, value);
  return matches[index] ?? null;
}

export async function findCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter find <key|text|type> <value> [press|fill "text"|get text]');
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  // Parse --index N from args
  let matchIndex = 0;
  const filteredArgs = [...args];
  const indexFlagPos = filteredArgs.indexOf('--index');
  if (indexFlagPos !== -1 && indexFlagPos + 1 < filteredArgs.length) {
    matchIndex = parseInt(filteredArgs[indexFlagPos + 1], 10) || 0;
    filteredArgs.splice(indexFlagPos, 2);
  }

  const locator = filteredArgs[0];
  const value = filteredArgs[1];
  const action = filteredArgs[2];
  const actionArg = filteredArgs[3];

  const client = await connectWithReconnect(session);
  try {
    const elements = await client.getInteractiveElements();
    const { refs } = formatSnapshot(elements);
    updateRefs(session, refs);
    session.lastSnapshot = elements;
    saveSession(session);

    const found = findElement(elements, locator, value, matchIndex);

    // If element not found locally but action is press/fill and locator is text/key,
    // use Marionette's own matcher directly (handles button labels not in snapshot)
    if (!found) {
      if (action === 'press' && locator === 'text') {
        await client.tap({ type: 'Text', text: value });
        console.log(`Pressed (by text "${value}")`);
        return;
      }
      if (action === 'press' && locator === 'key') {
        await client.tap({ type: 'Key', keyValue: value });
        console.log(`Pressed (by key "${value}")`);
        return;
      }
      if (action === 'fill' && actionArg) {
        if (locator === 'key') {
          await client.enterText({ type: 'Key', keyValue: value }, actionArg);
        } else if (locator === 'text') {
          await client.enterText({ type: 'Text', text: value }, actionArg);
        }
        console.log(`Filled (by ${locator} "${value}") with "${actionArg}"`);
        return;
      }
      throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `No element found with ${locator}="${value}"`);
    }

    // Find its ref (match by index to stay consistent)
    const matchingRefs = refs.filter((r) =>
      (locator === 'key' && r.key === value) ||
      (locator === 'text' && r.text?.includes(value)) ||
      (locator === 'type' && (r.type === value || normalizeType(r.type) === value)),
    );
    const refEl = matchingRefs[matchIndex];

    if (!action) {
      console.log(`Found: @${refEl?.ref} [${normalizeType(found.type)}] "${found.text ?? ''}"${found.key ? `  key=${found.key}` : ''}`);
      return;
    }

    switch (action) {
      case 'press': {
        if (found.key) {
          await client.tap({ type: 'Key', keyValue: found.key });
        } else if (found.text) {
          await client.tap({ type: 'Text', text: found.text });
        } else {
          const cx = found.bounds.x + found.bounds.width / 2;
          const cy = found.bounds.y + found.bounds.height / 2;
          await client.tap({ type: 'Coordinates', x: cx, y: cy });
        }
        console.log(`Pressed @${refEl?.ref}`);
        break;
      }
      case 'fill': {
        if (!actionArg) throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter find ... fill "text"');
        if (found.key) {
          await client.enterText({ type: 'Key', keyValue: found.key }, actionArg);
        } else {
          const cx = found.bounds.x + found.bounds.width / 2;
          const cy = found.bounds.y + found.bounds.height / 2;
          await client.enterText({ type: 'Coordinates', x: cx, y: cy }, actionArg);
        }
        console.log(`Filled @${refEl?.ref} with "${actionArg}"`);
        break;
      }
      case 'get': {
        const prop = actionArg ?? 'text';
        switch (prop) {
          case 'text':
            console.log(found.text ?? '');
            break;
          case 'type':
            console.log(normalizeType(found.type));
            break;
          case 'key':
            console.log(found.key ?? '');
            break;
          case 'attrs':
            console.log(JSON.stringify({
              ref: refEl?.ref,
              type: normalizeType(found.type),
              flutterType: found.type,
              text: found.text ?? null,
              key: found.key ?? null,
              visible: found.visible,
              bounds: found.bounds,
            }, null, 2));
            break;
          default:
            throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown property: ${prop}`);
        }
        break;
      }
      default:
        throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown action: ${action}. Use: press, fill, get`);
    }
  } finally {
    await client.disconnect();
  }
}
