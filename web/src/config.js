import { useEffect, useState } from 'react';
import { api } from './api.js';

// Public server configuration (Google client id, whether card payments are on).
// Fetched once per page load and shared by everyone who asks for it.
let pending = null;

export function loadConfig() {
  if (!pending) pending = api('/config').catch(() => ({}));
  return pending;
}

export function useConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let live = true;
    loadConfig().then((value) => {
      if (live) setConfig(value);
    });
    return () => {
      live = false;
    };
  }, []);

  return config;
}
