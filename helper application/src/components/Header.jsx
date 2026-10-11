import React from 'react';
import { 
  Bot, 
  Activity, 
  RefreshCw, 
  Settings, 
  FlaskConical, 
  Download, 
  Radio, 
  Layers, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export default function Header({ 
  status, 
  onRefresh, 
  onOpenSettings, 
  onOpenSandbox, 
  onExport, 
  isRefreshing 
}) {
  const isOnline = status?.online_active;
  const isOffline = status?.offline_active;

  return (
    <header className="header-bar glass">
      <div className="header-left">
        <div className="logo-badge">
          <Bot className="logo-icon" size={24} />
          <div className="logo-text">
            <h1>MedInsure Hub</h1>
            <span className="subtitle">AI Vacancy Classifier & Telegram Assistant</span>
          </div>
        </div>

        <div className="status-pills">
          {/* Telegram Channel Pill */}
          <div className="status-pill channel-pill">
            <span className="channel-icon">📢</span>
            <span className="channel-name">@{status?.channel_username || 'medical_Insurance_1'}</span>
            {status?.telegram_user?.first_name && (
              <span className="user-tag" title={`Logged in as ${status.telegram_user.first_name}`}>
                • {status.telegram_user.first_name}
              </span>
            )}
          </div>

          {/* Real-time Mode State Pill */}
          <div className={`status-pill mode-pill ${isOnline ? 'online' : (isOffline ? 'offline' : 'idle')}`}>
            {isOnline ? (
              <>
                <span className="radar-dot" />
                <span className="mode-label">ONLINE: Active Listener Active</span>
              </>
            ) : isOffline ? (
              <>
                <span className="radar-dot offline" />
                <span className="mode-label">OFFLINE: Catch-Up Classifier Running</span>
              </>
            ) : (
              <>
                <span className="idle-dot" />
                <span className="mode-label">IDLE: Ready</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <button 
          className="btn-icon" 
          onClick={onRefresh} 
          disabled={isRefreshing}
          title="Refresh Data"
        >
          <RefreshCw size={17} className={isRefreshing ? 'spin' : ''} />
          <span>Refresh</span>
        </button>

        <button 
          className="btn-secondary" 
          onClick={onOpenSandbox}
          title="Test Classifier Playground"
        >
          <FlaskConical size={17} />
          <span>Test Classifier</span>
        </button>

        <div className="dropdown-export">
          <button 
            className="btn-secondary"
            onClick={() => onExport('json')}
            title="Export local database to JSON"
          >
            <Download size={17} />
            <span>Export</span>
          </button>
        </div>

        <button 
          className="btn-icon settings-btn" 
          onClick={onOpenSettings}
          title="Settings & Credentials"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
