import type { StationInfo } from '../utils/api';
import type { Farm } from '../types';

interface SettingsProps {
  onSaved: () => void;
  stations: StationInfo[];
  onLogout: () => void;
  currentFarm?: Farm | null;
  onDeleteFarm?: () => void;
}

export function Settings({ onLogout, currentFarm, onDeleteFarm }: SettingsProps) {
  return (
    <div className="space-y-3">
      {/* Current Farm info */}
      {currentFarm && (
        <div className="agraria-card">
          <div className="sec-label">Current Farm</div>
          <div className="space-y-1.5 text-xs" style={{ color: 'var(--tx2)' }}>
            <div className="flex justify-between">
              <span>Name</span>
              <span style={{ color: 'var(--tx)' }}>{currentFarm.name}</span>
            </div>
            {currentFarm.stationName && (
              <div className="flex justify-between">
                <span>Station</span>
                <span style={{ color: 'var(--tx)' }}>{currentFarm.stationName}</span>
              </div>
            )}
            {currentFarm.latitude !== null && currentFarm.longitude !== null && (
              <div className="flex justify-between">
                <span>Location</span>
                <span style={{ color: 'var(--tx)' }}>
                  {currentFarm.latitude.toFixed(4)}, {currentFarm.longitude.toFixed(4)}
                </span>
              </div>
            )}
          </div>
          {onDeleteFarm && (
            <button
              onClick={onDeleteFarm}
              className="mt-3 text-[11px] px-3 py-1.5 rounded-[var(--r)] border"
              style={{ borderColor: 'var(--dt)', color: 'var(--dt)', background: 'transparent' }}
            >
              Delete Farm
            </button>
          )}
        </div>
      )}

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
