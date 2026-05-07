import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { FieldForm } from './components/FieldForm';
import { FieldDetail } from './components/FieldDetail';
import { Settings } from './components/Settings';
import { useFields } from './hooks/useFields';
import { getSettings } from './utils/storage';
import type { Field } from './types';

type View = 'dashboard' | 'settings' | 'add-field' | 'edit-field' | 'field-detail';

function App() {
  const { fields, add, update, remove, refresh } = useFields();
  const [view, setView] = useState<View>('dashboard');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const settings = getSettings();
    if (!settings.apiKey || !settings.applicationKey || !settings.stationMac) {
      setNeedsSetup(true);
      setView('settings');
    }
  }, []);

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  const handleAddField = (data: { name: string; sowingDate: string }) => {
    const settings = getSettings();
    add({ ...data, stationMac: settings.stationMac });
    setView('dashboard');
  };

  const handleEditField = (data: { name: string; sowingDate: string }) => {
    if (selectedFieldId) {
      update(selectedFieldId, data);
      setView('field-detail');
    }
  };

  const handleDeleteField = (id: string) => {
    remove(id);
    setView('dashboard');
    setSelectedFieldId(null);
  };

  const handleFieldClick = (field: Field) => {
    setSelectedFieldId(field.id);
    setView('field-detail');
  };

  const handleSettingsSaved = () => {
    setNeedsSetup(false);
    setView('dashboard');
    refresh();
  };

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-corn-50">
      {/* Header */}
      <header className="bg-corn-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-md">
        {view !== 'dashboard' && view !== 'settings' ? (
          <button
            onClick={() => {
              if (view === 'field-detail') setView('dashboard');
              else if (view === 'edit-field') setView('field-detail');
              else setView('dashboard');
            }}
            className="text-white/90 hover:text-white flex items-center gap-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌽</span>
            <h1 className="text-lg font-semibold">Corn GDD Tracker</h1>
          </div>
        )}
        <div className="flex items-center gap-2">
          {view === 'dashboard' && (
            <>
              <button
                onClick={() => setView('settings')}
                className="p-2 rounded-lg hover:bg-corn-600 transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setSelectedFieldId(null);
                  setView('add-field');
                }}
                className="p-2 rounded-lg hover:bg-corn-600 transition-colors"
                title="Add Field"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </>
          )}
          {view === 'field-detail' && selectedField && (
            <>
              <button
                onClick={() => setView('edit-field')}
                className="p-2 rounded-lg hover:bg-corn-600 transition-colors"
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
                className="p-2 rounded-lg hover:bg-red-600 transition-colors"
                title="Delete Field"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="pb-8">
        {view === 'settings' && (
          <Settings
            onSaved={handleSettingsSaved}
            needsSetup={needsSetup}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard
            fields={fields}
            onFieldClick={handleFieldClick}
            onAddField={() => {
              setSelectedFieldId(null);
              setView('add-field');
            }}
          />
        )}
        {view === 'add-field' && (
          <FieldForm
            onSubmit={handleAddField}
            onCancel={() => setView('dashboard')}
          />
        )}
        {view === 'edit-field' && selectedField && (
          <FieldForm
            field={selectedField}
            onSubmit={handleEditField}
            onCancel={() => setView('field-detail')}
          />
        )}
        {view === 'field-detail' && selectedField && (
          <FieldDetail field={selectedField} />
        )}
      </main>
    </div>
  );
}

export default App;
