import { useState } from 'react';
import Overview from './Overview.jsx';
import Activity from './Activity.jsx';
import Stations from './Stations.jsx';
import Media from './Media.jsx';
import Live from './Live.jsx';
import Requests from './Requests.jsx';
import Users from './Users.jsx';

const TABS = [
  ['overview', 'Overview', Overview],
  ['activity', 'Listener activity', Activity],
  ['stations', 'Stations', Stations],
  ['media', 'Media', Media],
  ['live', 'Live control', Live],
  ['requests', 'Access requests', Requests],
  ['users', 'Users', Users]
];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const Active = TABS.find(([id]) => id === tab)[2];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div>
          <h1>Control room</h1>
          <p className="muted small">Everything listeners see is controlled from here.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <Active />
    </div>
  );
}
