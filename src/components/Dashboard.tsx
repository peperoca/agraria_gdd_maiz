import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field } from '../types';
import { FieldCard } from './FieldCard';
import { WeatherStationCard } from './WeatherStationCard';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';

const FIELD_ORDER_KEY = 'agraria-field-order';

const CROP_EMOJI: Record<string, string> = {
  corn: '🌽',
  soybean: '🫘',
  wheat: '🌾',
  rapeseed: '🌻',
};

function getSavedOrder(farmId: number | undefined): number[] {
  if (!farmId) return [];
  try {
    const raw = localStorage.getItem(FIELD_ORDER_KEY);
    if (!raw) return [];
    const orders = JSON.parse(raw) as Record<string, number[]>;
    return orders[String(farmId)] || [];
  } catch { return []; }
}

function saveOrder(farmId: number | undefined, ids: number[]): void {
  if (!farmId) return;
  try {
    const raw = localStorage.getItem(FIELD_ORDER_KEY);
    const orders = raw ? JSON.parse(raw) : {};
    orders[String(farmId)] = ids;
    localStorage.setItem(FIELD_ORDER_KEY, JSON.stringify(orders));
  } catch { /* ignore */ }
}

interface DashboardProps {
  fields: Field[];
  onFieldClick: (field: Field) => void;
  onAddField: () => void;
  stationMac?: string | null;
  stationName?: string | null;
  stationDistanceKm?: number | null;
  canWrite?: boolean;
  farmId?: number;
  reordering?: boolean;
  onReorderDone?: () => void;
}

export function Dashboard({ fields, onFieldClick, onAddField, stationMac, stationName, stationDistanceKm, canWrite = true, farmId, reordering = false, onReorderDone }: DashboardProps) {
  const { t } = useTranslation();

  // Sort fields by saved order, appending any new fields at the end
  const sortedFields = useMemo(() => {
    const saved = getSavedOrder(farmId);
    if (saved.length === 0) return fields;
    const ordered: Field[] = [];
    const remaining = [...fields];
    for (const id of saved) {
      const idx = remaining.findIndex((f) => f.id === id);
      if (idx !== -1) {
        ordered.push(remaining.splice(idx, 1)[0]);
      }
    }
    return [...ordered, ...remaining];
  }, [fields, farmId]);

  const [orderedFields, setOrderedFields] = useState(sortedFields);

  useEffect(() => {
    setOrderedFields(sortedFields);
  }, [sortedFields]);

  const moveField = useCallback((fromIdx: number, toIdx: number) => {
    setOrderedFields((prev) => {
      const newFields = [...prev];
      const [moved] = newFields.splice(fromIdx, 1);
      newFields.splice(toIdx, 0, moved);
      saveOrder(farmId, newFields.map((f) => f.id));
      return newFields;
    });
  }, [farmId]);

  if (fields.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🌽</div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--tx)' }}>
          {canWrite ? t('dashboard.noFieldsTitle') : t('dashboard.noFieldsTitle')}
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--tx3)' }}>
          {canWrite
            ? t('dashboard.noFieldsDesc')
            : t('dashboard.noFieldsSharedDesc')}
        </p>
        {canWrite && (
          <button onClick={onAddField} className="agraria-btn-primary">
            {t('dashboard.addFirstField')}
          </button>
        )}
      </div>
    );
  }

  // Reorder mode: compact list with up/down arrows
  if (reordering) {
    return (
      <div className="space-y-2 pb-4">
        <div className="sec-label">{t('dashboard.reorderTitle', { defaultValue: 'Reorder Fields' })}</div>
        <div className="space-y-1">
          {orderedFields.map((field, idx) => {
            const baseCrop = getBaseCrop(field.cropType ?? 'corn');
            const config = getCropConfig(field.cropType ?? 'corn');
            return (
              <div
                key={field.id}
                className="flex items-center gap-2 p-2.5 rounded-[var(--r)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--bdr)' }}
              >
                {/* Position number */}
                <span className="text-[10px] font-bold w-4 text-center shrink-0" style={{ color: 'var(--tx3)' }}>
                  {idx + 1}
                </span>

                {/* Field name + crop */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--tx)' }}>
                    {CROP_EMOJI[baseCrop] || '🌱'} {field.name}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--tx3)' }}>
                    {config.label}
                  </div>
                </div>

                {/* Up/Down buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => idx > 0 && moveField(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-1 rounded"
                    style={{ color: idx === 0 ? 'var(--bdr)' : 'var(--tx2)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => idx < orderedFields.length - 1 && moveField(idx, idx + 1)}
                    disabled={idx === orderedFields.length - 1}
                    className="p-1 rounded"
                    style={{ color: idx === orderedFields.length - 1 ? 'var(--bdr)' : 'var(--tx2)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={onReorderDone}
          className="agraria-btn-primary w-full text-xs py-2 mt-2"
        >
          {t('dashboard.reorderDone', { defaultValue: 'Done' })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stationMac && (
        <WeatherStationCard stationMac={stationMac} stationName={stationName || stationMac} stationDistanceKm={stationDistanceKm} />
      )}
      {orderedFields.map((field) => (
        <FieldCard key={field.id} field={field} onClick={() => onFieldClick(field)} />
      ))}
    </div>
  );
}
