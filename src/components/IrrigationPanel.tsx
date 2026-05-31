import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Farm, Field, IrrigationEquipment, IrrigationAssignment } from '../types';
import {
  getIrrigationEquipment,
  createIrrigationEquipment,
  updateIrrigationEquipment,
  deleteIrrigationEquipment,
  getIrrigationAssignments,
  createIrrigationAssignment,
  updateIrrigationAssignment,
  deleteIrrigationAssignment,
  type IrrigationEquipmentRaw,
  type IrrigationAssignmentRaw,
} from '../utils/api';

interface IrrigationPanelProps {
  farm: Farm;
  fields: Field[];
}

function mapEquipment(raw: IrrigationEquipmentRaw): IrrigationEquipment {
  return {
    id: raw.id,
    farmId: raw.farm_id,
    name: raw.name,
    serialNumber: raw.serial_number,
    reportUrl: raw.report_url,
    areaHa: raw.area_ha,
    type: raw.type,
    isActive: !!raw.is_active,
    createdAt: raw.created_at,
  };
}

function mapAssignment(raw: IrrigationAssignmentRaw): IrrigationAssignment {
  return {
    id: raw.id,
    equipmentId: raw.equipment_id,
    equipmentName: raw.equipment_name,
    fieldId: raw.field_id,
    fieldName: raw.field_name,
    startDate: raw.start_date,
    endDate: raw.end_date,
    createdAt: raw.created_at,
  };
}

const EQUIP_TYPE_KEYS = [
  { value: 'pivot', key: 'irrigation.typePivot' },
  { value: 'drip', key: 'irrigation.typeDrip' },
  { value: 'sprinkler', key: 'irrigation.typeSprinkler' },
  { value: 'flood', key: 'irrigation.typeFlood' },
  { value: 'other', key: 'irrigation.typeOther' },
];

export function IrrigationPanel({ farm, fields }: IrrigationPanelProps) {
  const { t } = useTranslation();
  const [equipment, setEquipment] = useState<IrrigationEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Map<number, IrrigationAssignment[]>>(new Map());

  // Add equipment form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newType, setNewType] = useState('pivot');
  const [saving, setSaving] = useState(false);

  // Add assignment form
  const [addingAssignmentFor, setAddingAssignmentFor] = useState<number | null>(null);
  const [assignFieldId, setAssignFieldId] = useState<number | null>(null);
  const [assignStartDate, setAssignStartDate] = useState('');
  const [assignEndDate, setAssignEndDate] = useState('');

  // Edit equipment
  const [editingEquipId, setEditingEquipId] = useState<number | null>(null);
  const [editEquipName, setEditEquipName] = useState('');
  const [editEquipSerial, setEditEquipSerial] = useState('');
  const [editEquipArea, setEditEquipArea] = useState('');
  const [editEquipUrl, setEditEquipUrl] = useState('');

  // Edit assignment
  const [editingAssignment, setEditingAssignment] = useState<IrrigationAssignment | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const fetchEquipment = useCallback(async () => {
    try {
      const raw = await getIrrigationEquipment(farm.id);
      setEquipment(raw.map(mapEquipment));
    } catch {
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  }, [farm.id]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  const fetchAssignments = useCallback(async (equipmentId: number) => {
    try {
      const raw = await getIrrigationAssignments({ equipment_id: equipmentId });
      setAssignments((prev) => new Map(prev).set(equipmentId, raw.map(mapAssignment)));
    } catch {
      // ignore
    }
  }, []);

  // When expanding, fetch assignments
  const handleToggleExpand = (equipId: number) => {
    if (expandedId === equipId) {
      setExpandedId(null);
    } else {
      setExpandedId(equipId);
      if (!assignments.has(equipId)) {
        fetchAssignments(equipId);
      }
    }
  };

  const handleAddEquipment = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createIrrigationEquipment({
        farm_id: farm.id,
        name: newName.trim(),
        serial_number: newSerial.trim() || undefined,
        report_url: newUrl.trim() || undefined,
        area_ha: newArea ? parseFloat(newArea) : undefined,
        type: newType,
      });
      setNewName('');
      setNewSerial('');
      setNewUrl('');
      setNewArea('');
      setNewType('pivot');
      setShowAddForm(false);
      await fetchEquipment();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add equipment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEquipment = async (id: number) => {
    if (!confirm(t('irrigation.deactivateConfirm'))) return;
    try {
      await deleteIrrigationEquipment(id);
      await fetchEquipment();
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete equipment');
    }
  };

  const startEditEquipment = (equip: IrrigationEquipment) => {
    setEditingEquipId(equip.id);
    setEditEquipName(equip.name);
    setEditEquipSerial(equip.serialNumber || '');
    setEditEquipArea(equip.areaHa ? String(equip.areaHa) : '');
    setEditEquipUrl(equip.reportUrl || '');
  };

  const handleSaveEquipment = async () => {
    if (!editingEquipId) return;
    setSaving(true);
    try {
      await updateIrrigationEquipment(editingEquipId, {
        name: editEquipName.trim(),
        serial_number: editEquipSerial.trim() || null,
        area_ha: editEquipArea ? parseFloat(editEquipArea) : null,
        report_url: editEquipUrl.trim() || null,
      });
      setEditingEquipId(null);
      await fetchEquipment();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update equipment');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignment = async (equipId: number) => {
    if (!assignFieldId || !assignStartDate) return;
    setSaving(true);
    try {
      await createIrrigationAssignment({
        equipment_id: equipId,
        field_id: assignFieldId,
        start_date: assignStartDate,
        end_date: assignEndDate || undefined,
      });
      setAddingAssignmentFor(null);
      setAssignFieldId(null);
      setAssignStartDate('');
      setAssignEndDate('');
      await fetchAssignments(equipId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleEditAssignment = async () => {
    if (!editingAssignment) return;
    setSaving(true);
    try {
      await updateIrrigationAssignment(editingAssignment.id, {
        start_date: editStartDate,
        end_date: editEndDate || null,
      });
      setEditingAssignment(null);
      await fetchAssignments(editingAssignment.equipmentId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (a: IrrigationAssignment) => {
    if (!confirm(t('irrigation.deleteAssignmentConfirm'))) return;
    try {
      await deleteIrrigationAssignment(a.id);
      await fetchAssignments(a.equipmentId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete assignment');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-xs" style={{ color: 'var(--tx3)' }}>{t('irrigation.loadingEquipment')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="agraria-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--tx)' }}>{t('irrigation.title')}</h2>
            <p className="text-xs" style={{ color: 'var(--tx3)' }}>
              {farm.name} &middot; {t('irrigation.equipmentCount', { count: equipment.length })}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="agraria-btn-orange text-xs"
          >
            {showAddForm ? t('irrigation.cancel') : t('irrigation.addEquipment')}
          </button>
        </div>

        {/* Add equipment form */}
        {showAddForm && (
          <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '0.5px solid var(--bdr)' }}>
            <div>
              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.nameLabel')}</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('irrigation.namePlaceholder')}
                className="agraria-input w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.serialLabel')}</label>
                <input
                  type="text"
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  placeholder={t('irrigation.serialPlaceholder')}
                  className="agraria-input w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.areaLabel')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder={t('irrigation.areaPlaceholder')}
                  className="agraria-input w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.typeLabel')}</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="agraria-input w-full"
                >
                  {EQUIP_TYPE_KEYS.map((et) => (
                    <option key={et.value} value={et.value}>{t(et.key)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>
                {t('irrigation.agSenseUrlLabel')}
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={t('irrigation.agSenseUrlPlaceholder')}
                className="agraria-input w-full text-[10px]"
              />
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                {t('irrigation.agSenseUrlNote')}
              </p>
            </div>
            <button
              onClick={handleAddEquipment}
              disabled={saving || !newName.trim()}
              className="agraria-btn-primary w-full text-xs mt-1"
            >
              {saving ? t('irrigation.saving') : t('irrigation.addEquipmentBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Equipment list */}
      {equipment.length === 0 && !showAddForm && (
        <div className="agraria-card text-center py-6">
          <div className="text-3xl mb-2">💧</div>
          <p className="text-xs" style={{ color: 'var(--tx3)' }}>
            {t('irrigation.noEquipmentYet')}
          </p>
        </div>
      )}

      {equipment.map((equip) => {
        const isExpanded = expandedId === equip.id;
        const equipAssignments = assignments.get(equip.id) ?? [];
        const isAddingAssignment = addingAssignmentFor === equip.id;

        return (
          <div key={equip.id} className="agraria-card">
            {/* Equipment header */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => handleToggleExpand(equip.id)}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--tx)' }}>
                  {equip.name}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                  {equip.type.charAt(0).toUpperCase() + equip.type.slice(1)}
                  {equip.serialNumber && ` · SN: ${equip.serialNumber}`}
                  {equip.areaHa && ` · ${equip.areaHa} ha`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {equip.reportUrl && equip.areaHa && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#1a998820', color: '#1a9988' }}>
                    {t('irrigation.autoFetch')}
                  </span>
                )}
                {equip.reportUrl && !equip.areaHa && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#dc262620', color: '#dc2626' }}>
                    {t('irrigation.setArea')}
                  </span>
                )}
                <span className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface2)', color: 'var(--tx3)' }}>
                  {isExpanded ? t('irrigation.collapse') : t('irrigation.details')}
                </span>
              </div>
            </div>

            {/* Expanded: edit + assignments + actions */}
            {isExpanded && (
              <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '0.5px solid var(--bdr)' }}>
                {/* Equipment edit form */}
                {editingEquipId === equip.id ? (
                  <div className="p-2 rounded space-y-1.5" style={{ background: 'var(--surface2)' }}>
                    <div className="sec-label" style={{ margin: 0 }}>{t('irrigation.editEquipment')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.nameLabel')}</label>
                        <input type="text" value={editEquipName} onChange={(e) => setEditEquipName(e.target.value)} className="agraria-input w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.serialLabel')}</label>
                        <input type="text" value={editEquipSerial} onChange={(e) => setEditEquipSerial(e.target.value)} className="agraria-input w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.areaLabel')}</label>
                        <input type="number" step="0.01" value={editEquipArea} onChange={(e) => setEditEquipArea(e.target.value)} placeholder={t('irrigation.areaPlaceholder')} className="agraria-input w-full" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.reportUrlLabel')}</label>
                      <input type="url" value={editEquipUrl} onChange={(e) => setEditEquipUrl(e.target.value)} className="agraria-input w-full text-[10px]" />
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={handleSaveEquipment} disabled={saving} className="text-[10px] px-3 py-1 rounded font-medium" style={{ background: 'var(--orange)', color: '#fff' }}>
                        {saving ? t('irrigation.saving') : t('irrigation.save')}
                      </button>
                      <button onClick={() => setEditingEquipId(null)} className="text-[10px] px-3 py-1 rounded font-medium" style={{ color: 'var(--tx3)' }}>
                        {t('irrigation.cancel')}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <div className="sec-label" style={{ margin: 0 }}>{t('irrigation.fieldAssignments')}</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditEquipment(equip); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
                    >
                      {t('irrigation.edit')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingAssignmentFor(isAddingAssignment ? null : equip.id); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
                    >
                      {isAddingAssignment ? t('irrigation.cancel') : t('irrigation.move')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(equip.id); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: '#dc262615', color: '#dc2626' }}
                    >
                      {t('irrigation.deactivate')}
                    </button>
                  </div>
                </div>

                {/* Add assignment form */}
                {isAddingAssignment && (
                  <div className="p-2 rounded space-y-1.5" style={{ background: 'var(--surface2)' }}>
                    <div>
                      <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.fieldLabel')}</label>
                      <select
                        value={assignFieldId ?? ''}
                        onChange={(e) => setAssignFieldId(e.target.value ? Number(e.target.value) : null)}
                        className="agraria-input w-full"
                      >
                        <option value="">{t('irrigation.selectField')}</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.startDateLabel')}</label>
                        <input
                          type="date"
                          value={assignStartDate}
                          onChange={(e) => setAssignStartDate(e.target.value)}
                          className="agraria-input w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.endDateLabel')}</label>
                        <input
                          type="date"
                          value={assignEndDate}
                          onChange={(e) => setAssignEndDate(e.target.value)}
                          className="agraria-input w-full"
                        />
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.endDateHint')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddAssignment(equip.id)}
                      disabled={saving || !assignFieldId || !assignStartDate}
                      className="agraria-btn-primary w-full text-xs"
                    >
                      {saving ? t('irrigation.saving') : t('irrigation.assignToField')}
                    </button>
                    <p className="text-[9px]" style={{ color: 'var(--tx3)' }}>
                      {t('irrigation.autoCloseNote')}
                    </p>
                  </div>
                )}

                {/* Assignment list */}
                {equipAssignments.length === 0 ? (
                  <p className="text-[10px] py-2" style={{ color: 'var(--tx3)' }}>
                    {t('irrigation.noAssignments')}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {equipAssignments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-1.5 rounded text-xs"
                        style={{ background: 'var(--surface2)' }}
                      >
                        {editingAssignment?.id === a.id ? (
                          /* Inline edit mode */
                          <div className="flex-1 space-y-1">
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="agraria-input text-[10px]"
                              />
                              <input
                                type="date"
                                value={editEndDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                className="agraria-input text-[10px]"
                                placeholder={t('irrigation.openEnded')}
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={handleEditAssignment}
                                disabled={saving}
                                className="text-[10px] px-2 py-0.5 rounded font-medium"
                                style={{ background: 'var(--orange)', color: '#fff' }}
                              >
                                {t('irrigation.save')}
                              </button>
                              <button
                                onClick={() => setEditingAssignment(null)}
                                className="text-[10px] px-2 py-0.5 rounded font-medium"
                                style={{ color: 'var(--tx3)' }}
                              >
                                {t('irrigation.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Display mode */
                          <>
                            <div>
                              <span className="font-medium" style={{ color: 'var(--tx)' }}>
                                {a.fieldName || `Field #${a.fieldId}`}
                              </span>
                              <span className="ml-1.5" style={{ color: 'var(--tx3)' }}>
                                {a.startDate} → {a.endDate || t('irrigation.present')}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingAssignment(a);
                                  setEditStartDate(a.startDate);
                                  setEditEndDate(a.endDate || '');
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--tx3)' }}
                                title={t('irrigation.editDates')}
                              >
                                {t('irrigation.edit')}
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(a)}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ color: '#dc2626' }}
                                title={t('irrigation.deleteAssignment')}
                              >
                                {t('irrigation.deleteAssignment')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Report URL info */}
                {equip.reportUrl && (
                  <div className="pt-2" style={{ borderTop: '0.5px solid var(--bdr)' }}>
                    <div className="text-[9px] font-medium mb-0.5" style={{ color: 'var(--tx3)' }}>{t('irrigation.agSenseUrlLabel')}</div>
                    <div className="text-[9px] break-all p-1.5 rounded" style={{ background: 'var(--bg)', color: 'var(--tx3)', fontFamily: 'monospace' }}>
                      {equip.reportUrl.substring(0, 100)}...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Info card */}
      <div className="agraria-card">
        <p className="text-[10px]" style={{ color: 'var(--tx3)' }}>
          Irrigation data is fetched daily at 8:00 AM from AgSense 365 reports. Assign equipment to fields with date ranges to track water application. The water balance chart will include irrigation: Balance = Rain + Irrigation - ETc.
        </p>
      </div>
    </div>
  );
}
