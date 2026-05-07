import { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd } from '../types';
import { getCurrentStage, getProgressPercent, MATURITY_GDD } from '../utils/cornStages';
import { useWeatherData } from '../hooks/useWeatherData';
import { GddChart } from './GddChart';
import { GrowthStages } from './GrowthStages';

interface FieldDetailProps {
  field: Field;
}

export function FieldDetail({ field }: FieldDetailProps) {
  const { loading, error, fetchData } = useWeatherData();
  const [gddData, setGddData] = useState<DailyGdd[] | null>(null);

  useEffect(() => {
    fetchData(field.sowingDate)
      .then((data) => setGddData(data))
      .catch(() => {});
  }, [field.sowingDate, fetchData]);

  const latestGdd = gddData && gddData.length > 0 ? gddData[gddData.length - 1] : null;
  const cumulative = latestGdd?.cumulative ?? 0;
  const stage = getCurrentStage(cumulative);
  const progress = getProgressPercent(cumulative);
  const daysSinceSowing = differenceInDays(new Date(), parseISO(field.sowingDate));

  return (
    <div className="p-4 space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-corn-900">{field.name}</h2>
            <p className="text-sm text-gray-500">
              Sowed {format(parseISO(field.sowingDate), 'MMMM d, yyyy')} &middot;{' '}
              {daysSinceSowing} days ago
            </p>
          </div>
        </div>

        {loading && !gddData ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded-full w-full" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-3xl font-bold text-corn-700">
                {Math.round(cumulative)}
              </span>
              <span className="text-sm text-gray-500">GDD accumulated</span>
            </div>

            {stage && (
              <p className="text-sm text-corn-600 mb-3">
                Current stage: <span className="font-semibold">{stage.shortName} - {stage.name}</span>
              </p>
            )}

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
              <div
                className="bg-gradient-to-r from-corn-400 via-corn-500 to-corn-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-400">{progress}% to maturity</span>
              <span className="text-xs text-gray-400">{MATURITY_GDD} GDD</span>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      {gddData && gddData.length > 0 && <GddChart data={gddData} />}

      {/* Growth stages */}
      {gddData && <GrowthStages cumulativeGdd={cumulative} />}

      {/* Daily data table (last 7 days) */}
      {gddData && gddData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-4">
          <h3 className="text-sm font-semibold text-corn-800 mb-3">Recent Daily GDD</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Daily</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {gddData
                  .slice(-7)
                  .reverse()
                  .map((d) => (
                    <tr key={d.date} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">
                        {format(parseISO(d.date), 'MMM d')}
                      </td>
                      <td className="py-1.5 text-right text-amber-700 font-medium">
                        +{d.gdd.toFixed(1)}
                      </td>
                      <td className="py-1.5 text-right text-corn-700 font-medium">
                        {d.cumulative.toFixed(0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Loading overlay for refresh */}
      {loading && gddData && (
        <div className="text-center py-2">
          <span className="text-xs text-gray-400">Refreshing data...</span>
        </div>
      )}
    </div>
  );
}
