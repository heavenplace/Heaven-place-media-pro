import type { CapacitorConfig } from '@capacitor/cli';

// The app is a shell around the live StreamCast Pro site, so the listener app
// and the control room always read the same API and database — there is nothing
// to sync between them. WEB_URL comes from the build
// (docker-compose.mobile.yml) and is never committed, because the sandbox
// address changes.
const url = process.env.WEB_URL;
if (!url) throw new Error('WEB_URL is required to build the listener app');

const config: CapacitorConfig = {
  appId: 'pro.streamcast.listener',
  appName: 'StreamCast Pro',
  webDir: 'www',
  server: {
    url: `${url}${process.env.START_PATH ?? ''}`
  }
};

export default config;
