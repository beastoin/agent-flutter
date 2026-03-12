#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/vm-client.ts
function normalizeVmServiceUri(uri) {
  let wsUri = uri.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  if (!wsUri.endsWith("/ws")) {
    wsUri = wsUri.replace(/\/?$/, "/ws");
  }
  return wsUri;
}
function serializeMatcher(matcher) {
  switch (matcher.type) {
    case "Key":
      return { key: matcher.keyValue };
    case "Text":
      return { text: matcher.text };
    case "Coordinates":
      return { x: String(matcher.x), y: String(matcher.y) };
    case "Type":
      return { type: matcher.widgetType };
    case "FocusedElement":
      return { focused: true };
  }
}
var VmServiceClient;
var init_vm_client = __esm({
  "src/vm-client.ts"() {
    "use strict";
    VmServiceClient = class {
      ws = null;
      isolateId = null;
      requestId = 0;
      pending = /* @__PURE__ */ new Map();
      _connected = false;
      get connected() {
        return this._connected;
      }
      get currentIsolateId() {
        return this.isolateId;
      }
      async connect(uri) {
        if (this._connected) {
          throw new Error("Already connected");
        }
        const wsUri = normalizeVmServiceUri(uri);
        await new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUri);
          ws.addEventListener("open", () => {
            this.ws = ws;
            this._connected = true;
            resolve();
          });
          ws.addEventListener("error", () => {
            if (!this._connected) {
              reject(new Error(`WebSocket connection failed: ${wsUri}`));
            }
          });
          ws.addEventListener("message", (event) => {
            this.handleMessage(event.data);
          });
          ws.addEventListener("close", () => {
            this.cleanup();
          });
        });
        const vmResponse = await this.call("getVM", {});
        const isolates = vmResponse.result?.isolates ?? [];
        for (const isolateRef of isolates) {
          const isolate = await this.call("getIsolate", { isolateId: isolateRef.id });
          const extensionRPCs = isolate.result?.extensionRPCs ?? [];
          if (extensionRPCs.some((ext) => ext.startsWith("ext.flutter.marionette."))) {
            this.isolateId = isolateRef.id;
            return;
          }
        }
        throw new Error("No isolate with Marionette extensions found");
      }
      async disconnect() {
        if (this.ws) {
          this.ws.close();
          this.cleanup();
        }
      }
      async getInteractiveElements() {
        this.ensureConnected();
        for (let attempt = 0; attempt < 10; attempt++) {
          const response = await this.call("ext.flutter.marionette.interactiveElements", {
            isolateId: this.isolateId
          });
          const elements = response.result?.elements ?? [];
          if (elements.length > 0) return elements;
          if (attempt < 9) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        return [];
      }
      async tap(matcher) {
        this.ensureConnected();
        await this.call("ext.flutter.marionette.tap", {
          isolateId: this.isolateId,
          ...serializeMatcher(matcher)
        });
      }
      async enterText(matcher, text) {
        this.ensureConnected();
        await this.call("ext.flutter.marionette.enterText", {
          isolateId: this.isolateId,
          ...serializeMatcher(matcher),
          input: text
        });
      }
      async scrollTo(matcher) {
        this.ensureConnected();
        await this.call("ext.flutter.marionette.scrollTo", {
          isolateId: this.isolateId,
          ...serializeMatcher(matcher)
        });
      }
      async hotReload() {
        this.ensureConnected();
        const response = await this.call("ext.flutter.marionette.hotReload", {
          isolateId: this.isolateId
        });
        return response.result?.type === "Success";
      }
      async getLogs() {
        this.ensureConnected();
        const response = await this.call("ext.flutter.marionette.getLogs", {
          isolateId: this.isolateId
        });
        return response.result?.logs ?? [];
      }
      /**
       * Call any registered Flutter service extension on the current isolate.
       * Works for Marionette extensions AND built-in Flutter extensions
       * (e.g. ext.flutter.debugDumpSemanticsTreeInTraversalOrder).
       */
      async callExtension(method, params) {
        this.ensureConnected();
        const response = await this.call(method, {
          isolateId: this.isolateId,
          ...params
        });
        return response.result ?? {};
      }
      /**
       * Dump the Flutter semantics tree in traversal order.
       * Uses the built-in ext.flutter.debugDumpSemanticsTreeInTraversalOrder extension.
       * Returns the text dump, or null if unavailable.
       *
       * This bypasses UIAutomator entirely — works on animated pages where
       * UIAutomator's waitForIdle() never completes.
       */
      async dumpSemanticsTree() {
        try {
          const result = await this.callExtension("ext.flutter.debugDumpSemanticsTreeInTraversalOrder");
          const data = result.data;
          if (typeof data === "string" && data.length > 0) return data;
          return null;
        } catch {
          return null;
        }
      }
      async takeScreenshot() {
        this.ensureConnected();
        const response = await this.call("ext.flutter.marionette.takeScreenshots", {
          isolateId: this.isolateId
        });
        const base64 = response.result?.screenshots;
        if (typeof base64 === "string") {
          return Buffer.from(base64, "base64");
        }
        const screenshots = response.result?.screenshots;
        if (Array.isArray(screenshots) && screenshots.length > 0) {
          return Buffer.from(screenshots[0], "base64");
        }
        return null;
      }
      ensureConnected() {
        if (!this._connected || !this.ws) {
          throw new Error("Not connected to VM Service");
        }
        if (!this.isolateId) {
          throw new Error("No Marionette isolate found");
        }
      }
      call(method, params) {
        return new Promise((resolve, reject) => {
          if (!this.ws) {
            reject(new Error("Not connected"));
            return;
          }
          const id = String(++this.requestId);
          const request = {
            jsonrpc: "2.0",
            id,
            method,
            params
          };
          this.pending.set(id, { resolve, reject });
          this.ws.send(JSON.stringify(request));
        });
      }
      handleMessage(data) {
        let response;
        try {
          response = JSON.parse(data);
        } catch {
          return;
        }
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (response.error) {
          pending.reject(new Error(`VM Service error: ${response.error.message}`));
        } else {
          pending.resolve(response);
        }
      }
      cleanup() {
        this._connected = false;
        this.isolateId = null;
        for (const [, pending] of this.pending) {
          pending.reject(new Error("Connection closed"));
        }
        this.pending.clear();
        this.ws = null;
      }
    };
  }
});

// src/session.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
function ensureDir() {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 448 });
  }
}
function loadSession() {
  try {
    const data = readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function saveSession(session) {
  ensureDir();
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 384 });
}
function clearSession() {
  try {
    unlinkSync(SESSION_FILE);
  } catch {
  }
}
function updateRefs(session, refs) {
  session.refs = {};
  for (const ref of refs) {
    session.refs[ref.ref] = ref;
  }
}
function resolveRef(session, refStr) {
  const key = refStr.startsWith("@") ? refStr.slice(1) : refStr;
  return session.refs[key] ?? null;
}
var SESSION_DIR, SESSION_FILE;
var init_session = __esm({
  "src/session.ts"() {
    "use strict";
    SESSION_DIR = process.env.AGENT_FLUTTER_HOME ?? join(process.env.HOME ?? "/tmp", ".agent-flutter");
    SESSION_FILE = join(SESSION_DIR, "session.json");
  }
});

// src/auto-detect.ts
import { execSync } from "node:child_process";
import { readFileSync as readFileSync2 } from "node:fs";
import { createConnection } from "node:net";
function isPortOpen(port, timeoutMs = 1e3) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}
function detectFromFlutterLog() {
  const logPath = process.env.AGENT_FLUTTER_LOG;
  if (!logPath) return null;
  try {
    const log = readFileSync2(logPath, "utf-8");
    const matches = log.match(/is available at: (http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    const uriMatch = last.match(/(http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/);
    if (!uriMatch) return null;
    return uriMatch[1].replace("http://", "ws://") + "ws";
  } catch {
    return null;
  }
}
function detectVmServiceUri(deviceId) {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: "utf-8",
      timeout: 1e4,
      maxBuffer: 10 * 1024 * 1024,
      // 10MB — Omi logcat can exceed default 1MB
      stdio: PIPE_STDIO
    });
    const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
    if (!matches || matches.length === 0) return null;
    const unique = [...new Set(matches)].reverse();
    const httpUri = unique[0];
    const wsUri = httpUri.replace("http://", "ws://") + "ws";
    return wsUri;
  } catch {
    return null;
  }
}
async function detectVmServiceUriAsync(deviceId) {
  const fromLog = detectFromFlutterLog();
  if (fromLog) {
    const portMatch = fromLog.match(/:(\d+)\//);
    if (portMatch && await isPortOpen(parseInt(portMatch[1], 10))) {
      return fromLog;
    }
  }
  if (process.env.AGENT_FLUTTER_PLATFORM === "ios") return null;
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: "utf-8",
      timeout: 1e4,
      maxBuffer: 10 * 1024 * 1024,
      // 10MB — Omi logcat can exceed default 1MB
      stdio: PIPE_STDIO
    });
    const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
    if (!matches || matches.length === 0) return null;
    const unique = [...new Set(matches)].reverse();
    for (const httpUri of unique) {
      const portMatch = httpUri.match(/:(\d+)\//);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1], 10);
      try {
        execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5e3, stdio: PIPE_STDIO });
      } catch {
      }
      if (await isPortOpen(port)) {
        return httpUri.replace("http://", "ws://") + "ws";
      }
    }
    return null;
  } catch {
    return null;
  }
}
function setupPortForwarding(uri, deviceId) {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  const portMatch = uri.match(/:(\d+)\//);
  if (!portMatch) return;
  const port = portMatch[1];
  const platform = process.env.AGENT_FLUTTER_PLATFORM;
  if (platform === "ios") return;
  try {
    execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5e3, stdio: PIPE_STDIO });
  } catch {
  }
}
var PIPE_STDIO;
var init_auto_detect = __esm({
  "src/auto-detect.ts"() {
    "use strict";
    PIPE_STDIO = ["pipe", "pipe", "pipe"];
  }
});

// src/snapshot-fmt.ts
function normalizeType(flutterType) {
  return TYPE_MAP[flutterType] ?? flutterType.toLowerCase();
}
function getLabel(el) {
  if (el.text) return el.text;
  return "";
}
function formatSnapshotLine(el) {
  const type = normalizeType(el.type);
  const label = getLabel(el);
  const labelPart = label ? ` "${label}"` : "";
  const keyPart = el.key ? `  key=${el.key}` : "";
  return `@${el.ref} [${type}]${labelPart}${keyPart}`;
}
function formatSnapshot(elements) {
  const refs = elements.map((el, i) => ({
    ...el,
    ref: `e${i + 1}`
  }));
  const lines = refs.map((el) => formatSnapshotLine(el));
  return { lines, refs };
}
function filterInteractive(elements) {
  return elements.filter((el) => INTERACTIVE_TYPES.has(normalizeType(el.type)));
}
function formatSnapshotJson(elements) {
  return elements.map((el, i) => ({
    ref: `e${i + 1}`,
    type: normalizeType(el.type),
    label: getLabel(el),
    key: el.key ?? null,
    visible: el.visible,
    bounds: el.bounds,
    flutterType: el.type
  }));
}
var TYPE_MAP, INTERACTIVE_TYPES;
var init_snapshot_fmt = __esm({
  "src/snapshot-fmt.ts"() {
    "use strict";
    TYPE_MAP = {
      // --- Material Buttons ---
      ElevatedButton: "button",
      FilledButton: "button",
      OutlinedButton: "button",
      TextButton: "button",
      IconButton: "button",
      FloatingActionButton: "button",
      SegmentedButton: "button",
      MaterialButton: "button",
      // --- Material Text Input ---
      TextField: "textfield",
      TextFormField: "textfield",
      SearchBar: "searchbar",
      SearchAnchor: "searchbar",
      // --- Material Selection Controls ---
      Switch: "switch",
      SwitchListTile: "switch",
      Checkbox: "checkbox",
      CheckboxListTile: "checkbox",
      Radio: "radio",
      RadioListTile: "radio",
      Slider: "slider",
      RangeSlider: "slider",
      // --- Material Chips ---
      Chip: "chip",
      ActionChip: "chip",
      ChoiceChip: "chip",
      FilterChip: "chip",
      InputChip: "chip",
      // --- Material Dropdowns & Menus ---
      DropdownButton: "dropdown",
      DropdownButtonFormField: "dropdown",
      DropdownMenu: "dropdown",
      PopupMenuButton: "menu",
      MenuAnchor: "menu",
      // --- Material Pickers ---
      DatePickerDialog: "picker",
      TimePickerDialog: "picker",
      // --- Material Dialogs & Sheets ---
      AlertDialog: "dialog",
      SimpleDialog: "dialog",
      BottomSheet: "dialog",
      MaterialBanner: "banner",
      SnackBar: "snackbar",
      Tooltip: "tooltip",
      // --- Material Navigation ---
      AppBar: "appbar",
      SliverAppBar: "appbar",
      BottomAppBar: "appbar",
      BottomNavigationBar: "navbar",
      NavigationBar: "navbar",
      NavigationRail: "navbar",
      NavigationDrawer: "drawer",
      Drawer: "drawer",
      TabBar: "tabbar",
      Tab: "tab",
      // --- Material Lists & Content ---
      ListTile: "tile",
      ExpansionTile: "tile",
      Card: "card",
      DataTable: "table",
      Stepper: "stepper",
      ExpansionPanelList: "panel",
      // --- Material Touch & Gesture ---
      GestureDetector: "gesture",
      InkWell: "gesture",
      InkResponse: "gesture",
      Dismissible: "gesture",
      Draggable: "gesture",
      LongPressDraggable: "gesture",
      // --- Cupertino Buttons ---
      CupertinoButton: "button",
      // --- Cupertino Input ---
      CupertinoTextField: "textfield",
      CupertinoSearchTextField: "searchbar",
      CupertinoTextFormFieldRow: "textfield",
      // --- Cupertino Selection Controls ---
      CupertinoSwitch: "switch",
      CupertinoSlider: "slider",
      CupertinoCheckbox: "checkbox",
      CupertinoRadio: "radio",
      CupertinoSegmentedControl: "segmented",
      CupertinoSlidingSegmentedControl: "segmented",
      // --- Cupertino Pickers ---
      CupertinoPicker: "picker",
      CupertinoDatePicker: "picker",
      CupertinoTimerPicker: "picker",
      // --- Cupertino Dialogs ---
      CupertinoAlertDialog: "dialog",
      CupertinoActionSheet: "dialog",
      CupertinoContextMenu: "menu",
      // --- Cupertino Navigation ---
      CupertinoNavigationBar: "appbar",
      CupertinoTabBar: "tabbar",
      CupertinoListTile: "tile",
      // --- Scrolling & Layout ---
      ListView: "list",
      GridView: "grid",
      PageView: "pageview",
      ReorderableListView: "list",
      RefreshIndicator: "refresh",
      // --- Display (non-interactive) ---
      Text: "label",
      RichText: "label",
      Image: "image",
      Icon: "icon",
      Container: "container",
      Column: "column",
      Row: "row",
      Stack: "stack",
      Scaffold: "scaffold"
    };
    INTERACTIVE_TYPES = /* @__PURE__ */ new Set([
      "button",
      "textfield",
      "switch",
      "checkbox",
      "radio",
      "slider",
      "dropdown",
      "menu",
      "gesture",
      "tab",
      "chip",
      "searchbar",
      "segmented",
      "picker",
      "dialog",
      "stepper",
      "snackbar"
    ]);
  }
});

// src/errors.ts
import { randomUUID } from "node:crypto";
function generateDiagnosticId() {
  return randomUUID().slice(0, 8);
}
function formatError(err, json) {
  const diagnosticId = generateDiagnosticId();
  if (err instanceof AgentFlutterError) {
    if (json) {
      return JSON.stringify({ error: { code: err.code, message: err.message, hint: err.hint, diagnosticId } });
    }
    return `Error [${err.code}:${diagnosticId}]: ${err.message}${err.hint ? `
Hint: ${err.hint}` : ""}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (json) {
    return JSON.stringify({ error: { code: "COMMAND_FAILED", message: msg, diagnosticId } });
  }
  return `Error [COMMAND_FAILED:${diagnosticId}]: ${msg}`;
}
var ErrorCodes, AgentFlutterError;
var init_errors = __esm({
  "src/errors.ts"() {
    "use strict";
    ErrorCodes = {
      INVALID_ARGS: "INVALID_ARGS",
      INVALID_INPUT: "INVALID_INPUT",
      NOT_CONNECTED: "NOT_CONNECTED",
      ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND",
      TIMEOUT: "TIMEOUT",
      DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
      CONNECTION_FAILED: "CONNECTION_FAILED",
      COMMAND_FAILED: "COMMAND_FAILED"
    };
    AgentFlutterError = class extends Error {
      code;
      hint;
      constructor(code, message, hint) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.name = "AgentFlutterError";
      }
    };
  }
});

// src/text-parser.ts
function parseUiAutomatorXml(xml) {
  const entries = [];
  const nodePattern = /<node\s[^>]*>/g;
  let match;
  while ((match = nodePattern.exec(xml)) !== null) {
    const node = match[0];
    const text = extractAttr(node, "text");
    const contentDesc = extractAttr(node, "content-desc");
    const cls = extractAttr(node, "class") ?? "";
    const boundsStr = extractAttr(node, "bounds");
    const bounds = parseBounds(boundsStr);
    if (text) {
      entries.push({ text, source: "text", class: cls, bounds });
    }
    if (contentDesc && contentDesc !== text) {
      entries.push({ text: contentDesc, source: "content-desc", class: cls, bounds });
    }
  }
  return entries;
}
function extractVisibleTexts(entries) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const entry of entries) {
    const parts = entry.text.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        result.push(part);
      }
    }
  }
  return result;
}
function extractAttr(node, name) {
  const pattern = new RegExp(`${name}="([^"]*)"`, "i");
  const match = pattern.exec(node);
  if (!match) return null;
  const val = match[1].trim();
  return val.length > 0 ? decodeXmlEntities(val) : null;
}
function parseBounds(boundsStr) {
  if (!boundsStr) return [0, 0, 0, 0];
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return [0, 0, 0, 0];
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
    parseInt(match[4], 10)
  ];
}
function decodeXmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
var init_text_parser = __esm({
  "src/text-parser.ts"() {
    "use strict";
  }
});

// src/transport/adb.ts
import { execSync as execSync2 } from "node:child_process";
var AdbTransport;
var init_adb = __esm({
  "src/transport/adb.ts"() {
    "use strict";
    init_text_parser();
    AdbTransport = class {
      platform = "android";
      deviceId;
      constructor(deviceId) {
        this.deviceId = deviceId;
      }
      exec(cmd, opts) {
        return execSync2(`adb -s ${this.deviceId} ${cmd}`, {
          encoding: "utf8",
          timeout: opts?.timeout ?? 5e3,
          maxBuffer: opts?.maxBuffer,
          stdio: ["pipe", "pipe", "pipe"]
        }).trim();
      }
      execRaw(cmd, opts) {
        return execSync2(`adb -s ${this.deviceId} ${cmd}`, {
          timeout: opts?.timeout ?? 1e4,
          maxBuffer: opts?.maxBuffer ?? 10 * 1024 * 1024
        });
      }
      tap(x, y) {
        this.exec(`shell input tap ${x} ${y}`);
      }
      swipe(x1, y1, x2, y2, durationMs) {
        this.exec(`shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
      }
      keyevent(key) {
        const code = key === "back" ? 4 : 3;
        this.exec(`shell input keyevent ${code}`);
      }
      screenshot() {
        return this.execRaw("shell screencap -p");
      }
      getScreenSize() {
        try {
          const output = this.exec("shell wm size");
          const match = output.match(/size:\s*(\d+)x(\d+)/);
          if (match) {
            return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
          }
        } catch {
        }
        return { width: 1080, height: 1920 };
      }
      getDensity() {
        try {
          const output = this.exec("shell wm density");
          const match = output.match(/density:\s*(\d+)/);
          if (match) {
            return parseInt(match[1], 10) / 160;
          }
        } catch {
        }
        return 2.625;
      }
      ensureAccessibility() {
        try {
          const current = this.exec("shell settings get secure accessibility_enabled", { timeout: 3e3 });
          if (current.trim() === "1") return;
        } catch {
        }
        try {
          this.exec(
            "shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService",
            { timeout: 5e3 }
          );
          this.exec("shell settings put secure accessibility_enabled 1", { timeout: 3e3 });
          this.exec("shell sleep 0.5", { timeout: 3e3 });
        } catch {
        }
      }
      dumpText() {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            this.exec("shell uiautomator dump /sdcard/window_dump.xml", { timeout: 1e4 });
            const xml = this.exec("shell cat /sdcard/window_dump.xml", { timeout: 5e3, maxBuffer: 5 * 1024 * 1024 });
            const entries = parseUiAutomatorXml(xml);
            if (entries.length > 0) return entries;
          } catch {
          }
          if (attempt < 2) {
            try {
              this.exec("shell sleep 0.5", { timeout: 3e3 });
            } catch {
            }
          }
        }
        return [];
      }
      detectVmServiceUri() {
        try {
          const logcat = this.exec("logcat -d -s flutter", {
            timeout: 1e4,
            maxBuffer: 10 * 1024 * 1024
          });
          const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
          if (!matches || matches.length === 0) return null;
          const unique = [...new Set(matches)].reverse();
          return unique[0].replace("http://", "ws://") + "ws";
        } catch {
          return null;
        }
      }
      portForward(port) {
        try {
          this.exec(`forward tcp:${port} tcp:${port}`);
        } catch {
        }
      }
      detectDialog() {
        try {
          const output = this.exec("shell dumpsys window displays");
          const focusMatch = output.match(/mCurrentFocus=Window\{[^}]*\s+(\S+)\}/);
          const window = focusMatch?.[1] ?? "unknown";
          const safeWindows = ["StatusBar", "NavigationBar", "InputMethod"];
          if (safeWindows.some((w) => window.includes(w))) {
            return { present: false, window };
          }
          const dialogIndicators = [
            "com.google.android.gms",
            "PermissionController",
            "com.android.systemui",
            "com.google.android.permissioncontroller",
            "AlertDialog",
            "Chooser"
          ];
          const isDialog = dialogIndicators.some((d) => window.includes(d));
          return { present: isDialog, window };
        } catch {
          return { present: false, window: "error" };
        }
      }
      dismissDialog() {
        const info = this.detectDialog();
        if (!info.present) return false;
        this.keyevent("back");
        return true;
      }
      checkToolInstalled() {
        try {
          execSync2("adb version", { encoding: "utf-8", timeout: 5e3, stdio: "pipe" });
          return { ok: true, message: "ADB is installed" };
        } catch {
          return { ok: false, message: "ADB not found. Install Android SDK Platform Tools and add to PATH" };
        }
      }
      listDevices() {
        try {
          const output = execSync2("adb devices", { encoding: "utf-8", timeout: 5e3, stdio: "pipe" });
          return output.trim().split("\n").slice(1).filter((l) => l.includes("	device")).map((l) => l.split("	")[0]);
        } catch {
          return [];
        }
      }
    };
  }
});

// src/transport/ios-sim.ts
import { execSync as execSync3 } from "node:child_process";
import { readFileSync as readFileSync3, unlinkSync as unlinkSync2 } from "node:fs";
var DEVICE_LOGICAL_SIZES, TITLEBAR_HEIGHT, IosSimTransport;
var init_ios_sim = __esm({
  "src/transport/ios-sim.ts"() {
    "use strict";
    DEVICE_LOGICAL_SIZES = {
      "iPhone-17-Pro-Max": { width: 430, height: 932 },
      "iPhone-16-Pro-Max": { width: 430, height: 932 },
      "iPhone-15-Pro-Max": { width: 430, height: 932 },
      "iPhone-17-Pro": { width: 393, height: 852 },
      "iPhone-16-Pro": { width: 393, height: 852 },
      "iPhone-15-Pro": { width: 393, height: 852 },
      "iPhone-17": { width: 390, height: 844 },
      "iPhone-16": { width: 390, height: 844 },
      "iPhone-15": { width: 390, height: 844 },
      "iPhone-SE": { width: 375, height: 667 },
      "iPad-Pro-13": { width: 1024, height: 1366 },
      "iPad-Pro-11": { width: 834, height: 1194 },
      "iPad-Air": { width: 834, height: 1194 }
    };
    TITLEBAR_HEIGHT = 52;
    IosSimTransport = class {
      platform = "ios";
      deviceId;
      constructor(deviceId) {
        this.deviceId = deviceId;
      }
      simctl(cmd, opts) {
        return execSync3(`xcrun simctl ${cmd}`, {
          encoding: "utf8",
          timeout: opts?.timeout ?? 5e3,
          maxBuffer: opts?.maxBuffer,
          stdio: ["pipe", "pipe", "pipe"]
        }).trim();
      }
      /** Get the Simulator.app window bounds: {x, y, width, height} in screen points */
      getWindowBounds() {
        try {
          const result = execSync3(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        set winPos to position of window 1
        set winSize to size of window 1
        return (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text)
    end tell
end tell'`, { encoding: "utf8", timeout: 5e3, stdio: ["pipe", "pipe", "pipe"] }).trim();
          const [x, y, width, height] = result.split(",").map(Number);
          return { x, y, width, height };
        } catch {
          throw new Error("Cannot get Simulator window bounds. Is Simulator.app running?");
        }
      }
      /** Get the device logical size (points) from device type identifier */
      getDeviceLogicalSize() {
        const deviceType = this.getDeviceType();
        for (const [key, size] of Object.entries(DEVICE_LOGICAL_SIZES)) {
          if (deviceType.includes(key)) return size;
        }
        return { width: 393, height: 852 };
      }
      /** Get the device type identifier for the current device */
      getDeviceType() {
        try {
          const info = this.simctl("list devices -j");
          const parsed = JSON.parse(info);
          for (const runtime of Object.values(parsed.devices)) {
            for (const dev of runtime) {
              if (dev.udid === this.deviceId || this.deviceId === "booted" && dev.state === "Booted") {
                return dev.deviceTypeIdentifier ?? "";
              }
            }
          }
        } catch {
        }
        return "";
      }
      /**
       * Convert device physical-pixel coordinates to macOS screen points.
       * 1. physicalPx → logicalPt (divide by density)
       * 2. logicalPt → screenPt (scale by viewport ratio + window offset)
       */
      deviceToScreen(devX, devY) {
        const density = this.getDensity();
        const logX = devX / density;
        const logY = devY / density;
        const win = this.getWindowBounds();
        const devLogical = this.getDeviceLogicalSize();
        const vpW = win.width;
        const vpH = win.height - TITLEBAR_HEIGHT;
        const scaleX = vpW / devLogical.width;
        const scaleY = vpH / devLogical.height;
        return {
          x: Math.round(win.x + logX * scaleX),
          y: Math.round(win.y + TITLEBAR_HEIGHT + logY * scaleY)
        };
      }
      /** Check if cliclick is available */
      hasCliclick() {
        try {
          execSync3("which cliclick", { encoding: "utf8", timeout: 2e3, stdio: ["pipe", "pipe", "pipe"] });
          return true;
        } catch {
          return false;
        }
      }
      tap(x, y) {
        if (this.hasCliclick()) {
          const screen = this.deviceToScreen(x, y);
          execSync3(`cliclick c:${screen.x},${screen.y}`, {
            encoding: "utf8",
            timeout: 5e3,
            stdio: ["pipe", "pipe", "pipe"]
          });
          return;
        }
        throw new Error("Cannot tap on iOS simulator. Install cliclick: brew install cliclick");
      }
      swipe(x1, y1, x2, y2, durationMs) {
        if (this.hasCliclick()) {
          const start = this.deviceToScreen(x1, y1);
          const end = this.deviceToScreen(x2, y2);
          const wait = Math.max(20, Math.round(durationMs / 4));
          execSync3(`cliclick dd:${start.x},${start.y} w:${wait} m:${end.x},${end.y} w:${wait} du:${end.x},${end.y}`, {
            encoding: "utf8",
            timeout: durationMs + 5e3,
            stdio: ["pipe", "pipe", "pipe"]
          });
          return;
        }
        throw new Error("Cannot swipe on iOS simulator. Install cliclick: brew install cliclick");
      }
      keyevent(key) {
        if (key === "home") {
          execSync3(`osascript -e 'tell application "System Events" to keystroke "h" using {shift down, command down}'`, {
            encoding: "utf8",
            timeout: 5e3,
            stdio: ["pipe", "pipe", "pipe"]
          });
        } else {
          const screen = this.getScreenSize();
          this.swipe(5, screen.height / 2, screen.width / 2, screen.height / 2, 300);
        }
      }
      screenshot() {
        const tmpPath = `/tmp/agent-flutter-ios-screenshot-${Date.now()}.png`;
        this.simctl(`io ${this.deviceId} screenshot ${tmpPath}`);
        const buf = readFileSync3(tmpPath);
        try {
          unlinkSync2(tmpPath);
        } catch {
        }
        return buf;
      }
      getScreenSize() {
        const deviceType = this.getDeviceType();
        const sizes = [
          [["iPhone-17-Pro-Max", "iPhone-16-Pro-Max", "iPhone-15-Pro-Max"], { width: 1290, height: 2796 }],
          [["iPhone-17-Pro", "iPhone-16-Pro", "iPhone-15-Pro"], { width: 1179, height: 2556 }],
          [["iPhone-17", "iPhone-16", "iPhone-15"], { width: 1170, height: 2532 }],
          [["iPhone-SE"], { width: 750, height: 1334 }],
          [["iPad-Pro-13"], { width: 2048, height: 2732 }],
          [["iPad-Pro-11", "iPad-Air"], { width: 1668, height: 2388 }]
        ];
        for (const [keys, size] of sizes) {
          if (keys.some((k) => deviceType.includes(k))) return size;
        }
        return { width: 1179, height: 2556 };
      }
      getDensity() {
        const dt = this.getDeviceType();
        if (dt.includes("iPhone-SE") || dt.includes("iPhone-8")) return 2;
        if (dt.includes("iPad-mini") || dt.includes("iPad-Air-2")) return 2;
        return 3;
      }
      ensureAccessibility() {
      }
      dumpText() {
        return [];
      }
      detectVmServiceUri() {
        return null;
      }
      portForward(_port) {
      }
      detectDialog() {
        try {
          const result = execSync3(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        if exists sheet 1 of window 1 then
            return "sheet"
        end if
        if exists (first UI element of window 1 whose role is "AXSheet") then
            return "alert"
        end if
    end tell
end tell
return "none"'`, { encoding: "utf8", timeout: 5e3, stdio: ["pipe", "pipe", "pipe"] }).trim();
          if (result === "sheet" || result === "alert") {
            return { present: true, window: `iOS ${result}` };
          }
        } catch {
        }
        return { present: false, window: "n/a (iOS)" };
      }
      dismissDialog() {
        try {
          const result = execSync3(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        tell window 1
            -- Try to find and click "Allow" or "OK" buttons in alerts
            set foundBtn to false
            repeat with elem in (every button)
                set btnTitle to title of elem
                if btnTitle is "Allow" or btnTitle is "OK" or btnTitle is "Allow While Using App" or btnTitle is "Continue" then
                    click elem
                    set foundBtn to true
                    exit repeat
                end if
            end repeat
            return foundBtn as text
        end tell
    end tell
end tell'`, { encoding: "utf8", timeout: 5e3, stdio: ["pipe", "pipe", "pipe"] }).trim();
          return result === "true";
        } catch {
          return false;
        }
      }
      checkToolInstalled() {
        try {
          execSync3("xcrun simctl help", { encoding: "utf-8", timeout: 5e3, stdio: "pipe" });
        } catch {
          return { ok: false, message: "xcrun simctl not found. Install Xcode and Command Line Tools" };
        }
        const hasCli = this.hasCliclick();
        const msg = hasCli ? "Xcode Simulator tools + cliclick installed" : "Xcode Simulator tools installed (cliclick missing \u2014 native tap/swipe unavailable, install with: brew install cliclick)";
        return { ok: true, message: msg };
      }
      listDevices() {
        try {
          const output = this.simctl("list devices -j");
          const parsed = JSON.parse(output);
          const devices = [];
          for (const runtime of Object.values(parsed.devices)) {
            for (const dev of runtime) {
              if (dev.state === "Booted") {
                devices.push(dev.udid);
              }
            }
          }
          return devices;
        } catch {
          return [];
        }
      }
    };
  }
});

// src/transport/index.ts
function detectPlatform(deviceId) {
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(deviceId)) {
    return "ios";
  }
  if (deviceId === "booted") {
    return "ios";
  }
  return "android";
}
function resolveTransport(deviceId) {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  const explicitPlatform = process.env.AGENT_FLUTTER_PLATFORM;
  const platform = explicitPlatform ?? detectPlatform(device);
  if (platform === "ios") {
    return new IosSimTransport(device);
  }
  return new AdbTransport(device);
}
var init_transport = __esm({
  "src/transport/index.ts"() {
    "use strict";
    init_adb();
    init_ios_sim();
  }
});

// src/commands/press.ts
var press_exports = {};
__export(press_exports, {
  pressCommand: () => pressCommand
});
async function pressCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP2);
    return;
  }
  const isDryRun = args.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const useNative = args.includes("--native") || args.includes("--adb");
  const positionals = args.filter((a) => a !== "--dry-run" && a !== "--native" && a !== "--adb");
  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter press @ref | press <x> <y>");
  }
  const isCoordinateMode = positionals.length >= 2 && /^\d+$/.test(positionals[0]) && /^\d+$/.test(positionals[1]);
  if (isCoordinateMode) {
    await pressCoordinates(positionals, isDryRun);
  } else if (useNative) {
    await pressNativeRef(positionals, isDryRun);
  } else {
    await pressMarionette(positionals, isDryRun);
  }
}
async function pressMarionette(positionals, isDryRun) {
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, "Run: agent-flutter snapshot");
  const resolveMethod = el.key ? "Key" : el.text ? "Text" : "Coordinates";
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "press",
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null, method: resolveMethod },
      method: "marionette"
    }));
    return;
  }
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.tap({ type: "Key", keyValue: el.key });
    } else if (el.text) {
      await client.tap({ type: "Text", text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.tap({ type: "Coordinates", x: cx, y: cy });
    }
    console.log(JSON.stringify({
      pressed: `@${el.ref}`,
      method: "marionette"
    }));
  } finally {
    await client.disconnect();
  }
}
async function pressCoordinates(positionals, isDryRun) {
  const x = parseInt(positionals[0], 10);
  const y = parseInt(positionals[1], 10);
  if (isNaN(x) || isNaN(y)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Invalid coordinates: ${positionals[0]} ${positionals[1]}`);
  }
  const transport = resolveTransport();
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "press",
      tapped: { x, y },
      method: "coordinates",
      platform: transport.platform
    }));
    return;
  }
  try {
    transport.tap(x, y);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `Failed to tap at ${x},${y}`, "Check device connection");
  }
  console.log(JSON.stringify({
    pressed: { x, y },
    method: "coordinates",
    platform: transport.platform
  }));
}
async function pressNativeRef(positionals, isDryRun) {
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, "Run: agent-flutter snapshot");
  if (!el.bounds) {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `No bounds for ${positionals[0]}`, "Element must have bounds for native tap");
  }
  const transport = resolveTransport();
  const logicalX = el.bounds.x + el.bounds.width / 2;
  const logicalY = el.bounds.y + el.bounds.height / 2;
  const density = transport.getDensity();
  const x = Math.round(logicalX * density);
  const y = Math.round(logicalY * density);
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "press",
      target: `@${el.ref}`,
      tapped: { x, y },
      method: "native-ref",
      platform: transport.platform
    }));
    return;
  }
  try {
    transport.tap(x, y);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `Failed to tap at ${x},${y}`, "Check device connection");
  }
  console.log(JSON.stringify({
    pressed: `@${el.ref}`,
    tapped: { x, y },
    method: "native-ref",
    platform: transport.platform
  }));
}
var HELP2;
var init_press = __esm({
  "src/commands/press.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_transport();
    init_errors();
    HELP2 = `Usage: agent-flutter press @ref
       agent-flutter press <x> <y>
       agent-flutter press @ref --native

  Tap element by ref (Marionette), coordinates, or ref via native input.

  @ref       Element reference from snapshot (e.g. @e3) \u2014 uses Marionette
  <x> <y>    Physical pixel coordinates \u2014 uses platform input (ADB/simctl)
  --native   Force native tap instead of Marionette (useful when refs are stale)

Options:
  --dry-run  Resolve target without executing`;
  }
});

// src/commands/fill.ts
var fill_exports = {};
__export(fill_exports, {
  fillCommand: () => fillCommand
});
async function fillCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP3);
    return;
  }
  const isDryRun = args.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const positionals = args.filter((a) => a !== "--dry-run");
  if (positionals.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter fill @ref "text"');
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, "Run: agent-flutter snapshot");
  const text = positionals[1];
  const method = el.key ? "Key" : "Coordinates";
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "fill",
      target: `@${el.ref}`,
      text,
      resolved: { type: el.type, key: el.key ?? null, method }
    }));
    return;
  }
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.enterText({ type: "Key", keyValue: el.key }, text);
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.enterText({ type: "Coordinates", x: cx, y: cy }, text);
    }
    console.log(`Filled @${el.ref} with "${text}"`);
  } finally {
    await client.disconnect();
  }
}
var HELP3;
var init_fill = __esm({
  "src/commands/fill.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP3 = `Usage: agent-flutter fill @ref "text"

  Enter text into a text field.
  @ref   Element reference from snapshot (e.g. @e5)
  text   The text to enter

Options:
  --dry-run  Resolve target without executing`;
  }
});

// src/commands/get.ts
var get_exports = {};
__export(get_exports, {
  getCommand: () => getCommand
});
function getCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP4);
    return;
  }
  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter get text|type|key|attrs @ref");
  }
  const prop = args[0];
  const refStr = args[1];
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, refStr);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${refStr}`, "Run: agent-flutter snapshot");
  switch (prop) {
    case "text":
      console.log(el.text ?? "");
      break;
    case "type":
      console.log(normalizeType(el.type));
      break;
    case "key":
      console.log(el.key ?? "");
      break;
    case "attrs":
      console.log(JSON.stringify({
        ref: el.ref,
        type: normalizeType(el.type),
        flutterType: el.type,
        text: el.text ?? null,
        key: el.key ?? null,
        visible: el.visible,
        bounds: el.bounds
      }, null, 2));
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown property: ${prop}. Use: text, type, key, attrs`);
  }
}
var HELP4;
var init_get = __esm({
  "src/commands/get.ts"() {
    "use strict";
    init_session();
    init_snapshot_fmt();
    init_errors();
    HELP4 = `Usage: agent-flutter get <property> @ref

  Properties: text, type, key, attrs
  @ref  Element reference from snapshot (e.g. @e3)`;
  }
});

// src/commands/find.ts
var find_exports = {};
__export(find_exports, {
  findCommand: () => findCommand
});
function findAllMatches(elements, locator, value) {
  switch (locator) {
    case "key":
      return elements.filter((el) => el.key === value);
    case "text":
      return elements.filter((el) => el.text?.includes(value));
    case "type":
      return elements.filter((el) => el.type === value || normalizeType(el.type) === value);
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown locator: ${locator}. Use: key, text, type`);
  }
}
function findElement(elements, locator, value, index = 0) {
  const matches = findAllMatches(elements, locator, value);
  return matches[index] ?? null;
}
async function findCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP5);
    return;
  }
  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter find <key|text|type> <value> [press|fill "text"|get text]');
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  let matchIndex = 0;
  const filteredArgs = [...args];
  const indexFlagPos = filteredArgs.indexOf("--index");
  if (indexFlagPos !== -1 && indexFlagPos + 1 < filteredArgs.length) {
    matchIndex = parseInt(filteredArgs[indexFlagPos + 1], 10) || 0;
    filteredArgs.splice(indexFlagPos, 2);
  }
  const locator = filteredArgs[0];
  const value = filteredArgs[1];
  const action = filteredArgs[2];
  const actionArg = filteredArgs[3];
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const elements = await client.getInteractiveElements();
    const { refs } = formatSnapshot(elements);
    updateRefs(session, refs);
    session.lastSnapshot = elements;
    saveSession(session);
    const found = findElement(elements, locator, value, matchIndex);
    if (!found) {
      if (action === "press" && locator === "text") {
        await client.tap({ type: "Text", text: value });
        console.log(`Pressed (by text "${value}")`);
        return;
      }
      if (action === "press" && locator === "key") {
        await client.tap({ type: "Key", keyValue: value });
        console.log(`Pressed (by key "${value}")`);
        return;
      }
      if (action === "fill" && actionArg) {
        if (locator === "key") {
          await client.enterText({ type: "Key", keyValue: value }, actionArg);
        } else if (locator === "text") {
          await client.enterText({ type: "Text", text: value }, actionArg);
        }
        console.log(`Filled (by ${locator} "${value}") with "${actionArg}"`);
        return;
      }
      throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `No element found with ${locator}="${value}"`);
    }
    const matchingRefs = refs.filter(
      (r) => locator === "key" && r.key === value || locator === "text" && r.text?.includes(value) || locator === "type" && (r.type === value || normalizeType(r.type) === value)
    );
    const refEl = matchingRefs[matchIndex];
    if (!action) {
      console.log(`Found: @${refEl?.ref} [${normalizeType(found.type)}] "${found.text ?? ""}"${found.key ? `  key=${found.key}` : ""}`);
      return;
    }
    switch (action) {
      case "press": {
        if (found.key) {
          await client.tap({ type: "Key", keyValue: found.key });
        } else if (found.text) {
          await client.tap({ type: "Text", text: found.text });
        } else {
          const cx = found.bounds.x + found.bounds.width / 2;
          const cy = found.bounds.y + found.bounds.height / 2;
          await client.tap({ type: "Coordinates", x: cx, y: cy });
        }
        console.log(`Pressed @${refEl?.ref}`);
        break;
      }
      case "fill": {
        if (!actionArg) throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter find ... fill "text"');
        if (found.key) {
          await client.enterText({ type: "Key", keyValue: found.key }, actionArg);
        } else {
          const cx = found.bounds.x + found.bounds.width / 2;
          const cy = found.bounds.y + found.bounds.height / 2;
          await client.enterText({ type: "Coordinates", x: cx, y: cy }, actionArg);
        }
        console.log(`Filled @${refEl?.ref} with "${actionArg}"`);
        break;
      }
      case "get": {
        const prop = actionArg ?? "text";
        switch (prop) {
          case "text":
            console.log(found.text ?? "");
            break;
          case "type":
            console.log(normalizeType(found.type));
            break;
          case "key":
            console.log(found.key ?? "");
            break;
          case "attrs":
            console.log(JSON.stringify({
              ref: refEl?.ref,
              type: normalizeType(found.type),
              flutterType: found.type,
              text: found.text ?? null,
              key: found.key ?? null,
              visible: found.visible,
              bounds: found.bounds
            }, null, 2));
            break;
          default:
            throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown property: ${prop}`);
        }
        break;
      }
      default:
        throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown action: ${action}. Use: press, fill, get`);
    }
  } finally {
    await client.disconnect();
  }
}
var HELP5;
var init_find = __esm({
  "src/commands/find.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_snapshot_fmt();
    init_errors();
    HELP5 = `Usage: agent-flutter find <locator> <value> [action] [arg]

  Locators: key, text, type
  Actions: press, fill "text", get text|type|key|attrs
  Options: --index N  Select Nth match (0-based, default 0)`;
  }
});

// src/commands/wait.ts
var wait_exports = {};
__export(wait_exports, {
  waitCommand: () => waitCommand
});
function parseFlags(args) {
  let timeout = process.env.AGENT_FLUTTER_TIMEOUT ? parseInt(process.env.AGENT_FLUTTER_TIMEOUT, 10) : 1e4;
  let interval = 250;
  const positionals = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--timeout-ms" && i + 1 < args.length) {
      timeout = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === "--interval-ms" && i + 1 < args.length) {
      interval = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(HELP6);
      process.exit(0);
    } else {
      positionals.push(args[i]);
      i++;
    }
  }
  return { timeout, interval, positionals };
}
async function waitCommand(args) {
  const { timeout, interval, positionals } = parseFlags(args);
  if (positionals.length === 0) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter wait <condition> <target>");
  }
  if (/^\d+$/.test(positionals[0])) {
    const ms = parseInt(positionals[0], 10);
    await new Promise((r) => setTimeout(r, ms));
    console.log(`Waited ${ms}ms`);
    return;
  }
  const condition = positionals[0];
  const target = positionals[1];
  if (!target) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Usage: agent-flutter wait ${condition} <target>`);
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const elements = await client.getInteractiveElements();
      const { refs } = formatSnapshot(elements);
      switch (condition) {
        case "exists": {
          const refKey = target.startsWith("@") ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Found @${refKey}`);
            return;
          }
          break;
        }
        case "visible": {
          const refKey = target.startsWith("@") ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (found?.visible) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Visible @${refKey}`);
            return;
          }
          break;
        }
        case "text": {
          const lowerTarget = target.toLowerCase();
          const found = elements.some((el) => el.text?.toLowerCase().includes(lowerTarget));
          if (found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Found text "${target}"`);
            return;
          }
          break;
        }
        case "gone": {
          const refKey = target.startsWith("@") ? target.slice(1) : target;
          const found = refs.find((r) => r.ref === refKey);
          if (!found) {
            updateRefs(session, refs);
            session.lastSnapshot = elements;
            saveSession(session);
            console.log(`Gone @${refKey}`);
            return;
          }
          break;
        }
        default:
          throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown wait condition: ${condition}. Use: exists, visible, text, gone`);
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new AgentFlutterError(ErrorCodes.TIMEOUT, `TIMEOUT: ${condition} "${target}" not met within ${timeout}ms`);
  } finally {
    await client.disconnect();
  }
}
var HELP6;
var init_wait = __esm({
  "src/commands/wait.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_snapshot_fmt();
    init_errors();
    HELP6 = `Usage: agent-flutter wait <condition> <target> [options]

  wait exists @ref [--timeout-ms N] [--interval-ms N]   Wait for element to exist
  wait visible @ref [--timeout-ms N] [--interval-ms N]  Wait for element to be visible
  wait text "string" [--timeout-ms N] [--interval-ms N] Wait for text to appear
  wait gone @ref [--timeout-ms N] [--interval-ms N]     Wait for element to disappear
  wait <ms>                                              Simple delay in milliseconds

Options:
  --timeout-ms N    Maximum wait time (default: 10000)
  --interval-ms N   Poll interval (default: 250)`;
  }
});

// src/commands/is.ts
var is_exports = {};
__export(is_exports, {
  isCommand: () => isCommand
});
async function isCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP7);
    return;
  }
  if (args.length < 2) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter is <exists|visible> @ref");
  }
  const condition = args[0];
  const refStr = args[1];
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const refKey = refStr.startsWith("@") ? refStr.slice(1) : refStr;
  const el = resolveRef(session, refStr);
  switch (condition) {
    case "exists":
      if (el) {
        console.log("true");
      } else {
        console.log("false");
        process.exit(1);
      }
      break;
    case "visible":
      if (el?.visible) {
        console.log("true");
      } else {
        console.log("false");
        process.exit(1);
      }
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown condition: ${condition}. Use: exists, visible`);
  }
}
var HELP7;
var init_is = __esm({
  "src/commands/is.ts"() {
    "use strict";
    init_session();
    init_errors();
    HELP7 = `Usage: agent-flutter is <condition> @ref

  is exists @ref   Exit 0 if element exists, exit 1 if not
  is visible @ref  Exit 0 if element is visible, exit 1 if not

Exit codes: 0=true, 1=false, 2=error`;
  }
});

// src/commands/scroll.ts
var scroll_exports = {};
__export(scroll_exports, {
  scrollCommand: () => scrollCommand
});
async function scrollCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP8);
    return;
  }
  const isDryRun = args.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const positionals = args.filter((a) => a !== "--dry-run");
  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter scroll <@ref|up|down|left|right>");
  }
  const target = positionals[0];
  if (DIRECTIONS.includes(target)) {
    const transport = resolveTransport();
    if (isDryRun) {
      console.log(JSON.stringify({ dryRun: true, command: "scroll", direction: target, device: transport.deviceId, platform: transport.platform }));
      return;
    }
    const amount = positionals[1] ? parseFloat(positionals[1]) : 1;
    const screen = transport.getScreenSize();
    const cx = screen.width / 2;
    let x1, y1, x2, y2;
    const scrollDist = screen.height * 0.5 * amount;
    const hScrollDist = screen.width * 0.7 * amount;
    switch (target) {
      case "down":
        x1 = cx;
        y1 = Math.round(screen.height * 0.75);
        x2 = cx;
        y2 = Math.round(screen.height * 0.75 - scrollDist);
        break;
      case "up":
        x1 = cx;
        y1 = Math.round(screen.height * 0.25);
        x2 = cx;
        y2 = Math.round(screen.height * 0.25 + scrollDist);
        break;
      case "left":
        x1 = Math.round(screen.width * 0.8);
        y1 = Math.round(screen.height / 2);
        x2 = Math.round(screen.width * 0.8 - hScrollDist);
        y2 = Math.round(screen.height / 2);
        break;
      case "right":
        x1 = Math.round(screen.width * 0.2);
        y1 = Math.round(screen.height / 2);
        x2 = Math.round(screen.width * 0.2 + hScrollDist);
        y2 = Math.round(screen.height / 2);
        break;
      default:
        throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${target}`);
    }
    transport.swipe(x1, y1, x2, y2, 300);
    console.log(`Scrolled ${target}`);
    return;
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, target);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${target}`, "Run: agent-flutter snapshot");
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "scroll",
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null }
    }));
    return;
  }
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.scrollTo({ type: "Key", keyValue: el.key });
    } else if (el.text) {
      await client.scrollTo({ type: "Text", text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.scrollTo({ type: "Coordinates", x: cx, y: cy });
    }
    console.log(`Scrolled to @${el.ref}`);
  } finally {
    await client.disconnect();
  }
}
var HELP8, DIRECTIONS;
var init_scroll = __esm({
  "src/commands/scroll.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_transport();
    init_errors();
    HELP8 = `Usage: agent-flutter scroll <target>

  scroll @ref              Scroll element into view via Marionette
  scroll down [amount]     Scroll down (amount: multiplier, default 1)
  scroll up [amount]       Scroll up
  scroll left [amount]     Scroll left
  scroll right [amount]    Scroll right

Options:
  --dry-run  Show intended action without executing`;
    DIRECTIONS = ["down", "up", "left", "right"];
  }
});

// src/commands/swipe.ts
var swipe_exports = {};
__export(swipe_exports, {
  swipeCommand: () => swipeCommand
});
async function swipeCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP9);
    return;
  }
  const isDryRun = args.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  let distance = 0.5;
  let duration = 300;
  const positionals = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--distance" && i + 1 < args.length) {
      distance = parseFloat(args[i + 1]);
      i += 2;
    } else if (args[i] === "--duration-ms" && i + 1 < args.length) {
      duration = parseInt(args[i + 1], 10);
      i += 2;
    } else if (args[i] === "--dry-run") {
      i++;
    } else {
      positionals.push(args[i]);
      i++;
    }
  }
  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter swipe <up|down|left|right>");
  }
  const direction = positionals[0];
  if (!["up", "down", "left", "right"].includes(direction)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}. Use: up, down, left, right`);
  }
  const transport = resolveTransport();
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "swipe", direction, distance, duration, device: transport.deviceId, platform: transport.platform }));
    return;
  }
  const screen = transport.getScreenSize();
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  let x1, y1, x2, y2;
  switch (direction) {
    case "up":
      x1 = cx;
      y1 = cy + screen.height * distance / 2;
      x2 = cx;
      y2 = cy - screen.height * distance / 2;
      break;
    case "down":
      x1 = cx;
      y1 = cy - screen.height * distance / 2;
      x2 = cx;
      y2 = cy + screen.height * distance / 2;
      break;
    case "left":
      x1 = cx + screen.width * distance / 2;
      y1 = cy;
      x2 = cx - screen.width * distance / 2;
      y2 = cy;
      break;
    case "right":
      x1 = cx - screen.width * distance / 2;
      y1 = cy;
      x2 = cx + screen.width * distance / 2;
      y2 = cy;
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}`);
  }
  transport.swipe(x1, y1, x2, y2, duration);
  console.log(`Swiped ${direction}`);
}
var HELP9;
var init_swipe = __esm({
  "src/commands/swipe.ts"() {
    "use strict";
    init_transport();
    init_errors();
    HELP9 = `Usage: agent-flutter swipe <direction> [options]

  swipe up|down|left|right

Options:
  --distance N      Fraction of screen to swipe (default: 0.5)
  --duration-ms N   Swipe duration in ms (default: 300)
  --dry-run         Show intended action without executing`;
  }
});

// src/commands/back.ts
var back_exports = {};
__export(back_exports, {
  backCommand: () => backCommand
});
async function backCommand(args) {
  const isDryRun = args?.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const transport = resolveTransport();
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "back", device: transport.deviceId, platform: transport.platform }));
    return;
  }
  transport.keyevent("back");
  console.log("Back");
}
var init_back = __esm({
  "src/commands/back.ts"() {
    "use strict";
    init_transport();
  }
});

// src/commands/home.ts
var home_exports = {};
__export(home_exports, {
  homeCommand: () => homeCommand
});
async function homeCommand(args) {
  const isDryRun = args?.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const transport = resolveTransport();
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "home", device: transport.deviceId, platform: transport.platform }));
    return;
  }
  transport.keyevent("home");
  console.log("Home");
}
var init_home = __esm({
  "src/commands/home.ts"() {
    "use strict";
    init_transport();
  }
});

// src/commands/screenshot.ts
var screenshot_exports = {};
__export(screenshot_exports, {
  screenshotCommand: () => screenshotCommand
});
import { writeFileSync as writeFileSync2 } from "node:fs";
async function screenshotCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP10);
    return;
  }
  const outPath = args[0] ?? "screenshot.png";
  const session = loadSession();
  if (session) {
    const client = new VmServiceClient();
    try {
      await client.connect(session.vmServiceUri);
      const buf = await client.takeScreenshot();
      if (buf) {
        writeFileSync2(outPath, buf);
        console.log(`Screenshot saved: ${outPath}`);
        return;
      }
    } catch {
    } finally {
      try {
        await client.disconnect();
      } catch {
      }
    }
  }
  const transport = resolveTransport();
  try {
    const raw = transport.screenshot();
    writeFileSync2(outPath, raw);
    console.log(`Screenshot saved (via ${transport.platform}): ${outPath}`);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, "Failed to capture screenshot via both Marionette and platform tools");
  }
}
var HELP10;
var init_screenshot = __esm({
  "src/commands/screenshot.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_transport();
    init_errors();
    HELP10 = `Usage: agent-flutter screenshot [path]

  Capture screenshot. Default: screenshot.png
  Uses Marionette first, falls back to platform screencap.`;
  }
});

// src/commands/reload.ts
var reload_exports = {};
__export(reload_exports, {
  reloadCommand: () => reloadCommand
});
async function reloadCommand(args) {
  if (args?.includes("--help") || args?.includes("-h")) {
    console.log(HELP11);
    return;
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const success = await client.hotReload();
    console.log(success ? "Hot reload successful" : "Hot reload failed");
  } finally {
    await client.disconnect();
  }
}
var HELP11;
var init_reload = __esm({
  "src/commands/reload.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP11 = `Usage: agent-flutter reload

  Hot reload the Flutter app.`;
  }
});

// src/commands/logs.ts
var logs_exports = {};
__export(logs_exports, {
  logsCommand: () => logsCommand
});
async function logsCommand(args) {
  if (args?.includes("--help") || args?.includes("-h")) {
    console.log(HELP12);
    return;
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const logs = await client.getLogs();
    if (logs.length === 0) {
      console.log("(no logs)");
    } else {
      for (const log of logs) console.log(log);
    }
  } finally {
    await client.disconnect();
  }
}
var HELP12;
var init_logs = __esm({
  "src/commands/logs.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP12 = `Usage: agent-flutter logs

  Get Flutter app logs.`;
  }
});

// src/commands/dismiss.ts
var dismiss_exports = {};
__export(dismiss_exports, {
  dismissCommand: () => dismissCommand
});
async function dismissCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP13);
    return;
  }
  const checkOnly = args.includes("--check");
  const transport = resolveTransport();
  const dialogInfo = transport.detectDialog();
  if (checkOnly) {
    console.log(JSON.stringify({
      dialogPresent: dialogInfo.present,
      window: dialogInfo.window,
      platform: transport.platform
    }));
    if (!dialogInfo.present) {
      process.exitCode = 1;
    }
    return;
  }
  if (!dialogInfo.present) {
    console.log(JSON.stringify({
      dismissed: false,
      reason: transport.platform === "ios" ? "not supported on iOS" : "no dialog detected",
      window: dialogInfo.window,
      platform: transport.platform
    }));
    return;
  }
  const dismissed = transport.dismissDialog();
  if (dismissed) {
    console.log(JSON.stringify({
      dismissed: true,
      window: dialogInfo.window,
      platform: transport.platform
    }));
  } else {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      "Failed to dismiss dialog",
      "Check device connection"
    );
  }
}
var HELP13;
var init_dismiss = __esm({
  "src/commands/dismiss.ts"() {
    "use strict";
    init_transport();
    init_errors();
    HELP13 = `Usage: agent-flutter dismiss [--check]

  Dismiss the topmost system dialog.
  On Android: detects non-app window and sends BACK.
  On iOS: not applicable (iOS handles dialogs differently).

Options:
  --check  Check if a dialog is present without dismissing (exit 0=yes, 1=no)`;
  }
});

// src/semantics-parser.ts
function parseSemanticsTree(dump) {
  const entries = [];
  const sources = ["label", "value", "tooltip", "hint"];
  for (const source of sources) {
    const regex = new RegExp(`\\b${source}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
    let match;
    while ((match = regex.exec(dump)) !== null) {
      const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\").trim();
      if (text.length > 0) {
        entries.push({ text, source });
      }
    }
  }
  return entries;
}
function extractSemanticsTexts(entries) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const entry of entries) {
    const parts = entry.text.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        result.push(part);
      }
    }
  }
  return result;
}
var init_semantics_parser = __esm({
  "src/semantics-parser.ts"() {
    "use strict";
  }
});

// src/commands/text.ts
var text_exports = {};
__export(text_exports, {
  textCommand: () => textCommand
});
async function textCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP14);
    return;
  }
  const isJson = args.includes("--json") || process.env.AGENT_FLUTTER_JSON === "1";
  const isAll = args.includes("--all");
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim() || null;
  let texts = [];
  let method = "uiautomator";
  let uiEntries = [];
  let semEntries = [];
  const transport = resolveTransport();
  const session = loadSession();
  if (session) {
    transport.ensureAccessibility();
    const result = await trySemantics(session.vmServiceUri);
    if (result) {
      texts = result.texts;
      semEntries = result.entries;
      method = "semantics";
    }
  }
  if (texts.length === 0) {
    if (transport.platform === "android") {
      uiEntries = transport.dumpText();
      if (uiEntries.length > 0) {
        texts = extractVisibleTexts(uiEntries);
        method = "uiautomator";
      }
    }
  }
  if (query) {
    const lowerQuery = query.toLowerCase();
    const matches = texts.filter((t) => t.toLowerCase().includes(lowerQuery));
    const found = matches.length > 0;
    if (isJson) {
      console.log(JSON.stringify({ found, matches, method }));
    } else {
      if (found) {
        console.log(`Found: ${matches.join(", ")}`);
      } else {
        console.log(`Not found: "${query}"`);
      }
    }
    if (!found) process.exit(1);
    return;
  }
  if (isJson) {
    if (isAll) {
      if (method === "uiautomator") {
        console.log(JSON.stringify({ method, entries: uiEntries }));
      } else {
        console.log(JSON.stringify({ method, entries: semEntries }));
      }
    } else {
      console.log(JSON.stringify(texts));
    }
  } else {
    if (method === "semantics" && texts.length > 0) {
      console.log("(via Flutter semantics tree)");
    }
    if (texts.length === 0) {
      console.log("(no text found \u2014 is a Flutter app running with an active session?)");
    }
    for (const t of texts) {
      console.log(t);
    }
  }
}
async function trySemantics(vmServiceUri) {
  let client = null;
  try {
    client = new VmServiceClient();
    await client.connect(vmServiceUri);
    const dump = await client.dumpSemanticsTree();
    if (!dump) return null;
    const entries = parseSemanticsTree(dump);
    const texts = extractSemanticsTexts(entries);
    return texts.length > 0 ? { texts, entries } : null;
  } catch {
    return null;
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
      }
    }
  }
}
var HELP14;
var init_text = __esm({
  "src/commands/text.ts"() {
    "use strict";
    init_transport();
    init_text_parser();
    init_semantics_parser();
    init_session();
    init_vm_client();
    HELP14 = `Usage: agent-flutter text [query] [options]

  List all visible text on screen.
  With query: check if text is visible (exit 0=found, 1=not found).

  Sources (session-aware priority):
    1. Flutter semantics tree (fast, needs active session \u2014 preferred)
    2. UIAutomator accessibility dump (Android, no session needed \u2014 fallback)

  Options:
    --json    JSON output
    --all     Include source/metadata (with --json)`;
  }
});

// src/commands/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  doctorCommand: () => doctorCommand
});
async function doctorCommand(args) {
  const isJson = process.env.AGENT_FLUTTER_JSON === "1";
  const transport = resolveTransport();
  const checks = [];
  checks.push({ name: "platform", status: "pass", message: `${transport.platform} (device: ${transport.deviceId})` });
  const toolCheck = transport.checkToolInstalled();
  if (toolCheck.ok) {
    checks.push({ name: "tool", status: "pass", message: toolCheck.message });
  } else {
    checks.push({ name: "tool", status: "fail", message: toolCheck.message });
  }
  if (toolCheck.ok) {
    const devices = transport.listDevices();
    if (devices.length === 0) {
      const fix = transport.platform === "android" ? "Connect a device via USB or start an emulator: emulator -avd <name>" : "Boot a simulator: xcrun simctl boot <device>";
      checks.push({ name: "device", status: "fail", message: "No devices connected", fix });
    } else {
      const targetFound = devices.includes(transport.deviceId) || transport.deviceId === "booted";
      if (targetFound) {
        checks.push({ name: "device", status: "pass", message: `Device ${transport.deviceId} connected` });
      } else {
        const available = devices.join(", ");
        checks.push({
          name: "device",
          status: "warn",
          message: `Target device ${transport.deviceId} not found. Available: ${available}`,
          fix: `Use --device <id> or set AGENT_FLUTTER_DEVICE=${devices[0]}`
        });
      }
    }
  } else {
    checks.push({ name: "device", status: "fail", message: "Skipped (platform tool not available)" });
  }
  let vmUri = null;
  if (toolCheck.ok) {
    vmUri = transport.detectVmServiceUri();
    if (!vmUri && transport.platform === "android") {
      vmUri = detectVmServiceUri(transport.deviceId);
    }
    if (vmUri) {
      checks.push({ name: "flutter_app", status: "pass", message: `VM Service found: ${vmUri}` });
    } else {
      checks.push({
        name: "flutter_app",
        status: "fail",
        message: "No Flutter VM Service URI found",
        fix: "Launch app with: flutter run (not adb install). The app must be running in debug or profile mode."
      });
    }
  } else {
    checks.push({ name: "flutter_app", status: "fail", message: "Skipped (no device)" });
  }
  if (vmUri) {
    const client = new VmServiceClient();
    try {
      await client.connect(vmUri);
      checks.push({ name: "marionette", status: "pass", message: "Marionette extensions detected on isolate" });
      try {
        const elements = await client.getInteractiveElements();
        checks.push({
          name: "elements",
          status: elements.length > 0 ? "pass" : "warn",
          message: elements.length > 0 ? `${elements.length} interactive elements found` : "No interactive elements (screen may be empty or loading)",
          fix: elements.length === 0 ? "Wait for the app to finish loading, then run doctor again" : void 0
        });
      } catch {
        checks.push({ name: "elements", status: "warn", message: "Could not fetch elements (app may still be loading)" });
      }
      await client.disconnect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No isolate with Marionette extensions")) {
        checks.push({
          name: "marionette",
          status: "fail",
          message: "Flutter app is running but Marionette is NOT initialized",
          fix: "Add to your app main.dart:\n  import 'package:marionette_flutter/marionette_flutter.dart';\n  void main() {\n    assert(() { MarionetteBinding.ensureInitialized(); return true; }());\n    runApp(const MyApp());\n  }\nThen add to pubspec.yaml dev_dependencies: marionette_flutter: ^0.3.0"
        });
      } else {
        checks.push({
          name: "marionette",
          status: "fail",
          message: `Connection failed: ${msg}`,
          fix: transport.platform === "android" ? "Check that the VM Service port is forwarded: adb forward tcp:<port> tcp:<port>" : "Check that the VM Service is accessible on localhost"
        });
      }
    }
  } else {
    checks.push({ name: "marionette", status: "fail", message: "Skipped (no VM Service)" });
  }
  const session = loadSession();
  if (session) {
    checks.push({ name: "session", status: "pass", message: `Connected to ${session.vmServiceUri}` });
  } else {
    checks.push({
      name: "session",
      status: "warn",
      message: "No active session",
      fix: "Run: agent-flutter connect"
    });
  }
  const allPass = checks.every((c) => c.status === "pass");
  const hasFail = checks.some((c) => c.status === "fail");
  if (isJson) {
    console.log(JSON.stringify({ checks, allPass }));
  } else {
    for (const check of checks) {
      const icon = check.status === "pass" ? "[OK]" : check.status === "warn" ? "[WARN]" : "[FAIL]";
      console.log(`${icon} ${check.name}: ${check.message}`);
      if (check.fix) {
        console.log(`     Fix: ${check.fix}`);
      }
    }
    console.log(allPass ? "\nAll checks passed." : hasFail ? "\nSome checks failed. Fix the issues above." : "\nWarnings found but core requirements met.");
  }
  if (hasFail) process.exit(2);
}
var init_doctor = __esm({
  "src/commands/doctor.ts"() {
    "use strict";
    init_transport();
    init_auto_detect();
    init_session();
    init_vm_client();
  }
});

// src/commands/connect.ts
init_vm_client();
init_session();
init_auto_detect();
async function connectCommand(args) {
  let uri = args[0] ?? process.env.AGENT_FLUTTER_URI;
  if (!uri) {
    const detected = await detectVmServiceUriAsync();
    if (!detected) {
      throw new Error(
        "Could not detect Flutter VM Service URI.\nMake sure a Flutter app is running on the emulator.\nOr provide the URI directly: agent-flutter connect ws://..."
      );
    }
    uri = detected;
    console.log(`Auto-detected: ${uri}`);
  } else {
    if (uri.startsWith("http://") || uri.startsWith("ws://")) {
      setupPortForwarding(uri);
    }
  }
  const client = new VmServiceClient();
  await client.connect(uri);
  const isolateId = client.currentIsolateId;
  await client.disconnect();
  saveSession({
    vmServiceUri: uri,
    isolateId,
    refs: {},
    lastSnapshot: [],
    connectedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  console.log(`Connected to Flutter app (isolate: ${isolateId})`);
}

// src/commands/disconnect.ts
init_session();
async function disconnectCommand() {
  clearSession();
  console.log("Disconnected");
}

// src/commands/status.ts
init_session();
function statusCommand() {
  const session = loadSession();
  const isJson = process.env.AGENT_FLUTTER_JSON === "1";
  if (!session) {
    if (isJson) {
      console.log(JSON.stringify({ connected: false }));
    } else {
      console.log("Not connected");
    }
    return;
  }
  if (isJson) {
    console.log(JSON.stringify({
      connected: true,
      vmServiceUri: session.vmServiceUri,
      isolateId: session.isolateId,
      connectedAt: session.connectedAt,
      refs: Object.keys(session.refs).length
    }));
  } else {
    console.log(`Connected to: ${session.vmServiceUri}`);
    console.log(`Isolate: ${session.isolateId}`);
    console.log(`Connected at: ${session.connectedAt}`);
    console.log(`Refs: ${Object.keys(session.refs).length}`);
  }
}

// src/commands/snapshot.ts
init_vm_client();
init_session();
init_snapshot_fmt();
init_errors();
var HELP = `Usage: agent-flutter snapshot [options]

  -i, --interactive   Show only interactive elements (buttons, textfields, etc.)
  -c, --compact       Compact one-line format
  -d N, --depth N     Limit tree depth (accepted, currently flat)
  --json              Output as JSON array
  --diff              Show changes since last snapshot`;
async function snapshotCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }
  const session = loadSession();
  if (!session) {
    throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  }
  const isJson = args.includes("--json") || process.env.AGENT_FLUTTER_JSON === "1";
  const isDiff = args.includes("--diff");
  const isInteractive = args.includes("-i") || args.includes("--interactive");
  const isCompact = args.includes("-c") || args.includes("--compact");
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    let elements = await client.getInteractiveElements();
    if (isInteractive) {
      elements = filterInteractive(elements);
    }
    if (isJson) {
      const { refs } = formatSnapshot(elements);
      updateRefs(session, refs);
      session.lastSnapshot = elements;
      session.isolateId = client.currentIsolateId;
      saveSession(session);
      console.log(JSON.stringify(formatSnapshotJson(elements)));
      return;
    }
    if (isDiff) {
      const prev = session.lastSnapshot;
      const { lines: currentLines, refs } = formatSnapshot(elements);
      updateRefs(session, refs);
      if (prev.length === 0) {
        console.log("(baseline initialized)");
      } else {
        let prevElements = prev;
        if (isInteractive) prevElements = filterInteractive(prevElements);
        const { lines: prevLines } = formatSnapshot(prevElements);
        const added = currentLines.filter((l) => !prevLines.includes(l));
        const removed = prevLines.filter((l) => !currentLines.includes(l));
        if (added.length === 0 && removed.length === 0) {
          console.log("No changes");
        } else {
          for (const line of removed) console.log(`- ${line}`);
          for (const line of added) console.log(`+ ${line}`);
        }
      }
    } else {
      const { lines, refs } = formatSnapshot(elements);
      if (isCompact) {
        console.log(lines.join(" | "));
      } else {
        for (const line of lines) console.log(line);
      }
      updateRefs(session, refs);
    }
    session.lastSnapshot = elements;
    session.isolateId = client.currentIsolateId;
    saveSession(session);
  } finally {
    await client.disconnect();
  }
}

// src/cli.ts
init_errors();

// src/command-schema.ts
var COMMAND_SCHEMAS = [
  {
    name: "connect",
    description: "Connect to Flutter VM Service",
    args: [{ name: "uri", required: false, description: "VM Service WebSocket URI (auto-detect if omitted)" }],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter connect", "agent-flutter connect ws://127.0.0.1:38047/abc=/ws"]
  },
  {
    name: "disconnect",
    description: "Disconnect from Flutter app",
    args: [],
    flags: [],
    exitCodes: { "0": "success" },
    examples: ["agent-flutter disconnect"]
  },
  {
    name: "status",
    description: "Show connection state",
    args: [],
    flags: [],
    exitCodes: { "0": "success" },
    examples: ["agent-flutter status"]
  },
  {
    name: "snapshot",
    description: "Capture widget tree with @refs",
    args: [],
    flags: [
      { name: "-i, --interactive", description: "Show only interactive elements" },
      { name: "-c, --compact", description: "Compact one-line format" },
      { name: "-d N, --depth N", description: "Limit tree depth" },
      { name: "--diff", description: "Show changes since last snapshot" }
    ],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter snapshot", "agent-flutter snapshot -i --json", "agent-flutter snapshot --diff"]
  },
  {
    name: "press",
    description: "Tap element by ref or coordinates",
    args: [
      { name: "target", required: true, description: "@ref (e.g. @e3) or x y coordinates (physical pixels)" },
      { name: "y", required: false, description: "Y coordinate (required when target is x coordinate)" }
    ],
    flags: [
      { name: "--native", description: "Force native tap instead of Marionette (for ref targets)" },
      { name: "--dry-run", description: "Resolve target without executing" }
    ],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter press @e3", "agent-flutter press 540 1200", "agent-flutter press @e3 --native"]
  },
  {
    name: "fill",
    description: "Enter text into element by ref",
    args: [
      { name: "ref", required: true, description: "Element reference (e.g. @e5)" },
      { name: "text", required: true, description: "Text to enter" }
    ],
    flags: [{ name: "--dry-run", description: "Resolve target without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ['agent-flutter fill @e5 "hello world"']
  },
  {
    name: "get",
    description: "Read element property",
    args: [
      { name: "property", required: true, description: "Property to read: text, type, key, attrs" },
      { name: "ref", required: true, description: "Element reference (e.g. @e3)" }
    ],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter get text @e3", "agent-flutter get attrs @e3"]
  },
  {
    name: "find",
    description: "Find element and optionally perform action",
    args: [
      { name: "locator", required: true, description: "Locator type: key, text, type" },
      { name: "value", required: true, description: "Value to search for" },
      { name: "action", required: false, description: "Action: press, fill, get" },
      { name: "actionArg", required: false, description: "Argument for action (e.g. text for fill)" }
    ],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter find key submit_btn press", 'agent-flutter find text "Submit" press']
  },
  {
    name: "wait",
    description: "Wait for condition or delay",
    args: [
      { name: "condition", required: true, description: "Condition: exists, visible, text, gone, or milliseconds" },
      { name: "target", required: false, description: "Target ref or text string" }
    ],
    flags: [
      { name: "--timeout-ms N", description: "Maximum wait time", default: "10000" },
      { name: "--interval-ms N", description: "Poll interval", default: "250" }
    ],
    exitCodes: { "0": "success", "2": "error/timeout" },
    examples: ["agent-flutter wait exists @e3", 'agent-flutter wait text "Welcome"', "agent-flutter wait 500"]
  },
  {
    name: "is",
    description: "Assert element state",
    args: [
      { name: "condition", required: true, description: "Condition: exists, visible" },
      { name: "ref", required: true, description: "Element reference (e.g. @e3)" }
    ],
    flags: [],
    exitCodes: { "0": "true", "1": "false", "2": "error" },
    examples: ["agent-flutter is exists @e3", "agent-flutter is visible @e5"]
  },
  {
    name: "scroll",
    description: "Scroll element into view or scroll page",
    args: [{ name: "target", required: true, description: "@ref to scroll into view, or direction: up, down, left, right" }],
    flags: [{ name: "--dry-run", description: "Resolve target without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter scroll @e3", "agent-flutter scroll down"]
  },
  {
    name: "swipe",
    description: "Swipe gesture",
    args: [{ name: "direction", required: true, description: "Direction: up, down, left, right" }],
    flags: [
      { name: "--distance N", description: "Fraction of screen to swipe", default: "0.5" },
      { name: "--duration-ms N", description: "Swipe duration", default: "300" },
      { name: "--dry-run", description: "Show intended action without executing" }
    ],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter swipe up", "agent-flutter swipe left --distance 0.7"]
  },
  {
    name: "back",
    description: "Navigate back",
    args: [],
    flags: [{ name: "--dry-run", description: "Show intended action without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter back"]
  },
  {
    name: "home",
    description: "Home button",
    args: [],
    flags: [{ name: "--dry-run", description: "Show intended action without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter home"]
  },
  {
    name: "screenshot",
    description: "Capture screenshot",
    args: [{ name: "path", required: false, description: "Output file path (default: screenshot.png)" }],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter screenshot", "agent-flutter screenshot /tmp/screen.png"]
  },
  {
    name: "reload",
    description: "Hot reload the Flutter app",
    args: [],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter reload"]
  },
  {
    name: "logs",
    description: "Get Flutter app logs",
    args: [],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter logs"]
  },
  {
    name: "dismiss",
    description: "Dismiss system dialog",
    args: [],
    flags: [
      { name: "--check", description: "Check if dialog is present without dismissing (exit 0=yes, 1=no)" }
    ],
    exitCodes: { "0": "dismissed/present", "1": "no dialog", "2": "error" },
    examples: ["agent-flutter dismiss", "agent-flutter dismiss --check"]
  },
  {
    name: "doctor",
    description: "Check prerequisites: platform tools, device, Flutter app, Marionette, session",
    args: [],
    flags: [],
    exitCodes: { "0": "all checks pass", "2": "one or more checks failed" },
    examples: ["agent-flutter doctor", "agent-flutter --json doctor"]
  },
  {
    name: "text",
    description: "Extract visible text (UIAutomator \u2192 Flutter semantics fallback)",
    args: [{ name: "query", required: false, description: "Text to search for (substring, case-insensitive)" }],
    flags: [
      { name: "--json", description: "JSON output (includes method field: uiautomator or semantics)" },
      { name: "--all", description: "Include source metadata (with --json)" }
    ],
    exitCodes: { "0": "success (or text found)", "1": "text not found (search mode)", "2": "error" },
    examples: [
      "agent-flutter text",
      "agent-flutter text --json",
      'agent-flutter text "Featured"',
      'agent-flutter text "Sign In" --json',
      "agent-flutter text --json --all"
    ]
  },
  {
    name: "schema",
    description: "Show command schema for agent discovery",
    args: [{ name: "command", required: false, description: "Specific command to describe" }],
    flags: [],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter schema", "agent-flutter schema press"]
  }
];
function getSchema(commandName) {
  if (!commandName) return COMMAND_SCHEMAS;
  return COMMAND_SCHEMAS.find((s) => s.name === commandName) ?? null;
}

// src/validate.ts
init_errors();
function validateRef(ref) {
  if (!/^@?e\d+$/.test(ref)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Invalid ref format: "${ref}"`,
      "Refs must match @eN (e.g. @e1, @e42). Run: agent-flutter snapshot"
    );
  }
}
function validateTextArg(text) {
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      "Text contains invalid control characters",
      "Remove ASCII control chars (allowed: \\n, \\t)"
    );
  }
}
function validatePathArg(path) {
  if (path.includes("../")) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Path traversal detected: "${path}"`,
      "Paths must not contain ../"
    );
  }
  if (path.startsWith("~/")) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Home-relative path rejected: "${path}"`,
      "Use absolute paths under /tmp or relative paths"
    );
  }
  if (path.startsWith("/") && !path.startsWith("/tmp")) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Absolute path outside /tmp rejected: "${path}"`,
      "Absolute paths must be under /tmp"
    );
  }
}
function validateDeviceId(deviceId) {
  if (!/^[A-Za-z0-9.:-]+$/.test(deviceId)) {
    throw new AgentFlutterError(
      ErrorCodes.INVALID_INPUT,
      `Invalid device ID: "${deviceId}"`,
      "Device IDs must contain only alphanumeric, dash, dot, colon"
    );
  }
}

// src/cli.ts
var HELP15 = `agent-flutter \u2014 Control Flutter apps via Marionette

Usage: agent-flutter [--device <id>] [--json] [--no-json] <command> [args...]

Commands:
  connect [uri]            Connect to Flutter VM Service (auto-detect if no URI)
  disconnect               Disconnect from Flutter app
  status                   Show connection state
  snapshot [-i] [-c] [-d N] [--json] [--diff]  Widget tree with @refs
  press @ref [--native]    Tap element by ref (or via native input with --native)
  press <x> <y>            Tap at coordinates via native input
  fill @ref "text"         Enter text by ref
  get text|type|key @ref   Read element property
  find <locator> <value> [action] [arg]   Find + optional action
  wait exists|visible|text|gone <target> [--timeout-ms N] [--interval-ms N]
  wait <ms>                Simple delay
  is exists|visible @ref   Assert element state (exit 0=true, 1=false)
  scroll @ref|up|down      Scroll element or page
  swipe up|down|left|right Swipe gesture
  back                     Navigate back
  home                     Home button
  screenshot [path]        Capture screenshot
  reload                   Hot reload the Flutter app
  logs                     Get Flutter app logs
  dismiss [--check]        Dismiss system dialog
  text [query] [--all]     Visible text from accessibility layer (exit 0=found, 1=not found)
  schema [cmd]             Show command schema (JSON)
  doctor                   Check prerequisites and diagnose issues
  diff snapshot            Show changes since last snapshot

Global flags:
  --device <id>            Device ID (default: emulator-5554 on Android, booted on iOS)
  --platform <os>          Force platform: android or ios (auto-detected from device ID)
  --json                   Machine-readable JSON output on all commands
  --no-json                Force human-readable output (overrides env/TTY)
  --dry-run                Resolve targets without executing (mutating commands)
  --help                   Show this help
`;
function parseGlobalFlags(args) {
  const flags = { deviceId: "", platform: "", json: false, noJson: false, dryRun: false };
  const rest = [];
  let i = 0;
  while (i < args.length) {
    if ((args[i] === "--device" || args[i] === "--serial") && i + 1 < args.length) {
      flags.deviceId = args[i + 1];
      i += 2;
    } else if (args[i] === "--platform" && i + 1 < args.length) {
      flags.platform = args[i + 1];
      i += 2;
    } else if (args[i] === "--json") {
      flags.json = true;
      i++;
    } else if (args[i] === "--no-json") {
      flags.noJson = true;
      i++;
    } else if (args[i] === "--dry-run") {
      flags.dryRun = true;
      i++;
    } else {
      rest.push(args[i]);
      i++;
    }
  }
  return { flags, rest };
}
function resolveJsonMode(flags) {
  if (flags.noJson) return false;
  if (flags.json) return true;
  if (process.env.AGENT_FLUTTER_JSON === "1") return true;
  if (!process.stdout.isTTY) return true;
  return false;
}
function resolveDeviceId(flags) {
  if (flags.deviceId) return flags.deviceId;
  if (process.env.AGENT_FLUTTER_DEVICE) return process.env.AGENT_FLUTTER_DEVICE;
  return "emulator-5554";
}
function validateInputs(command, cmdArgs) {
  const deviceId = process.env.AGENT_FLUTTER_DEVICE;
  if (deviceId) validateDeviceId(deviceId);
  if (command === "press") {
    if (cmdArgs[0] && !cmdArgs[0].startsWith("-") && !/^\d+$/.test(cmdArgs[0])) validateRef(cmdArgs[0]);
  }
  if (command === "get") {
    if (cmdArgs[1] && !cmdArgs[1].startsWith("-")) validateRef(cmdArgs[1]);
  }
  if (command === "is") {
    if (cmdArgs[1] && !cmdArgs[1].startsWith("-")) validateRef(cmdArgs[1]);
  }
  if (command === "fill") {
    if (cmdArgs[0] && !cmdArgs[0].startsWith("-")) validateRef(cmdArgs[0]);
    if (cmdArgs[1] && !cmdArgs[1].startsWith("-")) validateTextArg(cmdArgs[1]);
  }
  if (command === "scroll" && cmdArgs[0]?.startsWith("@")) {
    validateRef(cmdArgs[0]);
  }
  if (command === "wait" && ["exists", "visible", "gone"].includes(cmdArgs[0])) {
    if (cmdArgs[1] && !cmdArgs[1].startsWith("-")) validateRef(cmdArgs[1]);
  }
  if (command === "screenshot" && cmdArgs[0] && !cmdArgs[0].startsWith("-")) {
    validatePathArg(cmdArgs[0]);
  }
}
async function main() {
  const rawArgs = process.argv.slice(2);
  const { flags, rest } = parseGlobalFlags(rawArgs);
  const jsonMode = resolveJsonMode(flags);
  const deviceId = resolveDeviceId(flags);
  process.env.AGENT_FLUTTER_DEVICE = deviceId;
  if (flags.platform) process.env.AGENT_FLUTTER_PLATFORM = flags.platform;
  if (jsonMode) process.env.AGENT_FLUTTER_JSON = "1";
  else delete process.env.AGENT_FLUTTER_JSON;
  if (flags.dryRun) process.env.AGENT_FLUTTER_DRY_RUN = "1";
  const hasHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
  const hasCommand = rest.some((a) => !a.startsWith("-"));
  if (rawArgs.length === 0 || hasHelp && !hasCommand) {
    if (jsonMode) {
      console.log(JSON.stringify(getSchema()));
    } else {
      console.log(HELP15.trim());
    }
    return;
  }
  if (rest.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify(getSchema()));
    } else {
      console.log(HELP15.trim());
    }
    return;
  }
  const command = rest[0];
  const cmdArgs = rest.slice(1);
  try {
    if (command === "schema") {
      const subCmd = cmdArgs.find((a) => !a.startsWith("-"));
      const result = getSchema(subCmd);
      if (subCmd && !result) {
        throw new Error(`Unknown command: ${subCmd}`);
      }
      console.log(JSON.stringify(result, null, jsonMode ? void 0 : 2));
      return;
    }
    if (!cmdArgs.includes("--help") && !cmdArgs.includes("-h")) {
      validateInputs(command, cmdArgs);
    }
    switch (command) {
      case "connect":
        await connectCommand(cmdArgs);
        break;
      case "disconnect":
        await disconnectCommand();
        break;
      case "status":
        statusCommand();
        break;
      case "snapshot":
        await snapshotCommand(cmdArgs);
        break;
      case "press":
        await (await Promise.resolve().then(() => (init_press(), press_exports))).pressCommand(cmdArgs);
        break;
      case "fill":
        await (await Promise.resolve().then(() => (init_fill(), fill_exports))).fillCommand(cmdArgs);
        break;
      case "get":
        (await Promise.resolve().then(() => (init_get(), get_exports))).getCommand(cmdArgs);
        break;
      case "find":
        await (await Promise.resolve().then(() => (init_find(), find_exports))).findCommand(cmdArgs);
        break;
      case "wait":
        await (await Promise.resolve().then(() => (init_wait(), wait_exports))).waitCommand(cmdArgs);
        break;
      case "is":
        await (await Promise.resolve().then(() => (init_is(), is_exports))).isCommand(cmdArgs);
        break;
      case "scroll":
        await (await Promise.resolve().then(() => (init_scroll(), scroll_exports))).scrollCommand(cmdArgs);
        break;
      case "swipe":
        await (await Promise.resolve().then(() => (init_swipe(), swipe_exports))).swipeCommand(cmdArgs);
        break;
      case "back":
        await (await Promise.resolve().then(() => (init_back(), back_exports))).backCommand(cmdArgs);
        break;
      case "home":
        await (await Promise.resolve().then(() => (init_home(), home_exports))).homeCommand(cmdArgs);
        break;
      case "screenshot":
        await (await Promise.resolve().then(() => (init_screenshot(), screenshot_exports))).screenshotCommand(cmdArgs);
        break;
      case "reload":
        await (await Promise.resolve().then(() => (init_reload(), reload_exports))).reloadCommand(cmdArgs);
        break;
      case "logs":
        await (await Promise.resolve().then(() => (init_logs(), logs_exports))).logsCommand(cmdArgs);
        break;
      case "dismiss":
        await (await Promise.resolve().then(() => (init_dismiss(), dismiss_exports))).dismissCommand(cmdArgs);
        break;
      case "text":
        await (await Promise.resolve().then(() => (init_text(), text_exports))).textCommand(cmdArgs);
        break;
      case "doctor":
        await (await Promise.resolve().then(() => (init_doctor(), doctor_exports))).doctorCommand(cmdArgs);
        break;
      case "diff":
        if (cmdArgs[0] === "snapshot") {
          await snapshotCommand(["--diff"]);
        } else {
          console.error(`Unknown diff target: ${cmdArgs[0]}`);
          process.exit(2);
        }
        break;
      default: {
        const suggestions = {
          tap: 'Use "press <x> <y>" for coordinate tap, or "press @ref --native" for native ref tap'
        };
        const hint = suggestions[command] ?? "Run 'agent-flutter --help' for usage";
        const unknownErr = formatError(
          new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown command: ${command}`, hint),
          jsonMode
        );
        if (jsonMode) console.log(unknownErr);
        else console.error(unknownErr);
        process.exit(2);
      }
    }
  } catch (err) {
    const errOutput = formatError(err, jsonMode);
    if (jsonMode) {
      console.log(errOutput);
    } else {
      console.error(errOutput);
    }
    process.exit(2);
  }
}
main();
