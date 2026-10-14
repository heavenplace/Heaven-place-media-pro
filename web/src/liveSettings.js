import { api } from './api.js';

/**
 * The live-settings vocabulary, in one place because the same choices are now offered in
 * three places: the studio's go-live form, the control room's desk and — mirrored in
 * `mobile/native/core/.../LiveSettings.kt` — the Android studio.
 *
 * A station remembers the pair it was last set up with (`stations.stream_quality` and
 * `stations.stream_window`), so every station goes live with the settings its owner last
 * chose rather than falling back to a per-device guess.
 */
export const QUALITY = {
  audio: { label: 'Audio only (FM / radio)', audioOnly: true, audioBitsPerSecond: 192000 },
  '720p': { label: 'HD 720p · 30fps', size: [1280, 720], frameRate: 30, videoBitsPerSecond: 3500000, audioBitsPerSecond: 128000 },
  '1080p': { label: 'Full HD 1080p · 30fps', size: [1920, 1080], frameRate: 30, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 },
  '1080p60': { label: 'Full HD 1080p · 60fps', size: [1920, 1080], frameRate: 60, videoBitsPerSecond: 9000000, audioBitsPerSecond: 192000 },
  '4k': { label: '4K 2160p · 30fps', size: [3840, 2160], frameRate: 30, videoBitsPerSecond: 16000000, audioBitsPerSecond: 256000 }
};

export const WINDOWS = [
  ['1', '1 hour'],
  ['4', '4 hours'],
  ['12', '12 hours'],
  ['24', '24 hours'],
  ['permanent', '24/7 — never ends']
];

/** What the API accepts, so a station row can never carry a setting nothing can use. */
export const QUALITY_KEYS = Object.keys(QUALITY);
export const WINDOW_KEYS = WINDOWS.map(([value]) => value);

/**
 * What a station goes live with until its owner picks something else. Every station — FM or
 * TV — opens on the camera broadcast, the go-live screen Metro TV has: the owner picks the
 * front or back camera and watches the picture that is going out. "Audio only (FM / radio)"
 * stays in the list for a microphone-only broadcast.
 */
export const defaultQuality = () => '1080p';

/** The quality a station remembers, falling back to the default for its kind. */
export const stationQuality = (station) =>
  QUALITY_KEYS.includes(station?.stream_quality) ? station.stream_quality : defaultQuality(station?.kind);

/** The live window a station remembers, falling back to one hour. */
export const stationWindow = (station) =>
  WINDOW_KEYS.includes(station?.stream_window) ? station.stream_window : '1';

/**
 * Remember the settings on the station so the next go-live — here, in the control room or
 * on a phone — opens with them. Saving is a convenience, never a reason to refuse to go
 * live, so a failure is swallowed.
 */
export const rememberStreamSettings = (stationId, body) =>
  api(`/stations/${stationId}/stream`, { method: 'PATCH', body }).catch(() => {});
