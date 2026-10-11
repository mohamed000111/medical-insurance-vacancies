import React, { useState, useEffect } from 'react';
import { X, Settings, Bookmark, Link, Key, Save, Check } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [form, setForm] = useState({
    channel_username: 'medical_Insurance_1',
    webhook_url: '',
    webhook_secret: '',
    auto_sync_supabase: true,
    last_message_id: 0
  });

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setForm(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading settings:", err);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          last_message_id: parseInt(form.last_message_id, 10) || 0
        })
      });
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        if (onSettingsSaved) onSettingsSaved();
      }
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card settings-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-row items-center gap-2">
            <Settings size={20} className="text-accent" />
            <h3>Settings & Configuration</h3>
          </div>
          <button className="btn-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          {loading ? (
            <div className="text-center py-6 text-muted">Loading configuration...</div>
          ) : (
            <div className="settings-fields">
              {/* Telegram Channel */}
              <div className="form-group">
                <label className="form-label">
                  <span>Telegram Target Channel</span>
                </label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">@</span>
                  <input
                    type="text"
                    className="form-input"
                    value={form.channel_username}
                    onChange={(e) => setForm({ ...form, channel_username: e.target.value.replace(/^@/, '') })}
                  />
                </div>
                <span className="form-hint">Public channel username or private channel ID</span>
              </div>

              {/* Watermark (Last Message No.) */}
              <div className="form-group highlight-group">
                <label className="form-label">
                  <Bookmark size={15} />
                  <span>Stored Watermark (Last Message No.)</span>
                </label>
                <input
                  type="number"
                  className="form-input watermark-input"
                  value={form.last_message_id}
                  onChange={(e) => setForm({ ...form, last_message_id: e.target.value })}
                />
                <span className="form-hint">
                  Offline mode will resume classifying messages starting strictly after this ID.
                </span>
              </div>

              {/* Webhook URL */}
              <div className="form-group">
                <label className="form-label">
                  <Link size={15} />
                  <span>Supabase AI Classifier Webhook URL</span>
                </label>
                <input
                  type="text"
                  className="form-input font-mono text-xs"
                  value={form.webhook_url}
                  onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                />
              </div>

              {/* Webhook Secret */}
              <div className="form-group">
                <label className="form-label">
                  <Key size={15} />
                  <span>Telegram Webhook Secret Token</span>
                </label>
                <input
                  type="password"
                  className="form-input font-mono text-xs"
                  value={form.webhook_secret}
                  onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                />
              </div>

              {/* Auto sync */}
              <div className="checkbox-wrap mt-2">
                <input
                  type="checkbox"
                  id="autoSyncCheck"
                  checked={form.auto_sync_supabase}
                  onChange={(e) => setForm({ ...form, auto_sync_supabase: e.target.checked })}
                />
                <label htmlFor="autoSyncCheck">
                  Automatically sync verified vacancies to Supabase cloud database
                </label>
              </div>
            </div>
          )}

          <div className="modal-footer mt-4">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {savedSuccess ? <Check size={16} /> : <Save size={16} />}
              <span>{savedSuccess ? 'Saved Successfully!' : (saving ? 'Saving...' : 'Save Settings')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
