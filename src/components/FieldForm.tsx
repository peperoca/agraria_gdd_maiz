import { useState } from 'react';
import type { Field } from '../types';

interface FieldFormProps {
  field?: Field;
  onSubmit: (data: { name: string; sowingDate: string }) => void;
  onCancel: () => void;
}

export function FieldForm({ field, onSubmit, onCancel }: FieldFormProps) {
  const [name, setName] = useState(field?.name ?? '');
  const [sowingDate, setSowingDate] = useState(field?.sowingDate ?? '');

  const isEditing = !!field;
  const isValid = name.trim().length > 0 && sowingDate.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ name: name.trim(), sowingDate });
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-5">
        <h2 className="text-lg font-semibold text-corn-800 mb-4">
          {isEditing ? 'Edit Field' : 'Add Field'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Field Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., North 40, River Field"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corn-500 focus:border-corn-500 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sowing Date
            </label>
            <input
              type="date"
              value={sowingDate}
              onChange={(e) => setSowingDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corn-500 focus:border-corn-500 text-sm"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="flex-1 py-3 px-4 rounded-lg bg-corn-600 text-white hover:bg-corn-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              {isEditing ? 'Save Changes' : 'Add Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
