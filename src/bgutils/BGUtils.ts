/*
  From BGUtils

  MIT License

  Copyright (c) 2024 LuanRT

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { ProtoUtils } from '../platform/lib.js';
import type { FetchFunction } from '../types/PlatformShim.js';
import { Platform, Utils } from '../utils/index.js';
import { SandboxedEvaluator } from './SandboxedEvaluator.js';

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
      [ ...base64Mod ].map((char) => char.charCodeAt(0))
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

  static async createChallenge(fetcher: FetchFunction, requestToken: string, interpreterHash: string | null, apiKey: string): Promise<any> {
    const payload = [ requestToken ];

    if (interpreterHash) {
      payload.push(interpreterHash);
    }

    const response = await fetcher(BGUtils.b64ToBuf('BxMTDxLZzs4JDQ3MDwDNBg4OBgsEAA8IEs0CDgzOwxEPAs4GDg4GCwTNCA0TBBENAAvNFgAAzRXQzfYAAM7iEQQAEwQ='), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json+protobuf',
        'User-Agent': USER_AGENT,
        'x-goog-api-key': apiKey,
        'x-user-agent': 'grpc-web-javascript/0.1'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const challenge = await response.json();

    if (challenge.length > 1 && challenge[1]) {
      const parsedChallenge = BGUtils.parseChallenge(challenge[1]);
      if (parsedChallenge) {
        return parsedChallenge;
      }
    }
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
      const [ messageId, script, , interpreterHash, challenge, globalName ] = JSON.parse(str);
      return {
        script,
        interpreterHash,
        globalName,
        challenge,
        messageId
      };
    }
  }

  static getFn1(): any {
    const fn1 = '(n){return(async()=>{const r=window[n.globalName];if(!r)throw new Error("V not found");const o={fn1:null,fn2:null,fn3:null,fn4:null};if(!r.a)throw new Error("Init failed");try{await r.a(n.challenge,(function(n,r,t,f){o.fn1=n,o.fn2=r,o.fn3=t,o.fn4=f}),!0,void 0,((...n)=>{}))}catch(n){throw new Error("Failed to load")}if(!o.fn1)throw new Error("fn1 unavailable.");let t=null;const f=[];if(await o.fn1((n=>{t=n}),[,,f]),!t)throw new Error("[BG]: No response");if(!f.length)throw new Error("No ppf");return window.ppf=f,t})()}';
    return SandboxedEvaluator.extractFnBodyAndArgs(fn1);
  }

  static getFn2(): any {
    const fn2 = '(r,e){const t=window.ppf[0];if(!t)throw new Error("PP:Undefined");return(async()=>{const n=await t((r=>{const e={"-":"+",_:"/",".":"="};let t;return t=/[-_.]/g.test(r)?r.replace(/[-_.]/g,(r=>e[r])):r,t=atob(t),new Uint8Array([...t].map((r=>r.charCodeAt(0))))})(r));if("function"!=typeof n)throw new Error("PP:failed");const o=((r,e=!1)=>{const t=btoa(String.fromCharCode(...r));return e?t.replace(/\\+/g,"-").replace(/\\//g,"_"):t})(await n((new TextEncoder).encode(e)),!0);if(o.length>80)return o;throw new Error("PT too small")})()}';
    return SandboxedEvaluator.extractFnBodyAndArgs(fn2.toString());
  }

  static async getPot(fetcher: FetchFunction = Platform.shim.fetch, runnerLocation: string, vd?: string, requestToken?: string, apiKey?: string, debug = false): Promise<any> {
    if (!requestToken) {
      requestToken = BGUtils.b64ToBuf('7tPSGc8DDwkHBvfRz/LiF9Pq4A4=');
    }

    if (!apiKey) {
      apiKey = BGUtils.b64ToBuf('4OgZAPIY4xjz1PbP6QfT2OXSz+8QEBMYBQMF1g/j6+Xq6+kO4A0W');
    }

    if (!vd) {
      vd = ProtoUtils.encodeVisitorData(Utils.generateRandomString(11), Math.floor(Date.now() / 1000));
    }

    const evaluator = new SandboxedEvaluator(runnerLocation);
    let pot: any = null;
    let ttl: any = null;
    let refresh: any = null;
    try {
      if (!debug) evaluator.setTimeout(5000);
      await evaluator.load();
      if (!debug) evaluator.setTimeout(null);

      const challenge = await BGUtils.createChallenge(fetcher, requestToken, null, apiKey);

      if (!challenge) {
        throw new Error('C is incorrect');
      }

      if (!challenge.script) {
        throw new Error('CS is bad');
      }

      const script = challenge.script.find((sc: any) => sc !== null);
      if (!script) {
        throw new Error('CS is null');
      }

      if (!debug) evaluator.setTimeout(5000);
      await evaluator.evaluate(script, [], []);
      if (!debug) evaluator.setTimeout(5000);
      const fn1 = this.getFn1();
      const response = await evaluator.evaluate(fn1.body, fn1.argNames, [ challenge ]);
      if (!debug) evaluator.setTimeout(null);

      const payload = [ requestToken, response ];
      const response2 = await fetcher(BGUtils.b64ToBuf('BxMTDxLZzs4JDQ3MDwDNBg4OBgsEAA8IEs0CDgzOwxEPAs4GDg4GCwTNCA0TBBENAAvNFgAAzRXQzfYAAM7mBA0EEQATBOjz'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json+protobuf',
          'x-goog-api-key': apiKey,
          'x-user-agent': 'grpc-web-javascript/0.1',
          'User-Agent': USER_AGENT,
          'Accept': '*/*'
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
      pot = await evaluator.evaluate(fn2.body, fn2.argNames, [ it, vd ]);

      if (!debug) evaluator.close();
    } catch (err) {
      if (!debug) evaluator.close();
      throw err;
    }
    return { pot, vd, requestToken, ttl, refresh };
  }
}