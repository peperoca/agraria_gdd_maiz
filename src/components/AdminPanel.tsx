import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUser, AdminStation } from '../types';
import {
  getAdminUsers, updateUserRole,
  getAdminStations, createStation, updateStation, deactivateStation,
} from '../utils/api';

type Tab = 'users' | 'stations';

export function AdminPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['users', 'stations'] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className="px-3 py-1.5 text-xs font-medium rounded-[var(--r)] transition-colors"
            style={{
              background: tab === tb ? 'var(--blue)' : 'var(--surface2)',
              color: tab === tb ? '#fff' : 'var(--tx2)',
            }}
          >
            {tb === 'users' ? t('admin.usersTab') : t('admin.stationsTab')}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'stations' && <StationsTab />}
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getAdminUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (userId: number, newRole: 'user' | 'admin') => {
    try {
      await updateUserRole(userId, newRole);
      await fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;

  return (
    <div className="agraria-card">
      <div className="sec-label">{t('admin.usersCount', { count: users.length })}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
              <th className="text-left py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('admin.userCol')}</th>
              <th className="text-left py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('admin.emailCol')}</th>
              <th className="text-center py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('admin.fieldsCol')}</th>
              <th className="text-center py-1.5 px-2 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('admin.roleCol')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '0.5px solid var(--bdr)' }}>
                <td className="py-1.5 px-2 font-medium" style={{ color: 'var(--tx)' }}>{u.username}</td>
                <td className="py-1.5 px-2" style={{ color: 'var(--tx2)' }}>{u.email}</td>
                <td className="py-1.5 px-2 text-center" style={{ color: 'var(--tx2)' }}>{u.fieldCount}</td>
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as 'user' | 'admin')}
                    className="text-[11px] px-1.5 py-0.5 rounded border"
                    style={{
                      background: 'var(--surface)',
                      color: u.role === 'admin' ? 'var(--blue)' : 'var(--tx2)',
                      borderColor: 'var(--bdr2)',
                    }}
                  >
                    <option value="user">{t('admin.roleUser')}</option>
                    <option value="admin">{t('admin.roleAdmin')}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StationsTab() {
  const { t } = useTranslation();
  const [stations, setStations] = useState<AdminStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchStations = async () => {
    try {
      setLoading(true);
      const data = await getAdminStations();
      setStations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStations(); }, []);

  const handleToggleActive = async (station: AdminStation) => {
    try {
      if (station.isActive) {
        await deactivateStation(station.id);
      } else {
        await updateStation(station.id, { isActive: true });
      }
      await fetchStations();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update station');
    }
  };

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;

  return (
    <div className="space-y-3">
      <div className="agraria-card">
        <div className="flex items-center justify-between mb-2">
          <div className="sec-label mb-0">{t('admin.stationsCount', { count: stations.length })}</div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="agraria-btn-orange text-[11px]"
          >
            {showForm ? t('admin.cancel') : t('admin.addStation')}
          </button>
        </div>

        {showForm && (
          <StationForm
            onSaved={() => { setShowForm(false); fetchStations(); }}
            onCancel={() => setShowForm(false)}
          />
        )}

        <div className="space-y-2 mt-2">
          {stations.map((s) => (
            <div
              key={s.id}
              className="p-2.5 rounded-[var(--r)] border"
              style={{
                borderColor: 'var(--bdr)',
                background: s.isActive ? 'var(--surface)' : 'var(--surface2)',
                opacity: s.isActive ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--tx)' }}>{s.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                    {s.mac} &middot; {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)} &middot; {s.elevationM}m
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(s)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{
                    borderColor: 'var(--bdr2)',
                    color: s.isActive ? 'var(--dt)' : 'var(--st)',
                    background: s.isActive ? 'var(--db)' : 'var(--sb)',
                  }}
                >
                  {s.isActive ? t('admin.deactivate') : t('admin.activate')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StationForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    mac: '', name: '', apiKey: '', applicationKey: '',
    latitude: '-34.5', longitude: '-56.0', elevationM: '50',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createStation({
        mac: form.mac,
        name: form.name,
        apiKey: form.apiKey,
        applicationKey: form.applicationKey,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        elevationM: parseInt(form.elevationM, 10),
      });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create station');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: 'var(--surface)',
    color: 'var(--tx)',
    borderColor: 'var(--bdr2)',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-2.5 rounded-[var(--r)] mb-2" style={{ background: 'var(--surface2)' }}>
      <input
        type="text" placeholder={t('admin.macPlaceholder')} required
        value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })}
        className="w-full text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
      />
      <input
        type="text" placeholder={t('admin.stationNamePlaceholder')} required
        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
      />
      <input
        type="text" placeholder={t('admin.apiKeyPlaceholder')} required
        value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
        className="w-full text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
      />
      <input
        type="text" placeholder={t('admin.appKeyPlaceholder')} required
        value={form.applicationKey} onChange={(e) => setForm({ ...form, applicationKey: e.target.value })}
        className="w-full text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number" step="any" placeholder={t('admin.latPlaceholder')} required
          value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })}
          className="text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
        />
        <input
          type="number" step="any" placeholder={t('admin.lonPlaceholder')} required
          value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })}
          className="text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
        />
        <input
          type="number" placeholder={t('admin.elevPlaceholder')} required
          value={form.elevationM} onChange={(e) => setForm({ ...form, elevationM: e.target.value })}
          className="text-xs px-2.5 py-1.5 rounded border" style={inputStyle}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="agraria-btn-orange text-[11px]">
          {saving ? t('admin.saving') : t('admin.createStation')}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] px-3 py-1" style={{ color: 'var(--tx3)' }}>
          {t('admin.cancel')}
        </button>
      </div>
    </form>
  );
}

// ── Shared UI Components ──

function LoadingCard() {
  return (
    <div className="agraria-card">
      <div className="space-y-2">
        <div className="h-4 rounded w-1/3" style={{ background: 'var(--surface2)' }} />
        <div className="h-3 rounded w-full" style={{ background: 'var(--surface2)' }} />
        <div className="h-3 rounded w-2/3" style={{ background: 'var(--surface2)' }} />
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="agraria-card">
      <p className="text-xs" style={{ color: 'var(--dt)' }}>{message}</p>
    </div>
  );
}
