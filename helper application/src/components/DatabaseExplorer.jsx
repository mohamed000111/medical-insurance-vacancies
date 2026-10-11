import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  ExternalLink, 
  RotateCw, 
  Edit3, 
  Copy, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  Radio,
  FastForward,
  Clock
} from 'lucide-react';
import LinkPreviewList from './LinkPreviewList';

export default function DatabaseExplorer({ 
  messages, 
  totalCount, 
  page, 
  totalPages, 
  onPageChange,
  searchQuery, 
  onSearchChange,
  verdictFilter, 
  onVerdictFilterChange,
  modeFilter, 
  onModeFilterChange,
  onInspectMessage,
  onReclassifyMessage,
  onOverrideVerdict,
  channelUsername = 'medical_Insurance_1'
}) {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (e, text, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateTs) => {
    if (!dateTs) return 'Unknown date';
    const d = new Date(dateTs * 1000);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="explorer-container glass">
      {/* Explorer Controls Bar */}
      <div className="explorer-toolbar">
        {/* Search Input */}
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            className="search-input"
            placeholder="Search by keyword, role (Claims, Auditor...), WhatsApp, Arabic text..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => onSearchChange('')}>✕</button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="filter-chips-row">
          <div className="chips-group">
            <span className="chips-label">Verdict:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'vacancy', label: '✅ Vacancies' },
              { id: 'noise', label: '⏸️ Noise' },
            ].map((f) => (
              <button
                key={f.id}
                className={`filter-chip ${verdictFilter === f.id ? 'active' : ''}`}
                onClick={() => onVerdictFilterChange(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="chips-group">
            <span className="chips-label">Mode:</span>
            {[
              { id: 'all', label: 'All Modes' },
              { id: 'online', label: '🟢 Online' },
              { id: 'offline', label: '🟠 Offline' },
            ].map((m) => (
              <button
                key={m.id}
                className={`filter-chip ${modeFilter === m.id ? 'active' : ''}`}
                onClick={() => onModeFilterChange(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="results-header">
        <span className="results-count">
          Showing <strong>{messages.length}</strong> of <strong>{totalCount}</strong> stored messages
        </span>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button 
              className="page-btn" 
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="page-indicator">Page {page} of {totalPages}</span>
            <button 
              className="page-btn" 
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Messages Data Grid / List */}
      {messages.length === 0 ? (
        <div className="empty-results-box">
          <Filter size={36} className="text-dim mb-2" />
          <h4>No messages match your filter criteria</h4>
          <p className="text-muted">Try clearing the search query or switching filters.</p>
        </div>
      ) : (
        <div className="messages-grid">
          {messages.map((msg) => {
            const isVac = msg.is_vacancy === true;
            const tgLink = `https://t.me/${channelUsername}/${msg.id}`;

            return (
              <div 
                key={msg.id} 
                className={`message-card ${isVac ? 'is-vacancy' : 'is-noise'}`}
                onClick={() => onInspectMessage(msg)}
              >
                <div className="card-top">
                  <div className="flex-row items-center gap-2">
                    <span className="msg-id">#{msg.id}</span>
                    <a 
                      href={tgLink} 
                      target="_blank" 
                      rel="noreferrer"
                      className="tg-link-icon"
                      onClick={(e) => e.stopPropagation()}
                      title="View original post on Telegram"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <span className="card-date">
                      <Clock size={12} />
                      {formatDate(msg.date_ts)}
                    </span>
                  </div>

                  <div className="flex-row items-center gap-2">
                    {msg.mode_captured === 'online' ? (
                      <span className="mode-tag-pill online">
                        <Radio size={11} /> Online
                      </span>
                    ) : (
                      <span className="mode-tag-pill offline">
                        <FastForward size={11} /> Offline
                      </span>
                    )}

                    <span className={`verdict-pill ${isVac ? 'vac' : 'noise'}`}>
                      {isVac ? <CheckCircle size={13} /> : <XCircle size={13} />}
                      {isVac ? 'Vacancy' : 'Noise'}
                    </span>
                  </div>
                </div>

                <div className="card-body arabic-text">
                  <p className="content-snippet">
                    {msg.text?.slice(0, 220)}
                    {msg.text?.length > 220 && '...'}
                  </p>
                  <LinkPreviewList text={msg.text} maxPreviews={2} compact={true} />
                </div>

                {/* AI Reasoning Strip */}
                <div className="card-reason-strip">
                  <div className="reason-content">
                    <Sparkles size={13} className="text-accent" />
                    <span className="reason-text">{msg.reason || (isVac ? 'Job opportunity' : 'General post')}</span>
                  </div>
                </div>

                <div className="card-actions-bar">
                  <button 
                    type="button"
                    className="action-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCopy(e, msg.text, msg.id);
                    }}
                    title="Copy full text"
                  >
                    <Copy size={13} />
                    <span>{copiedId === msg.id ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button 
                    type="button"
                    className="action-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onReclassifyMessage(msg.id);
                    }}
                    title="Re-run AI classifier"
                  >
                    <RotateCw size={13} />
                    <span>Re-classify</span>
                  </button>

                  <button 
                    type="button"
                    className={`action-btn override-btn ${msg._syncing ? 'syncing' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOverrideVerdict(msg.id, !isVac);
                    }}
                    disabled={msg._syncing}
                    title={isVac ? "Mark as Noise and remove from vacancies sheet" : "Mark as Vacancy and sync to vacancies sheet"}
                  >
                    <Edit3 size={13} className={msg._syncing ? 'spin' : ''} />
                    <span>
                      {msg._syncing ? 'Syncing...' : (isVac ? 'Set as Noise' : 'Set as Vacancy')}
                    </span>
                  </button>

                  <button 
                    type="button"
                    className="action-btn inspect-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onInspectMessage(msg);
                    }}
                    title="Inspect details"
                  >
                    <Eye size={13} />
                    <span>Inspect</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
