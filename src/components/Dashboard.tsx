import type { Field } from '../types';
import { FieldCard } from './FieldCard';

interface DashboardProps {
  fields: Field[];
  onFieldClick: (field: Field) => void;
  onAddField: () => void;
}

export function Dashboard({ fields, onFieldClick, onAddField }: DashboardProps) {
  if (fields.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🌽</div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--tx)' }}>
          No fields yet
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--tx3)' }}>
          Add your first field to start tracking Growing Degree Days.
        </p>
        <button onClick={onAddField} className="agraria-btn-primary">
          + Add Your First Field
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldCard key={field.id} field={field} onClick={() => onFieldClick(field)} />
      ))}
    </div>
  );
}
