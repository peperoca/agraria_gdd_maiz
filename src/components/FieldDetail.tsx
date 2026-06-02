import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Field, DailyGdd, DailyEto, DailyRain, NdviReading, DailyETc, DailyIrrigation, SoilMoistureReading } from '../types';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';
import { useWeatherData, type GapFillPreference } from '../hooks/useWeatherData';
import { getNdviData, getSoilMoistureData, getIrrigationReadings, getFieldOverrides, upsertFieldOverride, deleteFieldOverride, getSeasons } from '../utils/api';
import type { FieldOverride, Season } from '../types';
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
  onAswUpdate?: (aswMm: number | null) => void;
}

export function FieldDetail({ field, farmLatitude, onNdviDateClick, onAswUpdate }: FieldDetailProps) {
  const { t } = useTranslation();

  // Season management
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(field.seasonId ?? null);

  // Fetch seasons for this field
  useEffect(() => {
    getSeasons(field.id)
      .then((ss) => {
        setSeasons(ss);
        // Default to active season
        const active = ss.find((s) => s.isActive);
        if (active) setSelectedSeasonId(active.id);
      })
      .catch(() => setSeasons([]));
  }, [field.id]);


  // Derive active data from selected season
  const activeSeason = seasons.find((s) => s.id === selectedSeasonId) ?? null;
  const effectiveSowingDate = activeSeason?.sowingDate ?? field.sowingDate;
  const effectiveCropType = activeSeason?.cropType ?? field.cropType ?? 'corn';

  const cropConfig = getCropConfig(effectiveCropType);
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
    fetchData(effectiveSowingDate, field.stationMac, cropConfig.baseTempF, cropConfig.upperCapF, gapPref)
      .then((result) => {
        setGddData(result.gdd);
        setEtoData(result.eto);
        setRainData(result.rain);
      })
      .catch(() => {});
  }, [effectiveSowingDate, field.stationMac, effectiveCropType, fetchData, cropConfig.baseTempF, cropConfig.upperCapF, gapPref]);

  // Compute from-date for NDVI/SM: sowing - 7 days
  const ndviFromDate = useMemo(() => {
    const d = new Date(effectiveSowingDate);
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [effectiveSowingDate]);

  // Fetch NDVI data if field has polygon
  useEffect(() => {
    if (!field.polygon) return;
    getNdviData(field.id, ndviFromDate)
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
  }, [field.id, field.polygon, ndviFromDate]);

  // Fetch soil moisture data if field has polygon
  useEffect(() => {
    if (!field.polygon) return;
    getSoilMoistureData(field.id, ndviFromDate)
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
  }, [field.id, field.polygon, ndviFromDate]);

  // Fetch irrigation readings for this field
  useEffect(() => {
    getIrrigationReadings(field.id, effectiveSowingDate)
      .then((raw) => {
        setIrrigationData(raw.map((r) => ({ date: r.date, depthMm: r.depth_mm })));
      })
      .catch(() => setIrrigationData(null));
  }, [field.id, effectiveSowingDate]);

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

  // Truncate data at harvest date if season is ended
  const endDate = activeSeason?.endDate ?? null;
  const tGdd = useMemo(() => !gddData || !endDate ? gddData : gddData.filter(d => d.date <= endDate), [gddData, endDate]);
  const tEto = useMemo(() => !etoData || !endDate ? etoData : etoData.filter(d => d.date <= endDate), [etoData, endDate]);
  const tRain = useMemo(() => !effectiveRain || !endDate ? effectiveRain : effectiveRain.filter(d => d.date <= endDate), [effectiveRain, endDate]);
  const tEtc = useMemo(() => !etcData || !endDate ? etcData : etcData.filter(d => d.date <= endDate), [etcData, endDate]);
  const tIrrig = useMemo(() => !effectiveIrrigation || !endDate ? effectiveIrrigation : effectiveIrrigation.filter(d => d.date <= endDate), [effectiveIrrigation, endDate]);

  const latestGdd = tGdd && tGdd.length > 0 ? tGdd[tGdd.length - 1] : null;
  const cumulative = latestGdd?.cumulative ?? 0;

  // Use crop-specific stages
  const stages = cropConfig.stages;
  let currentStage = null;
  for (const s of stages) {
    if (cumulative >= s.gdd) currentStage = s;
    else break;
  }
  const progress = Math.min(100, Math.round((cumulative / cropConfig.maturityGdd) * 100));
  const daysSinceSowing = endDate
    ? differenceInDays(parseISO(endDate), parseISO(effectiveSowingDate))
    : differenceInDays(new Date(), parseISO(effectiveSowingDate));
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
  const baseCrop = getBaseCrop(effectiveCropType);

  // Soybean: compute PTU data for growth stage tracking
  const ptuData = baseCrop === 'soybean' && farmLatitude && tGdd
    ? calculatePtu(tGdd, farmLatitude)
    : null;

  // Wheat & Rapeseed: vernalization data (used for both alert and growth stage tracking)
  const vernData = (baseCrop === 'wheat' || baseCrop === 'rapeseed') && tGdd
    ? calculateCumulativeVernalization(tGdd)
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
    if (!field.tawMm || !tEtc || tEtc.length === 0 || !tRain) return null;
    const madFraction = field.madPct != null ? field.madPct / 100 : cropConfig.madDefault;
    return computeWaterBalance(tEtc, tRain, tIrrig, {
      tawMm: field.tawMm,
      madFraction,
      initialAswMm: activeSeason?.initialAswMm ?? field.initialAswMm ?? undefined,
    });
  }, [field.tawMm, field.madPct, field.initialAswMm, activeSeason?.initialAswMm, tEtc, tRain, tIrrig, cropConfig.madDefault]);

  // Report last ASW to parent for season rollover
  useEffect(() => {
    if (!aswData || aswData.length === 0) {
      onAswUpdate?.(null);
    } else {
      onAswUpdate?.(aswData[aswData.length - 1].asw);
    }
  }, [aswData, onAswUpdate]);

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
              {cropConfig.label} &middot; {t('dashboard.sowed')} {format(parseISO(effectiveSowingDate), 'MMMM d, yyyy')} &middot; {daysSinceSowing}{t('field.daysAbbr')}
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
      {tGdd && tGdd.some((d) => d.source && d.source !== 'station') && (
        <div className="agraria-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="sec-label" style={{ margin: 0 }}>{t('field.dataSource')}</div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                {tGdd.filter((d) => d.source && d.source !== 'station').length} day(s) with estimated data
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
      {tGdd && tGdd.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => exportFieldCsv(
              field.name, tGdd, tEto ?? [], tRain ?? [],
              ndviData ?? [], tEtc ?? [],
            )}
            className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium border"
            style={{ borderColor: 'var(--bdr2)', color: 'var(--tx2)', background: 'var(--surface)' }}
          >
            {t('field.exportCsv')}
          </button>
          <button
            onClick={() => exportFieldPdf(
              field, tGdd, tEto ?? [], tRain ?? [],
              ndviData ?? [], tEtc ?? [],
            )}
            className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium border"
            style={{ borderColor: 'var(--bdr2)', color: 'var(--tx2)', background: 'var(--surface)' }}
          >
            {t('field.exportPdf')}
          </button>
        </div>
      )}

      {/* GDD Chart (+ PTU for soybean) */}
      {tGdd && tGdd.length > 0 && <GddChart data={tGdd} ptuData={ptuData} />}

      {/* ETo + Rain Chart */}
      {tEto && tEto.length > 0 && (
        <EtoChart data={tEto} rainData={tRain ?? undefined} irrigationData={tIrrig} onTitleClick={() => setShowOverrideCalendar(true)} />
      )}

      {/* Override Calendar */}
      {showOverrideCalendar && (
        <OverrideCalendar
          fieldId={field.id}
          sowingDate={effectiveSowingDate}
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
      {tEtc && tEtc.length > 0 && tRain && tRain.length > 0 && (
        <WaterBalanceChart etcData={tEtc} rainData={tRain} irrigationData={tIrrig} aswData={aswData} />
      )}

      {/* Soil Moisture Chart (Sentinel-1) */}
      {soilMoistureData && soilMoistureData.some((d) => d.smRelative !== null) && (
        <SoilMoistureChart data={soilMoistureData} />
      )}

      {/* Growth stages */}
      {tGdd && <GrowthStages cumulativeGdd={cumulative} gddData={tGdd} cropType={effectiveCropType as import('../utils/cropConfig').CropType} ptuData={ptuData} vernData={vernData} />}

      {/* Wheat & Rapeseed: Vernalization card */}
      {(baseCrop === 'wheat' || baseCrop === 'rapeseed') && tGdd && !!cropConfig.vernalizationTarget && (
        <VernalizationCard gddData={tGdd} target={cropConfig.vernalizationTarget} />
      )}

      {/* Soybean: Photoperiod + PTU card */}
      {baseCrop === 'soybean' && farmLatitude && cropConfig.criticalPhotoperiod && tGdd && (
        <PhotoperiodCard
          latitude={farmLatitude}
          sowingDate={effectiveSowingDate}
          criticalPhotoperiod={cropConfig.criticalPhotoperiod}
          cropLabel={cropConfig.maturityLabel}
          gddData={tGdd}
          maturityPtu={cropConfig.maturityPtu}
        />
      )}

      {/* Daily data table */}
      {tGdd && tGdd.length > 0 && (
        <div className="agraria-card">
          <div className="sec-label">{t('field.recentDailyData')}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
                  <th className="text-left py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.dateCol')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.gddCol')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.cumCol')}</th>
                  {tEto && tEto.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.etoCol')}</th>
                  )}
                  {hasRain && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.rainCol')}</th>
                  )}
                  {hasIrrigation && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.irrigCol')}</th>
                  )}
                  {tEtc && tEtc.length > 0 && (
                    <th className="text-right py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('field.etcCol')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {tGdd
                  .slice(-7)
                  .reverse()
                  .map((d) => {
                    const etoDay = tEto?.find((e) => e.date === d.date);
                    const rainDay = tRain?.find((r) => r.date === d.date);
                    const etcDay = tEtc?.find((e) => e.date === d.date);
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
                        {tEto && tEto.length > 0 && (
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
                        {tEtc && tEtc.length > 0 && (
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

      {/* Season history — at bottom */}
      {seasons.length > 1 && (
        <div>
          <div className="sec-label">{t('season.seasonHistory')}</div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {seasons.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSeasonId(s.id)}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: s.id === selectedSeasonId ? 'var(--blue)' : 'var(--surface2)',
                  color: s.id === selectedSeasonId ? '#fff' : 'var(--tx2)',
                  border: s.isActive ? '1.5px solid var(--blue)' : '1px solid var(--bdr)',
                }}
              >
                {getCropConfig(s.cropType).label} — {format(parseISO(s.sowingDate), 'MMM yyyy')}
                {s.endDate && <span className="ml-1 opacity-60">→ {format(parseISO(s.endDate), 'MMM')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
