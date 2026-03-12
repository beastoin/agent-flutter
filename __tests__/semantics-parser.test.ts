import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemanticsTree, extractSemanticsTexts } from '../src/semantics-parser.ts';

describe('parseSemanticsTree', () => {
  it('extracts label values', () => {
    const dump = `SemanticsNode#0
 │ Rect.fromLTRB(0.0, 0.0, 411.4, 866.3)
 │ flags: scopesRoute
 ├─SemanticsNode#1
 │ │ label: "Settings"
 │ │ textDirection: ltr
 ├─SemanticsNode#2
 │ │ label: "Home"`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].text, 'Settings');
    assert.equal(entries[0].source, 'label');
    assert.equal(entries[1].text, 'Home');
    assert.equal(entries[1].source, 'label');
  });

  it('extracts value, tooltip, and hint', () => {
    const dump = `SemanticsNode#3
 │ label: "Email"
 │ value: "user@example.com"
 │ tooltip: "Tap to edit"
 │ hint: "Double-tap to activate"`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 4);
    assert.deepEqual(entries.map(e => e.source), ['label', 'value', 'tooltip', 'hint']);
    assert.equal(entries[1].text, 'user@example.com');
    assert.equal(entries[2].text, 'Tap to edit');
    assert.equal(entries[3].text, 'Double-tap to activate');
  });

  it('handles escaped quotes in labels', () => {
    const dump = `SemanticsNode#0
 │ label: "He said \\"hello\\""`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'He said "hello"');
  });

  it('handles escaped newlines', () => {
    const dump = `SemanticsNode#0
 │ label: "Line 1\\nLine 2"`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Line 1\nLine 2');
  });

  it('skips empty labels', () => {
    const dump = `SemanticsNode#0
 │ label: ""
 │ value: ""
 ├─SemanticsNode#1
 │ │ label: "Visible"`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Visible');
  });

  it('handles whitespace-only labels', () => {
    const dump = `SemanticsNode#0
 │ label: "   "
 ├─SemanticsNode#1
 │ │ label: "Real text"`;
    const entries = parseSemanticsTree(dump);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Real text');
  });

  it('returns empty array for non-semantics input', () => {
    assert.deepEqual(parseSemanticsTree(''), []);
    assert.deepEqual(parseSemanticsTree('no semantics here'), []);
    assert.deepEqual(parseSemanticsTree('No semantics tree available.'), []);
  });

  it('handles real-world multi-node tree', () => {
    const dump = `SemanticsNode#0
 │ Rect.fromLTRB(0.0, 0.0, 392.7, 803.6)
 │ flags: scopesRoute
 │ textDirection: ltr
 │
 ├─SemanticsNode#1
 │ │ Rect.fromLTRB(0.0, 0.0, 392.7, 80.0)
 │ │ flags: isHeader
 │ │ label: "Speak"
 │ │ textDirection: ltr
 │ │
 │ ├─SemanticsNode#2
 │ │ │ Rect.fromLTRB(16.0, 44.0, 56.0, 80.0)
 │ │ │ actions: tap
 │ │ │ tooltip: "Back"
 │ │ │ textDirection: ltr
 │ │
 │ ├─SemanticsNode#3
 │ │ │ label: "Transcribe"
 │ │ │ textDirection: ltr
 │ │
 │ ├─SemanticsNode#4
 │ │ │ label: "Sign in with Google"
 │ │ │ actions: tap
 │ │ │ textDirection: ltr
 │ │
 ├─SemanticsNode#5
 │ │ label: "Privacy Policy"
 │ │ actions: tap
 │ │ textDirection: ltr
 │ │
 ├─SemanticsNode#6
 │ │ label: "Terms of Use"
 │ │ actions: tap`;
    const entries = parseSemanticsTree(dump);

    const labels = entries.filter(e => e.source === 'label').map(e => e.text);
    assert.deepEqual(labels, ['Speak', 'Transcribe', 'Sign in with Google', 'Privacy Policy', 'Terms of Use']);

    const tooltips = entries.filter(e => e.source === 'tooltip').map(e => e.text);
    assert.deepEqual(tooltips, ['Back']);
  });

  it('does not match label-like text outside proper format', () => {
    // "label:" inside regular text should not match (requires word boundary)
    const dump = `Some text with label: not a real label
SemanticsNode#0
 │ label: "Real label"`;
    const entries = parseSemanticsTree(dump);
    // Both match because the regex uses \b word boundary before 'label'
    // "label: not a real label" doesn't match because no quotes
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Real label');
  });
});

describe('extractSemanticsTexts', () => {
  it('deduplicates identical texts', () => {
    const entries = [
      { text: 'Hello', source: 'label' as const },
      { text: 'Hello', source: 'value' as const },
      { text: 'World', source: 'label' as const },
    ];
    const texts = extractSemanticsTexts(entries);
    assert.deepEqual(texts, ['Hello', 'World']);
  });

  it('splits multi-line text', () => {
    const entries = [
      { text: 'Line 1\nLine 2\nLine 3', source: 'label' as const },
    ];
    const texts = extractSemanticsTexts(entries);
    assert.deepEqual(texts, ['Line 1', 'Line 2', 'Line 3']);
  });

  it('preserves order', () => {
    const entries = [
      { text: 'First', source: 'label' as const },
      { text: 'Second', source: 'value' as const },
      { text: 'Third', source: 'tooltip' as const },
    ];
    const texts = extractSemanticsTexts(entries);
    assert.deepEqual(texts, ['First', 'Second', 'Third']);
  });

  it('handles empty input', () => {
    assert.deepEqual(extractSemanticsTexts([]), []);
  });

  it('filters blank lines from split', () => {
    const entries = [
      { text: '\n\nHello\n\n', source: 'label' as const },
    ];
    const texts = extractSemanticsTexts(entries);
    assert.deepEqual(texts, ['Hello']);
  });
});
