/**
 * Format FlutterElements into agent-device/agent-browser style snapshot lines.
 * Format: @e1 [type] "label"  key=value_key
 */
import type { FlutterElement } from './vm-client.ts';

export type RefElement = FlutterElement & {
  ref: string;
};

/** Map Flutter widget types to lowercase display types.
 *  Covers all official Flutter interactive widgets (Material + Cupertino).
 *  See WIDGET_SUPPORT.md for full coverage matrix. */
const TYPE_MAP: Record<string, string> = {
  // --- Material Buttons ---
  ElevatedButton: 'button',
  FilledButton: 'button',
  OutlinedButton: 'button',
  TextButton: 'button',
  IconButton: 'button',
  FloatingActionButton: 'button',
  SegmentedButton: 'button',
  MaterialButton: 'button',

  // --- Material Text Input ---
  TextField: 'textfield',
  TextFormField: 'textfield',
  SearchBar: 'searchbar',
  SearchAnchor: 'searchbar',

  // --- Material Selection Controls ---
  Switch: 'switch',
  SwitchListTile: 'switch',
  Checkbox: 'checkbox',
  CheckboxListTile: 'checkbox',
  Radio: 'radio',
  RadioListTile: 'radio',
  Slider: 'slider',
  RangeSlider: 'slider',

  // --- Material Chips ---
  Chip: 'chip',
  ActionChip: 'chip',
  ChoiceChip: 'chip',
  FilterChip: 'chip',
  InputChip: 'chip',

  // --- Material Dropdowns & Menus ---
  DropdownButton: 'dropdown',
  DropdownButtonFormField: 'dropdown',
  DropdownMenu: 'dropdown',
  PopupMenuButton: 'menu',
  MenuAnchor: 'menu',

  // --- Material Pickers ---
  DatePickerDialog: 'picker',
  TimePickerDialog: 'picker',

  // --- Material Dialogs & Sheets ---
  AlertDialog: 'dialog',
  SimpleDialog: 'dialog',
  BottomSheet: 'dialog',
  MaterialBanner: 'banner',
  SnackBar: 'snackbar',
  Tooltip: 'tooltip',

  // --- Material Navigation ---
  AppBar: 'appbar',
  SliverAppBar: 'appbar',
  BottomAppBar: 'appbar',
  BottomNavigationBar: 'navbar',
  NavigationBar: 'navbar',
  NavigationRail: 'navbar',
  NavigationDrawer: 'drawer',
  Drawer: 'drawer',
  TabBar: 'tabbar',
  Tab: 'tab',

  // --- Material Lists & Content ---
  ListTile: 'tile',
  ExpansionTile: 'tile',
  Card: 'card',
  DataTable: 'table',
  Stepper: 'stepper',
  ExpansionPanelList: 'panel',

  // --- Material Touch & Gesture ---
  GestureDetector: 'gesture',
  InkWell: 'gesture',
  InkResponse: 'gesture',
  Dismissible: 'gesture',
  Draggable: 'gesture',
  LongPressDraggable: 'gesture',

  // --- Cupertino Buttons ---
  CupertinoButton: 'button',

  // --- Cupertino Input ---
  CupertinoTextField: 'textfield',
  CupertinoSearchTextField: 'searchbar',
  CupertinoTextFormFieldRow: 'textfield',

  // --- Cupertino Selection Controls ---
  CupertinoSwitch: 'switch',
  CupertinoSlider: 'slider',
  CupertinoCheckbox: 'checkbox',
  CupertinoRadio: 'radio',
  CupertinoSegmentedControl: 'segmented',
  CupertinoSlidingSegmentedControl: 'segmented',

  // --- Cupertino Pickers ---
  CupertinoPicker: 'picker',
  CupertinoDatePicker: 'picker',
  CupertinoTimerPicker: 'picker',

  // --- Cupertino Dialogs ---
  CupertinoAlertDialog: 'dialog',
  CupertinoActionSheet: 'dialog',
  CupertinoContextMenu: 'menu',

  // --- Cupertino Navigation ---
  CupertinoNavigationBar: 'appbar',
  CupertinoTabBar: 'tabbar',
  CupertinoListTile: 'tile',

  // --- Scrolling & Layout ---
  ListView: 'list',
  GridView: 'grid',
  PageView: 'pageview',
  ReorderableListView: 'list',
  RefreshIndicator: 'refresh',

  // --- Display (non-interactive) ---
  Text: 'label',
  RichText: 'label',
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
  'chip', 'searchbar', 'segmented', 'picker', 'dialog', 'stepper', 'snackbar',
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
