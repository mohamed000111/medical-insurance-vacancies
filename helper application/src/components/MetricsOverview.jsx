import React from 'react';
import { Database, Briefcase, Filter, Bookmark, Edit3, ArrowUpRight } from 'lucide-react';

export default function MetricsOverview({ status, onEditWatermark }) {
  const total = status?.total_messages || 0;
  const vacancies = status?.vacancies_count || 0;
  const noise = status?.noise_count || 0;
  const watermark = status?.last_message_id || 0;

  const vacancyPercent = total > 0 ? Math.round((vacancies / total) * 100) : 0;
  const noisePercent = total > 0 ? Math.round((noise / total) * 100) : 0;

  return (
    <div className="metrics-grid">
      {/* Total Processed */}
      <div className="metric-card glass">
        <div className="metric-header">
          <span className="metric-title">Local Database</span>
          <div className="metric-icon-wrap total">
            <Database size={19} />
          </div>
        </div>
        <div className="metric-body">
          <div className="metric-value">{total.toLocaleString()}</div>
          <span className="metric-sub">Classified Posts Stored</span>
        </div>
        <div className="metric-footer">
          <span className="pill-tag">SQLite Persistent</span>
        </div>
      </div>

      {/* Vacancies */}
      <div className="metric-card glass vacancy-glow">
        <div className="metric-header">
          <span className="metric-title">Vacancies Identified</span>
          <div className="metric-icon-wrap vacancy">
            <Briefcase size={19} />
          </div>
        </div>
        <div className="metric-body">
          <div className="metric-value text-vacancy">{vacancies.toLocaleString()}</div>
          <span className="metric-sub">{vacancyPercent}% of total posts</span>
        </div>
        <div className="metric-footer">
          <div className="progress-mini">
            <div className="progress-mini-bar vacancy" style={{ width: `${vacancyPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Noise Skipped */}
      <div className="metric-card glass noise-glow">
        <div className="metric-header">
          <span className="metric-title">Noise / Filtered</span>
          <div className="metric-icon-wrap noise">
            <Filter size={19} />
          </div>
        </div>
        <div className="metric-body">
          <div className="metric-value text-noise">{noise.toLocaleString()}</div>
          <span className="metric-sub">{noisePercent}% chit-chat / ads</span>
        </div>
        <div className="metric-footer">
          <div className="progress-mini">
            <div className="progress-mini-bar noise" style={{ width: `${noisePercent}%` }} />
          </div>
        </div>
      </div>

      {/* Stored Watermark */}
      <div className="metric-card glass watermark-glow">
        <div className="metric-header">
          <span className="metric-title">Offline Watermark</span>
          <div className="metric-icon-wrap watermark">
            <Bookmark size={19} />
          </div>
        </div>
        <div className="metric-body">
          <div className="metric-value text-offline">#{watermark.toLocaleString()}</div>
          <span className="metric-sub">Last processed message no.</span>
        </div>
        <div className="metric-footer">
          <button 
            className="btn-watermark-edit" 
            onClick={onEditWatermark}
            title="Edit starting message watermark"
          >
            <Edit3 size={13} />
            <span>Set Message No.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
