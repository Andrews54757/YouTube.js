/*
  From BGUtils

  MIT License

  Copyright (c) 2024 LuanRT

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { type Session } from '../core/index.js';
import type { FetchFunction } from '../types/PlatformShim.js';
import { Constants, Platform } from '../utils/index.js';
import { extractFnBodyAndArgs, type SandboxedEvaluator } from './SandboxedEvaluator.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36(KHTML, like Gecko)';

export class BGUtils {
  static base64ToU8(base64: string): Uint8Array {
    const base64urlToBase64Map: { [key: string]: string } = {
      '-': '+',
      '_': '/',
      '.': '='
    };

    let base64Mod: string;

    if ((/[-_.]/g).test(base64)) {
      base64Mod = base64.replace(/[-_.]/g, (match) => base64urlToBase64Map[match]);
    } else {
      base64Mod = base64;
    }

    base64Mod = atob(base64Mod);

    const result = new Uint8Array(
      [...base64Mod].map((char) => char.charCodeAt(0))
    );

    return result;
  }

  static u8ToBase64(u8: Uint8Array, base64url = false): string {
    const result = btoa(String.fromCharCode(...u8));

    if (base64url) {
      return result
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    return result;
  }

  static async createChallenge(inntertube: Session, fetcher: FetchFunction, requestToken: string, interpreterHash: string | null, apiKey: string): Promise<any> {
    const payload = [requestToken];

    if (interpreterHash) {
      payload.push(interpreterHash);
    }

    const response = await fetcher('https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json', {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'X-Goog-Visitor-Id': inntertube.context.client.visitorData || '',
        'X-Youtube-Client-Version': inntertube.context.client.clientVersion,
        'X-Youtube-Client-Name': '1'
      },
      body: JSON.stringify({
        engagementType: 'ENGAGEMENT_TYPE_UNBOUND',
        context: inntertube.context
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const challenge = await response.json();
    if (!challenge.bgChallenge) {
      throw new Error('No challenge found');
    }

    return challenge.bgChallenge;
  }

  static b64ToBuf(b64: string): string {
    const buffer = BGUtils.base64ToU8(b64);
    if (!buffer.length) {
      return '';
    }

    return new TextDecoder().decode(buffer.map((b) => b + 97));
  }

  static stringToB64(str: string): string {
    let buffer = new TextEncoder().encode(str);
    buffer = buffer.map((b) => b - 97);
    return BGUtils.u8ToBase64(buffer);
  }

  static parseChallenge(challenge: string): any {
    const str = BGUtils.b64ToBuf(challenge);
    if (str.length) {
      const [messageId, script, , interpreterHash, challenge, globalName] = JSON.parse(str);
      return {
        script,
        interpreterHash,
        globalName,
        challenge,
        messageId
      };
    }
  }

  static generateColdStartToken(identifier: string, clientState?: number): string {
    const encodedIdentifier = new TextEncoder().encode(identifier);

    if (encodedIdentifier.length > 118)
      throw new Error('Content binding is too long.');

    const timestamp = Math.floor(Date.now() / 1000);
    const randomKeys = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];

    // NOTE: The "0" value before the client state is supposed to be someVal & 0xFF.
    // It is always 0 though, so I didn't bother investigating further.
    const header = randomKeys.concat(
      [
        0, (clientState ?? 1)
      ],
      [
        (timestamp >> 24) & 0xFF,
        (timestamp >> 16) & 0xFF,
        (timestamp >> 8) & 0xFF,
        timestamp & 0xFF
      ]
    );

    const packet = new Uint8Array(2 + header.length + encodedIdentifier.length);

    packet[0] = 34;
    packet[1] = header.length + encodedIdentifier.length;

    packet.set(header, 2);
    packet.set(encodedIdentifier, 2 + header.length);

    const payload = packet.subarray(2);

    const keyLength = randomKeys.length;

    for (let i = keyLength; i < payload.length; i++) {
      payload[i] ^= payload[i % keyLength];
    }

    return this.u8ToBase64(packet, true);
  }

  static getFn1(): any {
    const fn1 = 'fn1(n){return(async()=>{const o=window[n.globalName];if(!o)throw new Error("V not found");const t={asyncSnapshotFunction:null,shutdownFunction:null,passEventFunction:null,checkCameraFunction:null};function e(n=1e4){let o,t;const e=new Promise(((n,e)=>{o=n,t=e})),r=setTimeout((()=>{t(new Error("timeout"))}),n);return{promise:e,resolve:n=>{clearTimeout(r),o(n)},reject:t}}let{promise:r,resolve:i}=e(1e4);if(!o.a)throw new Error("Init failed");try{o.a(n.program,(function(n,o,e,r){t.asyncSnapshotFunction=n,t.shutdownFunction=o,t.passEventFunction=e,t.checkCameraFunction=r,i()}),!0,void 0,((...n)=>{})),await r}catch(n){throw new Error("Failed to load")}if(!t.asyncSnapshotFunction)throw new Error("fn1 unavailable.");let{promise:a,resolve:c}=e();const u=[];t.asyncSnapshotFunction((n=>c(n)),[void 0,void 0,u,void 0]);const s=await a;if(!u.length)throw new Error("No output");return window.ppf=u,s})()}';
    return extractFnBodyAndArgs(fn1);
  }

  static getFn2(): any {
    const fn2 = 'a(n,r){const t=window.ppf[0];if(!t)throw new Error("PP:Undefined");return(async()=>{function e(n,r=!1){const t=btoa(String.fromCharCode(...n));return r?t.replace(/\\+/g,"-").replace(/\\//g,"_"):t}const o=await t(function(n){const r=/[-_.]/g,t={"-":"+",_:"/",".":"="};let e;return e=r.test(n)?n.replace(r,(function(n){return t[n]})):n,e=atob(e),new Uint8Array([...e].map((n=>n.charCodeAt(0))))}(n));if("function"!=typeof o)throw new Error("PP:failed");const c=[];for(const n of r){const r=await o((new TextEncoder).encode(n));if(!r)throw new Error("YNJ:Undefined");if(!(r instanceof Uint8Array))throw new Error("ODM:Invalid");c.push(e(r,!0))}return c})()}';
    return extractFnBodyAndArgs(fn2.toString());
  }

  static async getPot(
    innertube: Session,
    fetcher: FetchFunction = Platform.shim.fetch,
    evaluator: SandboxedEvaluator, identifiers: string | string[], requestToken?: string, apiKey?: string, debug = false
  ): Promise<any> {
    if (!requestToken) {
      requestToken = Constants.URLS.API.KEY2;
    }

    if (!apiKey) {
      apiKey = Constants.URLS.API.KEY;
    }

    identifiers = Array.isArray(identifiers) ? identifiers : [identifiers];

    let pot: any = null;
    let ttl: any = null;
    let refresh: any = null;
    const result = [];
    try {
      if (!debug) evaluator.setTimeout(5000);
      await evaluator.load();
      if (!debug) evaluator.setTimeout(null);

      const challenge = await BGUtils.createChallenge(innertube, fetcher, requestToken, null, apiKey);

      if (!challenge) {
        throw new Error('C is incorrect');
      }

      if (!challenge.program) {
        throw new Error('P is bad');
      }

      if (!challenge.globalName) {
        throw new Error('G is bad');
      }

      let interpreterUrl = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
      if (!interpreterUrl) {
        throw new Error('I is bad');
      }

      if (interpreterUrl.startsWith('//')) {
        interpreterUrl = `https:${interpreterUrl}`;
      }

      const bgScriptResponse = await fetcher(interpreterUrl);
      const interpreterJavascript = await bgScriptResponse.text();
      if (!interpreterJavascript) {
        throw new Error('Failed to fetch I');
      }

      if (!debug) evaluator.setTimeout(5000);
      await evaluator.evaluate(interpreterJavascript, [], []);
      if (!debug) evaluator.setTimeout(5000);
      const fn1 = this.getFn1();
      const response = await evaluator.evaluate(fn1.body, fn1.argNames, [challenge]);
      if (!debug) evaluator.setTimeout(null);

      const payload = [requestToken, response];
      const response2 = await fetcher(Constants.URLS.YT_BASE + Constants.URLS.YT_IT_GEN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json+protobuf',
          'x-goog-api-key': apiKey,
          'x-user-agent': 'grpc-web-javascript/0.1',
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify(payload)
      });

      if (!response2.ok) {
        throw new Error('It failed');
      }

      const tokenData = await response2.json();

      if (!tokenData.length || !tokenData[0]) {
        throw new Error('It none');
      }

      const it = tokenData[0];
      ttl = tokenData[1];
      refresh = tokenData[2];
      if (!debug) evaluator.setTimeout(5000);
      const fn2 = this.getFn2();
      pot = await evaluator.evaluate(fn2.body, fn2.argNames, [it, identifiers]);

      for (let i = 0; i < pot.length; i++) {
        result.push({
          id: identifiers[i],
          pot: pot[i]
        });
      }
      if (!debug) evaluator.close();
    } catch (err) {
      if (!debug) evaluator.close();
      throw err;
    }
    return { result, requestToken, ttl, refresh };
  }
}