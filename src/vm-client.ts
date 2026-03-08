/**
 * VmServiceClient — TypeScript client for Flutter's Dart VM Service.
 * Communicates with Marionette extensions via JSON-RPC 2.0 over WebSocket.
 * Copied from proven e2e-validated code.
 */

export type FlutterElement = {
  type: string;
  key?: string;
  text?: string;
  visible: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type WidgetMatcher =
  | { type: 'Key'; keyValue: string }
  | { type: 'Text'; text: string }
  | { type: 'Coordinates'; x: number; y: number }
  | { type: 'Type'; widgetType: string }
  | { type: 'FocusedElement' };

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
};

type PendingRequest = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (error: Error) => void;
};

export class VmServiceClient {
  private ws: WebSocket | null = null;
  private isolateId: string | null = null;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  get currentIsolateId(): string | null {
    return this.isolateId;
  }

  async connect(uri: string): Promise<void> {
    if (this._connected) {
      throw new Error('Already connected');
    }

    const wsUri = normalizeVmServiceUri(uri);

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUri);

      ws.addEventListener('open', () => {
        this.ws = ws;
        this._connected = true;
        resolve();
      });

      ws.addEventListener('error', () => {
        if (!this._connected) {
          reject(new Error(`WebSocket connection failed: ${wsUri}`));
        }
      });

      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data as string);
      });

      ws.addEventListener('close', () => {
        this.cleanup();
      });
    });

    // Find the Marionette isolate
    const vmResponse = await this.call('getVM', {});
    const isolates = (vmResponse.result?.isolates as Array<{ id: string; name: string }>) ?? [];

    for (const isolateRef of isolates) {
      const isolate = await this.call('getIsolate', { isolateId: isolateRef.id });
      const extensionRPCs = (isolate.result?.extensionRPCs as string[]) ?? [];
      if (extensionRPCs.some((ext) => ext.startsWith('ext.flutter.marionette.'))) {
        this.isolateId = isolateRef.id;
        return;
      }
    }

    throw new Error('No isolate with Marionette extensions found');
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.cleanup();
    }
  }

  async getInteractiveElements(): Promise<FlutterElement[]> {
    this.ensureConnected();
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await this.call('ext.flutter.marionette.interactiveElements', {
        isolateId: this.isolateId!,
      });
      const elements = (response.result?.elements as FlutterElement[]) ?? [];
      if (elements.length > 0) return elements;
      if (attempt < 9) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return [];
  }

  async tap(matcher: WidgetMatcher): Promise<void> {
    this.ensureConnected();
    await this.call('ext.flutter.marionette.tap', {
      isolateId: this.isolateId!,
      ...serializeMatcher(matcher),
    });
  }

  async enterText(matcher: WidgetMatcher, text: string): Promise<void> {
    this.ensureConnected();
    await this.call('ext.flutter.marionette.enterText', {
      isolateId: this.isolateId!,
      ...serializeMatcher(matcher),
      input: text,
    });
  }

  async scrollTo(matcher: WidgetMatcher): Promise<void> {
    this.ensureConnected();
    await this.call('ext.flutter.marionette.scrollTo', {
      isolateId: this.isolateId!,
      ...serializeMatcher(matcher),
    });
  }

  async hotReload(): Promise<boolean> {
    this.ensureConnected();
    const response = await this.call('ext.flutter.marionette.hotReload', {
      isolateId: this.isolateId!,
    });
    return response.result?.type === 'Success';
  }

  async getLogs(): Promise<string[]> {
    this.ensureConnected();
    const response = await this.call('ext.flutter.marionette.getLogs', {
      isolateId: this.isolateId!,
    });
    return (response.result?.logs as string[]) ?? [];
  }

  async takeScreenshot(): Promise<Buffer | null> {
    this.ensureConnected();
    const response = await this.call('ext.flutter.marionette.takeScreenshots', {
      isolateId: this.isolateId!,
    });
    const base64 = response.result?.screenshots;
    if (typeof base64 === 'string') {
      return Buffer.from(base64, 'base64');
    }
    // Try array format
    const screenshots = response.result?.screenshots as string[] | undefined;
    if (Array.isArray(screenshots) && screenshots.length > 0) {
      return Buffer.from(screenshots[0], 'base64');
    }
    return null;
  }

  private ensureConnected(): void {
    if (!this._connected || !this.ws) {
      throw new Error('Not connected to VM Service');
    }
    if (!this.isolateId) {
      throw new Error('No Marionette isolate found');
    }
  }

  private call(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('Not connected'));
        return;
      }
      const id = String(++this.requestId);
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(request));
    });
  }

  private handleMessage(data: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(data) as JsonRpcResponse;
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

  private cleanup(): void {
    this._connected = false;
    this.isolateId = null;
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Connection closed'));
    }
    this.pending.clear();
    this.ws = null;
  }
}

export function normalizeVmServiceUri(uri: string): string {
  let wsUri = uri.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  if (!wsUri.endsWith('/ws')) {
    wsUri = wsUri.replace(/\/?$/, '/ws');
  }
  return wsUri;
}

export function serializeMatcher(matcher: WidgetMatcher): Record<string, unknown> {
  switch (matcher.type) {
    case 'Key':
      return { key: matcher.keyValue };
    case 'Text':
      return { text: matcher.text };
    case 'Coordinates':
      return { x: String(matcher.x), y: String(matcher.y) };
    case 'Type':
      return { type: matcher.widgetType };
    case 'FocusedElement':
      return { focused: true };
  }
}
