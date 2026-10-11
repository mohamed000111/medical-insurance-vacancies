import React, { useState } from 'react';
import { X, FlaskConical, Sparkles, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import LinkPreviewList from './LinkPreviewList';

export default function SandboxModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [testText, setTestText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sampleTexts = [
    {
      title: "Real Vacancy Example",
      text: `🚨 مطلوب أخصائي مطالبات تأمين طبي (Medical Claims Specialist)
شركة تأمين كبرى بالتجمع الخامس
خبرة 2-3 سنوات في شبكات الرعاية الصحية والموافقات
برجاء إرسال السيرة الذاتية عبر واتساب: 01012345678`
    },
    {
      title: "Greeting / Noise Example",
      text: `جمعة مباركة على جميع الزملاء الأعزاء وكل عام وأنتم بخير وسعادة تقبل الله منا ومنكم صالح الأعمال.`
    },
    {
      title: "Course / Promotion Example",
      text: `دورة تدريبية مجانية أونلاين لشرح مبادئ وأساسيات التأمين الطبي وكيفية قراءة بوليصة التأمين. للتسجيل في الزووم اضغط الرابط التالي.`
    }
  ];

  const handleClassify = async () => {
    if (!testText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/test-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Classification failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card sandbox-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-row items-center gap-2">
            <FlaskConical size={20} className="text-accent" />
            <h3>AI Classifier Sandbox Playground</h3>
          </div>
          <button className="btn-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <p className="text-muted text-sm mb-3">
            Paste any draft job post or announcement to preview how the AI classifier evaluates it before posting to Telegram.
          </p>

          {/* Quick presets */}
          <div className="presets-row mb-3">
            <span className="text-xs text-dim">Quick Presets:</span>
            {sampleTexts.map((sample, idx) => (
              <button
                key={idx}
                className="preset-chip"
                onClick={() => setTestText(sample.text)}
              >
                {sample.title}
              </button>
            ))}
          </div>

          <div className="textarea-wrap">
            <textarea
              className="sandbox-textarea arabic-text"
              placeholder="Paste draft post here (Arabic or English)..."
              rows={6}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
            />
          </div>

          <div className="flex-row justify-between items-center mt-3">
            <span className="text-xs text-dim">{testText.length} characters</span>
            <button
              className="btn-primary"
              onClick={handleClassify}
              disabled={loading || !testText.trim()}
            >
              <Send size={15} />
              <span>{loading ? 'Evaluating with AI...' : 'Classify Post Now'}</span>
            </button>
          </div>

          {/* Result Card */}
          {result && (
            <div className={`sandbox-result-card glass ${result.is_vacancy ? 'res-vac' : 'res-noise'} mt-4`}>
              <div className="result-header">
                <div className="flex-row items-center gap-2">
                  {result.is_vacancy ? (
                    <CheckCircle size={18} className="text-vacancy" />
                  ) : (
                    <XCircle size={18} className="text-noise" />
                  )}
                  <h4>
                    Verdict: {result.is_vacancy ? '✅ Real Job Vacancy' : '⏸️ Noise / Skipped'}
                  </h4>
                </div>
                {result.latency_ms && (
                  <span className="latency-badge">
                    <Clock size={12} /> {result.latency_ms} ms
                  </span>
                )}
              </div>

              <div className="result-reason mt-2">
                <span className="reason-label">Reasoning:</span>
                <p className="reason-val">{result.reason}</p>
              </div>

              <div className="mt-3">
                <span className="reason-label">Action Link Previews:</span>
                <LinkPreviewList text={testText} maxPreviews={2} compact={false} />
              </div>

              <div className="pipeline-action-pill mt-2">
                {result.is_vacancy ? (
                  <span className="text-vacancy text-xs">
                    🚀 In Live Mode: This post would be stored directly to <strong>public.vacancies</strong> on the website.
                  </span>
                ) : (
                  <span className="text-noise text-xs">
                    🛡️ In Live Mode: This post would be filtered out and saved only to <strong>public.classification_log</strong>.
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner mt-3">
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
