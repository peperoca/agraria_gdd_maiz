import type { Farm } from '../types';

interface FarmSwitcherProps {
  farms: Farm[];
  currentFarmId: number | null;
  onFarmChange: (farmId: number) => void;
  onAddFarm: () => void;
}

export function FarmSwitcher({ farms, currentFarmId, onFarmChange, onAddFarm }: FarmSwitcherProps) {
  if (farms.length === 0) {
    return (
      <button
        onClick={onAddFarm}
        className="text-[11px] px-2.5 py-1 rounded-[var(--r)] font-medium"
        style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}
      >
        + Add Farm
      </button>
    );
  }

  const ownedFarms = farms.filter((f) => !f.access || f.access === 'owner');
  const sharedFarms = farms.filter((f) => f.access === 'shared');
  const adminFarms = farms.filter((f) => f.access === 'admin');
  const hasGroups = sharedFarms.length > 0 || adminFarms.length > 0;

  return (
    <select
      value={currentFarmId ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '__add__') {
          onAddFarm();
        } else {
          onFarmChange(Number(val));
        }
      }}
      className="text-[11px] px-2 py-1 rounded-[var(--r)] font-medium border-none cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.15)',
        color: '#fff',
        maxWidth: '180px',
      }}
    >
      {hasGroups ? (
        <>
          {ownedFarms.length > 0 && (
            <optgroup label="My Farms" style={{ color: '#000' }}>
              {ownedFarms.map((f) => (
                <option key={f.id} value={f.id} style={{ color: '#000' }}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
          {sharedFarms.length > 0 && (
            <optgroup label="Shared with me" style={{ color: '#000' }}>
              {sharedFarms.map((f) => (
                <option key={f.id} value={f.id} style={{ color: '#000' }}>
                  {f.name}{f.ownerUsername ? ` (${f.ownerUsername})` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {adminFarms.length > 0 && (
            <optgroup label="All Farms (Admin)" style={{ color: '#000' }}>
              {adminFarms.map((f) => (
                <option key={f.id} value={f.id} style={{ color: '#000' }}>
                  {f.name}{f.ownerUsername ? ` (${f.ownerUsername})` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </>
      ) : (
        farms.map((f) => (
          <option key={f.id} value={f.id} style={{ color: '#000' }}>
            {f.name}
          </option>
        ))
      )}
      <option value="__add__" style={{ color: '#000' }}>+ Add Farm...</option>
    </select>
  );
}
