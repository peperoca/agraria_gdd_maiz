import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { SoilMoistureReading } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, BarController, LineController,
  Title, Tooltip, Legend, Filler, annotationPlugin
);

interface SoilMoistureChartProps {
  data: SoilMoistureReading[];
}

function smColor(sm: number): string {
  if (sm < 30) return '#dc2626';
  if (sm < 45) return '#ea580c';
  if (sm <= 65) return '#16a34a';
  return '#2563eb';
}

export function SoilMoistureChart({ data }: SoilMoistureChartProps) {
  const { t } = useTranslation();
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';

  const latest = [...data].reverse().find((d) => d.smRelative !== null);
  const latestVvDry = latest?.vvDry;
  const latestVvWet = latest?.vvWet;
  const spread = latestVvDry != null && latestVvWet != null
    ? (latestVvWet - latestVvDry).toFixed(1) : '—';
  const bootstrapping = data.filter((d) => d.smRelative === null).length;

  const chartData = useMemo(() => ({
    labels: data.map((d) => format(parseISO(d.date), 'MMM d')),
    datasets: [
      {
        type: 'line' as const,
        label: t('charts.soilMoistureTitle'),
        data: data.map((d) => d.smRelative),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: data.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: data.map((d) =>
          d.smRelative !== null ? smColor(d.smRelative) : 'transparent'
        ),
        spanGaps: false,
        yAxisID: 'ySm',
        order: 1,
      },
      {
        type: 'line' as const,
        label: 'VV corrected (dB)',
        data: data.map((d) => d.vvDb),
        borderColor: '#9ca3af',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.3,
        pointRadius: data.map((d) => d.smRelative === null ? 4 : 0),
        pointStyle: data.map((d) => d.smRelative === null ? 'circle' : 'circle'),
        pointBackgroundColor: data.map((d) => d.smRelative === null ? 'transparent' : '#9ca3af'),
        pointBorderColor: '#9ca3af',
        pointHoverRadius: 4,
        yAxisID: 'yVv',
        order: 2,
      },
    ],
  }), [data]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, padding: 8, font: { size: 10 }, color: tx3 },
      },
      tooltip: {
        backgroundColor: surface,
        titleColor: tx3,
        bodyColor: tx3,
        borderColor: tx3,
        borderWidth: 0.5,
        callbacks: {
          label(ctx) {
            const idx = ctx.dataIndex;
            const d = data[idx];
            if (ctx.datasetIndex === 0) {
              return d.smRelative !== null ? `SM: ${d.smRelative.toFixed(1)}%` : t('charts.smBootstrapping');
            }
            return `VV: ${d.vvDb.toFixed(2)} dB${d.ndviUsed != null ? ` (NDVI corr: ${d.ndviUsed.toFixed(2)})` : ''}`;
          },
        },
      },
      annotation: {
        annotations: {
          dryZone: {
            type: 'box',
            yMin: 0, yMax: 30,
            yScaleID: 'ySm',
            backgroundColor: 'rgba(220, 38, 38, 0.06)',
            borderWidth: 0,
            label: { content: t('charts.dry'), display: true, position: { x: 'start', y: 'center' }, font: { size: 9 }, color: '#dc262680' },
          },
          wetZone: {
            type: 'box',
            yMin: 65, yMax: 100,
            yScaleID: 'ySm',
            backgroundColor: 'rgba(37, 99, 235, 0.06)',
            borderWidth: 0,
            label: { content: t('charts.wet'), display: true, position: { x: 'start', y: 'center' }, font: { size: 9 }, color: '#2563eb80' },
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          font: { size: 9 },
          color: tx3,
          maxTicksLimit: 12,
        },
        grid: { display: false },
      },
      ySm: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 100,
        title: { display: true, text: t('charts.smPercent'), font: { size: 10 }, color: '#2563eb' },
        ticks: { font: { size: 9 }, color: '#2563eb' },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      yVv: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: t('charts.vvDb'), font: { size: 10 }, color: '#9ca3af' },
        ticks: { font: { size: 9 }, color: '#9ca3af' },
        grid: { display: false },
      },
    },
  }), [data, tx3, surface]);

  return (
    <div className="agraria-card">
      <div className="sec-label">{t('charts.soilMoistureTitle')}</div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--tx3)' }}>{t('charts.latestSm')}</div>
          <div className="text-lg font-semibold" style={{ color: latest ? smColor(latest.smRelative!) : 'var(--tx3)' }}>
            {latest ? `${latest.smRelative!.toFixed(0)}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--tx3)' }}>{t('charts.date')}</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
            {latest ? format(parseISO(latest.date), 'MMM d') : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--tx3)' }}>{t('charts.vvRange')}</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--it)' }}>
            {spread} dB
          </div>
        </div>
      </div>

      <div style={{ height: 240 }}>
        <Chart type="line" data={chartData as never} options={options as never} />
      </div>

      {bootstrapping > 0 && (
        <p className="text-[9px] mt-2" style={{ color: 'var(--tx3)' }}>
          {bootstrapping} reading(s) without SM% — need at least 3 overpasses with {'>'}1 dB spread to calibrate.
        </p>
      )}
    </div>
  );
}
