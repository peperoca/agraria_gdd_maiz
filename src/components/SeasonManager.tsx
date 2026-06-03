import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getSeasons, createSeason, updateSeason, deleteSeason } from '../utils/api';
import { getCropConfig, CROP_DROPDOWN_OPTIONS } from '../utils/cropConfig';
import type { Season } from '../types';

interface SeasonManagerProps {
  fieldId: number;
  fieldName: string;
  lastAswMm?: number | null;
  onBack: () => void;
}

export function SeasonManager({ fieldId, fieldName, lastAswMm, onBack }: SeasonManagerProps) {
  const { t } = useTranslation();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  // New season form
  const [newCrop, setNewCrop] = useState('corn-intermediate');
  const [newSowDate, setNewSowDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-season sowing date editing
  const [sowEditing, setSowEditing] = useState<number | null>(null);
  const [sowDate, setSowDate] = useState('');
  const [savingSow, setSavingSow] = useState(false);

  // Per-season crop type editing
  const [cropEditing, setCropEditing] = useState<number | null>(null);
  const [cropValue, setCropValue] = useState('');
  const [savingCrop, setSavingCrop] = useState(false);

  // Per-season harvest editing
  const [harvestEditing, setHarvestEditing] = useState<number | null>(null);
  const [harvestDate, setHarvestDate] = useState('');
  const [savingHarvest, setSavingHarvest] = useState(false);

  const fetchSeasons = () => {
    setLoading(true);
    getSeasons(fieldId)
      .then(setSeasons)
      .catch(() => setSeasons([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchSeasons, [fieldId]);

  const handleCreate = async () => {
    if (!newSowDate) return;
    setSaving(true);
    try {
      await createSeason({
        field_id: fieldId,
        crop_type: newCrop,
        sowing_date: newSowDate,
        initial_asw_mm: lastAswMm ?? undefined,
      });
      setNewSowDate('');
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('season.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSowDateSave = async (seasonId: number) => {
    if (!sowDate) return;
    setSavingSow(true);
    try {
      await updateSeason(seasonId, { sowing_date: sowDate });
      setSowEditing(null);
      setSowDate('');
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update sowing date');
    } finally {
      setSavingSow(false);
    }
  };

  const handleCropTypeSave = async (seasonId: number) => {
    if (!cropValue) return;
    setSavingCrop(true);
    try {
      await updateSeason(seasonId, { crop_type: cropValue });
      setCropEditing(null);
      setCropValue('');
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update crop type');
    } finally {
      setSavingCrop(false);
    }
  };

  const handleUndoHarvest = async (seasonId: number) => {
    if (!confirm(t('season.undoHarvestConfirm', { defaultValue: 'Reactivate this season? The harvest date will be removed.' }))) return;
    try {
      await updateSeason(seasonId, { end_date: null, is_active: true });
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate season');
    }
  };

  const handleHarvest = async (seasonId: number) => {
    if (!harvestDate) return;
    setSavingHarvest(true);
    try {
      await updateSeason(seasonId, { end_date: harvestDate, is_active: false });
      setHarvestEditing(null);
      setHarvestDate('');
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('season.harvestFailed'));
    } finally {
      setSavingHarvest(false);
    }
  };

  const handleDelete = async (seasonId: number) => {
    if (!confirm(t('season.deleteSeasonConfirm'))) return;
    try {
      await deleteSeason(seasonId);
      fetchSeasons();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete season');
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="agraria-card">
        <div className="sec-label">{t('season.manageTitle')} — {fieldName}</div>

        {/* Add new season form */}
        <div className="space-y-3 mb-4 p-3 rounded-[var(--r)]" style={{ background: 'var(--surface2)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--tx)' }}>{t('season.addSeason')}</div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px]" style={{ color: 'var(--tx3)' }}>{t('fieldForm.cropLabel')}</label>
            <select
              value={newCrop}
              onChange={(e) => setNewCrop(e.target.value)}
              className="agraria-input text-xs"
            >
              {(['Corn', 'Soybean', 'Wheat', 'Rapeseed'] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {CROP_DROPDOWN_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px]" style={{ color: 'var(--tx3)' }}>{t('fieldForm.sowingDateLabel')}</label>
            <input
              type="date"
              value={newSowDate}
              onChange={(e) => setNewSowDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="agraria-input text-xs"
            />
          </div>
          <p className="text-[9px]" style={{ color: 'var(--tx3)' }}>
            {t('season.autoCloseNote')}
          </p>
          {lastAswMm != null && (
            <p className="text-[9px]" style={{ color: 'var(--blue)' }}>
              💧 {t('season.aswRollover', { value: Math.round(lastAswMm) })}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!newSowDate || saving}
            className="agraria-btn-primary w-full text-xs py-1.5"
          >
            {saving ? '...' : t('season.addSeason')}
          </button>
        </div>

        {/* Season list */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 rounded" style={{ background: 'var(--surface2)' }} />
            <div className="h-10 rounded" style={{ background: 'var(--surface2)' }} />
          </div>
        ) : seasons.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--tx3)' }}>
            No seasons yet.
          </p>
        ) : (
          <div className="space-y-2">
            {seasons.map((s) => {
              const config = getCropConfig(s.cropType);
              const isEditingHarvest = harvestEditing === s.id;
              return (
                <div
                  key={s.id}
                  className="p-3 rounded-[var(--r)]"
                  style={{ background: 'var(--surface2)', border: s.isActive ? '1.5px solid var(--blue)' : '1px solid var(--bdr)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {cropEditing === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={cropValue}
                            onChange={(e) => setCropValue(e.target.value)}
                            className="agraria-input text-[11px]"
                          >
                            {(['Corn', 'Soybean', 'Wheat', 'Rapeseed'] as const).map((group) => (
                              <optgroup key={group} label={group}>
                                {CROP_DROPDOWN_OPTIONS.filter((o) => o.group === group).map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            onClick={() => handleCropTypeSave(s.id)}
                            disabled={!cropValue || savingCrop}
                            className="text-[10px] px-2 py-1 rounded font-medium"
                            style={{ background: 'var(--blue)', color: '#fff' }}
                          >
                            {savingCrop ? '...' : 'OK'}
                          </button>
                          <button
                            onClick={() => { setCropEditing(null); setCropValue(''); }}
                            className="text-[10px] px-2 py-1 rounded"
                            style={{ color: 'var(--tx3)' }}
                          >
                            {t('fieldForm.cancel')}
                          </button>
                        </div>
                      ) : (
                        <span
                          className="text-xs font-medium cursor-pointer hover:underline"
                          style={{ color: 'var(--tx)' }}
                          onClick={() => { setCropEditing(s.id); setCropValue(s.cropType); }}
                          title={t('season.editCropType', { defaultValue: 'Edit crop type' })}
                        >
                          {config.label} ✏️
                        </span>
                      )}
                      {s.isActive && cropEditing !== s.id && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--blue)', color: '#fff' }}>
                          {t('season.active')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-[10px] p-1"
                      style={{ color: 'var(--tx3)' }}
                      title={t('season.deleteSeason')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <div className="text-[11px] space-y-0.5" style={{ color: 'var(--tx2)' }}>
                    {sowEditing === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0">{t('fieldForm.sowingDateLabel')}:</span>
                        <input
                          type="date"
                          value={sowDate}
                          onChange={(e) => setSowDate(e.target.value)}
                          max={s.endDate || new Date().toISOString().split('T')[0]}
                          className="agraria-input text-[11px] flex-1"
                        />
                        <button
                          onClick={() => handleSowDateSave(s.id)}
                          disabled={!sowDate || savingSow}
                          className="text-[10px] px-2 py-1 rounded font-medium"
                          style={{ background: 'var(--blue)', color: '#fff' }}
                        >
                          {savingSow ? '...' : 'OK'}
                        </button>
                        <button
                          onClick={() => { setSowEditing(null); setSowDate(''); }}
                          className="text-[10px] px-2 py-1 rounded"
                          style={{ color: 'var(--tx3)' }}
                        >
                          {t('fieldForm.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setSowEditing(s.id); setSowDate(s.sowingDate); }}
                        className="cursor-pointer hover:underline"
                        title={t('season.editSowingDate')}
                      >
                        {t('fieldForm.sowingDateLabel')}: {format(parseISO(s.sowingDate), 'MMM d, yyyy')} ✏️
                      </div>
                    )}
                    {s.endDate ? (
                      <div className="flex items-center gap-2">
                        <span>{t('season.harvestDateLabel')}: {format(parseISO(s.endDate), 'MMM d, yyyy')}</span>
                        <button
                          onClick={() => handleUndoHarvest(s.id)}
                          className="text-[9px] px-1.5 py-0.5 rounded underline"
                          style={{ color: 'var(--orange)' }}
                          title={t('season.undoHarvest', { defaultValue: 'Undo harvest' })}
                        >
                          {t('season.undoHarvest', { defaultValue: 'Undo' })}
                        </button>
                      </div>
                    ) : s.isActive ? (
                      <>
                        {isEditingHarvest ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="date"
                              value={harvestDate}
                              onChange={(e) => setHarvestDate(e.target.value)}
                              max={new Date().toISOString().split('T')[0]}
                              min={s.sowingDate}
                              className="agraria-input text-[11px] flex-1"
                            />
                            <button
                              onClick={() => handleHarvest(s.id)}
                              disabled={!harvestDate || savingHarvest}
                              className="text-[10px] px-2 py-1 rounded font-medium"
                              style={{ background: 'var(--blue)', color: '#fff' }}
                            >
                              {savingHarvest ? '...' : 'OK'}
                            </button>
                            <button
                              onClick={() => { setHarvestEditing(null); setHarvestDate(''); }}
                              className="text-[10px] px-2 py-1 rounded"
                              style={{ color: 'var(--tx3)' }}
                            >
                              {t('fieldForm.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setHarvestEditing(s.id); setHarvestDate(''); }}
                            className="text-[10px] mt-1 underline"
                            style={{ color: 'var(--orange)' }}
                          >
                            {`🌾 ${t('season.harvest')}`}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleUndoHarvest(s.id)}
                        className="text-[10px] underline"
                        style={{ color: 'var(--orange)' }}
                      >
                        {t('season.reactivate', { defaultValue: 'Reactivate season' })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onBack}
        className="w-full py-2 rounded-[var(--r)] text-xs font-medium"
        style={{ background: 'var(--surface2)', color: 'var(--tx2)', border: '1px solid var(--bdr)' }}
      >
        {t('nav.back')}
      </button>
    </div>
  );
}
