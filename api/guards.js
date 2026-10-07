import { q } from './db.js';

export const logActivity = (userId, type, detail, stationId = null) =>
  q('INSERT INTO activity (user_id, type, detail, station_id) VALUES ($1,$2,$3,$4)', [
    userId ?? null,
    type,
    detail ?? null,
    stationId ?? null
  ]);

export async function canManageStation(user, stationId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const { rows } = await q('SELECT owner_id FROM stations WHERE id = $1', [stationId]);
  return rows.length > 0 && rows[0].owner_id === user.id;
}

export async function isPremium(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.tier === 'premium') return true;
  const { rows } = await q(
    "SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > now())",
    [user.id]
  );
  return rows.length > 0;
}

export async function hasDownloadEntitlement(user, mediaId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const { rows } = await q(
    "SELECT 1 FROM entitlements WHERE user_id = $1 AND kind = 'download' AND media_id = $2",
    [user.id, mediaId]
  );
  return rows.length > 0;
}
