/**
 * is exists|visible @ref — Assert element state.
 * Exit codes: 0=true, 1=false, 2=error
 */
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter is <condition> @ref

  is exists @ref   Exit 0 if element exists, exit 1 if not
  is visible @ref  Exit 0 if element is visible, exit 1 if not

Exit codes: 0=true, 1=false, 2=error`;

export async function isCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter is <exists|visible> @ref');
  }

  const condition = args[0];
  const refStr = args[1];

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const refKey = refStr.startsWith('@') ? refStr.slice(1) : refStr;
  const el = resolveRef(session, refStr);

  switch (condition) {
    case 'exists':
      if (el) {
        console.log('true');
      } else {
        console.log('false');
        process.exit(1);
      }
      break;
    case 'visible':
      if (el?.visible) {
        console.log('true');
      } else {
        console.log('false');
        process.exit(1);
      }
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown condition: ${condition}. Use: exists, visible`);
  }
}
