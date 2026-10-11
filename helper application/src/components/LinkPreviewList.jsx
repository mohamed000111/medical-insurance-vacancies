import React, { useState, useEffect } from 'react';
import { 
  ExternalLink, 
  MessageCircle, 
  FileText, 
  Globe, 
  Phone
} from 'lucide-react';

function LinkedInIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>
  );
}

const URL_REGEX = /(https?:\/\/[^\s<)\]"'\*]+)/gi;
const EGYPT_PHONE_REGEX = /(?:\+?20[\s-]?|\b0)(1[0125](?:[\s-]?\d){8})\b/g;
const ogCache = new Map();

export function extractPreviews(rawText = '', maxCount = 2) {
  if (!rawText) return [];
  const previews = [];
  const seen = new Set();

  // 1. Explicit URLs
  const urls = rawText.match(URL_REGEX) || [];
  for (const rawUrl of urls) {
    let cleanUrl = rawUrl.replace(/[)\]*_"'>]+$/, '');
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    try {
      let parsed = new URL(cleanUrl);
      let host = parsed.hostname.toLowerCase();

      // Unwrap LinkedIn safety redirects: https://www.linkedin.com/safety/go/?url=...
      if (host.includes('linkedin.com') && parsed.pathname.includes('/safety/go')) {
        const unwrapped = parsed.searchParams.get('url');
        if (unwrapped) {
          cleanUrl = unwrapped;
          parsed = new URL(cleanUrl);
          host = parsed.hostname.toLowerCase();
        }
      }

      // WhatsApp links
      if (host.includes('wa.me') || host.includes('whatsapp.com')) {
        const phone = parsed.pathname.replace(/\D/g, '') || parsed.searchParams.get('phone') || '';
        const formatted = phone.startsWith('20') ? '0' + phone.slice(2) : (phone ? `+${phone}` : 'WhatsApp Chat');
        previews.push({
          type: 'whatsapp',
          url: phone ? `https://wa.me/${phone}` : cleanUrl,
          title: 'Apply via WhatsApp',
          subtitle: formatted,
          hostname: 'wa.me'
        });
        continue;
      }

      // Application Forms (Google Forms, Microsoft Forms, Typeform)
      if (host.includes('forms.gle') || host.includes('docs.google.com') || host.includes('typeform.com') || host.includes('forms.office.com')) {
        previews.push({
          type: 'form',
          url: cleanUrl,
          title: host.includes('forms.gle') || host.includes('google') ? 'Google Forms' : 'Application Form',
          subtitle: parsed.hostname,
          hostname: parsed.hostname
        });
        continue;
      }

      // LinkedIn Posts or Job postings
      if (host.includes('linkedin.com') || host.includes('lnkd.in')) {
        previews.push({
          type: 'linkedin',
          url: cleanUrl,
          title: 'LinkedIn Job Opening',
          subtitle: cleanUrl.length > 55 ? cleanUrl.slice(0, 52) + '...' : cleanUrl,
          hostname: 'linkedin.com'
        });
        continue;
      }

      // External website / job link
      previews.push({
        type: 'web',
        url: cleanUrl,
        title: parsed.hostname.replace(/^www\./, ''),
        subtitle: cleanUrl.length > 55 ? cleanUrl.slice(0, 52) + '...' : cleanUrl,
        hostname: parsed.hostname
      });
    } catch {
      // Ignore malformed URL
    }
  }

  // 2. Phone numbers (if no explicit WhatsApp link was already added)
  const hasWa = previews.some(p => p.type === 'whatsapp');
  if (!hasWa) {
    const phones = [...rawText.matchAll(EGYPT_PHONE_REGEX)];
    if (phones.length > 0) {
      const match = phones[0];
      const digits = '20' + match[1].replace(/\D/g, '');
      const formatted = '0' + match[1].replace(/\D/g, '');
      previews.push({
        type: 'whatsapp',
        url: `https://wa.me/${digits}`,
        title: 'Apply via WhatsApp',
        subtitle: formatted,
        hostname: 'wa.me'
      });
    }
  }

  return previews.slice(0, maxCount);
}

export default function LinkPreviewList({ text, maxPreviews = 2, compact = false }) {
  const previews = extractPreviews(text, maxPreviews);
  const [ogData, setOgData] = useState({});

  useEffect(() => {
    // Asynchronously enrich general web links
    const webLinks = previews.filter(p => p.type === 'web');
    if (!webLinks.length) return;

    webLinks.forEach(async (item) => {
      if (ogCache.has(item.url)) {
        setOgData(prev => ({ ...prev, [item.url]: ogCache.get(item.url) }));
        return;
      }

      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(item.url)}`, {
          signal: AbortSignal.timeout(3500)
        });
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data;
        if (data && (data.title || data.image)) {
          ogCache.set(item.url, data);
          setOgData(prev => ({ ...prev, [item.url]: data }));
        }
      } catch {
        // Fallback gracefully without throwing
      }
    });
  }, [text, previews.length]);

  if (!previews.length) return null;

  return (
    <div className={`link-previews-container ${compact ? 'compact' : 'full'}`}>
      {previews.map((prev, idx) => {
        const enriched = ogData[prev.url];
        const displayTitle = enriched?.title || prev.title;
        const displayDesc = enriched?.description || prev.subtitle;
        const thumbUrl = enriched?.image?.url || enriched?.logo?.url;

        let badgeClass = 'preview-badge-web';
        let icon = <Globe size={15} />;
        let actionLabel = 'Open Link';

        if (prev.type === 'whatsapp') {
          badgeClass = 'preview-badge-wa';
          icon = <MessageCircle size={15} />;
          actionLabel = 'Chat';
        } else if (prev.type === 'form') {
          badgeClass = 'preview-badge-form';
          icon = <FileText size={15} />;
          actionLabel = 'Open Form';
        } else if (prev.type === 'linkedin') {
          badgeClass = 'preview-badge-linkedin';
          icon = <LinkedInIcon size={15} />;
          actionLabel = 'View Job';
        }

        return (
          <a
            key={idx}
            href={prev.url}
            target="_blank"
            rel="noreferrer"
            className={`link-preview-item ${badgeClass}`}
            onClick={(e) => e.stopPropagation()}
            title={prev.url}
          >
            <div className="preview-left">
              {thumbUrl ? (
                <img src={thumbUrl} alt="Thumbnail" className="preview-mini-thumb" />
              ) : (
                <div className="preview-icon-box">
                  {icon}
                </div>
              )}
              <div className="preview-text-col">
                <span className="preview-title truncate">{displayTitle}</span>
                <span className="preview-sub truncate">{displayDesc}</span>
              </div>
            </div>

            <div className="preview-right">
              <span className="preview-action-chip">
                {actionLabel}
                <ExternalLink size={12} />
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
