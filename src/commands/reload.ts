/**
 * reload — Hot reload the Flutter app.
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter reload

  Hot reload the Flutter app.`;

export async function reloadCommand(args?: string[]): Promise<void> {
  if (args?.includes('--help') || args?.includes('-h')) {
    console.log(HELP);
    return;
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const success = await client.hotReload();
    console.log(success ? 'Hot reload successful' : 'Hot reload failed');
  } finally {
    await client.disconnect();
  }
}
