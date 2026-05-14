import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { FieldForm } from './components/FieldForm';
import { FieldDetail } from './components/FieldDetail';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { FarmForm } from './components/FarmForm';
import { FarmSwitcher } from './components/FarmSwitcher';
import { NdviImageView } from './components/NdviImageView';
import { useFields } from './hooks/useFields';
import { useTheme } from './hooks/useTheme';
import { isLoggedIn, logout, getMe, getStations, getFarms, createFarm, deleteFarm, type StationInfo } from './utils/api';
import type { Field, Farm, User, FieldPolygon } from './types';
import type { CropType } from './utils/cropConfig';

type View = 'dashboard' | 'settings' | 'add-field' | 'edit-field' | 'field-detail' | 'admin' | 'add-farm' | 'ndvi-image';

function App() {
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

  const fetchFarms = useCallback(async () => {
    try {
      const data = await getFarms();
      setFarms(data);
      if (data.length > 0 && !currentFarmId) {
        setCurrentFarmId(data[0].id);
      }
    } catch {
      setFarms([]);
    }
  }, [currentFarmId]);

  // Fetch stations, user info, and farms when authenticated
  useEffect(() => {
    if (authenticated) {
      getStations().then(setStations).catch(() => setStations([]));
      getMe().then(setUser).catch(() => setUser(null));
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
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  const handleAddField = async (data: { name: string; sowingDate: string; cropType: CropType; polygon?: FieldPolygon | null }) => {
    const stationMac = currentFarm?.stationMac || stations[0]?.mac || '';
    await add({ ...data, stationMac, farmId: currentFarmId ?? undefined, polygon: data.polygon });
    setView('dashboard');
  };

  const handleEditField = async (data: { name: string; sowingDate: string; cropType: CropType; polygon?: FieldPolygon | null }) => {
    if (selectedFieldId !== null) {
      await update(selectedFieldId, data);
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
              else if (view === 'admin') setView('dashboard');
              else if (view === 'add-farm') setView('dashboard');
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
            <>
              {user?.role === 'admin' && (
                <button
                  onClick={() => setView('admin')}
                  className="text-white/80 hover:text-white p-1.5"
                  title="Admin Panel"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setView('settings')}
                className="text-white/80 hover:text-white p-1.5"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {currentFarm && (
                <button
                  onClick={() => {
                    setSelectedFieldId(null);
                    setView('add-field');
                  }}
                  className="agraria-btn-orange text-xs"
                  title="Add Field"
                >
                  + Add Field
                </button>
              )}
            </>
          )}
          {view === 'field-detail' && selectedField && (
            <>
              <button
                onClick={() => setView('edit-field')}
                className="text-white/80 hover:text-white p-1.5"
                title="Edit Field"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${selectedField.name}"?`)) {
                    handleDeleteField(selectedField.id);
                  }
                }}
                className="text-white/80 hover:text-white p-1.5"
                title="Delete Field"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
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
            farmLat={currentFarm?.latitude}
            farmLng={currentFarm?.longitude}
          />
        )}
        {view === 'field-detail' && selectedField && (
          <FieldDetail
            field={selectedField}
            onNdviDateClick={(date, ndviData) => {
              setNdviImageDate(date);
              setNdviDataForImage(ndviData);
              setView('ndvi-image');
            }}
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
