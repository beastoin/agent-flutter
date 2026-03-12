import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseUiAutomatorXml, extractVisibleTexts } from '../src/text-parser.ts';

describe('parseUiAutomatorXml', () => {
  it('extracts text attribute from node', () => {
    const xml = '<node text="Featured" content-desc="" class="android.widget.TextView" bounds="[0,150][1080,210]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Featured');
    assert.equal(entries[0].source, 'text');
    assert.equal(entries[0].class, 'android.widget.TextView');
    assert.deepEqual(entries[0].bounds, [0, 150, 1080, 210]);
  });

  it('extracts content-desc attribute', () => {
    const xml = '<node text="" content-desc="Create Your Own App" class="android.view.View" bounds="[50,300][500,350]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Create Your Own App');
    assert.equal(entries[0].source, 'content-desc');
  });

  it('extracts both text and content-desc when different', () => {
    const xml = '<node text="Button" content-desc="Submit form" class="android.widget.Button" bounds="[0,0][100,50]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].text, 'Button');
    assert.equal(entries[0].source, 'text');
    assert.equal(entries[1].text, 'Submit form');
    assert.equal(entries[1].source, 'content-desc');
  });

  it('deduplicates identical text and content-desc', () => {
    const xml = '<node text="Featured" content-desc="Featured" class="android.widget.TextView" bounds="[0,0][100,50]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].source, 'text');
  });

  it('skips empty text and content-desc', () => {
    const xml = '<node text="" content-desc="" class="android.widget.FrameLayout" bounds="[0,0][1080,1920]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 0);
  });

  it('handles multiple nodes', () => {
    const xml = `<hierarchy>
      <node text="Featured" content-desc="" class="android.widget.TextView" bounds="[0,0][100,50]" />
      <node text="" content-desc="Google Drive" class="android.view.View" bounds="[0,50][100,100]" />
      <node text="Install" content-desc="" class="android.widget.Button" bounds="[0,100][100,150]" />
    </hierarchy>`;
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].text, 'Featured');
    assert.equal(entries[1].text, 'Google Drive');
    assert.equal(entries[2].text, 'Install');
  });

  it('handles empty XML', () => {
    const entries = parseUiAutomatorXml('');
    assert.equal(entries.length, 0);
  });

  it('handles XML with no text content', () => {
    const xml = '<hierarchy><node text="" content-desc="" class="android.widget.FrameLayout" bounds="[0,0][1080,1920]" /></hierarchy>';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 0);
  });

  it('decodes XML entities in text', () => {
    const xml = '<node text="Tom &amp; Jerry" content-desc="" class="android.widget.TextView" bounds="[0,0][100,50]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries[0].text, 'Tom & Jerry');
  });

  it('parses bounds correctly', () => {
    const xml = '<node text="Test" content-desc="" class="android.widget.TextView" bounds="[100,200][300,400]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.deepEqual(entries[0].bounds, [100, 200, 300, 400]);
  });

  it('handles missing bounds', () => {
    const xml = '<node text="Test" content-desc="" class="android.widget.TextView" />';
    const entries = parseUiAutomatorXml(xml);
    assert.deepEqual(entries[0].bounds, [0, 0, 0, 0]);
  });

  it('handles multiline content-desc', () => {
    const xml = '<node text="" content-desc="Google Drive\nProductivity\n3.6\n(22)\nInstall" class="android.view.View" bounds="[0,0][100,200]" />';
    const entries = parseUiAutomatorXml(xml);
    assert.equal(entries.length, 1);
    assert.ok(entries[0].text.includes('Google Drive'));
    assert.ok(entries[0].text.includes('Productivity'));
  });

  it('handles real-world UIAutomator output format', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.friend.ios.dev" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]"><node index="0" text="Featured" resource-id="" class="android.widget.TextView" package="com.friend.ios.dev" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[50,150][300,200]" /></node></hierarchy>`;
    const entries = parseUiAutomatorXml(xml);
    assert.ok(entries.length >= 1);
    assert.ok(entries.some(e => e.text === 'Featured'));
  });
});

describe('extractVisibleTexts', () => {
  it('returns unique text strings', () => {
    const entries = [
      { text: 'Hello', source: 'text' as const, class: 'TextView', bounds: [0, 0, 0, 0] as [number, number, number, number] },
      { text: 'World', source: 'text' as const, class: 'TextView', bounds: [0, 0, 0, 0] as [number, number, number, number] },
      { text: 'Hello', source: 'content-desc' as const, class: 'View', bounds: [0, 0, 0, 0] as [number, number, number, number] },
    ];
    const texts = extractVisibleTexts(entries);
    assert.deepEqual(texts, ['Hello', 'World']);
  });

  it('splits multiline text into separate entries', () => {
    const entries = [
      { text: 'Google Drive\nProductivity\n3.6', source: 'content-desc' as const, class: 'View', bounds: [0, 0, 0, 0] as [number, number, number, number] },
    ];
    const texts = extractVisibleTexts(entries);
    assert.deepEqual(texts, ['Google Drive', 'Productivity', '3.6']);
  });

  it('filters empty strings after split', () => {
    const entries = [
      { text: 'Hello\n\nWorld\n', source: 'text' as const, class: 'TextView', bounds: [0, 0, 0, 0] as [number, number, number, number] },
    ];
    const texts = extractVisibleTexts(entries);
    assert.deepEqual(texts, ['Hello', 'World']);
  });

  it('returns empty array for empty input', () => {
    const texts = extractVisibleTexts([]);
    assert.deepEqual(texts, []);
  });

  it('preserves order of first occurrence', () => {
    const entries = [
      { text: 'B', source: 'text' as const, class: 'T', bounds: [0, 0, 0, 0] as [number, number, number, number] },
      { text: 'A', source: 'text' as const, class: 'T', bounds: [0, 0, 0, 0] as [number, number, number, number] },
      { text: 'C', source: 'text' as const, class: 'T', bounds: [0, 0, 0, 0] as [number, number, number, number] },
    ];
    const texts = extractVisibleTexts(entries);
    assert.deepEqual(texts, ['B', 'A', 'C']);
  });
});
