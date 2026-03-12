/**
 * UIAutomator XML parser — extracts visible text from Android accessibility dump.
 * No external XML dependencies; uses regex extraction on node attributes.
 */

export interface TextEntry {
  text: string;
  source: 'text' | 'content-desc';
  class: string;
  bounds: [number, number, number, number]; // [left, top, right, bottom]
}

/**
 * Parse UIAutomator XML dump and extract all non-empty text entries.
 * Handles both `text` and `content-desc` attributes on <node> elements.
 */
export function parseUiAutomatorXml(xml: string): TextEntry[] {
  const entries: TextEntry[] = [];
  // Match each <node ...> or <node .../> element
  const nodePattern = /<node\s[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = nodePattern.exec(xml)) !== null) {
    const node = match[0];

    const text = extractAttr(node, 'text');
    const contentDesc = extractAttr(node, 'content-desc');
    const cls = extractAttr(node, 'class') ?? '';
    const boundsStr = extractAttr(node, 'bounds');
    const bounds = parseBounds(boundsStr);

    if (text) {
      entries.push({ text, source: 'text', class: cls, bounds });
    }
    if (contentDesc && contentDesc !== text) {
      entries.push({ text: contentDesc, source: 'content-desc', class: cls, bounds });
    }
  }

  return entries;
}

/**
 * Extract unique, non-empty text strings from parsed entries.
 * Splits multi-line values (e.g. "Google Drive\nProductivity\n3.6") into individual strings.
 */
export function extractVisibleTexts(entries: TextEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    // Split on newlines — UIAutomator often packs multiple labels in one content-desc
    const parts = entry.text.split('\n').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        result.push(part);
      }
    }
  }

  return result;
}

/** Extract an attribute value from a node string. Returns null if not found or empty. */
function extractAttr(node: string, name: string): string | null {
  // Match name="value" — handle escaped quotes inside value
  const pattern = new RegExp(`${name}="([^"]*)"`, 'i');
  const match = pattern.exec(node);
  if (!match) return null;
  const val = match[1].trim();
  return val.length > 0 ? decodeXmlEntities(val) : null;
}

/** Parse UIAutomator bounds string "[left,top][right,bottom]" into tuple. */
function parseBounds(boundsStr: string | null): [number, number, number, number] {
  if (!boundsStr) return [0, 0, 0, 0];
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return [0, 0, 0, 0];
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
    parseInt(match[4], 10),
  ];
}

/** Decode common XML entities. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
