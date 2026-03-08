import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeType, getLabel, formatSnapshotLine, formatSnapshot, formatSnapshotJson } from '../src/snapshot-fmt.ts';
import type { RefElement } from '../src/snapshot-fmt.ts';
import type { FlutterElement } from '../src/vm-client.ts';

test('normalizeType: maps Flutter types to lowercase', () => {
  assert.equal(normalizeType('ElevatedButton'), 'button');
  assert.equal(normalizeType('FilledButton'), 'button');
  assert.equal(normalizeType('TextField'), 'textfield');
  assert.equal(normalizeType('SwitchListTile'), 'switch');
  assert.equal(normalizeType('Text'), 'label');
  assert.equal(normalizeType('Checkbox'), 'checkbox');
});

test('normalizeType: unknown types lowercase', () => {
  assert.equal(normalizeType('CustomWidget'), 'customwidget');
});

test('getLabel: returns text', () => {
  const el: FlutterElement = { type: 'Text', text: 'Hello', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } };
  assert.equal(getLabel(el), 'Hello');
});

test('getLabel: returns empty for no text', () => {
  const el: FlutterElement = { type: 'ElevatedButton', visible: true, bounds: { x: 0, y: 0, width: 100, height: 48 } };
  assert.equal(getLabel(el), '');
});

test('formatSnapshotLine: basic text element', () => {
  const el: RefElement = { ref: 'e1', type: 'Text', text: 'Hello', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } };
  assert.equal(formatSnapshotLine(el), '@e1 [label] "Hello"');
});

test('formatSnapshotLine: button with key', () => {
  const el: RefElement = { ref: 'e3', type: 'FilledButton', key: 'submit_btn', visible: true, bounds: { x: 0, y: 0, width: 100, height: 48 } };
  assert.equal(formatSnapshotLine(el), '@e3 [button]  key=submit_btn');
});

test('formatSnapshotLine: button with text and key', () => {
  const el: RefElement = { ref: 'e2', type: 'ElevatedButton', text: 'Submit', key: 'submit', visible: true, bounds: { x: 0, y: 0, width: 100, height: 48 } };
  assert.equal(formatSnapshotLine(el), '@e2 [button] "Submit"  key=submit');
});

test('formatSnapshot: assigns sequential refs', () => {
  const elements: FlutterElement[] = [
    { type: 'Text', text: 'A', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } },
    { type: 'ElevatedButton', text: 'B', key: 'btn', visible: true, bounds: { x: 0, y: 20, width: 100, height: 48 } },
  ];
  const { lines, refs } = formatSnapshot(elements);
  assert.equal(refs[0].ref, 'e1');
  assert.equal(refs[1].ref, 'e2');
  assert.equal(lines[0], '@e1 [label] "A"');
  assert.equal(lines[1], '@e2 [button] "B"  key=btn');
});

test('formatSnapshotJson: returns correct structure', () => {
  const elements: FlutterElement[] = [
    { type: 'Text', text: 'Hello', key: 'greeting', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } },
  ];
  const json = formatSnapshotJson(elements);
  assert.equal(json.length, 1);
  const el = json[0] as any;
  assert.equal(el.ref, 'e1');
  assert.equal(el.type, 'label');
  assert.equal(el.label, 'Hello');
  assert.equal(el.key, 'greeting');
  assert.equal(el.flutterType, 'Text');
});
