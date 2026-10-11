import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import MetricsOverview from './components/MetricsOverview';
import OnlineModePanel from './components/OnlineModePanel';
import OfflineModePanel from './components/OfflineModePanel';
import DatabaseExplorer from './components/DatabaseExplorer';
import LogsPanel from './components/LogsPanel';
import MessageDetailModal from './components/MessageDetailModal';
import SandboxModal from './components/SandboxModal';
import SettingsModal from './components/SettingsModal';
import { playVacancyChime } from './utils/audio';
import { Radio, FastForward, Database, Terminal, Sparkles } from 'lucide-react';
import './App.css';

export default function App() {
  // App state
  const [status, setStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('online'); // 'online' | 'offline' | 'database' | 'logs'
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Messages in local DB
  const [messages, setMessages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  // Live session state
  const [liveMessages, setLiveMessages] = useState([]);
  const [offlineProgress, setOfflineProgress] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [logs, setLogs] = useState([]);

  // Modals
  const [inspectingMessage, setInspectingMessage] = useState(null);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // SSE event source ref
  const eventSourceRef = useRef(null);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.offline_progress) {
          setOfflineProgress(data.offline_progress);
        }
      }
    } catch (err) {
      console.warn("Could not fetch status:", err);
    }
  };

  // Fetch messages
  const fetchMessages = async (currentPage = page, search = searchQuery, verdict = verdictFilter, mode = modeFilter) => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: '20',
        verdict,
        mode
      });
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/messages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.items || []);
        setTotalCount(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      console.warn("Could not fetch messages:", err);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=80');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.warn("Could not fetch logs:", err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchMessages(1);
    fetchLogs();
  }, []);

  // Filter or page change
  useEffect(() => {
    fetchMessages(page, searchQuery, verdictFilter, modeFilter);
  }, [page, searchQuery, verdictFilter, modeFilter]);

  // Connect SSE for real-time reactivity
  useEffect(() => {
    const connectSSE = () => {
      const es = new EventSource('/api/events');
      eventSourceRef.current = es;

      es.addEventListener('online_status', (e) => {
        const payload = JSON.parse(e.data);
        setStatus((prev) => ({ ...prev, online_active: payload.data?.active }));
      });

      es.addEventListener('offline_progress', (e) => {
        const payload = JSON.parse(e.data);
        setOfflineProgress(payload.data);
        setStatus((prev) => ({ ...prev, offline_active: payload.data?.active }));
        if (!payload.data?.active) {
          fetchStatus();
          fetchMessages();
        }
      });

      es.addEventListener('watermark_updated', (e) => {
        const payload = JSON.parse(e.data);
        setStatus((prev) => ({ ...prev, last_message_id: payload.data?.last_message_id }));
      });

      es.addEventListener('message_classified', (e) => {
        const payload = JSON.parse(e.data);
        const newMsg = payload.data;
        if (newMsg) {
          setLiveMessages((prev) => [newMsg, ...prev.slice(0, 49)]);
          // Refresh list and stats
          fetchStatus();
          fetchMessages();

          // Play chime if vacancy
          if (newMsg.is_vacancy === true && audioEnabled) {
            playVacancyChime();
          }
        }
      });

      es.addEventListener('message_updated', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const updated = payload.data;
          if (updated?.id) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updated.id
                  ? { ...m, is_vacancy: updated.is_vacancy, reason: updated.reason }
                  : m
              )
            );
          }
        } catch (err) {
          console.warn("Error parsing message_updated event:", err);
        }
      });


      es.addEventListener('log', (e) => {
        const payload = JSON.parse(e.data);
        if (payload.data) {
          setLogs((prev) => [payload.data, ...prev.slice(0, 100)]);
        }
      });

      es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 4000);
      };
    };

    connectSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [audioEnabled]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchStatus(), fetchMessages(1), fetchLogs()]);
    setIsRefreshing(false);
  };

  // Online Mode actions
  const handleStartOnline = async () => {
    try {
      const res = await fetch('/api/mode/online/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) alert(data.detail || 'Failed to start online listener');
      fetchStatus();
    } catch (err) {
      alert("Error starting online mode: " + err.message);
    }
  };

  const handleStopOnline = async () => {
    try {
      await fetch('/api/mode/online/stop', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      alert("Error stopping online mode: " + err.message);
    }
  };

  // Offline Mode actions
  const handleStartOffline = async (params) => {
    try {
      const res = await fetch('/api/mode/offline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (!res.ok) alert(data.detail || 'Failed to start offline classifier');
      fetchStatus();
    } catch (err) {
      alert("Error starting offline mode: " + err.message);
    }
  };

  const handleStopOffline = async () => {
    try {
      await fetch('/api/mode/offline/stop', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      alert("Error stopping offline mode: " + err.message);
    }
  };

  // Message actions
  const handleReclassify = async (id) => {
    try {
      const res = await fetch(`/api/messages/${id}/reclassify`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Update inspected message if open
        if (inspectingMessage && inspectingMessage.id === id) {
          setInspectingMessage((prev) => ({
            ...prev,
            is_vacancy: data.verdict?.is_vacancy,
            reason: data.verdict?.reason
          }));
        }
        fetchStatus();
        fetchMessages();
      }
    } catch (err) {
      alert("Re-classify failed: " + err.message);
    }
  };

  const handleOverride = async (id, isVac) => {
    const reasonText = isVac
      ? "Manual override: Set as Vacancy (synced to sheet)"
      : "Manual override: Set as Noise (deactivated from sheet)";

    // 1. Instant optimistic in-place update for seamless, zero-flicker UI
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, is_vacancy: isVac, reason: reasonText, _syncing: true } : m
      )
    );

    if (inspectingMessage && inspectingMessage.id === id) {
      setInspectingMessage((prev) => ({
        ...prev,
        is_vacancy: isVac,
        reason: reasonText,
        _syncing: true,
      }));
    }

    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        vacancies_count: Math.max(0, (prev.vacancies_count || 0) + (isVac ? 1 : -1)),
        noise_count: Math.max(0, (prev.noise_count || 0) + (isVac ? -1 : 1)),
      };
    });

    try {
      const res = await fetch(`/api/messages/${id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_vacancy: isVac, reason: reasonText }),
      });

      if (res.ok) {
        // Clear syncing indicator smoothly
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, _syncing: false } : m
          )
        );
        if (inspectingMessage && inspectingMessage.id === id) {
          setInspectingMessage((prev) => ({ ...prev, _syncing: false }));
        }
      } else {
        const data = await res.json();
        alert("Override failed: " + (data.detail || "Server error"));
        fetchMessages();
      }
    } catch (err) {
      alert("Override request failed: " + err.message);
      fetchMessages();
    }
  };


  const handleExport = (format = 'json') => {
    window.open(`/api/export?format=${format}`, '_blank');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        status={status}
        onRefresh={handleRefresh}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSandbox={() => setIsSandboxOpen(true)}
        onExport={handleExport}
        isRefreshing={isRefreshing}
      />

      <main className="main-content">
        {/* KPI Metrics */}
        <MetricsOverview
          status={status}
          onEditWatermark={() => setIsSettingsOpen(true)}
        />

        {/* Tab Navigation Center */}
        <div className="tabs-nav-bar glass">
          <button
            className={`tab-btn ${activeTab === 'online' ? 'active tab-online' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            <Radio size={16} />
            <span>Online Mode (Live Sorter)</span>
            {status?.online_active && <span className="tab-pulse" />}
          </button>

          <button
            className={`tab-btn ${activeTab === 'offline' ? 'active tab-offline' : ''}`}
            onClick={() => setActiveTab('offline')}
          >
            <FastForward size={16} />
            <span>Offline Mode (Catch-Up)</span>
            {status?.offline_active && <span className="tab-pulse-offline" />}
          </button>

          <button
            className={`tab-btn ${activeTab === 'database' ? 'active tab-db' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            <Database size={16} />
            <span>Local Database Explorer</span>
            <span className="tab-badge">{totalCount}</span>
          </button>

          <button
            className={`tab-btn ${activeTab === 'logs' ? 'active tab-logs' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={16} />
            <span>Activity Logs</span>
            <span className="tab-badge">{logs.length}</span>
          </button>
        </div>

        {/* Tab Views */}
        <div className="tab-content-area">
          {activeTab === 'online' && (
            <OnlineModePanel
              status={status}
              onStartOnline={handleStartOnline}
              onStopOnline={handleStopOnline}
              liveMessages={liveMessages}
              audioEnabled={audioEnabled}
              onToggleAudio={() => setAudioEnabled(!audioEnabled)}
              onInspectMessage={(msg) => setInspectingMessage(msg)}
            />
          )}

          {activeTab === 'offline' && (
            <OfflineModePanel
              status={status}
              onStartOffline={handleStartOffline}
              onStopOffline={handleStopOffline}
              progress={offlineProgress}
              onUpdateWatermark={() => setIsSettingsOpen(true)}
            />
          )}

          {activeTab === 'database' && (
            <DatabaseExplorer
              messages={messages}
              totalCount={totalCount}
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => setPage(p)}
              searchQuery={searchQuery}
              onSearchChange={(q) => {
                setSearchQuery(q);
                setPage(1);
              }}
              verdictFilter={verdictFilter}
              onVerdictFilterChange={(v) => {
                setVerdictFilter(v);
                setPage(1);
              }}
              modeFilter={modeFilter}
              onModeFilterChange={(m) => {
                setModeFilter(m);
                setPage(1);
              }}
              onInspectMessage={(msg) => setInspectingMessage(msg)}
              onReclassifyMessage={handleReclassify}
              onOverrideVerdict={handleOverride}
              channelUsername={status?.channel_username || 'medical_Insurance_1'}
            />
          )}

          {activeTab === 'logs' && (
            <LogsPanel
              logs={logs}
              onClear={() => setLogs([])}
            />
          )}
        </div>
      </main>

      {/* Message Inspection Modal */}
      {inspectingMessage && (
        <MessageDetailModal
          message={inspectingMessage}
          onClose={() => setInspectingMessage(null)}
          onReclassify={handleReclassify}
          onOverride={handleOverride}
          channelUsername={status?.channel_username || 'medical_Insurance_1'}
        />
      )}

      {/* Classifier Sandbox Modal */}
      <SandboxModal
        isOpen={isSandboxOpen}
        onClose={() => setIsSandboxOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={() => {
          fetchStatus();
          fetchMessages();
        }}
      />
    </div>
  );
}
