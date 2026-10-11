import React, { useState } from 'react';
import { 
  Radio, 
  Power, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Clock,
  Zap,
  ShieldCheck
} from 'lucide-react';
import LinkPreviewList from './LinkPreviewList';

export default function OnlineModePanel({ 
  status, 
  onStartOnline, 
  onStopOnline, 
  liveMessages, 
  audioEnabled, 
  onToggleAudio,
  onInspectMessage
}) {
  const isOnline = status?.online_active;
  const channelName = status?.channel_username || 'medical_Insurance_1';

  return (
    <div className="mode-panel glass">
      <div className="panel-header">
        <div className="panel-title-wrap">
          <div className={`mode-indicator-badge ${isOnline ? 'active' : 'inactive'}`}>
            <Radio size={20} className={isOnline ? 'pulse-icon' : ''} />
          </div>
          <div>
            <h2>Online Mode: Active Listener & Sorter</h2>
            <p className="panel-desc">
              Continuously monitors <strong>@{channelName}</strong> in real-time. Incoming posts are classified by AI and sorted into vacancies immediately upon posting.
            </p>
          </div>
        </div>

        <div className="panel-actions">
          <button 
            className={`btn-sound ${audioEnabled ? 'active' : ''}`}
            onClick={onToggleAudio}
            title={audioEnabled ? "Mute audio alert on new vacancy" : "Enable chime on new vacancy"}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{audioEnabled ? 'Chime Active' : 'Chime Muted'}</span>
          </button>

          <button 
            className={`btn-power ${isOnline ? 'btn-stop' : 'btn-start'}`}
            onClick={isOnline ? onStopOnline : onStartOnline}
          >
            <Power size={18} />
            <span>{isOnline ? 'Stop Active Listener' : 'Start Active Listener'}</span>
          </button>
        </div>
      </div>

      {/* Online Status Banner */}
      <div className={`status-banner ${isOnline ? 'banner-active' : 'banner-idle'}`}>
        <div className="banner-left">
          <span className={`radar-dot ${isOnline ? '' : 'idle'}`} />
          <div className="banner-text">
            <strong>{isOnline ? `Real-Time Listener Active on @${channelName}` : 'Listener Inactive'}</strong>
            <span>
              {isOnline 
                ? 'Telethon socket open. Every new channel post is captured, classified via AI, and stored in local DB & Supabase.' 
                : 'Click Start to listen to live channel messages and classify vacancies on the fly.'}
            </span>
          </div>
        </div>
        {isOnline && (
          <div className="banner-metric">
            <span className="pulse-tag">LIVE STREAMING</span>
          </div>
        )}
      </div>

      {/* Live Feed Container */}
      <div className="live-feed-section">
        <div className="section-subheader">
          <div className="flex-row items-center gap-2">
            <Zap size={16} className="text-online" />
            <h3>Live Stream Feed (Online Captures)</h3>
          </div>
          <span className="count-badge">{liveMessages.length} captured this session</span>
        </div>

        {liveMessages.length === 0 ? (
          <div className="empty-live-box">
            <Radio size={36} className="text-dim mb-2" />
            <p className="text-muted">
              {isOnline 
                ? 'Listening for new messages on Telegram... As soon as admin posts, it will appear here instantly!' 
                : 'Start the Online Listener above to begin monitoring live posts.'}
            </p>
          </div>
        ) : (
          <div className="live-cards-list">
            {liveMessages.map((msg) => {
              const isVac = msg.is_vacancy === true;
              return (
                <div 
                  key={msg.id} 
                  className={`live-card ${isVac ? 'is-vacancy' : 'is-noise'}`}
                  onClick={() => onInspectMessage(msg)}
                >
                  <div className="live-card-header">
                    <div className="flex-row items-center gap-2">
                      <span className="msg-id-badge">#{msg.id}</span>
                      <span className="channel-tag">@{channelName}</span>
                    </div>

                    <div className="flex-row items-center gap-2">
                      <span className={`verdict-tag ${isVac ? 'tag-vac' : 'tag-noise'}`}>
                        {isVac ? <CheckCircle size={13} /> : <XCircle size={13} />}
                        {isVac ? 'JOB VACANCY' : 'NOISE / SKIPPED'}
                      </span>
                    </div>
                  </div>

                  <div className="live-card-body arabic-text">
                    {msg.text?.slice(0, 160)}
                    {msg.text?.length > 160 && '...'}
                    <LinkPreviewList text={msg.text} maxPreviews={1} compact={true} />
                  </div>

                  <div className="live-card-footer">
                    <div className="reason-pill">
                      <Sparkles size={12} />
                      <span>{msg.reason || (isVac ? 'Vacancy detected' : 'Noise filtered')}</span>
                    </div>
                    <span className="click-hint">Click to inspect</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
