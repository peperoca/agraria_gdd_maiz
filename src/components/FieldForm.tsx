import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field, FieldPolygon } from '../types';
import { CROP_DROPDOWN_OPTIONS, normalizeCropType, getCropConfig, type CropType } from '../utils/cropConfig';
import { getConeatSoils } from '../utils/api';
import { PolygonMap } from './PolygonMap';

// Turf.js for polygon intersection
import intersect from '@turf/intersect';
import area from '@turf/area';
import { polygon as turfPolygon, multiPolygon as turfMultiPolygon, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export interface FieldFormData {
  name: string;
  sowingDate: string;
  cropType: CropType;
  polygon?: FieldPolygon | null;
  // Soil water balance
  tawMm?: number | null;
  madPct?: number | null;
  tawSource?: 'coneat_mm' | 'coneat_apdn' | 'manual' | null;
  coneatGc?: string | null;
  initialAswMm?: number | null;
}

interface FieldFormProps {
  field?: Field;
  farmLat?: number | null;
  farmLng?: number | null;
  onSubmit: (data: FieldFormData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

interface ConeatMatch {
  gc: string;
  mm: number;
  apdn: number;
  ip: number;
  overlapPct: number;
}

export function FieldForm({ field, farmLat, farmLng, onSubmit, onCancel, onDelete }: FieldFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(field?.name ?? '');
  const [sowingDate, setSowingDate] = useState(field?.sowingDate ?? '');
  const [cropType, setCropType] = useState<CropType>(normalizeCropType(field?.cropType ?? 'corn'));
  const [polygon, setPolygon] = useState<FieldPolygon | null>(field?.polygon ?? null);

  // Soil water balance
  const [showSoil, setShowSoil] = useState(!!field?.tawMm);
  const [tawMm, setTawMm] = useState<string>(field?.tawMm != null ? String(field.tawMm) : '');
  const [madPct, setMadPct] = useState<string>(field?.madPct != null ? String(field.madPct) : '');
  const [tawSource, setTawSource] = useState<'coneat_mm' | 'coneat_apdn' | 'manual' | null>(field?.tawSource ?? null);
  const [coneatGc, setConeatGc] = useState<string | null>(field?.coneatGc ?? null);
  const [initialAswMm, setInitialAswMm] = useState<string>(field?.initialAswMm != null ? String(field.initialAswMm) : '');

  // CONEAT intersection
  const [coneatMatches, setConeatMatches] = useState<ConeatMatch[] | null>(null);
  const [coneatLoading, setConeatLoading] = useState(false);
  const [coneatError, setConeatError] = useState<string | null>(null);

  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  const cropConfig = getCropConfig(cropType);
  const isEditing = !!field;
  const isValid = isEditing ? name.trim().length > 0 : (name.trim().length > 0 && sowingDate.length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const taw = tawMm ? parseFloat(tawMm) : null;
    onSubmit({
      name: name.trim(),
      sowingDate,
      cropType,
      polygon,
      tawMm: taw,
      madPct: madPct ? parseFloat(madPct) : null,
      tawSource,
      coneatGc,
      initialAswMm: initialAswMm ? parseFloat(initialAswMm) : (taw ?? null),
    });
  };

  // Run CONEAT intersection when user clicks the button
  const runConeatIntersection = useCallback(async () => {
    if (!polygon) return;
    setConeatLoading(true);
    setConeatError(null);
    setConeatMatches(null);

    try {
      const soils = await getConeatSoils(true);
      const fieldFeature = turfPolygon(polygon.coordinates);
      const fieldArea = area(fieldFeature);
      if (fieldArea <= 0) {
        setConeatError('Field polygon has zero area');
        return;
      }

      const matches: ConeatMatch[] = [];

      for (const soil of soils) {
        if (!soil.geometry) continue;
        try {
          let soilFeature: Feature<Polygon | MultiPolygon>;
          if (soil.geometry.type === 'MultiPolygon') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            soilFeature = turfMultiPolygon(soil.geometry.coordinates as any) as Feature<Polygon | MultiPolygon>;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            soilFeature = turfPolygon(soil.geometry.coordinates as any) as Feature<Polygon | MultiPolygon>;
          }

          const fc = featureCollection([fieldFeature as Feature<Polygon | MultiPolygon>, soilFeature]);
          const inter = intersect(fc);
          if (inter) {
            const interArea = area(inter);
            const pct = (interArea / fieldArea) * 100;
            if (pct >= 0.5) {
              matches.push({
                gc: soil.gc_code,
                mm: soil.mm,
                apdn: soil.apdn,
                ip: soil.ip,
                overlapPct: Math.round(pct * 10) / 10,
              });
            }
          }
        } catch {
          // Skip problematic geometries
        }
      }

      matches.sort((a, b) => b.overlapPct - a.overlapPct);

      if (matches.length === 0) {
        setConeatError('No CONEAT groups overlap with this field polygon. You can enter TAW manually.');
      } else {
        // Compute weighted average if multiple groups
        if (matches.length > 1) {
          const totalPct = matches.reduce((s, m) => s + m.overlapPct, 0);
          const weightedMm = matches.reduce((s, m) => s + m.mm * m.overlapPct, 0) / totalPct;
          const weightedApdn = matches.reduce((s, m) => s + m.apdn * m.overlapPct, 0) / totalPct;
          matches.unshift({
            gc: 'Weighted Avg',
            mm: Math.round(weightedMm * 10) / 10,
            apdn: Math.round(weightedApdn * 10) / 10,
            ip: Math.round(matches.reduce((s, m) => s + m.ip * m.overlapPct, 0) / totalPct),
            overlapPct: 100,
          });
        }
        setConeatMatches(matches);
      }
    } catch (err) {
      setConeatError(err instanceof Error ? err.message : 'Failed to load CONEAT data');
    } finally {
      setConeatLoading(false);
    }
  }, [polygon]);

  // Auto-open soil section if we detect coneat data
  useEffect(() => {
    if (coneatMatches && coneatMatches.length > 0) setShowSoil(true);
  }, [coneatMatches]);

  const selectConeatValue = (gc: string, mm: number, apdn: number, source: 'coneat_mm' | 'coneat_apdn') => {
    const value = source === 'coneat_mm' ? mm : apdn;
    setTawMm(String(value));
    setTawSource(source);
    setConeatGc(gc === 'Weighted Avg' ? coneatMatches?.filter(m => m.gc !== 'Weighted Avg').map(m => m.gc).join('+') ?? null : gc);
    setInitialAswMm(String(value));
  };

  return (
    <div className="agraria-card">
      <div className="sec-label">{isEditing ? t('fieldForm.editField') : t('fieldForm.newField')}</div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('fieldForm.fieldNameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('fieldForm.fieldNamePlaceholder')}
            className="agraria-input"
            autoFocus
          />
        </div>

        {!isEditing && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('fieldForm.cropLabel')}</label>
              <select
                value={cropType}
                onChange={(e) => setCropType(e.target.value as CropType)}
                className="agraria-input"
              >
                {(['Corn', 'Soybean', 'Wheat', 'Rapeseed'] as const).map((group) => (
                  <optgroup key={group} label={t(`crops.${group.toLowerCase()}`)}>
                    {CROP_DROPDOWN_OPTIONS.filter((o) => o.group === group).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('fieldForm.sowingDateLabel')}</label>
              <input
                type="date"
                value={sowingDate}
                onChange={(e) => setSowingDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="agraria-input"
              />
            </div>
          </>
        )}

        {isEditing && field?.createdAt && (
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('fieldForm.creationDate')}</label>
            <div className="text-xs py-2 px-3 rounded-[var(--r)]" style={{ background: 'var(--surface2)', color: 'var(--tx)' }}>
              {new Date(field.createdAt).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* Polygon map */}
        <PolygonMap
          centerLat={farmLat ?? undefined}
          centerLng={farmLng ?? undefined}
          polygon={polygon}
          onChange={setPolygon}
        />
        {polygon && (
          <div className="text-[10px]" style={{ color: 'var(--tx3)' }}>
            {t('fieldForm.polygonDrawn', { count: polygon.coordinates[0].length - 1 })}
            {(() => {
              try {
                const feat = turfPolygon(polygon.coordinates);
                const areaM2 = area(feat);
                const ha = areaM2 / 10000;
                return ` · ${ha.toFixed(1)} ha (${(ha * 2.471).toFixed(1)} ac)`;
              } catch { return ''; }
            })()}
          </div>
        )}

        {/* ── Soil Water Balance Section ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowSoil(!showSoil)}
            className="text-xs font-medium w-full text-left py-1"
            style={{ color: 'var(--tx2)' }}
          >
            {showSoil ? '▾' : '▸'} {t('fieldForm.soilWaterBalance')} {tawMm ? t('fieldForm.soilTawSet', { value: tawMm }) : t('fieldForm.soilOptional')}
          </button>

          {showSoil && (
            <div className="space-y-3 mt-2 p-3 rounded-[var(--r)]" style={{ background: 'var(--surface2)' }}>
              {/* CONEAT auto-populate */}
              {polygon && (
                <div>
                  <button
                    type="button"
                    onClick={runConeatIntersection}
                    disabled={coneatLoading}
                    className="text-[11px] px-3 py-1.5 rounded-[var(--r)] font-medium w-full"
                    style={{ background: 'var(--bg)', color: 'var(--tx)', border: '1px solid var(--bdr)' }}
                  >
                    {coneatLoading ? t('fieldForm.analyzingSoil') : t('fieldForm.autoDetectConeat')}
                  </button>

                  {coneatError && (
                    <p className="text-[10px] mt-1.5" style={{ color: '#b45309' }}>{coneatError}</p>
                  )}

                  {coneatMatches && coneatMatches.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] mb-1" style={{ color: 'var(--tx3)' }}>
                        {t('fieldForm.selectConeatValue')}
                      </p>
                      {coneatMatches.map((m) => (
                        <div
                          key={m.gc}
                          className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded"
                          style={{
                            background: 'var(--bg)',
                            border: coneatGc === m.gc || (m.gc === 'Weighted Avg' && coneatGc?.includes('+'))
                              ? '1.5px solid var(--blue)' : '1px solid var(--bdr)',
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium" style={{ color: 'var(--tx)' }}>{m.gc}</span>
                            {m.gc !== 'Weighted Avg' && (
                              <span className="ml-1" style={{ color: 'var(--tx3)' }}>
                                ({m.overlapPct.toFixed(0)}%)
                              </span>
                            )}
                            <span className="ml-1 text-[10px]" style={{ color: 'var(--tx3)' }}>
                              IP:{m.ip}
                            </span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => selectConeatValue(m.gc, m.mm, m.apdn, 'coneat_mm')}
                              className="px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: tawSource === 'coneat_mm' && tawMm === String(m.mm) ? 'var(--blue)' : 'var(--surface2)',
                                color: tawSource === 'coneat_mm' && tawMm === String(m.mm) ? '#fff' : 'var(--tx)',
                              }}
                            >
                              MM {m.mm}
                            </button>
                            <button
                              type="button"
                              onClick={() => selectConeatValue(m.gc, m.mm, m.apdn, 'coneat_apdn')}
                              className="px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: tawSource === 'coneat_apdn' && tawMm === String(m.apdn) ? 'var(--blue)' : 'var(--surface2)',
                                color: tawSource === 'coneat_apdn' && tawMm === String(m.apdn) ? '#fff' : 'var(--tx)',
                              }}
                            >
                              APDN {m.apdn}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!polygon && (
                <p className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                  {t('fieldForm.drawPolygonForConeat')}
                </p>
              )}

              {/* Manual TAW input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px]" style={{ color: 'var(--tx2)' }}>
                  Total Available Water — TAW (mm)
                  <span className="ml-1" style={{ color: 'var(--tx3)' }}>FC - PWP for root zone</span>
                </label>
                <input
                  type="number"
                  value={tawMm}
                  onChange={(e) => {
                    setTawMm(e.target.value);
                    if (e.target.value) {
                      setTawSource('manual');
                      if (!initialAswMm) setInitialAswMm(e.target.value);
                    }
                  }}
                  placeholder="e.g., 120"
                  min="0"
                  max="400"
                  step="0.1"
                  className="agraria-input text-sm"
                />
              </div>

              {/* MAD override */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px]" style={{ color: 'var(--tx2)' }}>
                  Safety threshold — MAD (%)
                  <span className="ml-1" style={{ color: 'var(--tx3)' }}>
                    default: {(cropConfig.madDefault * 100).toFixed(0)}% for {cropConfig.baseCrop}
                  </span>
                </label>
                <input
                  type="number"
                  value={madPct}
                  onChange={(e) => setMadPct(e.target.value)}
                  placeholder={String(cropConfig.madDefault * 100)}
                  min="10"
                  max="90"
                  step="1"
                  className="agraria-input text-sm"
                />
              </div>

              {/* Initial ASW */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px]" style={{ color: 'var(--tx2)' }}>
                  Initial soil water (mm)
                  <span className="ml-1" style={{ color: 'var(--tx3)' }}>at sowing — defaults to TAW</span>
                </label>
                <input
                  type="number"
                  value={initialAswMm}
                  onChange={(e) => setInitialAswMm(e.target.value)}
                  placeholder={tawMm || 'TAW'}
                  min="0"
                  max={tawMm || '400'}
                  step="0.1"
                  className="agraria-input text-sm"
                />
              </div>

              {tawMm && (
                <p className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                  Water balance will track soil water 0–{tawMm} mm. Irrigation advisory triggers below{' '}
                  {Math.round(parseFloat(tawMm) * (1 - (madPct ? parseFloat(madPct) / 100 : cropConfig.madDefault)))} mm.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-[var(--r)] text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
          >
            {t('fieldForm.cancel')}
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="agraria-btn-primary flex-1"
          >
            {isEditing ? t('fieldForm.saveChanges') : t('fieldForm.addField')}
          </button>
        </div>

        {/* Delete field button — only when editing */}
        {isEditing && onDelete && (
          <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--bdr)' }}>
            {!showDeleteWarning ? (
              <button
                type="button"
                onClick={() => setShowDeleteWarning(true)}
                className="w-full py-2 rounded-[var(--r)] text-xs font-medium"
                style={{ background: '#dc2626', color: '#fff' }}
              >
                {t('fieldForm.deleteField')}
              </button>
            ) : (
              <div className="p-3 rounded-[var(--r)]" style={{ background: 'var(--surface2)', border: '1px solid #dc2626' }}>
                <p className="text-xs mb-3" style={{ color: 'var(--tx)' }}>
                  {t('fieldForm.deleteWarning')}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteWarning(false)}
                    className="flex-1 py-1.5 rounded-[var(--r)] text-xs font-medium"
                    style={{ background: 'var(--surface)', color: 'var(--tx2)', border: '1px solid var(--bdr)' }}
                  >
                    {t('fieldForm.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex-1 py-1.5 rounded-[var(--r)] text-xs font-medium"
                    style={{ background: '#dc2626', color: '#fff' }}
                  >
                    {t('fieldForm.deleteField')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
