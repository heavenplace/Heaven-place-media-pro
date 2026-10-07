// The APKs are produced by `docker compose -f docker-compose.mobile.yml run --rm android`
// and served from /downloads (see AGENTS.md).
const LISTENER_APK = '/downloads/streamcast-listener-release.apk';
const CONTROL_ROOM_APK = '/downloads/streamcast-admin-release.apk';

export default function GetTheApp() {
  return (
    <section className="panel between">
      <div>
        <div className="row" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>Get the Android app</h2>
          <span className="badge">APK</span>
        </div>
        <p className="small muted" style={{ margin: '6px 0 0', maxWidth: 560 }}>
          Listen and watch from your phone without a browser. Download the file, tap it, then
          allow installs from this source.
        </p>
      </div>
      <div className="row">
        <a className="btn btn-primary" href={LISTENER_APK} download>
          Listener app
        </a>
        <a className="btn" href={CONTROL_ROOM_APK} download>
          Admin app
        </a>
      </div>
    </section>
  );
}
