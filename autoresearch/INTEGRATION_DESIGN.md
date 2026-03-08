# Marionette Integration Design for agent-device

## Architecture Overview

```
agent-device CLI
    │
    ├─ snapshot / press / fill / etc.
    │
    ├─ Platform: Android (ADB + UIAutomator)     ← existing
    ├─ Platform: iOS (XCTest runner)              ← existing
    └─ Layer: Flutter (Marionette via VM Service) ← NEW
```

## Key Insight: Layer, Not Platform

Flutter is NOT a new platform — it's a **layer on top of** Android/iOS. A Flutter app runs ON Android or iOS. The device is still accessed via ADB or XCTest for OS-level operations. Marionette adds a parallel channel for widget-level operations.

This means:
- `snapshot` merges BOTH UIAutomator/XCTest tree AND Marionette elements
- `press @e5` routes to native OR Flutter depending on element source
- `screenshot` can come from either layer
- `open`, `install`, `back`, `home` remain native-only

## Integration Points

### 1. New Command: `flutter connect <ws-uri>`

Store VM service URI in session state. Agent-device already has `SessionState` in `src/daemon/session-store.ts`.

```typescript
// Add to SessionState
flutterVmServiceUri?: string;
flutterConnected?: boolean;
```

### 2. VM Service Client (TypeScript)

agent-device needs a TypeScript client that talks to Flutter's VM Service via WebSocket. Marionette registers extensions as `ext.flutter.marionette.*`.

```typescript
// New file: src/platforms/flutter/vm-service-client.ts
class VmServiceClient {
  connect(uri: string): Promise<void>
  disconnect(): Promise<void>
  getInteractiveElements(): Promise<FlutterElement[]>
  tap(matcher: WidgetMatcher): Promise<void>
  enterText(matcher: WidgetMatcher, text: string): Promise<void>
  scrollTo(matcher: WidgetMatcher): Promise<void>
  takeScreenshots(): Promise<string[]>  // base64 PNGs
  hotReload(): Promise<boolean>
  getLogs(): Promise<string[]>
}
```

The VM Service protocol is JSON-RPC 2.0 over WebSocket — agent-device already uses JSON-RPC for its daemon, so the pattern is familiar.

### 3. Enhanced Snapshot (Merged Element Tree)

Current snapshot returns `SnapshotNode[]` with refs like `@e1`, `@e2`.

New behavior when Flutter is connected:
1. Get native elements (UIAutomator/XCTest) → `RawSnapshotNode[]`
2. Get Flutter elements (Marionette `interactiveElements`) → `FlutterElement[]`
3. Convert Flutter elements to `RawSnapshotNode` format
4. Tag each node with `source: 'native' | 'flutter'`
5. Merge, dedupe overlapping bounds, assign refs
6. Return unified `SnapshotNode[]`

```typescript
// Extended SnapshotNode
type SnapshotNode = RawSnapshotNode & {
  ref: string;
  source: 'native' | 'flutter';  // NEW
  flutterKey?: string;            // NEW: ValueKey for routing
  flutterType?: string;           // NEW: Widget type name
};
```

### 4. Smart Command Routing

When `press @e5` is called:
1. Look up `@e5` in current snapshot
2. Check `source` field:
   - `native` → use existing Interactor (ADB tap / XCTest tap)
   - `flutter` → use VmServiceClient.tap() with appropriate matcher

```typescript
// In dispatch.ts or new handler
if (node.source === 'flutter') {
  const matcher = buildFlutterMatcher(node); // key > text > coordinates
  await vmClient.tap(matcher);
} else {
  await interactor.tap(centerX, centerY);
}
```

Matcher priority for Flutter elements:
1. `key` (ValueKey) — most reliable
2. `text` — human-readable fallback
3. `coordinates` (x, y from bounds) — last resort

### 5. New Flutter-specific Commands

| Command | Description |
|---------|-------------|
| `flutter connect [uri]` | Connect to Flutter VM service (auto-detects from logcat if no URI) |
| `flutter disconnect` | Disconnect |
| `flutter status` | Show connection state, isolate info, Marionette version |
| `flutter hot-reload` | Hot reload the Flutter app |
| `flutter logs` | Get Flutter app logs |
| `flutter elements` | Raw Marionette elements (not merged) |

### 5a. Auto-detect VM Service URI

On Android, Flutter prints the VM service URI to logcat on app launch:
```bash
adb logcat -s flutter | grep "Observatory"
# or
adb logcat -s DartVM
```

`flutter connect` (no args) should auto-detect by parsing logcat output. This is killer UX — agents don't need to manually find the URI.

### 6. Selector System Extension

agent-device's selector system (`src/daemon/selectors.ts`) supports `id`, `role`, `text`, `label`, etc. Add:
- `key` — matches Flutter ValueKey
- `widget-type` — matches Flutter widget type name
- `source` — filter by `native` or `flutter`

Example: `agent-device find "key = 'submit_button'"` or `agent-device find "source = 'flutter' text = 'Submit'"`

## File Plan

```
src/platforms/flutter/
├── index.ts                 # Public exports
├── vm-service-client.ts     # WebSocket client for Dart VM Service
├── element-converter.ts     # Convert Marionette elements → RawSnapshotNode
├── matcher-builder.ts       # Build WidgetMatcher from SnapshotNode
└── __tests__/
    ├── vm-service-client.test.ts
    ├── element-converter.test.ts
    └── matcher-builder.test.ts

src/daemon/handlers/
└── flutter.ts               # flutter connect/disconnect/hot-reload/logs handlers

# Modified files:
src/daemon/handlers/snapshot.ts    # Merge Flutter elements into snapshot
src/daemon/handlers/interaction.ts # Route to Flutter for flutter-sourced elements
src/daemon/types.ts                # Add flutterVmServiceUri to SessionState
src/daemon/selectors.ts            # Add key, widget-type, source selectors
src/utils/snapshot.ts              # Add source field to SnapshotNode
```

## VM Service Wire Protocol

The Dart VM Service uses JSON-RPC 2.0 over WebSocket:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "ext.flutter.marionette.interactiveElements",
  "params": {
    "isolateId": "isolates/1234"
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "type": "Success",
    "elements": [...]
  }
}
```

Connection sequence:
1. WebSocket connect to `ws://127.0.0.1:PORT/ws`
2. Call `getVM()` to list isolates
3. For each isolate, check `extensionRPCs` for `ext.flutter.marionette.*`
4. Store isolateId for subsequent calls

## Deduplication Strategy

When Flutter overlay and native view overlap:
- Flutter elements have more detail (widget type, key, exact text)
- Native elements show the Flutter region as `android.view.SurfaceView` or `io.flutter.embedding.android.FlutterSurfaceView`
- **Step 1**: Detect Flutter container — if native node class matches `FlutterSurfaceView` or `FlutterView`, mark that subtree as "Flutter region"
- **Step 2**: When Marionette is connected, suppress native nodes inside the Flutter region entirely — replace with Marionette elements
- **Step 3**: Keep native nodes OUTSIDE the Flutter region (status bar, system dialogs, permissions popups)
- **Fallback**: If Marionette is NOT connected, show native nodes as-is (graceful degradation)

## Testing Plan

1. **Unit tests**: VM service client mock, element converter, matcher builder
2. **Integration tests**: Against example Flutter app (Marionette has one in `example/`)
3. **E2E tests**: Against Omi app on Pixel 7a via Mac Mini

## Decisions (resolved with @geni)

1. **Auto-detect URI**: YES — parse `adb logcat` for VM service URI. Killer UX.
2. **Flutter web**: Out of scope for v1. agent-browser handles web.
3. **Element ordering**: Interleaved by Y position (top-to-bottom) — matches visual order agents expect.
4. **PR strategy**: Incremental (3 PRs):
   - **PR 1**: `flutter connect` + VM service client + raw `flutter elements` command
   - **PR 2**: Merged snapshot (native + Flutter elements unified)
   - **PR 3**: Smart routing (press/fill route to Flutter when appropriate)

## Approach

1. **Open GitHub issue first** on callstackincubator/agent-device with the "layer not platform" pitch
2. Get Callstack buy-in before coding
3. Fork, prototype PR 1, test against Omi app on Pixel 7a
4. Submit incremental PRs
