import React, { useState } from 'react';
import { 
  X, 
  ExternalLink, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Sparkles, 
  Clock, 
  Edit3, 
  RotateCw,
  Send
} from 'lucide-react';
import LinkPreviewList from './LinkPreviewList';

export default function MessageDetailModal({ 
  message, 
  onClose, 
  onReclassify, 
  onOverride,
  channelUsername = 'medical_Insurance_1'
}) {
  if (!message) return null;

  const [copied, setCopied] = useState(false);
  const isVac = message.is_vacancy === true;
  const tgLink = `https://t.me/${channelUsername}/${message.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateTs) => {
    if (!dateTs) return 'N/A';
    return new Date(dateTs * 1000).toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="msg-id-lg">Message #{message.id}</span>
            <span className={`verdict-pill-lg ${isVac ? 'vac' : 'noise'}`}>
              {isVac ? <CheckCircle size={15} /> : <XCircle size={15} />}
              {isVac ? 'JOB VACANCY' : 'NOISE / SKIPPED'}
            </span>
          </div>

          <div className="flex-row items-center gap-2">
            <a 
              href={tgLink} 
              target="_blank" 
              rel="noreferrer" 
              className="btn-icon"
              title="Open on Telegram"
            >
              <ExternalLink size={16} />
              <span>Telegram Post</span>
            </a>

            <button className="btn-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="modal-body">
          {/* AI Intelligence Card */}
          <div className="ai-audit-card glass">
            <div className="audit-header">
              <div className="flex-row items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                <h4>AI Classifier Intelligence</h4>
              </div>
              <span className="model-tag">{message.model || 'groq-edge-classifier'}</span>
            </div>

            <div className="audit-reason-box">
              <span className="reason-label">Verdict Rationale:</span>
              <p className="reason-text">{message.reason || 'No explanation recorded'}</p>
            </div>

            <div className="audit-meta-grid">
              <div className="meta-item">
                <span className="meta-key">Captured Mode:</span>
                <span className="meta-val capitalize">{message.mode_captured || 'offline'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-key">Post Timestamp:</span>
                <span className="meta-val">{formatDate(message.date_ts)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-key">Sync Status:</span>
                <span className="meta-val">{message.status || 'synced'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-key">Supabase Pipeline:</span>
                <span className="meta-val text-vacancy">Verified in DB</span>
              </div>
            </div>
          </div>

          {/* Verbatim Content */}
          <div className="verbatim-box">
            <div className="verbatim-header">
              <span className="verbatim-label">Original Telegram Text (Verbatim):</span>
              <button className="copy-action-btn" onClick={handleCopy}>
                <Copy size={13} />
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Full Text'}</span>
              </button>
            </div>

            <div className="verbatim-text-container arabic-text">
              {message.text}
            </div>

            <div className="modal-previews-section mt-3">
              <span className="verbatim-label">Detected Action Links & Contact Previews:</span>
              <LinkPreviewList text={message.text} maxPreviews={4} compact={false} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <div className="flex-row items-center gap-2">
            <button 
              type="button"
              className="btn-secondary"
              onClick={(e) => {
                e.preventDefault();
                onReclassify(message.id);
              }}
            >
              <RotateCw size={15} />
              <span>Re-run AI Classifier</span>
            </button>

            <button 
              type="button"
              className="btn-secondary"
              onClick={(e) => {
                e.preventDefault();
                onOverride(message.id, !isVac);
              }}
            >
              <Edit3 size={15} />
              <span>{isVac ? 'Override: Mark as Noise & Remove from Sheet' : 'Override: Mark as Vacancy & Sync to Sheet'}</span>
            </button>
          </div>

          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>

        </div>
      </div>
    </div>
  );
}
