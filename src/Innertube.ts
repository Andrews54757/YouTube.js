import Session from './core/Session.js';

import {
  Playlist,
  VideoInfo
} from './parser/youtube/index.js';

import { ShortFormVideoInfo } from './parser/ytshorts/index.js';

import NavigationEndpoint from './parser/classes/NavigationEndpoint.js';

import { generateRandomString, InnertubeError, throwIfMissing, u8ToBase64 } from './utils/Utils.js';

import type { ApiResponse } from './core/Actions.js';
import type {
  DownloadOptions,
  EngagementType,
  FormatOptions,
  InnerTubeClient,
  InnerTubeConfig
} from './types/index.js';
import type { IParsedResponse } from './parser/index.js';
import type Format from './parser/classes/misc/Format.js';

import {
  ReelSequence
} from '../protos/generated/misc/params.js';

/**
 * Provides access to various services and modules in the YouTube API.
 *
 * @example
 * ```ts
 * import { Innertube, UniversalCache } from 'youtubei.js';
 * const innertube = await Innertube.create({ cache: new UniversalCache(true)});
 * ```
 */
export default class Innertube {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  static async create(config: InnerTubeConfig): Promise<Innertube> {
    return new Innertube(await Session.create(config));
  }

  async getInfo(target: string | NavigationEndpoint, client?: InnerTubeClient): Promise<VideoInfo> {
    throwIfMissing({ target });

    const payload = {
      videoId: target instanceof NavigationEndpoint ? target.payload?.videoId : target,
      playlistId: target instanceof NavigationEndpoint ? target.payload?.playlistId : undefined,
      playlistIndex: target instanceof NavigationEndpoint ? target.payload?.playlistIndex : undefined,
      params: target instanceof NavigationEndpoint ? target.payload?.params : undefined,
      racyCheckOk: true,
      contentCheckOk: true
    };

    const watch_endpoint = new NavigationEndpoint({ watchEndpoint: payload });
    const watch_next_endpoint = new NavigationEndpoint({ watchNextEndpoint: payload });

    const extra_payload: Record<string, any> = {
      playbackContext: {
        contentPlaybackContext: {
          vis: 0,
          splay: false,
          lactMilliseconds: '-1',
          signatureTimestamp: this.#session.player?.sts
        }
      },
      client
    };

    if (this.#session.po_token) {
      extra_payload.serviceIntegrityDimensions = {
        poToken: this.#session.po_token
      };
    }

    const watch_response = watch_endpoint.call(this.#session.actions, extra_payload);
    const watch_next_response = watch_next_endpoint.call(this.#session.actions);

    const response = await Promise.all([ watch_response, watch_next_response ]);

    const cpn = generateRandomString(16);

    return new VideoInfo(response, this.actions, cpn);
  }

  async getBasicInfo(video_id: string, client?: InnerTubeClient): Promise<VideoInfo> {
    throwIfMissing({ video_id });

    const watch_endpoint = new NavigationEndpoint({ watchEndpoint: { videoId: video_id } });

    const extra_payload: Record<string, any> = {
      playbackContext: {
        contentPlaybackContext: {
          vis: 0,
          splay: false,
          lactMilliseconds: '-1',
          signatureTimestamp: this.#session.player?.sts
        }
      },
      client
    };

    if (this.#session.po_token) {
      extra_payload.serviceIntegrityDimensions = {
        poToken: this.#session.po_token
      };
    }
    
    const watch_response = await watch_endpoint.call(this.#session.actions, extra_payload);

    const cpn = generateRandomString(16);

    return new VideoInfo([ watch_response ], this.actions, cpn);
  }

  async getShortsVideoInfo(video_id: string, client?: InnerTubeClient): Promise<ShortFormVideoInfo> {
    throwIfMissing({ video_id });

    const reel_watch_endpoint = new NavigationEndpoint({
      reelWatchEndpoint: {
        disablePlayerResponse: false,
        params: 'CAUwAg%3D%3D',
        videoId: video_id
      }
    });

    const reel_watch_response = reel_watch_endpoint.call(this.#session.actions, { client });

    const writer = ReelSequence.encode({
      shortId: video_id,
      params: {
        number: 5
      },
      feature2: 25,
      feature3: 0
    });

    const params = encodeURIComponent(u8ToBase64(writer.finish()));

    const sequence_response = this.actions.execute('/reel/reel_watch_sequence', { sequenceParams: params });

    const response = await Promise.all([ reel_watch_response, sequence_response ]);

    const cpn = generateRandomString(16);

    return new ShortFormVideoInfo([ response[0] ], this.actions, cpn, response[1]);
  }
  async getPlaylist(id: string): Promise<Playlist> {
    throwIfMissing({ id });

    if (!id.startsWith('VL')) {
      id = `VL${id}`;
    }

    const browse_endpoint = new NavigationEndpoint({ browseEndpoint: { browseId: id } });
    const response = await browse_endpoint.call(this.#session.actions);

    return new Playlist(this.actions, response);
  }

  /**
   * An alternative to {@link download}.
   * Returns deciphered streaming data.
   *
   * If you wish to retrieve the video info too, have a look at {@link getBasicInfo} or {@link getInfo}.
   * @param video_id - The video id.
   * @param options - Format options.
   */
  async getStreamingData(video_id: string, options: FormatOptions = {}): Promise<Format> {
    const info = await this.getBasicInfo(video_id);

    const format = info.chooseFormat(options);
    format.url = await format.decipher(this.#session.player);

    return format;
  }

  /**
   * Downloads a given video. If all you need the direct download link, see {@link getStreamingData}.
   * If you wish to retrieve the video info too, have a look at {@link getBasicInfo} or {@link getInfo}.
   * @param video_id - The video id.
   * @param options - Download options.
   */
  async download(video_id: string, options?: DownloadOptions): Promise<ReadableStream<Uint8Array>> {
    const info = await this.getBasicInfo(video_id, options?.client);
    return info.download(options);
  }

  /**
   * Resolves the given URL.
   */
  async resolveURL(url: string): Promise<NavigationEndpoint> {
    const response = await this.actions.execute('/navigation/resolve_url', { url, parse: true });

    if (!response.endpoint)
      throw new InnertubeError('Failed to resolve URL. Expected a NavigationEndpoint but got undefined', response);

    return response.endpoint;
  }

  /**
   * Fetches an attestation challenge.
   */
  async getAttestationChallenge(engagement_type: EngagementType, ids?: Record<string, any>[]) {
    const payload: Record<string, any> = {
      engagementType: engagement_type
    };
    
    if (ids)
      payload.ids = ids;
    
    return this.actions.execute('/att/get', { parse: true, ...payload });
  }

  /**
   * Utility method to call an endpoint without having to use {@link Actions}.
   */
  call<T extends IParsedResponse>(endpoint: NavigationEndpoint, args: { [key: string]: any; parse: true }): Promise<T>;
  call(endpoint: NavigationEndpoint, args?: { [key: string]: any; parse?: false }): Promise<ApiResponse>;
  call(endpoint: NavigationEndpoint, args?: object): Promise<IParsedResponse | ApiResponse> {
    return endpoint.call(this.actions, args);
  }

  /**
   * An internal class used to dispatch requests.
   */
  get actions() {
    return this.#session.actions;
  }

  /**
   * The session used by this instance.
   */
  get session() {
    return this.#session;
  }
}