import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Field, DailyGdd, DailyEto, DailyRain, NdviReading, DailyETc } from '../types';
import type { TFunction } from 'i18next';
import { getCropConfig, getBaseCrop, getTranslatedStage } from './cropConfig';

/**
 * Export field report as PDF.
 * Captures charts from the DOM and builds a summary page.
 */
export async function exportFieldPdf(
  field: Field,
  gddData: DailyGdd[],
  etoData: DailyEto[],
  rainData: DailyRain[],
  ndviData: NdviReading[] = [],
  _etcData: DailyETc[] = [],
  t?: TFunction,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const cropConfig = getCropConfig(field.cropType ?? 'corn');

  // ── Header ──
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(24, 95, 165); // Agraria blue
  pdf.text('Agraria GDD Tracker', margin, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Field Report — Generated ${new Date().toLocaleDateString()}`, margin, y);
  y += 10;

  // ── Field Summary ──
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text(field.name, margin, y);
  y += 7;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);

  const latestGdd = gddData.length > 0 ? gddData[gddData.length - 1] : null;
  const latestEto = etoData.length > 0 ? etoData[etoData.length - 1] : null;
  const latestRain = rainData.length > 0 ? rainData[rainData.length - 1] : null;

  const summaryLines = [
    `Crop: ${cropConfig.label}`,
    `Sowing Date: ${field.sowingDate}`,
    `Cumulative GDD: ${latestGdd ? Math.round(latestGdd.cumulative) : '—'}`,
    `Cumulative ETo: ${latestEto ? latestEto.cumulative.toFixed(1) + ' mm' : '—'}`,
    `Cumulative Rain: ${latestRain ? latestRain.cumulative.toFixed(1) + ' mm' : '—'}`,
  ];

  if (ndviData.length > 0) {
    const latestNdvi = ndviData[ndviData.length - 1];
    summaryLines.push(`Latest NDVI: ${latestNdvi.ndviMean.toFixed(3)} (Kc: ${latestNdvi.kc.toFixed(3)})`);
  }

  for (const line of summaryLines) {
    pdf.text(line, margin, y);
    y += 5;
  }
  y += 5;

  // ── Growth Stages Table ──
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  const baseCrop = getBaseCrop((field.cropType ?? 'corn') as import('./cropConfig').CropType);
  pdf.text(t ? t('growthStages.title') : 'Growth Stages', margin, y);
  y += 6;

  // Find stage dates
  const stageDates = new Map<string, string>();
  let stageIdx = 0;
  for (const day of gddData) {
    while (stageIdx < cropConfig.stages.length && day.cumulative >= cropConfig.stages[stageIdx].gdd) {
      stageDates.set(cropConfig.stages[stageIdx].shortName, day.date);
      stageIdx++;
    }
    if (stageIdx >= cropConfig.stages.length) break;
  }

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 100, 100);
  const colX = [margin, margin + 15, margin + 55, margin + 85, margin + 110];
  pdf.text('', colX[0], y);
  pdf.text('Stage', colX[1], y);
  pdf.text('Name', colX[2], y);
  pdf.text('GDD', colX[3], y);
  pdf.text('Date', colX[4], y);
  y += 4;

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  for (const stage of cropConfig.stages) {
    if (y > 270) {
      pdf.addPage();
      y = margin;
    }
    const isPast = latestGdd ? latestGdd.cumulative >= stage.gdd : false;
    const dateReached = stageDates.get(stage.shortName);
    pdf.text(isPast ? 'OK' : '  ', colX[0], y);
    pdf.text(stage.shortName, colX[1], y);
    const stageName = t ? getTranslatedStage(t, baseCrop, stage).name : stage.name;
    pdf.text(stageName, colX[2], y);
    pdf.text(String(stage.gdd), colX[3], y);
    pdf.text(dateReached ?? '—', colX[4], y);
    y += 4;
  }
  y += 5;

  // ── Capture charts from DOM ──
  const chartCards = Array.from(document.querySelectorAll('.agraria-card'));
  for (const card of chartCards) {
    const canvas = card.querySelector('canvas');
    if (!canvas) continue;

    try {
      if (y > 180) {
        pdf.addPage();
        y = margin;
      }

      const img = await html2canvas(card as HTMLElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = img.toDataURL('image/png');
      const ratio = img.width / img.height;
      const imgWidth = contentWidth;
      const imgHeight = imgWidth / ratio;

      pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      y += imgHeight + 5;
    } catch {
      // Skip chart if capture fails
    }
  }

  // ── Daily Data Table ──
  pdf.addPage();
  y = margin;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text('Daily Data (last 14 days)', margin, y);
  y += 6;

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 100, 100);
  const dataColX = [margin, margin + 22, margin + 38, margin + 55, margin + 72, margin + 88];
  pdf.text('Date', dataColX[0], y);
  pdf.text('GDD', dataColX[1], y);
  pdf.text('Cum GDD', dataColX[2], y);
  pdf.text('ETo', dataColX[3], y);
  pdf.text('Rain', dataColX[4], y);
  pdf.text('ETc', dataColX[5], y);
  y += 4;

  const etoMap = new Map(etoData.map((d) => [d.date, d]));
  const rainMap = new Map(rainData.map((d) => [d.date, d]));
  const etcMap = new Map(_etcData.map((d) => [d.date, d]));

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  const recentDays = gddData.slice(-14).reverse();
  for (const day of recentDays) {
    const eto = etoMap.get(day.date);
    const rain = rainMap.get(day.date);
    const etc = etcMap.get(day.date);

    pdf.text(day.date, dataColX[0], y);
    pdf.text(day.gdd.toFixed(1), dataColX[1], y);
    pdf.text(day.cumulative.toFixed(0), dataColX[2], y);
    pdf.text(eto ? eto.eto.toFixed(2) : '—', dataColX[3], y);
    pdf.text(rain && rain.rain > 0 ? rain.rain.toFixed(1) : '—', dataColX[4], y);
    pdf.text(etc ? etc.etc.toFixed(2) : '—', dataColX[5], y);
    y += 4;
  }

  // ── Footer ──
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Agraria Uruguay — www.agraria.com.uy', margin, 290);
    pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, 290);
  }

  pdf.save(`${field.name.replace(/\s+/g, '_')}_report.pdf`);
}
