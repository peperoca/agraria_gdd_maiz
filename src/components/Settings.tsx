import { useState } from 'react';
import { getSettings, saveSettings } from '../utils/storage';
import type { StationInfo } from '../utils/api';

interface SettingsProps {
  onSaved: () => void;
  stations: StationInfo[];
  onLogout: () => void;
}

export function Settings({ onSaved, stations, onLogout }: SettingsProps) {
  const [settings, setSettings] = useState(() => getSettings());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="agraria-card space-y-4">
        <div className="sec-label">Weather Station</div>

        {stations.length === 0 ? (
          <div className="agraria-info-row">
            <p className="text-xs" style={{ color: 'var(--it)' }}>
              No weather stations assigned to your account. Contact your administrator.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--tx2)' }}>Select Station</label>
            <select
              value={settings.stationMac}
              onChange={(e) => {
                const station = stations.find((s) => s.mac === e.target.value);
                setSettings({
                  stationMac: e.target.value,
                  stationName: station?.name ?? e.target.value,
                });
              }}
              className="agraria-input"
            >
              <option value="">Select a station...</option>
              {stations.map((s) => (
                <option key={s.mac} value={s.mac}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!settings.stationMac}
          className="agraria-btn-primary w-full"
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Station info */}
      {settings.stationMac && stations.length > 0 && (() => {
        const current = stations.find((s) => s.mac === settings.stationMac);
        if (!current) return null;
        return (
          <div className="agraria-card">
            <div className="sec-label">Station Info</div>
            <div className="space-y-1.5 text-xs" style={{ color: 'var(--tx2)' }}>
              <div className="flex justify-between">
                <span>Name</span>
                <span style={{ color: 'var(--tx)' }}>{current.name}</span>
              </div>
              <div className="flex justify-between">
                <span>MAC</span>
                <span style={{ color: 'var(--tx)' }} className="font-mono text-[11px]">{current.mac}</span>
              </div>
              {current.latitude !== 0 && (
                <div className="flex justify-between">
                  <span>Location</span>
                  <span style={{ color: 'var(--tx)' }}>
                    {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}
                  </span>
                </div>
              )}
              {current.elevationM > 0 && (
                <div className="flex justify-between">
                  <span>Elevation</span>
                  <span style={{ color: 'var(--tx)' }}>{current.elevationM}m</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Account */}
      <div className="agraria-card space-y-3">
        <div className="sec-label">Account</div>
        <button
          onClick={onLogout}
          className="agraria-btn-secondary w-full flex items-center justify-center gap-2"
        >
          Sign Out
        </button>
        <p className="text-[11px]" style={{ color: 'var(--tx3)' }}>
          Your fields and weather data are stored on the server and synced across devices.
        </p>
      </div>
    </div>
  );
}
