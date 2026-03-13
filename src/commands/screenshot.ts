/**
 * screenshot [path] — Capture screenshot via Marionette or platform fallback.
 */
import { writeFileSync } from 'node:fs';
import { loadSession } from '../session.ts';
import { resolveTransport } from '../transport/index.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';
import { connectWithReconnect } from '../reconnect.ts';

const HELP = `Usage: agent-flutter screenshot [path]

  Capture screenshot. Default: screenshot.png
  Uses Marionette first, falls back to platform screencap.`;

export async function screenshotCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const outPath = args[0] ?? 'screenshot.png';

  const session = loadSession();

  // Try Marionette screenshot first if connected
  if (session) {
    let client;
    try {
      client = await connectWithReconnect(session);
      const buf = await client.takeScreenshot();
      if (buf) {
        writeFileSync(outPath, buf);
        console.log(`Screenshot saved: ${outPath}`);
        return;
      }
    } catch {
      // Marionette screenshot not available, fall back
    } finally {
      try { await client?.disconnect(); } catch { /* ignore */ }
    }
  }

  // Platform fallback (works without a session)
  const transport = resolveTransport();
  try {
    const raw = transport.screenshot();
    writeFileSync(outPath, raw);
    console.log(`Screenshot saved (via ${transport.platform}): ${outPath}`);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, 'Failed to capture screenshot via both Marionette and platform tools');
  }
}
