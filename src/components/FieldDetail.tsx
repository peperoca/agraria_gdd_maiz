import { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd, DailyEto, DailyRain } from '../types';
import { getCropConfig } from '../utils/cropConfig';
import { useWeatherData } from '../hooks/useWeatherData';
import { GddChart } from './GddChart';
import { EtoChart } from './EtoChart';
import { GrowthStages } from './GrowthStages';

interface FieldDetailProps {
  field: Field;
}

export function FieldDetail({ field }: FieldDetailProps) {
  const cropConfig = getCropConfig(field.cropType ?? 'corn');
  const { loading, error, fetchData } = useWeatherData();
  const [gddData, setGddData] = useState<DailyGdd[] | null>(null);
  const [etoData, setEtoData] = useState<DailyEto[] | null>(null);
  const [rainData, setRainData] = useState<DailyRain[] | null>(null);

  useEffect(() => {
    fetchData(field.sowingDate, field.stationMac, cropConfig.baseTempF, cropConfig.upperCapF)
      .then((result) => {
        setGddData(result.gdd);
        setEtoData(result.eto);
        setRainData(result.rain);
      })
      .catch(() => {});
  }, [field.sowingDate, field.stationMac, field.cropType, fetchData, cropConfig.baseTempF, cropConfig.upperCapF]);

  const latestGdd = gddData && gddData.length > 0 ? gddData[gddData.length - 1] : null;
  const cumulative = latestGdd?.cumulative ?? 0;

  // Use crop-specific stages
  const stages = cropConfig.stages;
  let currentStage = null;
  for (const s of stages) {
    if (cumulative >= s.gdd) currentStage = s;
    else break;
  }
  const progress = Math.min(100, Math.round((cumulative / cropConfig.maturityGdd) * 100));
  const daysSinceSowing = differenceInDays(new Date(), parseISO(field.sowingDate));
  const hasRain = rainData && rainData.length > 0;

  return (
    <div className="space-y-3">
      {/* Summary card */}
      <div className="agraria-card">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--tx)' }}>{field.name}</h2>
            <p className="text-xs" style={{ color: 'var(--tx2)' }}>
              {cropConfig.label} &middot; Sowed {format(parseISO(field.sowingDate), 'MMMM d, yyyy')} &middot; {daysSinceSowing} days ago
            </p>
          </div>
        </div>

        {loading && !gddData ? (
          <div className="space-y-3">
            <div className="h-8 rounded w-1/3" style={{ background: 'var(--surface2)' }} />
            <div className="h-4 rounded w-1/2" style={{ background: 'var(--surface2)' }} />
            <div className="h-4 rounded-full w-full" style={{ background: 'var(--surface2)' }} />
          </div>
        ) : error ? (
          <div className="text-xs p-2.5 rounded-[var(--r)]" style={{ background: 'var(--db)', color: 'var(--dt)' }}>
            {error}
          </div>
        ) : (
          <>
            {/* Info row */}
            <div className="agraria-info-row grid grid-cols-3 gap-2 mt-2 mb-3">
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>GDD</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
                  {Math.round(cumulative)}
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Stage</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
                  {currentStage?.shortName ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Days</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
                  {daysSinceSowing}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="agraria-progress-bar">
              <div className="agraria-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>{progress}% to maturity</span>
              <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>{cropConfig.maturityGdd} GDD</span>
            </div>
          </>
        )}
      </div>

      {/* GDD Chart */}
      {gddData && gddData.length > 0 && <GddChart data={gddData} />}

      {/* ETo + Rain Chart */}
      {etoData && etoData.length > 0 && (
        <EtoChart data={etoData} rainData={rainData ?? undefined} />
      )}

      {/* Growth stages */}
      {gddData && <GrowthStages cumulativeGdd={cumulative} gddData={gddData} cropType={field.cropType ?? 'corn'} />}

      {/* Daily data table */}
      {gddData && gddData.length > 0 && (
        <div className="agraria-card">
          <div className="sec-label">Recent Daily Data</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
                  <th className="text-left py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Date</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>GDD</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Cum.</th>
                  {etoData && etoData.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>ETo</th>
                  )}
                  {hasRain && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Rain</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {gddData
                  .slice(-7)
                  .reverse()
                  .map((d) => {
                    const etoDay = etoData?.find((e) => e.date === d.date);
                    const rainDay = rainData?.find((r) => r.date === d.date);
                    return (
                      <tr key={d.date} style={{ borderBottom: '0.5px solid var(--bdr)' }}>
                        <td className="py-1.5 px-2" style={{ color: 'var(--tx)' }}>
                          {format(parseISO(d.date), 'MMM d')}
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium" style={{ color: 'var(--orange)' }}>
                          +{d.gdd.toFixed(1)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium" style={{ color: 'var(--blue)' }}>
                          {d.cumulative.toFixed(0)}
                        </td>
                        {etoData && etoData.length > 0 && (
                          <td className="py-1.5 px-2 text-right font-medium" style={{ color: 'var(--blue-m)' }}>
                            {etoDay ? `${etoDay.eto.toFixed(2)}` : '—'}
                          </td>
                        )}
                        {hasRain && (
                          <td className="py-1.5 px-2 text-right font-medium" style={{ color: '#1a9988' }}>
                            {rainDay && rainDay.rain > 0 ? `${rainDay.rain.toFixed(1)}` : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && gddData && (
        <div className="text-center py-2">
          <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>Refreshing data...</span>
        </div>
      )}
    </div>
  );
}
