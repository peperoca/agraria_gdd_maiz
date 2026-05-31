import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isBefore, isAfter } from 'date-fns';
import type { DailyRain, DailyIrrigation, FieldOverride } from '../types';

interface OverrideCalendarProps {
  fieldId: number;
  sowingDate: string;
  rainData: DailyRain[];
  irrigationData: DailyIrrigation[] | null;
  overrides: FieldOverride[];
  onSave: (date: string, rainMm: number | null, irrigMm: number | null) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
  onClose: () => void;
}

const DAY_KEYS = ['calendar.mon', 'calendar.tue', 'calendar.wed', 'calendar.thu', 'calendar.fri', 'calendar.sat', 'calendar.sun'];

export function OverrideCalendar({
  sowingDate, rainData, irrigationData, overrides, onSave, onDelete, onClose,
}: OverrideCalendarProps) {
  const { t } = useTranslation();
  const today = new Date();
  const sowDate = parseISO(sowingDate);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editRain, setEditRain] = useState('');
  const [editIrrig, setEditIrrig] = useState('');
  const [saving, setSaving] = useState(false);

  // Build lookup maps
  const rainMap = useMemo(() => new Map(rainData.map((r) => [r.date, r.rain])), [rainData]);
  const irrigMap = useMemo(() => {
    const m = new Map<string, number>();
    if (irrigationData) for (const i of irrigationData) m.set(i.date, i.depthMm);
    return m;
  }, [irrigationData]);
  const overrideMap = useMemo(() => new Map(overrides.map((o) => [o.date, o])), [overrides]);

  // Calendar grid for current month
  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Monday-based: getDay returns 0=Sun, we want 0=Mon
  const firstDayOffset = useMemo(() => {
    const dow = getDay(monthDays[0]); // 0=Sun
    return dow === 0 ? 6 : dow - 1; // convert to Mon=0
  }, [monthDays]);

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    const ov = overrideMap.get(dateStr);
    const stationRain = rainMap.get(dateStr);
    const equipIrrig = irrigMap.get(dateStr);
    // Pre-fill with override value, or empty to show placeholder
    setEditRain(ov?.rainMm != null ? String(ov.rainMm) : (stationRain != null ? String(Math.round(stationRain * 100) / 100) : ''));
    setEditIrrig(ov?.irrigationMm != null ? String(ov.irrigationMm) : (equipIrrig != null ? String(Math.round(equipIrrig * 100) / 100) : ''));
  };

  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const rainVal = editRain !== '' ? parseFloat(editRain) : null;
      const irrigVal = editIrrig !== '' ? parseFloat(editIrrig) : null;
      await onSave(selectedDate, rainVal, irrigVal);
      setSelectedDate(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      await onDelete(selectedDate);
      setSelectedDate(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agraria-card">
      <div className="flex items-center justify-between mb-3">
        <div className="sec-label mb-0">{t('calendar.title')}</div>
        <button
          onClick={onClose}
          className="text-[11px] px-2 py-1 rounded"
          style={{ color: 'var(--tx3)' }}
        >
          {t('calendar.close')}
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="text-sm px-2 py-1 rounded"
          style={{ color: 'var(--tx2)' }}
        >
          &lt;
        </button>
        <span className="text-sm font-medium" style={{ color: 'var(--tx)' }}>
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="text-sm px-2 py-1 rounded"
          style={{ color: 'var(--tx2)' }}
        >
          &gt;
        </button>
      </div>

      {/* Day name headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_KEYS.map((key) => (
          <div key={key} className="text-center text-[10px] font-medium py-0.5" style={{ color: 'var(--tx3)' }}>
            {t(key)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`pad-${i}`} className="h-9" />
        ))}

        {monthDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isDisabled = isBefore(day, sowDate) || isAfter(day, today);
          const hasOverride = overrideMap.has(dateStr);
          const hasRain = (rainMap.get(dateStr) ?? 0) > 0 || (overrideMap.get(dateStr)?.rainMm ?? 0) > 0;
          const hasIrrig = (irrigMap.get(dateStr) ?? 0) > 0 || (overrideMap.get(dateStr)?.irrigationMm ?? 0) > 0;
          const isSelected = selectedDate === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => !isDisabled && handleDateClick(dateStr)}
              disabled={isDisabled}
              className="h-9 rounded text-xs font-medium relative flex flex-col items-center justify-center"
              style={{
                background: isSelected ? 'var(--blue)' : isDisabled ? 'transparent' : 'var(--surface2)',
                color: isSelected ? '#fff' : isDisabled ? 'var(--tx3)' : 'var(--tx)',
                opacity: isDisabled ? 0.35 : 1,
              }}
            >
              {day.getDate()}
              {/* Indicator dots */}
              {!isDisabled && (hasRain || hasIrrig) && (
                <div className="flex gap-0.5 absolute bottom-0.5">
                  {hasRain && <span className="w-1 h-1 rounded-full" style={{ background: '#1a9988' }} />}
                  {hasIrrig && <span className="w-1 h-1 rounded-full" style={{ background: 'var(--orange)' }} />}
                </div>
              )}
              {/* Override marker */}
              {hasOverride && !isDisabled && (
                <span className="absolute top-0.5 right-1 text-[7px]" style={{ color: isSelected ? '#fff' : 'var(--blue)' }}>✏️</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Date edit popup */}
      {selectedDate && (
        <div className="mt-3 p-3 rounded-[var(--r)]" style={{ background: 'var(--surface2)', border: '1px solid var(--bdr)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--tx)' }}>
            {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            {overrideMap.has(selectedDate) && (
              <span className="ml-2 text-[10px]" style={{ color: 'var(--blue)' }}>{t('calendar.overridden')}</span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] w-16 shrink-0" style={{ color: '#1a9988' }}>{t('calendar.rainLabel')}</label>
              <input
                type="number"
                value={editRain}
                onChange={(e) => setEditRain(e.target.value)}
                placeholder={t('calendar.rainPlaceholder', { value: rainMap.get(selectedDate)?.toFixed(1) ?? '—' })}
                min="0"
                step="0.1"
                className="agraria-input text-sm flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] w-16 shrink-0" style={{ color: 'var(--orange)' }}>{t('calendar.irrigLabel')}</label>
              <input
                type="number"
                value={editIrrig}
                onChange={(e) => setEditIrrig(e.target.value)}
                placeholder={t('calendar.irrigPlaceholder', { value: irrigMap.get(selectedDate)?.toFixed(1) ?? '—' })}
                min="0"
                step="0.1"
                className="agraria-input text-sm flex-1"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setSelectedDate(null)}
              className="flex-1 py-1.5 rounded-[var(--r)] text-[11px] font-medium"
              style={{ background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--bdr)' }}
            >
              {t('calendar.cancel')}
            </button>
            {overrideMap.has(selectedDate) && (
              <button
                onClick={handleReset}
                disabled={saving}
                className="py-1.5 px-3 rounded-[var(--r)] text-[11px] font-medium"
                style={{ background: 'transparent', color: 'var(--tx3)', border: '1px solid var(--bdr)' }}
              >
                {t('calendar.reset')}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="agraria-btn-primary flex-1 text-[11px]"
            >
              {saving ? t('calendar.saving') : t('calendar.ok')}
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        {t('calendar.footerNote')}
      </p>
    </div>
  );
}
