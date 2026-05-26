import { useState, useEffect, useCallback } from 'react';
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

const EQUIP_TYPES = [
  { value: 'pivot', label: 'Pivot' },
  { value: 'drip', label: 'Drip' },
  { value: 'sprinkler', label: 'Sprinkler' },
  { value: 'flood', label: 'Flood' },
  { value: 'other', label: 'Other' },
];

export function IrrigationPanel({ farm, fields }: IrrigationPanelProps) {
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
    if (!confirm('Deactivate this equipment?')) return;
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
    if (!confirm('Delete this assignment?')) return;
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
        <p className="text-xs" style={{ color: 'var(--tx3)' }}>Loading irrigation equipment...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="agraria-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--tx)' }}>Irrigation</h2>
            <p className="text-xs" style={{ color: 'var(--tx3)' }}>
              {farm.name} &middot; {equipment.length} equipment
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="agraria-btn-orange text-xs"
          >
            {showAddForm ? 'Cancel' : '+ Add Equipment'}
          </button>
        </div>

        {/* Add equipment form */}
        {showAddForm && (
          <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '0.5px solid var(--bdr)' }}>
            <div>
              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pivot North"
                className="agraria-input w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Serial Number</label>
                <input
                  type="text"
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  placeholder="AgSense serial"
                  className="agraria-input w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Area (ha) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="e.g. 65.5"
                  className="agraria-input w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="agraria-input w-full"
                >
                  {EQUIP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>
                AgSense Report URL
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Paste full AgSense report URL..."
                className="agraria-input w-full text-[10px]"
              />
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                Open the &quot;Applied by Day&quot; report in AgSense 365 and copy the URL. The system reads Total Cubic Meters Pumped and divides by the irrigated area to compute average mm/day.
              </p>
            </div>
            <button
              onClick={handleAddEquipment}
              disabled={saving || !newName.trim()}
              className="agraria-btn-primary w-full text-xs mt-1"
            >
              {saving ? 'Saving...' : 'Add Equipment'}
            </button>
          </div>
        )}
      </div>

      {/* Equipment list */}
      {equipment.length === 0 && !showAddForm && (
        <div className="agraria-card text-center py-6">
          <div className="text-3xl mb-2">💧</div>
          <p className="text-xs" style={{ color: 'var(--tx3)' }}>
            No irrigation equipment yet. Add your first pivot or sprinkler.
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
                    Auto-fetch
                  </span>
                )}
                {equip.reportUrl && !equip.areaHa && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#dc262620', color: '#dc2626' }}>
                    Set area
                  </span>
                )}
                <span className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface2)', color: 'var(--tx3)' }}>
                  {isExpanded ? 'Collapse' : 'Details'}
                </span>
              </div>
            </div>

            {/* Expanded: edit + assignments + actions */}
            {isExpanded && (
              <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '0.5px solid var(--bdr)' }}>
                {/* Equipment edit form */}
                {editingEquipId === equip.id ? (
                  <div className="p-2 rounded space-y-1.5" style={{ background: 'var(--surface2)' }}>
                    <div className="sec-label" style={{ margin: 0 }}>Edit Equipment</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Name</label>
                        <input type="text" value={editEquipName} onChange={(e) => setEditEquipName(e.target.value)} className="agraria-input w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Serial</label>
                        <input type="text" value={editEquipSerial} onChange={(e) => setEditEquipSerial(e.target.value)} className="agraria-input w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Area (ha)</label>
                        <input type="number" step="0.01" value={editEquipArea} onChange={(e) => setEditEquipArea(e.target.value)} placeholder="e.g. 65.5" className="agraria-input w-full" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Report URL</label>
                      <input type="url" value={editEquipUrl} onChange={(e) => setEditEquipUrl(e.target.value)} className="agraria-input w-full text-[10px]" />
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={handleSaveEquipment} disabled={saving} className="text-[10px] px-3 py-1 rounded font-medium" style={{ background: 'var(--orange)', color: '#fff' }}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingEquipId(null)} className="text-[10px] px-3 py-1 rounded font-medium" style={{ color: 'var(--tx3)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <div className="sec-label" style={{ margin: 0 }}>Field Assignments</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditEquipment(equip); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingAssignmentFor(isAddingAssignment ? null : equip.id); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
                    >
                      {isAddingAssignment ? 'Cancel' : '+ Move'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(equip.id); }}
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ background: '#dc262615', color: '#dc2626' }}
                    >
                      Deactivate
                    </button>
                  </div>
                </div>

                {/* Add assignment form */}
                {isAddingAssignment && (
                  <div className="p-2 rounded space-y-1.5" style={{ background: 'var(--surface2)' }}>
                    <div>
                      <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Field *</label>
                      <select
                        value={assignFieldId ?? ''}
                        onChange={(e) => setAssignFieldId(e.target.value ? Number(e.target.value) : null)}
                        className="agraria-input w-full"
                      >
                        <option value="">Select field...</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>Start Date *</label>
                        <input
                          type="date"
                          value={assignStartDate}
                          onChange={(e) => setAssignStartDate(e.target.value)}
                          className="agraria-input w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-0.5" style={{ color: 'var(--tx3)' }}>End Date</label>
                        <input
                          type="date"
                          value={assignEndDate}
                          onChange={(e) => setAssignEndDate(e.target.value)}
                          className="agraria-input w-full"
                        />
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--tx3)' }}>Leave blank = still at field</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddAssignment(equip.id)}
                      disabled={saving || !assignFieldId || !assignStartDate}
                      className="agraria-btn-primary w-full text-xs"
                    >
                      {saving ? 'Saving...' : 'Assign to Field'}
                    </button>
                    <p className="text-[9px]" style={{ color: 'var(--tx3)' }}>
                      Previous open assignment will be auto-closed the day before this start date.
                    </p>
                  </div>
                )}

                {/* Assignment list */}
                {equipAssignments.length === 0 ? (
                  <p className="text-[10px] py-2" style={{ color: 'var(--tx3)' }}>
                    No assignments yet. Use &quot;+ Move&quot; to assign this equipment to a field.
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
                                placeholder="Open-ended"
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={handleEditAssignment}
                                disabled={saving}
                                className="text-[10px] px-2 py-0.5 rounded font-medium"
                                style={{ background: 'var(--orange)', color: '#fff' }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingAssignment(null)}
                                className="text-[10px] px-2 py-0.5 rounded font-medium"
                                style={{ color: 'var(--tx3)' }}
                              >
                                Cancel
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
                                {a.startDate} → {a.endDate || 'present'}
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
                                title="Edit dates"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(a)}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ color: '#dc2626' }}
                                title="Delete assignment"
                              >
                                Del
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
                    <div className="text-[9px] font-medium mb-0.5" style={{ color: 'var(--tx3)' }}>AgSense Report URL</div>
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
