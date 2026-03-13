/**
 * Shared reconnection logic for Marionette commands.
 * Tries stored URI first, falls back to auto-detect if connection fails
 * (e.g., after app restart with new VM Service port).
 */
import { VmServiceClient } from './vm-client.ts';
import { detectVmServiceUriAsync } from './auto-detect.ts';
import { AgentFlutterError, ErrorCodes } from './errors.ts';
import type { SessionData } from './session.ts';

/**
 * Connect a VmServiceClient to the session's URI, falling back to auto-detect
 * if the stored URI is stale (e.g., after app restart with new VM Service port).
 *
 * Mutates session.vmServiceUri if auto-detect finds a new URI.
 * Returns the connected client.
 */
export async function connectWithReconnect(session: SessionData): Promise<VmServiceClient> {
  let client = new VmServiceClient();
  try {
    await client.connect(session.vmServiceUri);
    return client;
  } catch {
    // Stored URI failed — try auto-detect for fresh URI
    const newUri = await detectVmServiceUriAsync();
    if (newUri) {
      client = new VmServiceClient();
      await client.connect(newUri);
      session.vmServiceUri = newUri;
      return client;
    }
    throw new AgentFlutterError(
      ErrorCodes.NOT_CONNECTED,
      'Connection failed — app may have restarted',
      'Run: agent-flutter connect',
    );
  }
}
