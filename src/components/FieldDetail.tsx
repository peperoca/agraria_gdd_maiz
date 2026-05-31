import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd, DailyEto, DailyRain, NdviReading, DailyETc, DailyIrrigation, SoilMoistureReading } from '../types';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';
import { useWeatherData, type GapFillPreference } from '../hooks/useWeatherData';
import { getNdviData, getSoilMoistureData, getIrrigationReadings, getFieldOverrides, upsertFieldOverride, deleteFieldOverride } from '../utils/api';
import type { FieldOverride } from '../types';
import { applyRainOverrides, applyIrrigationOverrides } from '../utils/applyOverrides';
import { OverrideCalendar } from './OverrideCalendar';
import { calculateETc, recalculateKc, type KcFormula, type KcParams } from '../utils/ndvi';
import { calculateCumulativeVernalization, getVernalizationStatus } from '../utils/vernalization';
import { calculateDaylength, getDayOfYear, getPhotoperiodStatus, calculatePtu } from '../utils/photoperiod';
import { computeWaterBalance } from '../utils/waterBalance';
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
  const { t } = useTranslation();
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
  const [irrigationData, setIrrigationData] = useState<DailyIrrigation[] | null>(null);
  const [overrides, setOverrides] = useState<FieldOverride[]>([]);
  const [showOverrideCalendar, setShowOverrideCalendar] = useState(false);

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

  // Fetch irrigation readings for this field
  useEffect(() => {
    getIrrigationReadings(field.id, field.sowingDate)
      .then((raw) => {
        setIrrigationData(raw.map((r) => ({ date: r.date, depthMm: r.depth_mm })));
      })
      .catch(() => setIrrigationData(null));
  }, [field.id, field.sowingDate]);

  // Fetch manual overrides for this field
  const fetchOverrides = () => {
    getFieldOverrides(field.id)
      .then((raw) => setOverrides(raw.map((r) => ({
        date: r.date,
        rainMm: r.rain_mm,
        irrigationMm: r.irrigation_mm,
      }))))
      .catch(() => setOverrides([]));
  };
  useEffect(fetchOverrides, [field.id]);

  // Apply overrides to rain and irrigation data
  const effectiveRain = useMemo(
    () => rainData ? applyRainOverrides(rainData, overrides) : null,
    [rainData, overrides],
  );
  const effectiveIrrigation = useMemo(
    () => applyIrrigationOverrides(irrigationData, overrides),
    [irrigationData, overrides],
  );

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
  const hasIrrigation = irrigationData && irrigationData.length > 0;
  const irrigMap = useMemo(() => {
    const m = new Map<string, number>();
    if (irrigationData) {
      for (const i of irrigationData) m.set(i.date, i.depthMm);
    }
    return m;
  }, [irrigationData]);

  // ── Crop-specific indicators ──
  const baseCrop = getBaseCrop(field.cropType ?? 'corn');

  // Soybean: compute PTU data for growth stage tracking
  const ptuData = baseCrop === 'soybean' && farmLatitude && gddData
    ? calculatePtu(gddData, farmLatitude)
    : null;

  // Wheat & Rapeseed: vernalization data (used for both alert and growth stage tracking)
  const vernData = (baseCrop === 'wheat' || baseCrop === 'rapeseed') && gddData
    ? calculateCumulativeVernalization(gddData)
    : null;

  const vernAlert = vernData && cropConfig.vernalizationTarget
    ? (() => {
        const latest = vernData.length > 0 ? vernData[vernData.length - 1] : null;
        const jointingGdd = cropConfig.stages.find((s) => s.shortName === 'SE')?.gdd ?? 600;
        return latest ? getVernalizationStatus(latest.cumulativeVd, cropConfig.vernalizationTarget!, cumulative, jointingGdd) : null;
      })()
    : null;

  // Soil water balance (bounded ASW) — only when TAW is set on the field
  const aswData = useMemo(() => {
    if (!field.tawMm || !etcData || etcData.length === 0 || !effectiveRain) return null;
    const madFraction = field.madPct != null ? field.madPct / 100 : cropConfig.madDefault;
    return computeWaterBalance(etcData, effectiveRain, effectiveIrrigation, {
      tawMm: field.tawMm,
      madFraction,
      initialAswMm: field.initialAswMm ?? undefined,
    });
  }, [field.tawMm, field.madPct, field.initialAswMm, etcData, effectiveRain, effectiveIrrigation, cropConfig.madDefault]);

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
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('field.gddUnit')}</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
                  {Math.round(cumulative)}
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('growthStages.stageCol')}</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
                  {currentStage?.shortName ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('field.daysAbbr')}</div>
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
              <div className="sec-label" style={{ margin: 0 }}>{t('field.dataSource')}</div>
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
                {t('field.carryForward')}
              </button>
              <button
                onClick={() => setGapPref('fallback')}
                className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                style={{
                  background: gapPref === 'fallback' ? 'var(--orange)' : 'var(--surface)',
                  color: gapPref === 'fallback' ? '#fff' : 'var(--tx3)',
                }}
              >
                {t('field.nearestStation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop alerts */}
      {vernAlert && <CropAlertBanner type={vernAlert.type} message={vernAlert.message} />}
      {photoAlert && <CropAlertBanner type={photoAlert.type} message={photoAlert.message} />}
      {aswData && aswData.length > 0 && (() => {
        const latest = aswData[aswData.length - 1];
        if (latest.asw <= 0) {
          const target80 = Math.round(latest.taw * 0.8);
          const toApply = Math.round(target80 - latest.asw);
          return <CropAlertBanner type="critical" message={t('alerts.soilWiltingPoint', { amount: toApply > 0 ? toApply : target80 })} />;
        }
        if (latest.asw < latest.madThreshold) {
          const target80 = Math.round(latest.taw * 0.8);
          const toApply = Math.round(target80 - latest.asw);
          return <CropAlertBanner type="warning" message={t('alerts.soilBelowThreshold', { pct: Math.round(latest.asw / latest.taw * 100), amount: toApply })} />;
        }
        return null;
      })()}

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
            {t('field.exportCsv')}
          </button>
          <button
            onClick={() => exportFieldPdf(
              field, gddData, etoData ?? [], rainData ?? [],
              ndviData ?? [], etcData ?? [],
            )}
            className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium border"
            style={{ borderColor: 'var(--bdr2)', color: 'var(--tx2)', background: 'var(--surface)' }}
          >
            {t('field.exportPdf')}
          </button>
        </div>
      )}

      {/* GDD Chart (+ PTU for soybean) */}
      {gddData && gddData.length > 0 && <GddChart data={gddData} ptuData={ptuData} />}

      {/* ETo + Rain Chart */}
      {etoData && etoData.length > 0 && (
        <EtoChart data={etoData} rainData={effectiveRain ?? undefined} irrigationData={effectiveIrrigation} onTitleClick={() => setShowOverrideCalendar(true)} />
      )}

      {/* Override Calendar */}
      {showOverrideCalendar && (
        <OverrideCalendar
          fieldId={field.id}
          sowingDate={field.sowingDate}
          rainData={rainData ?? []}
          irrigationData={irrigationData}
          overrides={overrides}
          onSave={async (date, rainMm, irrigMm) => {
            await upsertFieldOverride(field.id, date, rainMm, irrigMm);
            fetchOverrides();
          }}
          onDelete={async (date) => {
            await deleteFieldOverride(field.id, date);
            fetchOverrides();
          }}
          onClose={() => setShowOverrideCalendar(false)}
        />
      )}

      {/* NDVI Chart + Kc Formula toggle */}
      {ndviData && ndviData.length > 0 && (
        <>
          <div className="agraria-card">
            <div className="flex items-center justify-between">
              <div className="sec-label" style={{ margin: 0 }}>{t('field.kcFormula')}</div>
              <div className="flex rounded-[var(--r)] overflow-hidden border" style={{ borderColor: 'var(--bdr2)' }}>
                <button
                  onClick={() => setKcFormula('linear')}
                  className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                  style={{
                    background: kcFormula === 'linear' ? 'var(--blue)' : 'var(--surface)',
                    color: kcFormula === 'linear' ? '#fff' : 'var(--tx3)',
                  }}
                >
                  {t('field.kcLinear')}
                </button>
                <button
                  onClick={() => setKcFormula('nonlinear')}
                  className="text-[10px] px-2.5 py-1 font-medium transition-colors"
                  style={{
                    background: kcFormula === 'nonlinear' ? 'var(--blue)' : 'var(--surface)',
                    color: kcFormula === 'nonlinear' ? '#fff' : 'var(--tx3)',
                  }}
                >
                  {t('field.kcNonlinear')}
                </button>
              </div>
            </div>
            <p className="text-[9px] mt-1.5" style={{ color: 'var(--tx3)' }}>
              {kcFormula === 'linear'
                ? t('field.kcLinearDesc')
                : t('field.kcNonlinearDesc')
              }
            </p>
            <p className="text-[9px]" style={{ color: 'var(--tx3)' }}>
              {t('field.kcChartNote')}
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
        <WaterBalanceChart etcData={etcData} rainData={effectiveRain} irrigationData={effectiveIrrigation} aswData={aswData} />
      )}

      {/* Soil Moisture Chart (Sentinel-1) */}
      {soilMoistureData && soilMoistureData.some((d) => d.smRelative !== null) && (
        <SoilMoistureChart data={soilMoistureData} />
      )}

      {/* Growth stages */}
      {gddData && <GrowthStages cumulativeGdd={cumulative} gddData={gddData} cropType={(field.cropType ?? 'corn') as import('../utils/cropConfig').CropType} ptuData={ptuData} vernData={vernData} />}

      {/* Wheat & Rapeseed: Vernalization card */}
      {(baseCrop === 'wheat' || baseCrop === 'rapeseed') && gddData && !!cropConfig.vernalizationTarget && (
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
          <div className="sec-label">{t('field.recentDailyData')}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
                  <th className="text-left py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.dateCol')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.gddCol')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.cumCol')}</th>
                  {etoData && etoData.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.etoCol')}</th>
                  )}
                  {hasRain && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.rainCol')}</th>
                  )}
                  {hasIrrigation && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.irrigCol')}</th>
                  )}
                  {etcData && etcData.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.etcCol')}</th>
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
                        {hasIrrigation && (
                          <td className="py-1.5 px-2 text-right font-medium" style={{ color: 'var(--orange)' }}>
                            {irrigMap.get(d.date) ? `${irrigMap.get(d.date)!.toFixed(1)}` : '—'}
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
