import { useState } from 'react';
import type { Field } from '../types';
import { CROP_CONFIGS, type CropType } from '../utils/cropConfig';

interface FieldFormProps {
  field?: Field;
  onSubmit: (data: { name: string; sowingDate: string; cropType: CropType }) => void;
  onCancel: () => void;
}

export function FieldForm({ field, onSubmit, onCancel }: FieldFormProps) {
  const [name, setName] = useState(field?.name ?? '');
  const [sowingDate, setSowingDate] = useState(field?.sowingDate ?? '');
  const [cropType, setCropType] = useState<CropType>(field?.cropType ?? 'corn');

  const isEditing = !!field;
  const isValid = name.trim().length > 0 && sowingDate.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ name: name.trim(), sowingDate, cropType });
  };

  return (
    <div className="agraria-card">
      <div className="sec-label">{isEditing ? 'Edit Field' : 'New Field'}</div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>Field Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., North 40, River Field"
            className="agraria-input"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>Crop</label>
          <select
            value={cropType}
            onChange={(e) => setCropType(e.target.value as CropType)}
            className="agraria-input"
          >
            {(Object.entries(CROP_CONFIGS) as [CropType, typeof CROP_CONFIGS.corn][]).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>Sowing Date</label>
          <input
            type="date"
            value={sowingDate}
            onChange={(e) => setSowingDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="agraria-input"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-[var(--r)] text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="agraria-btn-primary flex-1"
          >
            {isEditing ? 'Save Changes' : '+ Add Field'}
          </button>
        </div>
      </form>
    </div>
  );
}
