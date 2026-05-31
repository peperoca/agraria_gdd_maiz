import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyRain, DailyETc, DailyIrrigation, DailyASW } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, BarController, LineController,
  PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler,
  annotationPlugin
);

interface WaterBalanceChartProps {
  etcData: DailyETc[];
  rainData: DailyRain[];
  irrigationData?: DailyIrrigation[] | null;
  /** When provided, renders bounded ASW chart instead of unbounded cumulative */
  aswData?: DailyASW[] | null;
}

// ── Bounded ASW chart (when soil params are set) ──
function ASWChart({ aswData, etcData, rainData, irrigationData }: {
  aswData: DailyASW[];
  etcData: DailyETc[];
  rainData: DailyRain[];
  irrigationData?: DailyIrrigation[] | null;
}) {
  const { t } = useTranslation();
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';
  const red = '#dc2626';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';

  const latest = aswData[aswData.length - 1];
  const taw = latest.taw;
  const pctAvailable = Math.round((latest.asw / taw) * 100);
  const isStressed = latest.asw < latest.madThreshold;
  const hasIrrigation = irrigationData && irrigationData.length > 0;

  const statusLabel = latest.asw <= 0
    ? t('charts.wiltingPoint')
    : isStressed
      ? t('charts.irrigateSoon')
      : t('charts.adequate');
  const statusColor = latest.asw <= 0 ? red : isStressed ? '#b45309' : teal;

  // Build cumulative maps for rain, ETc, irrigation
  const rainMap = new Map(rainData.map((r) => [r.date, r]));
  const etcMap = new Map(etcData.map((e) => [e.date, e]));
  const irrigMap = new Map((irrigationData ?? []).map((i) => [i.date, i]));

  const dates = aswData.map((d) => d.date);

  // Compute cumulative irrigation
  const cumIrrigData = useMemo(() => {
    let cum = 0;
    return dates.map((date) => {
      const irrig = irrigMap.get(date);
      if (irrig) cum += irrig.depthMm;
      return cum;
    });
  }, [dates, irrigMap]);

  const chartData = useMemo(() => ({
    labels: dates.map((d) => format(parseISO(d), 'MMM d')),
    datasets: [
      // TAW line (left axis — toggleable)
      {
        type: 'line' as const,
        label: t('charts.taw'),
        data: aswData.map(() => taw),
        borderColor: teal,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        order: 9,
      },
      // MAD line (left axis — toggleable)
      {
        type: 'line' as const,
        label: t('charts.mad'),
        data: aswData.map(() => latest.madThreshold),
        borderColor: '#b45309',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        order: 10,
      },
      // ASW area fill — primary (left axis)
      {
        type: 'line' as const,
        label: t('charts.asw'),
        data: aswData.map((d) => d.asw),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f620',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        order: 0,
      },
      // Daily Rain bars (left axis)
      {
        type: 'bar' as const,
        label: t('charts.dailyRainShort'),
        data: aswData.map((d) => d.rain > 0 ? d.rain : null),
        backgroundColor: `${teal}60`,
        borderColor: teal,
        borderWidth: 1,
        borderRadius: 2,
        order: 6,
      },
      // Daily ETc bars (left axis — same scale as ASW)
      {
        type: 'bar' as const,
        label: t('charts.dailyEtcShort'),
        data: aswData.map((d) => d.etc > 0 ? d.etc : null),
        backgroundColor: `${red}60`,
        borderColor: red,
        borderWidth: 1,
        borderRadius: 2,
        order: 6,
      },
      // Daily Irrigation bars (left axis — same scale as ASW)
      ...(hasIrrigation ? [{
        type: 'bar' as const,
        label: t('charts.dailyIrrigShort'),
        data: dates.map((d) => {
          const irr = irrigMap.get(d);
          return irr && irr.depthMm > 0 ? irr.depthMm : null;
        }),
        backgroundColor: `${orange}60`,
        borderColor: orange,
        borderWidth: 1,
        borderRadius: 2,
        order: 7,
      }] : []),
      // Cumulative Rain (right axis)
      {
        type: 'line' as const,
        label: t('charts.cumRainShort'),
        data: dates.map((d) => rainMap.get(d)?.cumulative ?? null),
        borderColor: teal,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        order: 1,
        yAxisID: 'yCum',
      },
      // Cumulative ETc (right axis)
      {
        type: 'line' as const,
        label: t('charts.cumEtcShort'),
        data: dates.map((d) => etcMap.get(d)?.cumulative ?? null),
        borderColor: red,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        order: 2,
        yAxisID: 'yCum',
      },
      // Cumulative Irrigation (right axis)
      ...(hasIrrigation ? [{
        type: 'line' as const,
        label: t('charts.cumIrrigShort'),
        data: cumIrrigData,
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        order: 3,
        yAxisID: 'yCum',
      }] : []),
      // Daily excess bars (left axis — same scale as ASW)
      {
        type: 'bar' as const,
        label: t('charts.excess'),
        data: aswData.map((d) => d.excess > 0 ? d.excess : null),
        backgroundColor: '#06b6d480',
        borderColor: '#06b6d4',
        borderWidth: 1,
        borderRadius: 2,
        order: 8,
      },
      // Cumulative excess line (right axis)
      {
        type: 'line' as const,
        label: t('charts.cumExcess'),
        data: aswData.map((d) => d.cumulativeExcess > 0 ? d.cumulativeExcess : null),
        borderColor: '#06b6d4',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        order: 4,
        yAxisID: 'yCum',
      },
    ],
  }), [aswData, dates, rainMap, etcMap, irrigMap, cumIrrigData, teal, red, orange, hasIrrigation]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, font: { size: 10 }, color: tx3, boxWidth: 8 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)} mm`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      y: {
        min: 0,
        title: { display: true, text: t('charts.mmAxis'), font: { size: 10 }, color: tx3 },
        ticks: { font: { size: 9 }, color: tx3 },
        grid: { color: `${tx3}15` },
      },
      yCum: {
        position: 'right',
        min: 0,
        title: { display: true, text: t('charts.cumAxis'), font: { size: 10 }, color: tx3 },
        ticks: { font: { size: 9 }, color: tx3 },
        grid: { display: false },
      },
    },
  };

  // Summary values
  const cumRain = rainData.length > 0 ? rainData[rainData.length - 1].cumulative : 0;
  const cumEtc = etcData.length > 0 ? etcData[etcData.length - 1].cumulative : 0;
  const cumIrrig = cumIrrigData.length > 0 ? cumIrrigData[cumIrrigData.length - 1] : 0;

  return (
    <div className="agraria-card">
      <div className="sec-label">{t('charts.soilWaterBalance')}</div>
      <div className={`agraria-info-row grid gap-2 mb-3 ${hasIrrigation ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.asw')}</div>
          <div className="text-base font-semibold" style={{ color: '#3b82f6' }}>
            {latest.asw.toFixed(0)} <span className="text-[11px] font-normal opacity-70">mm</span>
          </div>
          <div className="text-[10px]" style={{ color: statusColor }}>{pctAvailable}% — {statusLabel} ({t('charts.available')})</div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: teal }}>Rain</div>
          <div className="text-base font-semibold" style={{ color: teal }}>
            {cumRain.toFixed(0)} <span className="text-[11px] font-normal opacity-70">mm</span>
          </div>
        </div>
        {hasIrrigation && (
          <div>
            <div className="text-[11px] opacity-75" style={{ color: orange }}>Irrig.</div>
            <div className="text-base font-semibold" style={{ color: orange }}>
              {cumIrrig.toFixed(0)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
        )}
        <div>
          <div className="text-[11px] opacity-75" style={{ color: red }}>ETc</div>
          <div className="text-base font-semibold" style={{ color: red }}>
            {cumEtc.toFixed(0)} <span className="text-[11px] font-normal opacity-70">mm</span>
          </div>
          {latest.cumulativeExcess > 0 && (
            <div className="text-[10px]" style={{ color: '#06b6d4' }}>Excess: {latest.cumulativeExcess.toFixed(0)} mm</div>
          )}
        </div>
      </div>
      <div style={{ height: '260px' }}>
        {/* @ts-expect-error mixed chart type */}
        <Chart type="line" data={chartData} options={options} />
      </div>
      {/* Manual legend with axis references */}
      <div className="mt-2 space-y-1">
        <div className="text-[10px] font-medium" style={{ color: 'var(--tx2)' }}>
          Left axis — ASW (mm):
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 8, background: '#3b82f620', border: '1.5px solid #3b82f6', borderRadius: 2 }} /> ASW
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 8, background: `${teal}60`, border: `1px solid ${teal}`, borderRadius: 2 }} /> Daily Rain
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 8, background: `${red}60`, border: `1px solid ${red}`, borderRadius: 2 }} /> Daily ETc
          </span>
          {hasIrrigation && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
              <span style={{ display: 'inline-block', width: 12, height: 8, background: `${orange}60`, border: `1px solid ${orange}`, borderRadius: 2 }} /> Daily Irrig.
            </span>
          )}
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 12, height: 8, background: '#06b6d480', border: '1px solid #06b6d4', borderRadius: 2 }} /> Excess
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `1.5px dashed ${teal}` }} /> TAW
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '1.5px dashed #b45309' }} /> MAD
          </span>
        </div>
        <div className="text-[10px] font-medium mt-1" style={{ color: 'var(--tx2)' }}>
          Right axis — Cumulative (mm):
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `2px solid ${teal}` }} /> Rain
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `2px solid ${red}` }} /> ETc
          </span>
          {hasIrrigation && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
              <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `2px dashed ${orange}` }} /> Irrig.
            </span>
          )}
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx3)' }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed #06b6d4' }} /> Cum. Excess
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Legacy unbounded chart (when no soil params) ──
function LegacyBalanceChart({ etcData, rainData, irrigationData }: Omit<WaterBalanceChartProps, 'aswData'>) {
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';
  const red = '#dc2626';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';

  const hasIrrigation = irrigationData && irrigationData.length > 0;

  // Build unified date list
  const allDates = new Set<string>();
  etcData.forEach((d) => allDates.add(d.date));
  rainData.forEach((d) => allDates.add(d.date));
  irrigationData?.forEach((d) => allDates.add(d.date));
  const dates = Array.from(allDates).sort();

  const rainMap = new Map(rainData.map((r) => [r.date, r]));
  const etcMap = new Map(etcData.map((e) => [e.date, e]));
  const irrigMap = new Map((irrigationData ?? []).map((i) => [i.date, i]));

  // Compute cumulative water balance = Cum Rain + Cum Irrigation - Cum ETc
  const balanceData = useMemo(() => {
    let cumRain = 0;
    let cumEtc = 0;
    let cumIrrig = 0;
    return dates.map((date) => {
      const rain = rainMap.get(date);
      const etc = etcMap.get(date);
      const irrig = irrigMap.get(date);
      if (rain) cumRain = rain.cumulative;
      if (etc) cumEtc = etc.cumulative;
      if (irrig) cumIrrig += irrig.depthMm;
      return {
        date,
        cumRain,
        cumEtc,
        cumIrrig,
        balance: Math.round((cumRain + cumIrrig - cumEtc) * 100) / 100,
      };
    });
  }, [dates, rainMap, etcMap, irrigMap]);

  const lastBalance = balanceData.length > 0 ? balanceData[balanceData.length - 1] : null;

  const chartData = useMemo(() => {
    const datasets = [
      {
        type: 'line' as const,
        label: 'Cum. Rain (mm)',
        data: balanceData.map((d) => d.cumRain),
        borderColor: teal,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 1,
      },
      {
        type: 'line' as const,
        label: 'Cum. ETc (mm)',
        data: balanceData.map((d) => d.cumEtc),
        borderColor: red,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 2,
      },
      ...(hasIrrigation ? [{
        type: 'line' as const,
        label: 'Cum. Irrigation (mm)',
        data: balanceData.map((d) => d.cumIrrig),
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 3,
      }] : []),
      {
        type: 'line' as const,
        label: 'Balance (mm)',
        data: balanceData.map((d) => d.balance),
        borderColor: '#6366f1',
        backgroundColor: '#6366f120',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        fill: true,
        order: 0,
      },
    ];
    return {
      labels: dates.map((d) => format(parseISO(d), 'MMM d')),
      datasets,
    };
  }, [balanceData, dates, teal, red, orange, hasIrrigation]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, font: { size: 11 }, color: tx3 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)} mm`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: 'mm', font: { size: 10 }, color: tx3 },
        ticks: { font: { size: 9 }, color: tx3 },
        grid: { color: `${tx3}15` },
      },
    },
  };

  return (
    <div className="agraria-card">
      <div className="sec-label">Water Balance ({hasIrrigation ? 'Rain + Irrigation' : 'Rain'} vs ETc)</div>
      {lastBalance && (
        <div className={`agraria-info-row grid gap-2 mb-3 ${hasIrrigation ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Rain</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastBalance.cumRain.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
          {hasIrrigation && (
            <div>
              <div className="text-[11px] opacity-75" style={{ color: orange }}>Irrig.</div>
              <div className="text-base font-semibold" style={{ color: orange }}>
                {lastBalance.cumIrrig.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
              </div>
            </div>
          )}
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>ETc</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastBalance.cumEtc.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Balance</div>
            <div className="text-base font-semibold" style={{
              color: lastBalance.balance >= 0 ? teal : red,
            }}>
              {lastBalance.balance >= 0 ? '+' : ''}{lastBalance.balance.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: '240px' }}>
        {/* @ts-expect-error mixed chart type */}
        <Chart type="line" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        ETc = ETo x Kc (NDVI-derived). Balance = Cumulative Rain{hasIrrigation ? ' + Irrigation' : ''} - Cumulative ETc. Positive = surplus, Negative = deficit.
      </p>
    </div>
  );
}

// ── Main export: picks the right chart based on available data ──
export function WaterBalanceChart({ etcData, rainData, irrigationData, aswData }: WaterBalanceChartProps) {
  if (aswData && aswData.length > 0) {
    return <ASWChart aswData={aswData} etcData={etcData} rainData={rainData} irrigationData={irrigationData} />;
  }
  return <LegacyBalanceChart etcData={etcData} rainData={rainData} irrigationData={irrigationData} />;
}
