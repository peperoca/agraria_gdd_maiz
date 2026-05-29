import { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd } from '../types';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';
import { useWeatherData } from '../hooks/useWeatherData';

interface FieldCardProps {
  field: Field;
  onClick: () => void;
}

const CROP_EMOJI: Record<string, string> = {
  corn: '🌽',
  soybean: '🫘',
  wheat: '🌾',
  rapeseed: '🌻',
};

export function FieldCard({ field, onClick }: FieldCardProps) {
  const cropConfig = getCropConfig(field.cropType ?? 'corn');
  const { fetchData } = useWeatherData();
  const [gddData, setGddData] = useState<DailyGdd[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchData(field.sowingDate, field.stationMac, cropConfig.baseTempF, cropConfig.upperCapF)
      .then((result) => setGddData(result.gdd))
      .catch(() => setGddData(null))
      .finally(() => setLoading(false));
  }, [field.sowingDate, field.stationMac, field.cropType, fetchData, cropConfig.baseTempF, cropConfig.upperCapF]);

  const latestGdd = gddData && gddData.length > 0 ? gddData[gddData.length - 1] : null;
  const cumulative = latestGdd?.cumulative ?? 0;

  // Crop-specific stage lookup
  let currentStage = null;
  for (const s of cropConfig.stages) {
    if (cumulative >= s.gdd) currentStage = s;
    else break;
  }
  const progress = Math.min(100, Math.round((cumulative / cropConfig.maturityGdd) * 100));
  const daysSinceSowing = differenceInDays(new Date(), parseISO(field.sowingDate));

  return (
    <button onClick={onClick} className="agraria-card w-full text-left cursor-pointer active:scale-[0.98] transition-transform">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--tx)' }}>{field.name}</span>
        <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>{daysSinceSowing}d</span>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--tx2)' }}>
        {CROP_EMOJI[getBaseCrop(field.cropType ?? 'corn')]} {cropConfig.label} &middot; Sowed: {format(parseISO(field.sowingDate), 'MMM d, yyyy')}
      </p>

      {loading ? (
        <div className="space-y-2">
          <div className="h-4 rounded w-1/2" style={{ background: 'var(--surface2)' }} />
          <div className="h-3 rounded w-full" style={{ background: 'var(--surface2)' }} />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-bold" style={{ color: 'var(--blue)' }}>
              {Math.round(cumulative)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>GDD</span>
            {currentStage && (
              <span className="agraria-badge ml-auto">{currentStage.shortName}</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="agraria-progress-bar">
            <div className="agraria-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>{progress}%</span>
            <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>{cropConfig.maturityGdd} GDD</span>
          </div>
        </>
      )}
    </button>
  );
}
