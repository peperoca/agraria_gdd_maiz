import { useState, useEffect, useMemo } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd, DailyEto, DailyRain, NdviReading, DailyETc, SoilMoistureReading } from '../types';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';
import { useWeatherData, type GapFillPreference } from '../hooks/useWeatherData';
import { getNdviData, getSoilMoistureData } from '../utils/api';
import { calculateETc, recalculateKc, type KcFormula, type KcParams } from '../utils/ndvi';
import { calculateCumulativeVernalization, getVernalizationStatus } from '../utils/vernalization';
import { calculateDaylength, getDayOfYear, getPhotoperiodStatus, calculatePtu } from '../utils/photoperiod';
import { exportFieldCsv } from '../utils/exportCsv';
import { exportFieldPdf } from '../utils/exportPdf';
import { GddChart } from './GddChart';
import { EtoChart } from './EtoChart';
import { NdviChart } from './NdviChart';
import { WaterBalanceChart } from './WaterBalanceChart';
import { GrowthStages } from './GrowthStages';
import { CropAlertBanner } from './CropAlertBanner';
import { VernalizationCard } from './VernalizationCard';
import { PhotoperiodCard } from './PhotoperiodCard';
import { SoilMoistureChart } from './SoilMoistureChart';

interface FieldDetailProps {
  field: Field;
  farmLatitude?: number | null;
  onNdviDateClick?: (date: string, ndviData: NdviReading[]) => void;
}

export function FieldDetail({ field, farmLatitude, onNdviDateClick }: FieldDetailProps) {
  const cropConfig = getCropConfig(field.cropType ?? 'corn');
  const { loading, error, fetchData } = useWeatherData();
  const [gddData, setGddData] = useState<DailyGdd[] | null>(null);
  const [etoData, setEtoData] = useState<DailyEto[] | null>(null);
  const [rainData, setRainData] = useState<DailyRain[] | null>(null);
  const [ndviDataRaw, setNdviDataRaw] = useState<NdviReading[] | null>(null);
  const [etcData, setEtcData] = useState<DailyETc[] | null>(null);
  const [kcFormula, setKcFormula] = useState<KcFormula>('linear');
  const [gapPref, setGapPref] = useState<GapFillPreference>('carry_forward');
  const [soilMoistureData, setSoilMoistureData] = useState<SoilMoistureReading[] | null>(null);

  const kcParams: KcParams = useMemo(
    () => ({ kcMax: cropConfig.kcMax, kcMin: cropConfig.kcMin, ndviMax: cropConfig.ndviMax }),
    [cropConfig.kcMax, cropConfig.kcMin, cropConfig.ndviMax],
  );

  // Compute both Kc curves — the active one drives ETc, both display on chart
  const ndviDataLinear = useMemo(
    () => ndviDataRaw ? recalculateKc(ndviDataRaw, 'linear', kcParams) : null,
    [ndviDataRaw, kcParams],
  );
  const ndviDataNonlinear = useMemo(
    () => ndviDataRaw ? recalculateKc(ndviDataRaw, 'nonlinear', kcParams) : null,
    [ndviDataRaw, kcParams],
  );
  const ndviData = kcFormula === 'linear' ? ndviDataLinear : ndviDataNonlinear;

  useEffect(() => {
    fetchData(field.sowingDate, field.stationMac, cropConfig.baseTempF, cropConfig.upperCapF, gapPref)
      .then((result) => {
        setGddData(result.gdd);
        setEtoData(result.eto);
        setRainData(result.rain);
      })
      .catch(() => {});
  }, [field.sowingDate, field.stationMac, field.cropType, fetchData, cropConfig.baseTempF, cropConfig.upperCapF, gapPref]);

  // Fetch NDVI data if field has polygon
  useEffect(() => {
    if (!field.polygon) return;
    getNdviData(field.id)
      .then((raw) => {
        const readings: NdviReading[] = raw.map((r) => ({
          date: r.date,
          ndviMean: r.ndvi_mean,
          kc: r.kc,
          cloudPct: r.cloud_pct,
        }));
        setNdviDataRaw(readings);
      })
      .catch(() => setNdviDataRaw(null));
  }, [field.id, field.polygon]);

  // Fetch soil moisture data if field has polygon
  useEffect(() => {
    if (!field.polygon) return;
    getSoilMoistureData(field.id)
      .then((raw) => {
        setSoilMoistureData(raw.map((r) => ({
          date: r.date,
          vvDb: r.vv_db,
          vhDb: r.vh_db,
          vvRawDb: r.vv_raw_db,
          ndviUsed: r.ndvi_used,
          smRelative: r.sm_relative,
          vvDry: r.vv_dry,
          vvWet: r.vv_wet,
        })));
      })
      .catch(() => setSoilMoistureData(null));
  }, [field.id, field.polygon]);

  // Calculate ETc when both ETo and NDVI are available (recalculates on formula change)
  useEffect(() => {
    if (etoData && ndviData && ndviData.length > 0) {
      const etc = calculateETc(etoData, ndviData);
      setEtcData(etc);
    }
  }, [etoData, ndviData, kcFormula]);

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

  // ── Crop-specific indicators ──
  const baseCrop = getBaseCrop(field.cropType ?? 'corn');

  // Soybean: compute PTU data for growth stage tracking
  const ptuData = baseCrop === 'soybean' && farmLatitude && gddData
    ? calculatePtu(gddData, farmLatitude)
    : null;

  // Wheat: vernalization data (used for both alert and growth stage tracking)
  const vernData = baseCrop === 'wheat' && gddData
    ? calculateCumulativeVernalization(gddData)
    : null;

  const vernAlert = vernData && cropConfig.vernalizationTarget
    ? (() => {
        const latest = vernData.length > 0 ? vernData[vernData.length - 1] : null;
        const jointingGdd = cropConfig.stages.find((s) => s.shortName === 'SE')?.gdd ?? 600;
        return latest ? getVernalizationStatus(latest.cumulativeVd, cropConfig.vernalizationTarget!, cumulative, jointingGdd) : null;
      })()
    : null;

  // Soybean: photoperiod
  const photoAlert = baseCrop === 'soybean' && farmLatitude && cropConfig.criticalPhotoperiod
    ? (() => {
        const today = new Date().toISOString().slice(0, 10);
        const doy = getDayOfYear(today);
        const daylength = calculateDaylength(farmLatitude, doy);
        return getPhotoperiodStatus(daylength, cropConfig.criticalPhotoperiod!);
      })()
    : null;

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

      {/* Gap-fill source toggle — show when estimated data exists */}
      {gddData && gddData.some((d) => d.source && d.source !== 'station') && (
        <div className="agraria-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="sec-label" style={{ margin: 0 }}>Data Source</div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                {gddData.filter((d) => d.source && d.source !== 'station').length} day(s) with estimated data
              </p>
            </div>
            <div className="flex rounded-[var(--r)] overflow-hidden border" style={{ borderColor: 'var(--bdr2)' }}>
              <button
                onClick={() => setGapPref('carry_forward')}
                className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                style={{
                  background: gapPref === 'carry_forward' ? 'var(--orange)' : 'var(--surface)',
                  color: gapPref === 'carry_forward' ? '#fff' : 'var(--tx3)',
                }}
              >
                Carry Forward
              </button>
              <button
                onClick={() => setGapPref('fallback')}
                className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                style={{
                  background: gapPref === 'fallback' ? 'var(--orange)' : 'var(--surface)',
                  color: gapPref === 'fallback' ? '#fff' : 'var(--tx3)',
                }}
              >
                Nearest Station
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop alerts */}
      {vernAlert && <CropAlertBanner type={vernAlert.type} message={vernAlert.message} />}
      {photoAlert && <CropAlertBanner type={photoAlert.type} message={photoAlert.message} />}

      {/* Export buttons */}
      {gddData && gddData.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => exportFieldCsv(
              field.name, gddData, etoData ?? [], rainData ?? [],
              ndviData ?? [], etcData ?? [],
            )}
            className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium border"
            style={{ borderColor: 'var(--bdr2)', color: 'var(--tx2)', background: 'var(--surface)' }}
          >
            Export CSV
          </button>
          <button
            onClick={() => exportFieldPdf(
              field, gddData, etoData ?? [], rainData ?? [],
              ndviData ?? [], etcData ?? [],
            )}
            className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium border"
            style={{ borderColor: 'var(--bdr2)', color: 'var(--tx2)', background: 'var(--surface)' }}
          >
            Export PDF
          </button>
        </div>
      )}

      {/* GDD Chart (+ PTU for soybean) */}
      {gddData && gddData.length > 0 && <GddChart data={gddData} ptuData={ptuData} />}

      {/* ETo + Rain Chart */}
      {etoData && etoData.length > 0 && (
        <EtoChart data={etoData} rainData={rainData ?? undefined} />
      )}

      {/* NDVI Chart + Kc Formula toggle */}
      {ndviData && ndviData.length > 0 && (
        <>
          <div className="agraria-card">
            <div className="flex items-center justify-between">
              <div className="sec-label" style={{ margin: 0 }}>Kc Formula</div>
              <div className="flex rounded-[var(--r)] overflow-hidden border" style={{ borderColor: 'var(--bdr2)' }}>
                <button
                  onClick={() => setKcFormula('linear')}
                  className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                  style={{
                    background: kcFormula === 'linear' ? 'var(--blue)' : 'var(--surface)',
                    color: kcFormula === 'linear' ? '#fff' : 'var(--tx3)',
                  }}
                >
                  Linear
                </button>
                <button
                  onClick={() => setKcFormula('nonlinear')}
                  className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                  style={{
                    background: kcFormula === 'nonlinear' ? 'var(--blue)' : 'var(--surface)',
                    color: kcFormula === 'nonlinear' ? '#fff' : 'var(--tx3)',
                  }}
                >
                  Non-linear
                </button>
              </div>
            </div>
            <p className="text-[9px] mt-1.5" style={{ color: 'var(--tx3)' }}>
              {kcFormula === 'linear'
                ? `Active: Kc = 1.25 × NDVI + 0.20 (Glenn et al.)`
                : `Active: Kc = ${cropConfig.kcMin.toFixed(2)} + (${cropConfig.kcMax.toFixed(2)} − ${cropConfig.kcMin.toFixed(2)}) × [(NDVI − 0.15) / (${cropConfig.ndviMax.toFixed(2)} − 0.15)] (Glenn et al. 2011)`
              }
            </p>
            <p className="text-[9px]" style={{ color: 'var(--tx3)' }}>
              Both curves shown on chart. Toggle selects which drives ETc/water balance.
            </p>
          </div>
          <NdviChart
            data={ndviData}
            altKcData={kcFormula === 'linear' ? ndviDataNonlinear : ndviDataLinear}
            activeFormula={kcFormula}
            onDateClick={field.polygon ? (date) => onNdviDateClick?.(date, ndviData) : undefined}
          />
        </>
      )}

      {/* Water Balance Chart (Rain vs ETc) */}
      {etcData && etcData.length > 0 && rainData && rainData.length > 0 && (
        <WaterBalanceChart etcData={etcData} rainData={rainData} />
      )}

      {/* Soil Moisture Chart (Sentinel-1) */}
      {soilMoistureData && soilMoistureData.some((d) => d.smRelative !== null) && (
        <SoilMoistureChart data={soilMoistureData} />
      )}

      {/* Growth stages */}
      {gddData && <GrowthStages cumulativeGdd={cumulative} gddData={gddData} cropType={(field.cropType ?? 'corn') as import('../utils/cropConfig').CropType} ptuData={ptuData} vernData={vernData} />}

      {/* Wheat: Vernalization card */}
      {baseCrop === 'wheat' && gddData && cropConfig.vernalizationTarget && (
        <VernalizationCard gddData={gddData} target={cropConfig.vernalizationTarget} />
      )}

      {/* Soybean: Photoperiod + PTU card */}
      {baseCrop === 'soybean' && farmLatitude && cropConfig.criticalPhotoperiod && gddData && (
        <PhotoperiodCard
          latitude={farmLatitude}
          sowingDate={field.sowingDate}
          criticalPhotoperiod={cropConfig.criticalPhotoperiod}
          cropLabel={cropConfig.maturityLabel}
          gddData={gddData}
          maturityPtu={cropConfig.maturityPtu}
        />
      )}

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
                  {etcData && etcData.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>ETc</th>
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
                    const etcDay = etcData?.find((e) => e.date === d.date);
                    return (
                      <tr key={d.date} style={{ borderBottom: '0.5px solid var(--bdr)', opacity: d.source && d.source !== 'station' ? 0.7 : 1 }}>
                        <td className="py-1.5 px-2" style={{ color: 'var(--tx)' }}>
                          <span className="inline-flex items-center gap-1">
                            {d.source && d.source !== 'station' && (
                              <span
                                title={d.source === 'carry_forward' ? 'Carried forward' : 'Fallback station'}
                                style={{
                                  display: 'inline-block',
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: d.source === 'carry_forward' ? 'var(--orange)' : '#a855f7',
                                }}
                              />
                            )}
                            {format(parseISO(d.date), 'MMM d')}
                          </span>
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
                        {etcData && etcData.length > 0 && (
                          <td className="py-1.5 px-2 text-right font-medium" style={{ color: '#dc2626' }}>
                            {etcDay ? `${etcDay.etc.toFixed(2)}` : '—'}
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
