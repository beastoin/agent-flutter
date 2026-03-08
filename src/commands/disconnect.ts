/**
 * disconnect — Clear session and disconnect.
 */
import { clearSession } from '../session.ts';

export async function disconnectCommand(): Promise<void> {
  clearSession();
  console.log('Disconnected');
}
