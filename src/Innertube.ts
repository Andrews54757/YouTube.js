import Session from './core/Session.js';

import {
  BrowseEndpoint,
  NextEndpoint,
  PlayerEndpoint,
  Reel
} from './core/endpoints/index.js';

import {
  Playlist,
  VideoInfo
} from './parser/youtube/index.js';

import { ShortFormVideoInfo } from './parser/ytshorts/index.js';

import NavigationEndpoint from './parser/classes/NavigationEndpoint.js';

import * as Proto from './proto/index.js';
import { InnertubeError, generateRandomString, throwIfMissing } from './utils/Utils.js';

import type { ApiResponse } from './core/Actions.js';
import type { INextRequest } from './types/index.js';
import type { IParsedResponse } from './parser/types/index.js';
import type { DownloadOptions, FormatOptions } from './types/FormatUtils.js';
import type { SessionOptions } from './core/Session.js';
import type Format from './parser/classes/misc/Format.js';

export type InnertubeConfig = SessionOptions;

export type InnerTubeClient = 'IOS' | 'WEB' | 'ANDROID' | 'YTMUSIC' | 'YTMUSIC_ANDROID' | 'YTSTUDIO_ANDROID' | 'TV_EMBEDDED' | 'YTKIDS';

export type SearchFilters = Partial<{
  upload_date: 'all' | 'hour' | 'today' | 'week' | 'month' | 'year';
  type: 'all' | 'video' | 'channel' | 'playlist' | 'movie';
  duration: 'all' | 'short' | 'medium' | 'long';
  sort_by: 'relevance' | 'rating' | 'upload_date' | 'view_count';
  features: ('hd' | 'subtitles' | 'creative_commons' | '3d' | 'live' | 'purchased' | '4k' | '360' | 'location' | 'hdr' | 'vr180')[];
}>;

/**
 * Provides access to various services and modules in the YouTube API.
 */
export default class Innertube {
  #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  static async create(config: InnertubeConfig): Promise<Innertube> {
    return new Innertube(await Session.create(config));
  }

  async getInfo(target: string | NavigationEndpoint, client?: InnerTubeClient): Promise<VideoInfo> {
    throwIfMissing({ target: target });

    let next_payload: INextRequest;

    if (target instanceof NavigationEndpoint) {
      next_payload = NextEndpoint.build({
        video_id: target.payload?.videoId,
        playlist_id: target.payload?.playlistId,
        params: target.payload?.params,
        playlist_index: target.payload?.index
      });
    } else if (typeof target === 'string') {
      next_payload = NextEndpoint.build({
        video_id: target
      });
    } else {
      throw new InnertubeError('Invalid target. Expected a video id or NavigationEndpoint.', target);
    }

    if (!next_payload.videoId)
      throw new InnertubeError('Video id cannot be empty', next_payload);

    const player_payload = PlayerEndpoint.build({
      video_id: next_payload.videoId,
      playlist_id: next_payload?.playlistId,
      client: client,
      sts: this.#session.player?.sts,
      po_token: this.#session.po_token
    });

    const player_response = this.actions.execute(PlayerEndpoint.PATH, player_payload);
    const next_response = this.actions.execute(NextEndpoint.PATH, next_payload);
    const response = await Promise.all([ player_response, next_response ]);

    const cpn = generateRandomString(16);

    return new VideoInfo(response, this.actions, cpn);
  }

  async getBasicInfo(video_id: string, client?: InnerTubeClient): Promise<VideoInfo> {
    throwIfMissing({ video_id });

    const response = await this.actions.execute(
      PlayerEndpoint.PATH, PlayerEndpoint.build({
        video_id: video_id,
        client: client,
        sts: this.#session.player?.sts,
        po_token: this.#session.po_token
      })
    );

    const cpn = generateRandomString(16);

    return new VideoInfo([ response ], this.actions, cpn);
  }

  async getShortsVideoInfo(video_id: string, client?: InnerTubeClient): Promise<ShortFormVideoInfo> {
    throwIfMissing({ video_id });

    const watch_response = this.actions.execute(
      Reel.ReelItemWatchEndpoint.PATH, Reel.ReelItemWatchEndpoint.build({ video_id, client })
    );

    const sequence_response = this.actions.execute(
      Reel.ReelWatchSequenceEndpoint.PATH, Reel.ReelWatchSequenceEndpoint.build({
        sequence_params: Proto.encodeReelSequence(video_id)
      })
    );

    const response = await Promise.all([ watch_response, sequence_response ]);

    const cpn = generateRandomString(16);

    return new ShortFormVideoInfo([ response[0] ], this.actions, cpn, response[1]);
  }
  async getPlaylist(id: string): Promise<Playlist> {
    throwIfMissing({ id });

    if (!id.startsWith('VL')) {
      id = `VL${id}`;
    }

    const response = await this.actions.execute(
      BrowseEndpoint.PATH, BrowseEndpoint.build({ browse_id: id })
    );

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
   * Utility method to call an endpoint without having to use {@link Actions}.
   * @param endpoint -The endpoint to call.
   * @param args - Call arguments.
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