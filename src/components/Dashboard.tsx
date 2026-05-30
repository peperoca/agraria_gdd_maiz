import type { Field } from '../types';
import { FieldCard } from './FieldCard';
import { WeatherStationCard } from './WeatherStationCard';

interface DashboardProps {
  fields: Field[];
  onFieldClick: (field: Field) => void;
  onAddField: () => void;
  stationMac?: string | null;
  stationName?: string | null;
  stationDistanceKm?: number | null;
  canWrite?: boolean;
}

export function Dashboard({ fields, onFieldClick, onAddField, stationMac, stationName, stationDistanceKm, canWrite = true }: DashboardProps) {
  if (fields.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🌽</div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--tx)' }}>
          {canWrite ? 'No fields yet' : 'No fields'}
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--tx3)' }}>
          {canWrite
            ? 'Add your first field to start tracking Growing Degree Days.'
            : 'This shared farm has no fields yet.'}
        </p>
        {canWrite && (
          <button onClick={onAddField} className="agraria-btn-primary">
            + Add Your First Field
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stationMac && (
        <WeatherStationCard stationMac={stationMac} stationName={stationName || stationMac} stationDistanceKm={stationDistanceKm} />
      )}
      {fields.map((field) => (
        <FieldCard key={field.id} field={field} onClick={() => onFieldClick(field)} />
      ))}
    </div>
  );
}
