/**
 * get text|type|key|attrs @ref — Read element property.
 */
import { loadSession, resolveRef } from '../session.ts';
import { normalizeType } from '../snapshot-fmt.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter get <property> @ref

  Properties: text, type, key, attrs
  @ref  Element reference from snapshot (e.g. @e3)`;

export function getCommand(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter get text|type|key|attrs @ref');
  }

  const prop = args[0];
  const refStr = args[1];

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, refStr);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${refStr}`, 'Run: agent-flutter snapshot');

  switch (prop) {
    case 'text':
      console.log(el.text ?? '');
      break;
    case 'type':
      console.log(normalizeType(el.type));
      break;
    case 'key':
      console.log(el.key ?? '');
      break;
    case 'attrs':
      console.log(JSON.stringify({
        ref: el.ref,
        type: normalizeType(el.type),
        flutterType: el.type,
        text: el.text ?? null,
        key: el.key ?? null,
        visible: el.visible,
        bounds: el.bounds,
      }, null, 2));
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown property: ${prop}. Use: text, type, key, attrs`);
  }
}
