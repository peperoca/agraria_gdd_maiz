import type { DailyGdd, DailyEto, DailyRain, NdviReading, DailyETc } from '../types';

/**
 * Export field data as CSV with BOM for Excel compatibility.
 */
export function exportFieldCsv(
  fieldName: string,
  gddData: DailyGdd[],
  etoData: DailyEto[],
  rainData: DailyRain[],
  ndviData: NdviReading[] = [],
  etcData: DailyETc[] = [],
): void {
  // Build date-indexed maps
  const etoMap = new Map(etoData.map((d) => [d.date, d]));
  const rainMap = new Map(rainData.map((d) => [d.date, d]));
  const ndviMap = new Map(ndviData.map((d) => [d.date, d]));
  const etcMap = new Map(etcData.map((d) => [d.date, d]));

  const headers = [
    'Date',
    'Daily GDD', 'Cum GDD',
    'Daily ETo (mm)', 'Cum ETo (mm)',
    'Daily Rain (mm)', 'Cum Rain (mm)',
    'NDVI', 'Kc',
    'Daily ETc (mm)', 'Cum ETc (mm)',
  ];

  const rows = gddData.map((g) => {
    const eto = etoMap.get(g.date);
    const rain = rainMap.get(g.date);
    const ndvi = ndviMap.get(g.date);
    const etc = etcMap.get(g.date);

    return [
      g.date,
      g.gdd.toFixed(2),
      g.cumulative.toFixed(2),
      eto ? eto.eto.toFixed(3) : '',
      eto ? eto.cumulative.toFixed(2) : '',
      rain ? rain.rain.toFixed(2) : '',
      rain ? rain.cumulative.toFixed(2) : '',
      ndvi ? ndvi.ndviMean.toFixed(4) : '',
      ndvi ? ndvi.kc.toFixed(4) : '',
      etc ? etc.etc.toFixed(3) : '',
      etc ? etc.cumulative.toFixed(2) : '',
    ].join(',');
  });

  // BOM + CSV content
  const bom = '﻿';
  const csv = bom + headers.join(',') + '\n' + rows.join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fieldName.replace(/\s+/g, '_')}_data.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
