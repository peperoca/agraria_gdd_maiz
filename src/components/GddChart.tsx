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
import type { ChartOptions } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyGdd } from '../types';
import type { PtuDay } from '../utils/photoperiod';
import { CORN_STAGES } from '../utils/cornStages';

ChartJS.register(
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
  annotationPlugin
);

interface GddChartProps {
  data: DailyGdd[];
  ptuData?: PtuDay[] | null;
}

export function GddChart({ data, ptuData }: GddChartProps) {
  const { t } = useTranslation();
  const maxGdd = data.length > 0 ? data[data.length - 1].cumulative : 0;
  const maxDailyGdd = data.length > 0 ? Math.max(...data.map((d) => d.gdd)) : 0;
  const dailyAxisMax = Math.ceil(maxDailyGdd * 1.2);
  const relevantStages = CORN_STAGES.filter((s) => s.gdd <= maxGdd * 1.5 + 200);

  const styles = getComputedStyle(document.documentElement);
  const blue = styles.getPropertyValue('--blue').trim() || '#185FA5';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';

  const purple = '#7c3aed';
  const hasPtu = ptuData && ptuData.length > 0;

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => format(parseISO(d.date), 'MMM d')),
      datasets: [
        {
          type: 'bar' as const,
          label: t('charts.dailyGdd'),
          data: data.map((d) => d.gdd),
          backgroundColor: data.map((d) =>
            d.source && d.source !== 'station'
              ? (d.source === 'carry_forward' ? `${orange}40` : `${purple}40`)
              : `${orange}80`
          ),
          borderColor: data.map((d) =>
            d.source && d.source !== 'station'
              ? (d.source === 'carry_forward' ? orange : purple)
              : orange
          ),
          borderWidth: 1,
          borderRadius: 3,
          borderDash: undefined,
          yAxisID: 'y',
          order: 3,
        },
        {
          type: 'line' as const,
          label: t('charts.cumulativeGdd'),
          data: data.map((d) => d.cumulative),
          borderColor: blue,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: data.length > 60 ? 0 : 2,
          pointHoverRadius: 5,
          yAxisID: 'y1',
          order: 1,
        },
        ...(hasPtu ? [
          {
            type: 'bar' as const,
            label: t('charts.dailyPtuLine'),
            data: ptuData!.map((d) => d.dailyPtu),
            backgroundColor: `${purple}50`,
            borderColor: purple,
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'yPtuDaily',
            order: 4,
          },
          {
            type: 'line' as const,
            label: t('charts.cumulativePtu'),
            data: ptuData!.map((d) => d.cumulativePtu),
            borderColor: purple,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 3] as number[],
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'yPtuCum',
            order: 2,
          },
        ] : []),
      ],
    }),
    [data, ptuData, blue, orange, purple, hasPtu]
  );

  const annotations: Record<string, object> = {};
  for (const stage of relevantStages) {
    annotations[`line_${stage.shortName}`] = {
      type: 'line',
      scaleID: 'y1',
      yMin: stage.gdd,
      yMax: stage.gdd,
      borderColor: `${tx3}50`,
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: `${stage.shortName} (${stage.gdd})`,
        position: 'start',
        font: { size: 10 },
        color: tx3,
        backgroundColor: `${surface}cc`,
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    };
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          font: { size: 11 },
          color: tx3,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y ?? 0;
            const label = ctx.dataset.label ?? '';
            if (label === t('charts.dailyGdd')) return `${t('charts.dailyGdd')}: +${val.toFixed(1)}`;
            if (label === t('charts.cumulativeGdd')) return `${t('charts.cumGddAxis')}: ${val.toFixed(0)}`;
            if (label === t('charts.dailyPtuLine')) return `${t('charts.dailyPtu')}: +${val.toFixed(0)}`;
            if (label === t('charts.cumulativePtu')) return `${t('charts.cumPtu')}: ${val.toLocaleString()}`;
            return `${label}: ${val.toFixed(1)}`;
          },
        },
      },
      annotation: { annotations },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      y: {
        position: 'left',
        title: { display: true, text: hasPtu ? t('charts.dailyGddPtuAxis') : t('charts.dailyGddAxis'), font: { size: 11 }, color: tx3 },
        ticks: { font: { size: 10 }, color: tx3 },
        grid: { color: `${tx3}15` },
        beginAtZero: true,
        max: dailyAxisMax,
      },
      y1: {
        position: 'right',
        title: { display: true, text: hasPtu ? t('charts.cumGddPtuAxis') : t('charts.cumGddAxis'), font: { size: 11 }, color: tx3 },
        ticks: { font: { size: 10 }, color: tx3 },
        grid: { display: false },
        beginAtZero: true,
      },
      ...(hasPtu ? {
        yPtuDaily: {
          display: false,
          position: 'left' as const,
          beginAtZero: true,
        },
        yPtuCum: {
          display: false,
          position: 'right' as const,
          beginAtZero: true,
        },
      } : {}),
    },
  };

  const lastGdd = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="flex items-center justify-between mb-1">
        <div className="sec-label mb-0">{t('charts.gddTitle')}</div>
      </div>
      {lastGdd && (
        <div className={`agraria-info-row grid gap-2 mb-3 ${hasPtu ? 'grid-cols-4' : 'grid-cols-2'}`}>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.latestDaily')}</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              +{lastGdd.gdd.toFixed(1)} <span className="text-[11px] font-normal opacity-70">GDD</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.cumulative')}</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastGdd.cumulative.toFixed(0)} <span className="text-[11px] font-normal opacity-70">GDD</span>
            </div>
          </div>
          {hasPtu && (() => {
            const lastPtu = ptuData![ptuData!.length - 1];
            return (
              <>
                <div>
                  <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.dailyPtu')}</div>
                  <div className="text-base font-semibold" style={{ color: purple }}>
                    +{lastPtu.dailyPtu.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.cumPtu')}</div>
                  <div className="text-base font-semibold" style={{ color: purple }}>
                    {lastPtu.cumulativePtu.toLocaleString()}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
      <div style={{ height: '280px' }}>
        {/* @ts-expect-error mixed chart type with annotation plugin */}
        <Chart type="bar" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        {hasPtu
          ? t('charts.gddFootnoteWithPtu')
          : t('charts.gddFootnote')}
      </p>
    </div>
  );
}
