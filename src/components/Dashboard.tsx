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
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🌽</div>
        <h2 className="text-xl font-semibold text-corn-800 mb-2">No fields yet</h2>
        <p className="text-gray-500 mb-6 text-sm">
          Add your first field to start tracking Growing Degree Days.
        </p>
        <button
          onClick={onAddField}
          className="bg-corn-600 text-white py-3 px-6 rounded-xl hover:bg-corn-700 transition-colors font-medium shadow-sm"
        >
          + Add Your First Field
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {fields.map((field) => (
        <FieldCard
          key={field.id}
          field={field}
          onClick={() => onFieldClick(field)}
        />
      ))}
    </div>
  );
}
