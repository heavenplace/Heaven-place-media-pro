import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadConfig } from '../config.js';
import { useAuth } from '../AuthContext.jsx';

// Renders Google's own "Sign in with Google" button. Google hands the browser a
// signed ID token, which the API verifies — see api/google.js.
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let script = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!script) {
    script = new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = GIS_SRC;
      element.async = true;
      element.defer = true;
      element.onload = () => resolve();
      element.onerror = () => {
        script = null;
        reject(new Error('Could not reach Google sign-in'));
      };
      document.head.appendChild(element);
    });
  }
  return script;
}

export default function GoogleSignIn({ clientId, onError }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const holder = useRef(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    let live = true;
    setFailed('');

    loadGoogleScript()
      .then(() => {
        if (!live || !window.google?.accounts?.id || !holder.current) return;
        holder.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              await loginWithGoogle(credential);
              navigate('/');
            } catch (error) {
              onError?.(error.message);
            } finally {
              setBusy(false);
            }
          }
        });
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width: 360
        });
      })
      .catch((error) => {
        if (live) setFailed(error.message);
      });

    return () => {
      live = false;
    };
  }, [clientId, loginWithGoogle, navigate, onError]);

  if (failed) return <div className="notice notice-error small">{failed}</div>;

  return (
    <div className="stack" style={{ gap: 8, alignItems: 'center' }}>
      <div ref={holder} />
      {busy && <span className="spinner" />}
    </div>
  );
}

/** Google sign-in button when the server has a client id, otherwise a hint. */
export function GoogleSignInGate({ onError, onUnavailable }) {
  const [clientId, setClientId] = useState(null);

  useEffect(() => {
    let live = true;
    loadConfig().then((config) => {
      if (live) setClientId(config?.google_client_id || '');
    });
    return () => {
      live = false;
    };
  }, []);

  if (clientId === null) return null;
  if (!clientId) return onUnavailable ? onUnavailable() : null;
  return <GoogleSignIn clientId={clientId} onError={onError} />;
}
