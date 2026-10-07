import type { CapacitorConfig } from '@capacitor/cli';

// The control room app opens straight into /admin and reads the same API and
// database as the listener app, so everything an admin changes shows up for
// listeners immediately. WEB_URL comes from the build
// (docker-compose.mobile.yml) and is never committed.
const url = process.env.WEB_URL;
if (!url) throw new Error('WEB_URL is required to build the control room app');

const config: CapacitorConfig = {
  appId: 'pro.streamcast.controlroom',
  appName: 'StreamCast Control Room',
  webDir: 'www',
  server: {
    url: `${url}${process.env.START_PATH ?? ''}`
  }
};

export default config;
