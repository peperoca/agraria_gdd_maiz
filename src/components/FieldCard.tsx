import { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd } from '../types';
import { getCurrentStage, getProgressPercent, MATURITY_GDD } from '../utils/cornStages';
import { useWeatherData } from '../hooks/useWeatherData';

interface FieldCardProps {
  field: Field;
  onClick: () => void;
}

export function FieldCard({ field, onClick }: FieldCardProps) {
  const { fetchData } = useWeatherData();
  const [gddData, setGddData] = useState<DailyGdd[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchData(field.sowingDate)
      .then((data) => setGddData(data))
      .catch(() => setGddData(null))
      .finally(() => setLoading(false));
  }, [field.sowingDate, fetchData]);

  const latestGdd = gddData && gddData.length > 0 ? gddData[gddData.length - 1] : null;
  const cumulative = latestGdd?.cumulative ?? 0;
  const stage = getCurrentStage(cumulative);
  const progress = getProgressPercent(cumulative);
  const daysSinceSowing = differenceInDays(new Date(), parseISO(field.sowingDate));

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl shadow-sm border border-corn-200 p-4 text-left hover:border-corn-400 hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-corn-900 text-base">{field.name}</h3>
        <span className="text-xs text-gray-500">
          {daysSinceSowing}d
        </span>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Sowed: {format(parseISO(field.sowingDate), 'MMM d, yyyy')}
      </p>

      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-xl font-bold text-corn-700">
              {Math.round(cumulative)}
            </span>
            <span className="text-xs text-gray-500">GDD</span>
            {stage && (
              <span className="ml-auto text-xs font-medium bg-corn-100 text-corn-700 px-2 py-0.5 rounded-full">
                {stage.shortName}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-corn-400 to-corn-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">{progress}%</span>
            <span className="text-[10px] text-gray-400">{MATURITY_GDD} GDD</span>
          </div>
        </>
      )}
    </button>
  );
}
