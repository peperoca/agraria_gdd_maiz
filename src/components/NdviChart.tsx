import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { NdviReading } from '../types';
import type { KcFormula } from '../utils/ndvi';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface NdviChartProps {
  data: NdviReading[];
  altKcData?: NdviReading[] | null;
  activeFormula?: KcFormula;
  onDateClick?: (date: string) => void;
}

export function NdviChart({ data, altKcData, activeFormula, onDateClick }: NdviChartProps) {
  const { t } = useTranslation();
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const green = '#2d8a4e';
  const orange = styles.getPropertyValue('--orange').trim() || '#D97706';

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const altSorted = useMemo(
    () => altKcData ? [...altKcData].sort((a, b) => a.date.localeCompare(b.date)) : null,
    [altKcData],
  );

  const activeLabel = activeFormula === 'nonlinear' ? t('charts.kcNonlinearLabel') : t('charts.kcLinearLabel');
  const altLabel = activeFormula === 'nonlinear' ? t('charts.kcLinearLabel') : t('charts.kcNonlinearLabel');
  const purple = '#7c3aed';

  const chartData = useMemo(() => {
    const datasets = [
      {
        label: t('charts.ndviLabel'),
        data: sorted.map((d) => d.ndviMean),
        borderColor: green,
        backgroundColor: `${green}30`,
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: 'yNdvi',
      },
      {
        label: activeLabel,
        data: sorted.map((d) => d.kc),
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        yAxisID: 'yKc',
      },
      ...(altSorted ? [{
        label: altLabel,
        data: altSorted.map((d) => d.kc),
        borderColor: purple,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3] as number[],
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
        yAxisID: 'yKc',
      }] : []),
    ];
    return { labels: sorted.map((d) => format(parseISO(d.date), 'MMM d')), datasets };
  }, [sorted, altSorted, green, orange, purple, activeLabel, altLabel]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    onClick: (_event, elements) => {
      if (onDateClick && elements.length > 0) {
        const idx = elements[0].index;
        if (idx >= 0 && idx < sorted.length) {
          onDateClick(sorted[idx].date);
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, font: { size: 11 }, color: tx3 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${val.toFixed(3)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      yNdvi: {
        position: 'left',
        title: { display: true, text: t('charts.ndviAxis'), font: { size: 10 }, color: green },
        ticks: { font: { size: 9 }, color: green },
        grid: { color: `${tx3}15` },
        min: 0,
        max: 1,
      },
      yKc: {
        position: 'right',
        title: { display: true, text: t('charts.kcAxis'), font: { size: 10 }, color: orange },
        ticks: { font: { size: 9 }, color: orange },
        grid: { display: false },
        min: 0,
        max: 1.5,
      },
    },
  };

  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="sec-label">{t('charts.ndviTitle')}</div>
      {latest && (
        <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.ndviLabel')}</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {latest.ndviMean.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.kcLabel')}</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {latest.kc.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('charts.date')}</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {format(parseISO(latest.date), 'MMM d')}
            </div>
          </div>
        </div>
      )}
      <div style={{ height: '240px', cursor: onDateClick ? 'pointer' : undefined }}>
        <Line data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        {t('charts.ndviFootnote')}
        {onDateClick && (
          <span style={{ color: 'var(--blue)' }}> {t('charts.ndviTapToView')}</span>
        )}
      </p>
    </div>
  );
}
