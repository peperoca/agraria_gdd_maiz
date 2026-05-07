import { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, exportData, importData, downloadJson } from '../utils/storage';
import type { AppSettings, DeviceInfo } from '../types';

interface SettingsProps {
  onSaved: () => void;
  needsSetup: boolean;
}

export function Settings({ onSaved, needsSetup }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDevices = async () => {
    if (!settings.apiKey || !settings.applicationKey) return;

    setLoadingDevices(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        apiKey: settings.apiKey,
        applicationKey: settings.applicationKey,
      });
      const response = await fetch(`/api/devices?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status}`);
      }
      const data = await response.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (settings.apiKey && settings.applicationKey) {
      fetchDevices();
    }
  }, []);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  const handleExport = () => {
    const json = exportData();
    const date = new Date().toISOString().split('T')[0];
    downloadJson(`corn-gdd-export-${date}.json`, json);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = importData(content);
      setImportMsg(result.message);
      if (result.success) {
        setSettings(getSettings());
      }
      setTimeout(() => setImportMsg(null), 5000);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="p-4 space-y-6">
      {needsSetup && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-semibold text-amber-800 mb-1">Welcome! Let's get started</h3>
          <p className="text-sm text-amber-700">
            Enter your Ambient Weather API credentials and select your weather station to begin tracking GDD.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-corn-800">Weather Station</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            placeholder="Your Ambient Weather API key"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corn-500 focus:border-corn-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Application Key</label>
          <input
            type="password"
            value={settings.applicationKey}
            onChange={(e) => setSettings({ ...settings, applicationKey: e.target.value })}
            placeholder="Your Ambient Weather application key"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corn-500 focus:border-corn-500 text-sm"
          />
        </div>

        <button
          onClick={fetchDevices}
          disabled={!settings.apiKey || !settings.applicationKey || loadingDevices}
          className="w-full bg-corn-600 text-white py-2 px-4 rounded-lg hover:bg-corn-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loadingDevices ? 'Loading stations...' : 'Detect Stations'}
        </button>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
        )}

        {devices.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weather Station</label>
            <select
              value={settings.stationMac}
              onChange={(e) => {
                const device = devices.find((d) => d.macAddress === e.target.value);
                setSettings({
                  ...settings,
                  stationMac: e.target.value,
                  stationName: device?.info?.name ?? e.target.value,
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corn-500 focus:border-corn-500 text-sm"
            >
              <option value="">Select a station...</option>
              {devices.map((d) => (
                <option key={d.macAddress} value={d.macAddress}>
                  {d.info?.name || d.macAddress}
                  {d.info?.location ? ` - ${d.info.location}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!settings.apiKey || !settings.applicationKey || !settings.stationMac}
          className="w-full bg-corn-700 text-white py-3 px-4 rounded-lg hover:bg-corn-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-corn-800">Data Management</h2>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 bg-earth-100 text-earth-800 py-2 px-4 rounded-lg hover:bg-earth-200 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-earth-100 text-earth-800 py-2 px-4 rounded-lg hover:bg-earth-200 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {importMsg && (
          <p className="text-sm text-corn-700 bg-corn-50 p-2 rounded-lg">{importMsg}</p>
        )}

        <p className="text-xs text-gray-500">
          Export saves your fields and cached weather data. API keys are not included for security.
        </p>
      </div>
    </div>
  );
}
