import { OAuth2Client } from 'google-auth-library';

// Google sign-in uses the browser "Sign in with Google" credential flow: the
// client gets a signed ID token from Google and posts it here, where we verify
// it against Google's public keys. Only the (public) client id is needed — no
// client secret — so the same id is served to the web app via /api/config.

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID);

let client = null;

export async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const error = new Error('Google sign-in is not configured on this server');
    error.status = 503;
    throw error;
  }

  if (!client) client = new OAuth2Client(clientId);

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: String(credential), audience: clientId });
  } catch {
    const error = new Error('That Google sign-in could not be verified');
    error.status = 401;
    throw error;
  }

  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified === false) {
    const error = new Error('That Google account has no verified email address');
    error.status = 401;
    throw error;
  }

  return {
    email: String(payload.email).toLowerCase(),
    name: payload.name || String(payload.email).split('@')[0],
    picture: payload.picture || null
  };
}
