import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Bookmark, 
  Sliders, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  FastForward, 
  Layers, 
  Clock 
} from 'lucide-react';

export default function OfflineModePanel({ 
  status, 
  onStartOffline, 
  onStopOffline, 
  progress, 
  onUpdateWatermark 
}) {
  const isRunning = status?.offline_active;
  const currentWatermark = status?.last_message_id || 0;

  const [fromMsgId, setFromMsgId] = useState('');
  const [useCustomStart, setUseCustomStart] = useState(false);
  const [batchLimit, setBatchLimit] = useState(50);

  const startIdToUse = useCustomStart && fromMsgId ? parseInt(fromMsgId, 10) : currentWatermark;

  const handleStart = () => {
    onStartOffline({
      from_message_id: startIdToUse,
      limit: batchLimit > 0 ? batchLimit : undefined
    });
  };

  const processed = progress?.processed || 0;
  const total = progress?.total || 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const vacancies = progress?.vacancies || 0;
  const noise = progress?.noise || 0;

  return (
    <div className="mode-panel glass">
      <div className="panel-header">
        <div className="panel-title-wrap">
          <div className={`mode-indicator-badge offline-badge ${isRunning ? 'active' : 'inactive'}`}>
            <FastForward size={20} className={isRunning ? 'spin-slow' : ''} />
          </div>
          <div>
            <h2>Offline Mode: Catch-Up Classifier</h2>
            <p className="panel-desc">
              Picks up from the stored last message number (watermark), fetches unprocessed posts from Telegram, runs the AI classifier, and saves results to local database & Supabase.
            </p>
          </div>
        </div>

        <div className="panel-actions">
          {isRunning ? (
            <button className="btn-power btn-stop" onClick={onStopOffline}>
              <Square size={16} />
              <span>Stop Catch-Up</span>
            </button>
          ) : (
            <button className="btn-power btn-start-offline" onClick={handleStart}>
              <Play size={16} />
              <span>Start Classifier from #{startIdToUse}</span>
            </button>
          )}
        </div>
      </div>

      {/* Watermark Configuration Box */}
      <div className="offline-config-card glass">
        <div className="config-grid">
          {/* Starting Watermark */}
          <div className="config-col">
            <label className="config-label">
              <Bookmark size={15} />
              <span>Starting Message Watermark</span>
            </label>
            <div className="watermark-input-wrap">
              <div className="stored-watermark-pill">
                <span className="pill-prefix">Stored Cursor:</span>
                <strong>#{currentWatermark}</strong>
              </div>

              <div className="checkbox-wrap">
                <input 
                  type="checkbox" 
                  id="customStartCheck"
                  checked={useCustomStart}
                  onChange={(e) => setUseCustomStart(e.target.checked)}
                />
                <label htmlFor="customStartCheck">Override Starting Message #</label>
              </div>

              {useCustomStart && (
                <input 
                  type="number"
                  className="input-watermark"
                  placeholder={`e.g. ${currentWatermark}`}
                  value={fromMsgId}
                  onChange={(e) => setFromMsgId(e.target.value)}
                  disabled={isRunning}
                />
              )}
            </div>
          </div>

          {/* Batch Limit */}
          <div className="config-col">
            <label className="config-label">
              <Sliders size={15} />
              <span>Batch Size Limit</span>
            </label>
            <div className="batch-chips">
              {[25, 50, 100, 250, 0].map((limit) => (
                <button
                  key={limit}
                  className={`chip-btn ${batchLimit === limit ? 'active' : ''}`}
                  onClick={() => setBatchLimit(limit)}
                  disabled={isRunning}
                >
                  {limit === 0 ? 'All Posts' : `${limit} Posts`}
                </button>
              ))}
            </div>
            <span className="config-hint">
              {batchLimit === 0 ? 'Will process all available posts since watermark' : `Fetches up to ${batchLimit} newest posts`}
            </span>
          </div>
        </div>
      </div>

      {/* Progress & Live Catch-Up Status */}
      {isRunning && (
        <div className="offline-running-box glass">
          <div className="running-header">
            <div className="flex-row items-center gap-2">
              <span className="radar-dot offline" />
              <strong>Processing Batch... Message #{progress?.current_id || startIdToUse}</strong>
            </div>
            <span className="progress-percent-label">{percent}% Completed</span>
          </div>

          {/* Striped Progress Bar */}
          <div className="progress-container">
            <div 
              className="progress-bar-striped"
              style={{ width: `${Math.max(percent, 4)}%` }}
            />
          </div>

          <div className="running-stats-row">
            <div className="stat-pill">
              <span>Processed:</span>
              <strong>{processed} / {total || '...'}</strong>
            </div>
            <div className="stat-pill text-vacancy">
              <CheckCircle2 size={14} />
              <span>Vacancies Found:</span>
              <strong>{vacancies}</strong>
            </div>
            <div className="stat-pill text-noise">
              <XCircle size={14} />
              <span>Noise Skipped:</span>
              <strong>{noise}</strong>
            </div>
          </div>

          {progress?.snippet && (
            <div className="current-post-preview">
              <span className="preview-label">Evaluating Post #{progress.current_id}:</span>
              <p className="preview-text arabic-text">"{progress.snippet}..."</p>
              {progress.verdict && (
                <div className="preview-verdict">
                  <Sparkles size={13} />
                  <span>Verdict: {progress.verdict.is_vacancy ? '✅ Vacancy' : '⏸️ Noise'} — {progress.verdict.reason}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Completed Summary Banner */}
      {!isRunning && processed > 0 && (
        <div className="completed-summary glass">
          <CheckCircle2 size={24} className="text-vacancy" />
          <div className="summary-text">
            <h4>Batch Catch-Up Completed!</h4>
            <p>
              Processed <strong>{processed}</strong> posts. 
              Found <strong>{vacancies}</strong> real vacancies and filtered <strong>{noise}</strong> noise messages. 
              Watermark advanced to <strong>#{currentWatermark}</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
