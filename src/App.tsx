import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, setAdminDefault } from './i18n';
import { Dashboard } from './components/Dashboard';
import { FieldForm, type FieldFormData } from './components/FieldForm';
import { FieldDetail } from './components/FieldDetail';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { FarmForm } from './components/FarmForm';
import { FarmSwitcher } from './components/FarmSwitcher';
import { NdviImageView } from './components/NdviImageView';
import { IrrigationPanel } from './components/IrrigationPanel';
import { ShareManager } from './components/ShareManager';
import { SeasonManager } from './components/SeasonManager';
import { FarmMapView } from './components/FarmMapView';
import { useFields } from './hooks/useFields';
import { useTheme } from './hooks/useTheme';
import { isLoggedIn, logout, getMe, getStations, getFarms, createFarm, deleteFarm, getFields as apiGetFields, updateField as apiUpdateField, type StationInfo } from './utils/api';
import type { Field, Farm, User } from './types';
// CropType now used via FieldFormData

type View = 'dashboard' | 'settings' | 'add-field' | 'edit-field' | 'field-detail' | 'admin' | 'add-farm' | 'ndvi-image' | 'irrigation' | 'share-farm' | 'edit-crop' | 'farm-map';

function App() {
  const { t, i18n } = useTranslation();
  const [authenticated, setAuthenticated] = useState(() => isLoggedIn());
  const [user, setUser] = useState<User | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [currentFarmId, setCurrentFarmId] = useState<number | null>(null);
  const { fields, loading: fieldsLoading, add, update, remove, refresh } = useFields(currentFarmId);
  const { theme, toggle: toggleTheme } = useTheme();
  const [view, setView] = useState<View>('dashboard');
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [ndviImageDate, setNdviImageDate] = useState<string | undefined>(undefined);
  const [ndviDataForImage, setNdviDataForImage] = useState<import('./types').NdviReading[]>([]);
  const [lastAswMm, setLastAswMm] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  const fetchFarms = useCallback(async () => {
    try {
      const data = await getFarms();
      setFarms(data);
      if (data.length > 0) {
        setCurrentFarmId((prev) => prev ?? data[0].id);
      }
    } catch {
      setFarms([]);
    }
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close gear dropdown on outside click
  useEffect(() => {
    if (!gearOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [gearOpen]);

  // Fetch stations, user info, and farms when authenticated
  useEffect(() => {
    if (authenticated) {
      getStations().then(setStations).catch(() => setStations([]));
      getMe().then((u) => {
        setUser(u);
        if (u.role === 'admin') setAdminDefault();
      }).catch(() => setUser(null));
      fetchFarms();
    }
  }, [authenticated, fetchFarms]);

  const handleLoggedIn = () => {
    setAuthenticated(true);
    refresh();
  };

  const handleLogout = async () => {
    await logout();
    setAuthenticated(false);
    setUser(null);
    setFarms([]);
    setCurrentFarmId(null);
    setView('dashboard');
    setSelectedFieldId(null);
  };

  // Show login if not authenticated
  if (!authenticated) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  const currentFarm = farms.find((f) => f.id === currentFarmId) ?? null;
  const canWrite = !currentFarm || currentFarm.access === 'owner' || currentFarm.access === 'admin' || !currentFarm.access;
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  const handleAddField = async (data: FieldFormData) => {
    const stationMac = currentFarm?.stationMac || stations[0]?.mac || '';
    await add({ ...data, stationMac, farmId: currentFarmId ?? undefined, polygon: data.polygon });
    // If soil params were set, update the field with them
    if (data.tawMm != null) {
      const newFields = await apiGetFields(currentFarmId ?? undefined);
      const newest = newFields[0]; // most recent
      if (newest) {
        await apiUpdateField(newest.id, {
          tawMm: data.tawMm,
          madPct: data.madPct,
          tawSource: data.tawSource,
          coneatGc: data.coneatGc,
          initialAswMm: data.initialAswMm,
        });
        await refresh();
      }
    }
    setView('dashboard');
  };

  const handleEditField = async (data: FieldFormData) => {
    if (selectedFieldId !== null) {
      await update(selectedFieldId, {
        name: data.name,
        sowingDate: data.sowingDate,
        cropType: data.cropType,
        polygon: data.polygon,
      });
      // Update soil params separately if provided
      await apiUpdateField(selectedFieldId, {
        tawMm: data.tawMm,
        madPct: data.madPct,
        tawSource: data.tawSource,
        coneatGc: data.coneatGc,
        initialAswMm: data.initialAswMm,
      });
      await refresh();
      setView('field-detail');
    }
  };

  const handleDeleteField = async (id: number) => {
    await remove(id);
    setView('dashboard');
    setSelectedFieldId(null);
  };

  const handleFieldClick = (field: Field) => {
    setSelectedFieldId(field.id);
    setView('field-detail');
  };

  const handleCreateFarm = async (data: { name: string; latitude?: number; longitude?: number }) => {
    try {
      const newFarm = await createFarm(data);
      await fetchFarms();
      setCurrentFarmId(newFarm.id);
      setView('dashboard');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create farm');
    }
  };

  const handleDeleteFarm = async () => {
    if (!currentFarm) return;
    if (!confirm(`Delete farm "${currentFarm.name}" and all its fields?`)) return;
    try {
      await deleteFarm(currentFarm.id);
      setCurrentFarmId(null);
      await fetchFarms();
      setView('dashboard');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete farm');
    }
  };

  const handleSettingsSaved = () => {
    setView('dashboard');
    refresh();
    fetchFarms();
  };

  return (
    <div className="max-w-[600px] mx-auto min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="agraria-header flex items-center justify-between sticky top-0 z-10">
        {view !== 'dashboard' && view !== 'settings' ? (
          <button
            onClick={() => {
              if (view === 'ndvi-image') setView('field-detail');
              else if (view === 'field-detail') setView('dashboard');
              else if (view === 'edit-field') setView('field-detail');
              else if (view === 'edit-crop') setView('field-detail');
              else if (view === 'admin') setView('dashboard');
              else if (view === 'add-farm') setView('dashboard');
              else if (view === 'irrigation') setView('dashboard');
              else if (view === 'share-farm') setView('dashboard');
              else if (view === 'farm-map') setView('dashboard');
              else setView('dashboard');
            }}
            className="text-white/90 hover:text-white flex items-center gap-1 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href="http://www.agraria.com.uy"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-[10px] px-2.5 py-1 flex items-center justify-center h-[42px] shrink-0 hover:opacity-90 transition-opacity"
            >
              <img src="/agraria-logo.png" alt="Agraria" className="h-[30px] w-auto max-w-[110px] object-contain" />
            </a>
            <div className="text-white">
              <h1 className="text-sm font-bold leading-tight">GDD Tracker</h1>
              {/* Farm switcher */}
              <FarmSwitcher
                farms={farms}
                currentFarmId={currentFarmId}
                onFarmChange={(id) => {
                  setCurrentFarmId(id);
                  setSelectedFieldId(null);
                  setView('dashboard');
                }}
                onAddFarm={() => setView('add-farm')}
                onViewMap={() => setView('farm-map')}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            <svg className="theme-icon theme-icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            <svg className="theme-icon theme-icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>

          {view === 'dashboard' && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((p) => !p)}
                className="text-white/80 hover:text-white p-1.5"
                title="Menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-50 min-w-[170px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--bdr2)' }}
                >
                  {currentFarm && canWrite && (
                    <button
                      onClick={() => { setMenuOpen(false); setSelectedFieldId(null); setView('add-field'); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                      style={{ color: 'var(--tx)' }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--orange)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {t('menu.addField')}
                    </button>
                  )}
                  {fields.length > 1 && (
                    <button
                      onClick={() => { setMenuOpen(false); setReordering(true); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                      style={{ color: 'var(--tx)' }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--tx3)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      {t('menu.reorderFields', { defaultValue: 'Reorder Fields' })}
                    </button>
                  )}
                  {currentFarm && canWrite && (
                    <button
                      onClick={() => { setMenuOpen(false); setView('irrigation'); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                      style={{ color: 'var(--tx)' }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#1a9988' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21c-4.418 0-8-3.134-8-7 0-4.5 8-11 8-11s8 6.5 8 11c0 3.866-3.582 7-8 7z" />
                      </svg>
                      {t('menu.irrigation')}
                    </button>
                  )}
                  {currentFarm && canWrite && (
                    <button
                      onClick={() => { setMenuOpen(false); setView('share-farm'); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                      style={{ color: 'var(--tx)' }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#6366f1' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      {t('menu.shareFarm')}
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); setView('settings'); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--tx)' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--tx3)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {t('menu.settings')}
                  </button>
                  {/* Language toggle */}
                  <button
                    onClick={() => { setMenuOpen(false); setLanguage(i18n.language === 'es' ? 'en' : 'es'); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--tx)' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--tx3)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    {i18n.language === 'es' ? 'English' : 'Español'}
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => { setMenuOpen(false); setView('admin'); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                      style={{ color: 'var(--tx)' }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--tx3)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      {t('menu.admin')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {view === 'field-detail' && selectedField && canWrite && (
            <div className="relative" ref={gearRef}>
              <button
                onClick={() => setGearOpen((p) => !p)}
                className="text-white/80 hover:text-white p-1.5"
                title={t('menu.fieldSettings')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {gearOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-50 min-w-[150px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--bdr2)' }}
                >
                  <button
                    onClick={() => { setGearOpen(false); setView('edit-field'); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--tx)' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {t('menu.editField')}
                  </button>
                  <button
                    onClick={() => { setGearOpen(false); setView('edit-crop'); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--tx)' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                    {t('menu.editCrop')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Logout */}
          {(view === 'settings' || view === 'admin') && (
            <button
              onClick={handleLogout}
              className="text-white/80 hover:text-white p-1.5 text-xs"
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="p-[14px]">
        {view === 'irrigation' && currentFarm && (
          <IrrigationPanel farm={currentFarm} fields={fields} />
        )}
        {view === 'share-farm' && currentFarm && (
          <ShareManager entityType="farm" entityId={currentFarm.id} entityName={currentFarm.name} />
        )}
        {view === 'farm-map' && (
          <FarmMapView
            farms={farms}
            stations={stations}
            currentFarmId={currentFarmId}
            onSelectFarm={(id) => {
              setCurrentFarmId(id);
              setSelectedFieldId(null);
              setView('dashboard');
            }}
            onBack={() => setView('dashboard')}
          />
        )}
        {view === 'admin' && <AdminPanel />}
        {view === 'add-farm' && (
          <FarmForm onSubmit={handleCreateFarm} onCancel={() => setView('dashboard')} />
        )}
        {view === 'settings' && (
          <Settings
            onSaved={handleSettingsSaved}
            stations={stations}
            onLogout={handleLogout}
            currentFarm={currentFarm}
            onDeleteFarm={handleDeleteFarm}
          />
        )}
        {view === 'dashboard' && (
          farms.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🌾</div>
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--tx)' }}>
                Welcome! Create your first farm
              </h2>
              <p className="text-xs mb-6" style={{ color: 'var(--tx3)' }}>
                A farm groups your fields under a weather station. Place a pin on the map to auto-assign the nearest station.
              </p>
              <button onClick={() => setView('add-farm')} className="agraria-btn-primary">
                + Create Your First Farm
              </button>
            </div>
          ) : fieldsLoading ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">🌽</div>
              <p className="text-xs" style={{ color: 'var(--tx3)' }}>Loading fields...</p>
            </div>
          ) : (
            <Dashboard
              fields={fields}
              onFieldClick={handleFieldClick}
              onAddField={() => {
                setSelectedFieldId(null);
                setView('add-field');
              }}
              stationMac={currentFarm?.stationMac}
              stationName={currentFarm?.stationName}
              stationDistanceKm={currentFarm?.stationDistanceKm}
              canWrite={canWrite}
              farmId={currentFarmId ?? undefined}
              reordering={reordering}
              onReorderDone={() => setReordering(false)}
            />
          )
        )}
        {view === 'add-field' && (
          <FieldForm
            onSubmit={handleAddField}
            onCancel={() => setView('dashboard')}
            farmLat={currentFarm?.latitude}
            farmLng={currentFarm?.longitude}
          />
        )}
        {view === 'edit-field' && selectedField && (
          <FieldForm
            field={selectedField}
            onSubmit={handleEditField}
            onCancel={() => setView('field-detail')}
            onDelete={() => handleDeleteField(selectedField.id)}
            farmLat={currentFarm?.latitude}
            farmLng={currentFarm?.longitude}
          />
        )}
        {view === 'edit-crop' && selectedField && (
          <SeasonManager
            fieldId={selectedField.id}
            fieldName={selectedField.name}
            lastAswMm={lastAswMm}
            onBack={() => { refresh(); setView('field-detail'); }}
          />
        )}
        {view === 'field-detail' && selectedField && (
          <FieldDetail
            field={selectedField}
            farmLatitude={currentFarm?.latitude ?? null}
            onNdviDateClick={(date, ndviData) => {
              setNdviImageDate(date);
              setNdviDataForImage(ndviData);
              setView('ndvi-image');
            }}
            onAswUpdate={setLastAswMm}
          />
        )}
        {view === 'ndvi-image' && selectedField && ndviDataForImage.length > 0 && (
          <NdviImageView
            fieldId={selectedField.id}
            fieldName={selectedField.name}
            ndviData={ndviDataForImage}
            initialDate={ndviImageDate}
            onBack={() => setView('field-detail')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
