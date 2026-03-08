/**
 * Input validation for agent-flutter.
 * Applied before command dispatch to catch bad input early.
 */
import { AgentFlutterError, ErrorCodes } from './errors.ts';

/** Validate element ref format: @e1, e1, @e42, etc. */
export function validateRef(ref: string): void {
  if (!/^@?e\d+$/.test(ref)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Invalid ref format: "${ref}"`,
      'Refs must match @eN (e.g. @e1, @e42). Run: agent-flutter snapshot',
    );
  }
}

/** Validate text argument: reject ASCII control chars except \n and \t. */
export function validateTextArg(text: string): void {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      'Text contains invalid control characters',
      'Remove ASCII control chars (allowed: \\n, \\t)',
    );
  }
}

/** Validate path argument: reject traversal, home dir, and non-tmp absolute paths. */
export function validatePathArg(path: string): void {
  if (path.includes('../')) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Path traversal detected: "${path}"`,
      'Paths must not contain ../',
    );
  }
  if (path.startsWith('~/')) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Home-relative path rejected: "${path}"`,
      'Use absolute paths under /tmp or relative paths',
    );
  }
  if (path.startsWith('/') && !path.startsWith('/tmp')) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Absolute path outside /tmp rejected: "${path}"`,
      'Absolute paths must be under /tmp',
    );
  }
}

/** Validate device ID: only alphanumeric, dash, dot, colon. */
export function validateDeviceId(deviceId: string): void {
  if (!/^[A-Za-z0-9.:-]+$/.test(deviceId)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Invalid device ID: "${deviceId}"`,
      'Device IDs must contain only alphanumeric, dash, dot, colon',
    );
  }
}
