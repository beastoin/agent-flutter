import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterInteractive, normalizeType } from '../src/snapshot-fmt.ts';
import type { FlutterElement } from '../src/vm-client.ts';

describe('filterInteractive', () => {
  const mkEl = (type: string): FlutterElement => ({
    type,
    visible: true,
    bounds: { x: 0, y: 0, width: 100, height: 50 },
  });

  it('should keep buttons', () => {
    const elements = [mkEl('ElevatedButton'), mkEl('Text'), mkEl('TextField')];
    const filtered = filterInteractive(elements);
    assert.equal(filtered.length, 2);
    assert.equal(normalizeType(filtered[0].type), 'button');
    assert.equal(normalizeType(filtered[1].type), 'textfield');
  });

  it('should exclude labels and containers', () => {
    const elements = [mkEl('Text'), mkEl('Container'), mkEl('Column'), mkEl('Row')];
    const filtered = filterInteractive(elements);
    assert.equal(filtered.length, 0);
  });

  it('should keep switches and checkboxes', () => {
    const elements = [mkEl('Switch'), mkEl('Checkbox'), mkEl('Radio'), mkEl('Slider')];
    const filtered = filterInteractive(elements);
    assert.equal(filtered.length, 4);
  });
});
