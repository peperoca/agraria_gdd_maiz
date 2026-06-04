import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field } from '../types';
import { FieldCard } from './FieldCard';
import { WeatherStationCard } from './WeatherStationCard';

const FIELD_ORDER_KEY = 'agraria-field-order';

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
}

export function Dashboard({ fields, onFieldClick, onAddField, stationMac, stationName, stationDistanceKm, canWrite = true, farmId }: DashboardProps) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchDragIdx = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const persistOrder = useCallback((newFields: Field[]) => {
    setOrderedFields(newFields);
    saveOrder(farmId, newFields.map((f) => f.id));
  }, [farmId]);

  // Desktop drag & drop
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const newFields = [...orderedFields];
    const [moved] = newFields.splice(dragIdx, 1);
    newFields.splice(idx, 0, moved);
    persistOrder(newFields);
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  // Touch-based reorder via long-press on drag handle
  const handleTouchStart = (idx: number) => (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDragIdx.current = idx;
    setDragIdx(idx);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchDragIdx.current === null || !listRef.current) return;
    const y = e.touches[0].clientY;
    const cards = listRef.current.querySelectorAll('[data-field-idx]');
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        setOverIdx(i);
        break;
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchDragIdx.current !== null && overIdx !== null && touchDragIdx.current !== overIdx) {
      const newFields = [...orderedFields];
      const [moved] = newFields.splice(touchDragIdx.current, 1);
      newFields.splice(overIdx, 0, moved);
      persistOrder(newFields);
    }
    touchDragIdx.current = null;
    touchStartY.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

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

  return (
    <div className="space-y-3">
      {stationMac && (
        <WeatherStationCard stationMac={stationMac} stationName={stationName || stationMac} stationDistanceKm={stationDistanceKm} />
      )}
      <div ref={listRef} className="space-y-3" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {orderedFields.map((field, idx) => (
          <div
            key={field.id}
            data-field-idx={idx}
            draggable
            onDragStart={handleDragStart(idx)}
            onDragOver={handleDragOver(idx)}
            onDrop={handleDrop(idx)}
            onDragEnd={handleDragEnd}
            className="relative"
            style={{
              opacity: dragIdx === idx ? 0.5 : 1,
              borderTop: overIdx === idx && dragIdx !== null && dragIdx > idx ? '2px solid var(--blue)' : undefined,
              borderBottom: overIdx === idx && dragIdx !== null && dragIdx < idx ? '2px solid var(--blue)' : undefined,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Drag handle */}
            <div
              className="absolute left-0 top-0 bottom-0 flex items-center pl-1 z-10 cursor-grab active:cursor-grabbing"
              style={{ width: '20px', touchAction: 'none' }}
              onTouchStart={handleTouchStart(idx)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="var(--tx3)" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M8 6h.01M8 12h.01M8 18h.01M12 6h.01M12 12h.01M12 18h.01" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ paddingLeft: '16px' }}>
              <FieldCard field={field} onClick={() => onFieldClick(field)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
