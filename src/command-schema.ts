/**
 * Central command schema definitions for agent-flutter.
 * Source of truth for schema output and help metadata.
 */

export type SchemaArg = {
  name: string;
  required: boolean;
  description: string;
};

export type SchemaFlag = {
  name: string;
  description: string;
  default?: string;
};

export type CommandSchema = {
  name: string;
  description: string;
  args: SchemaArg[];
  flags: SchemaFlag[];
  exitCodes: Record<string, string>;
  examples: string[];
};

export const COMMAND_SCHEMAS: CommandSchema[] = [
  {
    name: 'connect',
    description: 'Connect to Flutter VM Service',
    args: [{ name: 'uri', required: false, description: 'VM Service WebSocket URI (auto-detect if omitted)' }],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter connect', 'agent-flutter connect ws://127.0.0.1:38047/abc=/ws'],
  },
  {
    name: 'disconnect',
    description: 'Disconnect from Flutter app',
    args: [],
    flags: [],
    exitCodes: { '0': 'success' },
    examples: ['agent-flutter disconnect'],
  },
  {
    name: 'status',
    description: 'Show connection state',
    args: [],
    flags: [],
    exitCodes: { '0': 'success' },
    examples: ['agent-flutter status'],
  },
  {
    name: 'snapshot',
    description: 'Capture widget tree with @refs',
    args: [],
    flags: [
      { name: '-i, --interactive', description: 'Show only interactive elements' },
      { name: '-c, --compact', description: 'Compact one-line format' },
      { name: '-d N, --depth N', description: 'Limit tree depth' },
      { name: '--diff', description: 'Show changes since last snapshot' },
    ],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter snapshot', 'agent-flutter snapshot -i --json', 'agent-flutter snapshot --diff'],
  },
  {
    name: 'press',
    description: 'Tap element by ref',
    args: [{ name: 'ref', required: true, description: 'Element reference (e.g. @e3)' }],
    flags: [{ name: '--dry-run', description: 'Resolve target without executing' }],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter press @e3'],
  },
  {
    name: 'fill',
    description: 'Enter text into element by ref',
    args: [
      { name: 'ref', required: true, description: 'Element reference (e.g. @e5)' },
      { name: 'text', required: true, description: 'Text to enter' },
    ],
    flags: [{ name: '--dry-run', description: 'Resolve target without executing' }],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter fill @e5 "hello world"'],
  },
  {
    name: 'get',
    description: 'Read element property',
    args: [
      { name: 'property', required: true, description: 'Property to read: text, type, key, attrs' },
      { name: 'ref', required: true, description: 'Element reference (e.g. @e3)' },
    ],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter get text @e3', 'agent-flutter get attrs @e3'],
  },
  {
    name: 'find',
    description: 'Find element and optionally perform action',
    args: [
      { name: 'locator', required: true, description: 'Locator type: key, text, type' },
      { name: 'value', required: true, description: 'Value to search for' },
      { name: 'action', required: false, description: 'Action: press, fill, get' },
      { name: 'actionArg', required: false, description: 'Argument for action (e.g. text for fill)' },
    ],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter find key submit_btn press', 'agent-flutter find text "Submit" press'],
  },
  {
    name: 'wait',
    description: 'Wait for condition or delay',
    args: [
      { name: 'condition', required: true, description: 'Condition: exists, visible, text, gone, or milliseconds' },
      { name: 'target', required: false, description: 'Target ref or text string' },
    ],
    flags: [
      { name: '--timeout-ms N', description: 'Maximum wait time', default: '10000' },
      { name: '--interval-ms N', description: 'Poll interval', default: '250' },
    ],
    exitCodes: { '0': 'success', '2': 'error/timeout' },
    examples: ['agent-flutter wait exists @e3', 'agent-flutter wait text "Welcome"', 'agent-flutter wait 500'],
  },
  {
    name: 'is',
    description: 'Assert element state',
    args: [
      { name: 'condition', required: true, description: 'Condition: exists, visible' },
      { name: 'ref', required: true, description: 'Element reference (e.g. @e3)' },
    ],
    flags: [],
    exitCodes: { '0': 'true', '1': 'false', '2': 'error' },
    examples: ['agent-flutter is exists @e3', 'agent-flutter is visible @e5'],
  },
  {
    name: 'scroll',
    description: 'Scroll element into view or scroll page',
    args: [{ name: 'target', required: true, description: '@ref to scroll into view, or direction: up, down, left, right' }],
    flags: [{ name: '--dry-run', description: 'Resolve target without executing' }],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter scroll @e3', 'agent-flutter scroll down'],
  },
  {
    name: 'swipe',
    description: 'Swipe gesture via ADB',
    args: [{ name: 'direction', required: true, description: 'Direction: up, down, left, right' }],
    flags: [
      { name: '--distance N', description: 'Fraction of screen to swipe', default: '0.5' },
      { name: '--duration-ms N', description: 'Swipe duration', default: '300' },
      { name: '--dry-run', description: 'Show intended action without executing' },
    ],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter swipe up', 'agent-flutter swipe left --distance 0.7'],
  },
  {
    name: 'back',
    description: 'Android back button via ADB',
    args: [],
    flags: [{ name: '--dry-run', description: 'Show intended action without executing' }],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter back'],
  },
  {
    name: 'home',
    description: 'Android home button via ADB',
    args: [],
    flags: [{ name: '--dry-run', description: 'Show intended action without executing' }],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter home'],
  },
  {
    name: 'screenshot',
    description: 'Capture screenshot',
    args: [{ name: 'path', required: false, description: 'Output file path (default: screenshot.png)' }],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter screenshot', 'agent-flutter screenshot /tmp/screen.png'],
  },
  {
    name: 'reload',
    description: 'Hot reload the Flutter app',
    args: [],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter reload'],
  },
  {
    name: 'logs',
    description: 'Get Flutter app logs',
    args: [],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter logs'],
  },
  {
    name: 'tap',
    description: 'Tap at coordinates via ADB (bypasses Marionette)',
    args: [
      { name: 'x', required: true, description: 'X coordinate (physical pixels) or @ref' },
      { name: 'y', required: false, description: 'Y coordinate (physical pixels, required if x is not a ref)' },
    ],
    flags: [
      { name: '--dry-run', description: 'Show coordinates without tapping' },
    ],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter tap 200 400', 'agent-flutter tap @e3'],
  },
  {
    name: 'dismiss',
    description: 'Dismiss Android system dialog via ADB',
    args: [],
    flags: [
      { name: '--check', description: 'Check if dialog is present without dismissing (exit 0=yes, 1=no)' },
    ],
    exitCodes: { '0': 'dismissed/present', '1': 'no dialog', '2': 'error' },
    examples: ['agent-flutter dismiss', 'agent-flutter dismiss --check'],
  },
  {
    name: 'doctor',
    description: 'Check prerequisites: ADB, device, Flutter app, Marionette, session',
    args: [],
    flags: [],
    exitCodes: { '0': 'all checks pass', '2': 'one or more checks failed' },
    examples: ['agent-flutter doctor', 'agent-flutter --json doctor'],
  },
  {
    name: 'schema',
    description: 'Show command schema for agent discovery',
    args: [{ name: 'command', required: false, description: 'Specific command to describe' }],
    flags: [],
    exitCodes: { '0': 'success', '2': 'error' },
    examples: ['agent-flutter schema', 'agent-flutter schema press'],
  },
];

export function getSchema(commandName?: string): CommandSchema[] | CommandSchema | null {
  if (!commandName) return COMMAND_SCHEMAS;
  return COMMAND_SCHEMAS.find((s) => s.name === commandName) ?? null;
}
