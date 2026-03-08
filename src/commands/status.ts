/**
 * status — Show connection state.
 */
import { loadSession } from '../session.ts';

export function statusCommand(): void {
  const session = loadSession();
  const isJson = process.env.AGENT_FLUTTER_JSON === '1';

  if (!session) {
    if (isJson) {
      console.log(JSON.stringify({ connected: false }));
    } else {
      console.log('Not connected');
    }
    return;
  }

  if (isJson) {
    console.log(JSON.stringify({
      connected: true,
      vmServiceUri: session.vmServiceUri,
      isolateId: session.isolateId,
      connectedAt: session.connectedAt,
      refs: Object.keys(session.refs).length,
    }));
  } else {
    console.log(`Connected to: ${session.vmServiceUri}`);
    console.log(`Isolate: ${session.isolateId}`);
    console.log(`Connected at: ${session.connectedAt}`);
    console.log(`Refs: ${Object.keys(session.refs).length}`);
  }
}
