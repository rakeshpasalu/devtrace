import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Save, RotateCcw, CheckCircle2 } from "lucide-react";

const DEFAULTS = {
  collectorUrl: "http://127.0.0.1:9000",
  apiKey: "",
  wsAutoReconnect: true,
  slowThresholdMs: 150,
  maxRetainedEvents: 20000,
  pollingIntervalMs: 3000,
  theme: "dark",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("devtrace-settings");
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(settings) {
  localStorage.setItem("devtrace-settings", JSON.stringify(settings));
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);

  // Apply theme to DOM immediately on change
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  function update(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    setSettings({ ...DEFAULTS });
    setSaved(false);
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleReset}>
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? <><CheckCircle2 size={14} /> Saved</> : <><Save size={14} /> Save Settings</>}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Connection */}
        <div className="card settings-section">
          <div className="card-header">
            <span className="card-title">Connection</span>
          </div>

          <SettingsField label="Collector URL" description="The base URL of the DevTrace collector backend">
            <input className="settings-input" type="text" value={settings.collectorUrl}
              onChange={e => update("collectorUrl", e.target.value)}
              placeholder="http://127.0.0.1:9000" />
          </SettingsField>

          <SettingsField label="API Key" description="Shared secret for authenticating with the collector. Leave empty for open local-dev mode.">
            <input className="settings-input" type="password" value={settings.apiKey}
              onChange={e => update("apiKey", e.target.value)}
              placeholder="Enter API key…"
              autoComplete="off" />
          </SettingsField>

          <SettingsField label="Polling Interval" description="How often to refresh snapshot data (ms)">
            <input className="settings-input" type="number" value={settings.pollingIntervalMs}
              onChange={e => update("pollingIntervalMs", Number(e.target.value))}
              min={500} max={30000} step={500} />
          </SettingsField>

          <SettingsField label="WebSocket Auto-Reconnect" description="Automatically reconnect when the WebSocket connection drops">
            <label className="settings-toggle">
              <input type="checkbox" checked={settings.wsAutoReconnect}
                onChange={e => update("wsAutoReconnect", e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
              {settings.wsAutoReconnect ? "Enabled" : "Disabled"}
            </label>
          </SettingsField>
        </div>

        {/* Performance */}
        <div className="card settings-section">
          <div className="card-header">
            <span className="card-title">Performance Thresholds</span>
          </div>

          <SettingsField label="Slow Span Threshold" description="Spans exceeding this duration (ms) are flagged as slow">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input className="settings-input" type="range" min={50} max={2000} step={50}
                value={settings.slowThresholdMs}
                onChange={e => update("slowThresholdMs", Number(e.target.value))}
                style={{ flex: 1 }} />
              <span className="settings-range-value">{settings.slowThresholdMs}ms</span>
            </div>
          </SettingsField>

          <SettingsField label="Max Retained Events" description="Maximum number of events to keep in memory on the collector">
            <select className="settings-input" value={settings.maxRetainedEvents}
              onChange={e => update("maxRetainedEvents", Number(e.target.value))}>
              <option value={5000}>5,000 (lightweight)</option>
              <option value={20000}>20,000 (default)</option>
              <option value={50000}>50,000 (heavy)</option>
              <option value={100000}>100,000 (maximum)</option>
            </select>
          </SettingsField>
        </div>

        {/* Appearance */}
        <div className="card settings-section">
          <div className="card-header">
            <span className="card-title">Appearance</span>
          </div>

          <SettingsField label="Theme" description="Application color theme">
            <div className="theme-options">
              {["dark", "light", "system"].map(t => (
                <button key={t} className={`theme-option ${settings.theme === t ? "active" : ""}`}
                  onClick={() => update("theme", t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </SettingsField>
        </div>

        {/* About */}
        <div className="card settings-section">
          <div className="card-header">
            <span className="card-title">About</span>
          </div>
          <div className="settings-about">
            <div className="settings-about-row"><span>Version</span><strong>1.0.0-SNAPSHOT</strong></div>
            <div className="settings-about-row"><span>License</span><strong>Proprietary</strong></div>
            <div className="settings-about-row"><span>Runtime</span><strong>React + Vite</strong></div>
            <div className="settings-about-row"><span>Collector</span><strong>Node.js + Express</strong></div>
          </div>
        </div>
      </div>
    </>
  );
}

function SettingsField({ label, description, children }) {
  return (
    <div className="settings-field">
      <div className="settings-field-info">
        <div className="settings-field-label">{label}</div>
        <div className="settings-field-desc">{description}</div>
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  );
}
