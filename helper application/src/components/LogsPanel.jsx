import React from 'react';
import { Terminal, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export default function LogsPanel({ logs, onClear }) {
  const getIcon = (level) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 size={13} className="text-vacancy" />;
      case 'warning':
        return <AlertTriangle size={13} className="text-offline" />;
      case 'error':
        return <AlertCircle size={13} className="text-noise" />;
      default:
        return <Info size={13} className="text-online" />;
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="logs-container glass">
      <div className="logs-header">
        <div className="flex-row items-center gap-2">
          <Terminal size={17} className="text-accent" />
          <h3>System & Activity Telemetry Logs</h3>
        </div>
        <div className="flex-row items-center gap-2">
          <span className="log-count">{logs.length} events logged</span>
        </div>
      </div>

      <div className="logs-terminal">
        {logs.length === 0 ? (
          <div className="empty-logs text-muted">No activity logs recorded yet.</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className={`log-line level-${log.level || 'info'}`}>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className="log-icon">{getIcon(log.level)}</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
