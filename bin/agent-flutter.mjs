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
      maxBuffer: 10 * 1024 * 1024
      // 10MB — Omi logcat can exceed default 1MB
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
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: "utf-8",
      timeout: 1e4,
      maxBuffer: 10 * 1024 * 1024
      // 10MB — Omi logcat can exceed default 1MB
    });
    const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
    if (!matches || matches.length === 0) return null;
    const unique = [...new Set(matches)].reverse();
    for (const httpUri of unique) {
      const portMatch = httpUri.match(/:(\d+)\//);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1], 10);
      try {
        execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5e3 });
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
  try {
    execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5e3 });
  } catch {
  }
}
var init_auto_detect = __esm({
  "src/auto-detect.ts"() {
    "use strict";
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
  const positionals = args.filter((a) => a !== "--dry-run");
  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter press @ref");
  }
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, "Run: agent-flutter snapshot");
  const method = el.key ? "Key" : el.text ? "Text" : "Coordinates";
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "press",
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null, method }
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
    console.log(`Pressed @${el.ref}`);
  } finally {
    await client.disconnect();
  }
}
var HELP2;
var init_press = __esm({
  "src/commands/press.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP2 = `Usage: agent-flutter press @ref

  Tap element by ref.
  @ref  Element reference from snapshot (e.g. @e3)

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
import { execSync as execSync2 } from "node:child_process";
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
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  if (SWIPE_COORDS[target]) {
    if (isDryRun) {
      console.log(JSON.stringify({ dryRun: true, command: "scroll", direction: target, device: deviceId }));
      return;
    }
    const amount = positionals[1] ? parseFloat(positionals[1]) : 1;
    const [x1, y1, x2, y2] = SWIPE_COORDS[target];
    const dx = (x2 - x1) * amount;
    const dy = (y2 - y1) * amount;
    execSync2(`adb -s ${deviceId} shell input swipe ${x1} ${y1} ${Math.round(x1 + dx)} ${Math.round(y1 + dy)} 300`, {
      timeout: 5e3
    });
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
var HELP8, SWIPE_COORDS;
var init_scroll = __esm({
  "src/commands/scroll.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP8 = `Usage: agent-flutter scroll <target>

  scroll @ref              Scroll element into view via Marionette
  scroll down [amount]     Scroll down via ADB (amount: multiplier, default 1)
  scroll up [amount]       Scroll up via ADB
  scroll left [amount]     Scroll left via ADB
  scroll right [amount]    Scroll right via ADB

Options:
  --dry-run  Show intended action without executing`;
    SWIPE_COORDS = {
      down: [540, 1500, 540, 500],
      up: [540, 500, 540, 1500],
      left: [900, 960, 100, 960],
      right: [100, 960, 900, 960]
    };
  }
});

// src/commands/swipe.ts
var swipe_exports = {};
__export(swipe_exports, {
  swipeCommand: () => swipeCommand
});
import { execSync as execSync3 } from "node:child_process";
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
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  if (!["up", "down", "left", "right"].includes(direction)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}. Use: up, down, left, right`);
  }
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "swipe", direction, distance, duration, device: deviceId }));
    return;
  }
  let x1, y1, x2, y2;
  switch (direction) {
    case "up":
      x1 = CX;
      y1 = CY + SCREEN_H * distance / 2;
      x2 = CX;
      y2 = CY - SCREEN_H * distance / 2;
      break;
    case "down":
      x1 = CX;
      y1 = CY - SCREEN_H * distance / 2;
      x2 = CX;
      y2 = CY + SCREEN_H * distance / 2;
      break;
    case "left":
      x1 = CX + SCREEN_W * distance / 2;
      y1 = CY;
      x2 = CX - SCREEN_W * distance / 2;
      y2 = CY;
      break;
    case "right":
      x1 = CX - SCREEN_W * distance / 2;
      y1 = CY;
      x2 = CX + SCREEN_W * distance / 2;
      y2 = CY;
      break;
    default:
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Unknown direction: ${direction}`);
  }
  execSync3(`adb -s ${deviceId} shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${duration}`, {
    timeout: 5e3
  });
  console.log(`Swiped ${direction}`);
}
var HELP9, CX, CY, SCREEN_W, SCREEN_H;
var init_swipe = __esm({
  "src/commands/swipe.ts"() {
    "use strict";
    init_errors();
    HELP9 = `Usage: agent-flutter swipe <direction> [options]

  swipe up|down|left|right

Options:
  --distance N      Fraction of screen to swipe (default: 0.5)
  --duration-ms N   Swipe duration in ms (default: 300)
  --dry-run         Show intended action without executing`;
    CX = 540;
    CY = 960;
    SCREEN_W = 1080;
    SCREEN_H = 1920;
  }
});

// src/commands/back.ts
var back_exports = {};
__export(back_exports, {
  backCommand: () => backCommand
});
import { execSync as execSync4 } from "node:child_process";
async function backCommand(args) {
  const isDryRun = args?.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "back", device: deviceId }));
    return;
  }
  execSync4(`adb -s ${deviceId} shell input keyevent 4`, { timeout: 5e3 });
  console.log("Back");
}
var init_back = __esm({
  "src/commands/back.ts"() {
    "use strict";
  }
});

// src/commands/home.ts
var home_exports = {};
__export(home_exports, {
  homeCommand: () => homeCommand
});
import { execSync as execSync5 } from "node:child_process";
async function homeCommand(args) {
  const isDryRun = args?.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: "home", device: deviceId }));
    return;
  }
  execSync5(`adb -s ${deviceId} shell input keyevent 3`, { timeout: 5e3 });
  console.log("Home");
}
var init_home = __esm({
  "src/commands/home.ts"() {
    "use strict";
  }
});

// src/commands/screenshot.ts
var screenshot_exports = {};
__export(screenshot_exports, {
  screenshotCommand: () => screenshotCommand
});
import { writeFileSync as writeFileSync2 } from "node:fs";
import { execSync as execSync6 } from "node:child_process";
async function screenshotCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP10);
    return;
  }
  const outPath = args[0] ?? "screenshot.png";
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const buf = await client.takeScreenshot();
    if (buf) {
      writeFileSync2(outPath, buf);
      console.log(`Screenshot saved: ${outPath}`);
      return;
    }
  } catch {
  } finally {
    await client.disconnect();
  }
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  try {
    const raw = execSync6(`adb -s ${deviceId} shell screencap -p`, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 1e4
    });
    writeFileSync2(outPath, raw);
    console.log(`Screenshot saved (via ADB): ${outPath}`);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, "Failed to capture screenshot via both Marionette and ADB");
  }
}
var HELP10;
var init_screenshot = __esm({
  "src/commands/screenshot.ts"() {
    "use strict";
    init_vm_client();
    init_session();
    init_errors();
    HELP10 = `Usage: agent-flutter screenshot [path]

  Capture screenshot. Default: screenshot.png
  Uses Marionette first, falls back to ADB screencap.`;
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
import { execSync as execSync7 } from "node:child_process";
async function dismissCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP13);
    return;
  }
  const checkOnly = args.includes("--check");
  const device = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  const dialogInfo = detectDialog(device);
  if (checkOnly) {
    console.log(JSON.stringify({
      dialogPresent: dialogInfo.present,
      window: dialogInfo.window
    }));
    if (!dialogInfo.present) {
      process.exitCode = 1;
    }
    return;
  }
  if (!dialogInfo.present) {
    console.log(JSON.stringify({
      dismissed: false,
      reason: "no dialog detected",
      window: dialogInfo.window
    }));
    return;
  }
  try {
    adb(device, "shell input keyevent 4");
    console.log(JSON.stringify({
      dismissed: true,
      window: dialogInfo.window
    }));
  } catch {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      "Failed to dismiss dialog",
      "Check ADB connection"
    );
  }
}
function detectDialog(device) {
  try {
    const output = adb(device, "shell dumpsys window displays");
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
function adb(device, cmd) {
  return execSync7(`adb -s ${device} ${cmd}`, {
    encoding: "utf8",
    timeout: 5e3
  }).trim();
}
var HELP13;
var init_dismiss = __esm({
  "src/commands/dismiss.ts"() {
    "use strict";
    init_errors();
    HELP13 = `Usage: agent-flutter dismiss [--check]

  Dismiss the topmost Android system dialog via ADB.
  Detects if a non-app window is focused (system dialog, permissions, etc.)
  and sends BACK to dismiss it.

Options:
  --check  Check if a dialog is present without dismissing (exit 0=yes, 1=no)`;
  }
});

// src/commands/tap.ts
var tap_exports = {};
__export(tap_exports, {
  tapCommand: () => tapCommand
});
import { execSync as execSync8 } from "node:child_process";
async function tapCommand(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP14);
    return;
  }
  const isDryRun = args.includes("--dry-run") || process.env.AGENT_FLUTTER_DRY_RUN === "1";
  const positionals = args.filter((a) => a !== "--dry-run");
  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter tap <x> <y> | tap @ref");
  }
  const device = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  let x;
  let y;
  let method;
  const refPattern = /^@?e\d+$/;
  if (refPattern.test(positionals[0])) {
    const session = loadSession();
    if (!session) {
      throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, "Not connected", "Run: agent-flutter connect");
    }
    const el = resolveRef(session, positionals[0]);
    if (!el) {
      throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, "Run: agent-flutter snapshot");
    }
    if (!el.bounds) {
      throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `No bounds for ${positionals[0]}`, "Element must have bounds for tap");
    }
    const logicalX = el.bounds.x + el.bounds.width / 2;
    const logicalY = el.bounds.y + el.bounds.height / 2;
    const density = getDeviceDensity(device);
    x = Math.round(logicalX * density);
    y = Math.round(logicalY * density);
    method = "ref";
  } else {
    if (positionals.length < 2) {
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, "Usage: agent-flutter tap <x> <y>");
    }
    x = parseInt(positionals[0], 10);
    y = parseInt(positionals[1], 10);
    if (isNaN(x) || isNaN(y)) {
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Invalid coordinates: ${positionals[0]} ${positionals[1]}`);
    }
    method = "coordinates";
  }
  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: "tap",
      tapped: { x, y },
      method
    }));
    return;
  }
  try {
    execSync8(`adb -s ${device} shell input tap ${x} ${y}`, {
      encoding: "utf8",
      timeout: 5e3
    });
    console.log(JSON.stringify({
      tapped: { x, y },
      method
    }));
  } catch {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      `Failed to tap at ${x},${y}`,
      "Check ADB connection"
    );
  }
}
function getDeviceDensity(device) {
  try {
    const output = execSync8(`adb -s ${device} shell wm density`, {
      encoding: "utf8",
      timeout: 5e3
    }).trim();
    const match = output.match(/density:\s*(\d+)/);
    if (match) {
      return parseInt(match[1], 10) / 160;
    }
  } catch {
  }
  return 2.625;
}
var HELP14;
var init_tap = __esm({
  "src/commands/tap.ts"() {
    "use strict";
    init_session();
    init_errors();
    HELP14 = `Usage: agent-flutter tap <x> <y>
       agent-flutter tap @ref

  Tap at absolute screen coordinates via ADB.
  Bypasses Marionette \u2014 works even when snapshot refs are stale.

  <x> <y>  Physical pixel coordinates
  @ref     Element reference \u2014 taps at center of bounds

Options:
  --dry-run  Show coordinates without tapping`;
  }
});

// src/commands/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  doctorCommand: () => doctorCommand
});
import { execSync as execSync9 } from "node:child_process";
async function doctorCommand(args) {
  const isJson = process.env.AGENT_FLUTTER_JSON === "1";
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? "emulator-5554";
  const checks = [];
  try {
    execSync9("adb version", { encoding: "utf-8", timeout: 5e3, stdio: "pipe" });
    checks.push({ name: "adb", status: "pass", message: "ADB is installed" });
  } catch {
    checks.push({
      name: "adb",
      status: "fail",
      message: "ADB not found",
      fix: "Install Android SDK Platform Tools and add to PATH"
    });
  }
  if (checks[0].status === "pass") {
    try {
      const devices = execSync9("adb devices", { encoding: "utf-8", timeout: 5e3, stdio: "pipe" });
      const lines = devices.trim().split("\n").slice(1).filter((l) => l.includes("	device"));
      if (lines.length === 0) {
        checks.push({
          name: "device",
          status: "fail",
          message: "No ADB devices connected",
          fix: "Connect a device via USB or start an emulator: emulator -avd <name>"
        });
      } else {
        const targetFound = lines.some((l) => l.startsWith(deviceId));
        if (targetFound) {
          checks.push({ name: "device", status: "pass", message: `Device ${deviceId} connected` });
        } else {
          const available = lines.map((l) => l.split("	")[0]).join(", ");
          checks.push({
            name: "device",
            status: "warn",
            message: `Target device ${deviceId} not found. Available: ${available}`,
            fix: `Use --device <id> or set AGENT_FLUTTER_DEVICE=${lines[0].split("	")[0]}`
          });
        }
      }
    } catch {
      checks.push({ name: "device", status: "fail", message: "Failed to list ADB devices" });
    }
  } else {
    checks.push({ name: "device", status: "fail", message: "Skipped (ADB not available)" });
  }
  let vmUri = null;
  if (checks[0].status === "pass") {
    vmUri = detectVmServiceUri(deviceId);
    if (vmUri) {
      checks.push({ name: "flutter_app", status: "pass", message: `VM Service found: ${vmUri}` });
    } else {
      checks.push({
        name: "flutter_app",
        status: "fail",
        message: "No Flutter VM Service URI found in logcat",
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
          fix: "Check that the VM Service port is forwarded: adb forward tcp:<port> tcp:<port>"
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
    description: "Tap element by ref",
    args: [{ name: "ref", required: true, description: "Element reference (e.g. @e3)" }],
    flags: [{ name: "--dry-run", description: "Resolve target without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter press @e3"]
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
    description: "Swipe gesture via ADB",
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
    description: "Android back button via ADB",
    args: [],
    flags: [{ name: "--dry-run", description: "Show intended action without executing" }],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter back"]
  },
  {
    name: "home",
    description: "Android home button via ADB",
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
    name: "tap",
    description: "Tap at coordinates via ADB (bypasses Marionette)",
    args: [
      { name: "x", required: true, description: "X coordinate (physical pixels) or @ref" },
      { name: "y", required: false, description: "Y coordinate (physical pixels, required if x is not a ref)" }
    ],
    flags: [
      { name: "--dry-run", description: "Show coordinates without tapping" }
    ],
    exitCodes: { "0": "success", "2": "error" },
    examples: ["agent-flutter tap 200 400", "agent-flutter tap @e3"]
  },
  {
    name: "dismiss",
    description: "Dismiss Android system dialog via ADB",
    args: [],
    flags: [
      { name: "--check", description: "Check if dialog is present without dismissing (exit 0=yes, 1=no)" }
    ],
    exitCodes: { "0": "dismissed/present", "1": "no dialog", "2": "error" },
    examples: ["agent-flutter dismiss", "agent-flutter dismiss --check"]
  },
  {
    name: "doctor",
    description: "Check prerequisites: ADB, device, Flutter app, Marionette, session",
    args: [],
    flags: [],
    exitCodes: { "0": "all checks pass", "2": "one or more checks failed" },
    examples: ["agent-flutter doctor", "agent-flutter --json doctor"]
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
  press @ref               Tap element by ref
  fill @ref "text"         Enter text by ref
  get text|type|key @ref   Read element property
  find <locator> <value> [action] [arg]   Find + optional action
  wait exists|visible|text|gone <target> [--timeout-ms N] [--interval-ms N]
  wait <ms>                Simple delay
  is exists|visible @ref   Assert element state (exit 0=true, 1=false)
  scroll @ref|up|down      Scroll element or page
  swipe up|down|left|right Swipe gesture via ADB
  back                     Android back button
  home                     Android home button
  screenshot [path]        Capture screenshot
  reload                   Hot reload the Flutter app
  logs                     Get Flutter app logs
  tap <x> <y> | @ref       Tap at coordinates via ADB (bypasses Marionette)
  dismiss [--check]        Dismiss Android system dialog via ADB
  schema [cmd]             Show command schema (JSON)
  doctor                   Check prerequisites and diagnose issues
  diff snapshot            Show changes since last snapshot

Global flags:
  --device <id>            ADB device ID (default: emulator-5554)
  --json                   Machine-readable JSON output on all commands
  --no-json                Force human-readable output (overrides env/TTY)
  --dry-run                Resolve targets without executing (mutating commands)
  --help                   Show this help
`;
function parseGlobalFlags(args) {
  const flags = { deviceId: "", json: false, noJson: false, dryRun: false };
  const rest = [];
  let i = 0;
  while (i < args.length) {
    if ((args[i] === "--device" || args[i] === "--serial") && i + 1 < args.length) {
      flags.deviceId = args[i + 1];
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
    if (cmdArgs[0] && !cmdArgs[0].startsWith("-")) validateRef(cmdArgs[0]);
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
      case "tap":
        await (await Promise.resolve().then(() => (init_tap(), tap_exports))).tapCommand(cmdArgs);
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
      default:
        const unknownErr = formatError(new Error(`Unknown command: ${command}. Run 'agent-flutter --help' for usage.`), jsonMode);
        if (jsonMode) console.log(unknownErr);
        else console.error(unknownErr);
        process.exit(2);
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
