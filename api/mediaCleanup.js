import { q } from './db.js';
import { removeStoredFile } from './uploads.js';

/**
 * Removing a published item is more than its row: it is the file it was published from and
 * the two records that would otherwise keep it alive.
 *
 * A sale and a live window both survive the item on purpose — `earnings.media_id` and
 * `live_sessions.media_id` are ON DELETE SET NULL in the schema, so the money keeps its
 * amount and the window keeps its history. Two things still have to happen here:
 *
 * - A window still *on air* over the item would keep showing listeners a stream with
 *   nothing behind it, so it is closed first.
 * - `sweepLiveRecordings()` re-archives any ended broadcast whose `recording_url` is no
 *   longer in `media` — which is exactly the row being deleted, so a deleted Relive
 *   capture would come back. Clearing the session's `recording_url` is what stops that.
 *
 * The file goes last, best effort: the row is already gone and a missing file is not an
 * error worth failing the request over.
 */
export async function removeMedia(media) {
  await q(
    "UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE media_id = $1 AND status = 'live'",
    [media.id]
  );
  await q('UPDATE live_sessions SET recording_url = NULL WHERE recording_url = $1', [media.url]);
  await q('DELETE FROM media WHERE id = $1', [media.id]);
  await removeStoredFile(media.url);
}
