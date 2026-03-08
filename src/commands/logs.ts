/**
 * logs — Get Flutter app logs via Marionette.
 */
import { VmServiceClient } from '../vm-client.ts';
import { loadSession } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter logs

  Get Flutter app logs.`;

export async function logsCommand(args?: string[]): Promise<void> {
  if (args?.includes('--help') || args?.includes('-h')) {
    console.log(HELP);
    return;
  }

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const logs = await client.getLogs();
    if (logs.length === 0) {
      console.log('(no logs)');
    } else {
      for (const log of logs) console.log(log);
    }
  } finally {
    await client.disconnect();
  }
}
