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
        maxWidth: '160px',
      }}
    >
      {farms.map((f) => (
        <option key={f.id} value={f.id} style={{ color: '#000' }}>
          {f.name}
        </option>
      ))}
      <option value="__add__" style={{ color: '#000' }}>+ Add Farm...</option>
    </select>
  );
}
