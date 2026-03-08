/**
 * Format FlutterElements into agent-device/agent-browser style snapshot lines.
 * Format: @e1 [type] "label"  key=value_key
 */
import type { FlutterElement } from './vm-client.ts';

export type RefElement = FlutterElement & {
  ref: string;
};

/** Map Flutter widget types to lowercase display types */
const TYPE_MAP: Record<string, string> = {
  ElevatedButton: 'button',
  FilledButton: 'button',
  OutlinedButton: 'button',
  TextButton: 'button',
  IconButton: 'button',
  FloatingActionButton: 'button',
  Text: 'label',
  RichText: 'label',
  TextField: 'textfield',
  TextFormField: 'textfield',
  Switch: 'switch',
  SwitchListTile: 'switch',
  Checkbox: 'checkbox',
  CheckboxListTile: 'checkbox',
  Radio: 'radio',
  RadioListTile: 'radio',
  Slider: 'slider',
  DropdownButton: 'dropdown',
  PopupMenuButton: 'menu',
  GestureDetector: 'gesture',
  InkWell: 'gesture',
  ListTile: 'tile',
  Card: 'card',
  AppBar: 'appbar',
  BottomNavigationBar: 'navbar',
  TabBar: 'tabbar',
  Tab: 'tab',
  Image: 'image',
  Icon: 'icon',
  Container: 'container',
  Column: 'column',
  Row: 'row',
  Stack: 'stack',
  Scaffold: 'scaffold',
};

export function normalizeType(flutterType: string): string {
  return TYPE_MAP[flutterType] ?? flutterType.toLowerCase();
}

/** Get the best display label for an element */
export function getLabel(el: FlutterElement): string {
  // For text elements, use the text content
  if (el.text) return el.text;
  // No label available
  return '';
}

/** Format a single element as a snapshot line */
export function formatSnapshotLine(el: RefElement): string {
  const type = normalizeType(el.type);
  const label = getLabel(el);
  const labelPart = label ? ` "${label}"` : '';
  const keyPart = el.key ? `  key=${el.key}` : '';
  return `@${el.ref} [${type}]${labelPart}${keyPart}`;
}

/** Assign refs and format all elements as snapshot text */
export function formatSnapshot(elements: FlutterElement[]): { lines: string[]; refs: RefElement[] } {
  const refs: RefElement[] = elements.map((el, i) => ({
    ...el,
    ref: `e${i + 1}`,
  }));

  const lines = refs.map((el) => formatSnapshotLine(el));
  return { lines, refs };
}

/** Interactive element types that agents can interact with */
const INTERACTIVE_TYPES = new Set([
  'button', 'textfield', 'switch', 'checkbox', 'radio', 'slider', 'dropdown', 'menu', 'gesture', 'tab',
]);

/** Filter to only interactive elements */
export function filterInteractive(elements: FlutterElement[]): FlutterElement[] {
  return elements.filter((el) => INTERACTIVE_TYPES.has(normalizeType(el.type)));
}

/** Format elements as JSON output */
export function formatSnapshotJson(elements: FlutterElement[]): object[] {
  return elements.map((el, i) => ({
    ref: `e${i + 1}`,
    type: normalizeType(el.type),
    label: getLabel(el),
    key: el.key ?? null,
    visible: el.visible,
    bounds: el.bounds,
    flutterType: el.type,
  }));
}
