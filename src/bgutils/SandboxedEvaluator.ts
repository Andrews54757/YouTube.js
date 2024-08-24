interface ExtendedHTMLIFrameElement extends HTMLIFrameElement {
  credentialless: boolean;
}

export class SandboxedEvaluator {
  private listeners: Map<string, Function[]>;
  private runnerFrame: ExtendedHTMLIFrameElement;
  private readyPromise: Promise<void>;
  private timeout: number | null;
  private listenerBind = this.listener.bind(this);

  constructor(RunnerFrameLocation: string) {
    this.listeners = new Map<string, Function[]>();
    const currentOrigin = window.location.origin;
    const runnerOrigin = new URL(RunnerFrameLocation).origin;
    if (currentOrigin === runnerOrigin) {
      throw new Error('Current frame must not share same origin as the runner frame');
    }

    this.runnerFrame = document.createElement('iframe') as ExtendedHTMLIFrameElement;
    this.runnerFrame.credentialless = true;

    this.runnerFrame.src = RunnerFrameLocation;
    this.runnerFrame.style.display = 'none';

    document.body.appendChild(this.runnerFrame);

    window.addEventListener('message', this.listenerBind);

    this.readyPromise = new Promise((resolve) => {
      this.runnerFrame.addEventListener('load', () => {
        resolve();
        this.emit('ready');
      });
    });

    this.timeout = null;
  }

  async load(): Promise<void> {
    return this.readyPromise;
  }

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(listener);
  }

  off(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      return;
    }
    const listeners = this.listeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (index === -1) {
      return;
    }
    listeners?.splice(index, 1);
  }

  emit(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) {
      return;
    }
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }
  }

  setTimeout(timeoutDuration: number | null): void {
    if (this.timeout)
      clearTimeout(this.timeout);
    if (!timeoutDuration) {
      return;
    }
    this.timeout = window.setTimeout(() => {
      this.close();
    }, timeoutDuration);
  }

  private listener(event: MessageEvent): void {
    if (event.source !== this.runnerFrame?.contentWindow) {
      return;
    }

    if (event.data.type === 'sandboxResult') {
      this.emit('result', event.data.result);
    } else if (event.data.type === 'sandboxError') {
      this.emit('error', event.data.error);
    }
  }

  close(): void {
    if (!this.runnerFrame) {
      return;
    }
    this.runnerFrame.remove();
    window.removeEventListener('message', this.listenerBind);
    if (this.timeout)
      clearTimeout(this.timeout);
    this.emit('close');
  }

  async evaluate(body: string, argNames: string[] = [], argValues: any[] = []): Promise<any> {
    await this.readyPromise;

    this.runnerFrame.contentWindow?.postMessage({ type: 'sandboxEvaluate', body, argNames, argValues }, '*');

    return new Promise((resolve, reject) => {
      let resultHandler: Function | null = null;
      let errorHandler: Function | null = null;
      let closeHandler: Function | null = null;

      const cleanup = () => {
        if (resultHandler) this.off('result', resultHandler);
        if (errorHandler) this.off('error', errorHandler);
        if (closeHandler) this.off('close', closeHandler);
      };

      resultHandler = (result: any) => {
        cleanup();
        resolve(result);
      };

      errorHandler = (error: any) => {
        cleanup();
        reject(error);
      };

      closeHandler = () => {
        cleanup();
        reject(new Error('SandboxedEvaluator closed'));
      };

      this.on('result', resultHandler);
      this.on('error', errorHandler);
      this.on('close', closeHandler);
    });
  }

  static async evaluateOnce(runnerLocation: string, body: string, argNames: string[], argValues: any[], timeoutDuration = 5000): Promise<any> {
    const evaluator = new SandboxedEvaluator(runnerLocation);
    if (timeoutDuration) evaluator.setTimeout(timeoutDuration);

    try {
      const result = await evaluator.evaluate(body, argNames, argValues);
      evaluator.close();
      return result;
    } catch (err) {
      evaluator.close();
      throw err;
    }
  }

  static extractFnBodyAndArgs(funcStr: string): { body: string, argNames: string[] } {
    const body = funcStr.substring(funcStr.indexOf('{') + 1, funcStr.lastIndexOf('}'));
    const argNames = funcStr.substring(funcStr.indexOf('(') + 1, funcStr.indexOf(')')).split(',').map((arg) => arg.trim());
    return { body, argNames };
  }

  static matchArgValues(argNames: string[], argObject: { [key: string]: any }): any[] {
    return argNames.map((arg) => {
      if (!Object.hasOwn(argObject, arg)) {
        return undefined;
      }
      return argObject[arg];
    });
  }
}