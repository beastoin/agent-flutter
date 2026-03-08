/**
 * Structured error codes for agent-flutter.
 * Exit codes: 0=success, 1=assertion false, 2=error.
 */
import { randomUUID } from 'node:crypto';

export const ErrorCodes = {
  INVALID_ARGS: 'INVALID_ARGS',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_CONNECTED: 'NOT_CONNECTED',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  COMMAND_FAILED: 'COMMAND_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AgentFlutterError extends Error {
  code: ErrorCode;
  hint?: string;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.name = 'AgentFlutterError';
  }
}

function generateDiagnosticId(): string {
  return randomUUID().slice(0, 8);
}

export function formatError(err: unknown, json: boolean): string {
  const diagnosticId = generateDiagnosticId();

  if (err instanceof AgentFlutterError) {
    if (json) {
      return JSON.stringify({ error: { code: err.code, message: err.message, hint: err.hint, diagnosticId } });
    }
    return `Error [${err.code}:${diagnosticId}]: ${err.message}${err.hint ? `\nHint: ${err.hint}` : ''}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (json) {
    return JSON.stringify({ error: { code: 'COMMAND_FAILED', message: msg, diagnosticId } });
  }
  return `Error [COMMAND_FAILED:${diagnosticId}]: ${msg}`;
}
