/**
 * Flutter semantics tree parser — extracts visible text from
 * ext.flutter.debugDumpSemanticsTreeInTraversalOrder output.
 *
 * Bypasses UIAutomator entirely, so it works on animated pages
 * where UIAutomator's waitForIdle() never completes.
 */

export interface SemanticsTextEntry {
  text: string;
  source: 'label' | 'value' | 'tooltip' | 'hint';
}

/**
 * Parse Flutter semantics tree dump text and extract all non-empty text entries.
 *
 * Typical dump format:
 *   SemanticsNode#0
 *    │ label: "Settings"
 *    │ value: "user@example.com"
 *    │ tooltip: "Back"
 *    │ hint: "Double-tap to activate"
 */
export function parseSemanticsTree(dump: string): SemanticsTextEntry[] {
  const entries: SemanticsTextEntry[] = [];

  const sources: SemanticsTextEntry['source'][] = ['label', 'value', 'tooltip', 'hint'];

  for (const source of sources) {
    // Match: label: "text" — handles escaped quotes inside
    const regex = new RegExp(`\\b${source}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(dump)) !== null) {
      const text = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        .trim();
      if (text.length > 0) {
        entries.push({ text, source });
      }
    }
  }

  return entries;
}

/**
 * Extract unique, non-empty text strings from semantics entries.
 * Splits multi-line values into individual strings.
 */
export function extractSemanticsTexts(entries: SemanticsTextEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
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
