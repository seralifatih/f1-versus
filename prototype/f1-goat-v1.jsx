import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Sliders, Trophy, Flag, ArrowLeftRight } from 'lucide-react';

/**
 * f1-goat-v1.jsx — DESIGN BIBLE
 *
 * This is the visual reference for f1-versus.com.
 * Match this exactly when building in Cursor.
 *
 * Stack assumed at runtime:
 *  - Next.js 14 App Router
 *  - Tailwind (custom config matching the tokens below)
 *  - framer-motion for row reorder + slider feedback
 *  - lucide-react for icons
 *
 * Fonts to load in app/layout.tsx via next/font/google:
 *  - Fraunces (variable, weights 300-900, opsz 9-144) — display
 *  - Inter Tight (weights 400, 500, 600) — body
 *  - JetBrains Mono (weights 400, 700) — numerics
 */

// ============================================================
// MOCK DATA — in production, fetched from D1
// ============================================================

const PRESETS = [
  { id: 'era-adjusted', label: 'Era Adjusted', blurb: 'Normalized for grid size, season length, era difficulty.', weights: { c: 25, w: 15, p: 10, q: 10, f: 5, r: 10, h: 15, l: 5, d: 5 } },
  { id: 'stats-geek', label: 'Stats Geek', blurb: 'Raw career totals. No era adjustment. Numbers don\'t lie.', weights: { c: 30, w: 25, p: 15, q: 10, f: 5, r: 5, h: 5, l: 5, d: 0 } },
  { id: 'peak', label: 'Peak Performance', blurb: 'Best 3 consecutive seasons. Brief brilliance over longevity.', weights: { c: 15, w: 10, p: 5, q: 5, f: 5, r: 15, h: 10, l: 0, d: 35 } },
  { id: 'longevity', label: 'Longevity', blurb: 'Sustained excellence across decades. Stamina matters.', weights: { c: 20, w: 15, p: 10, q: 5, f: 5, r: 15, h: 5, l: 20, d: 5 } },
  { id: 'teammate-slayer', label: 'Teammate Slayer', blurb: 'How well you beat the only direct comparison: your teammate.', weights: { c: 10, w: 10, p: 5, q: 10, f: 5, r: 5, h: 45, l: 5, d: 5 } },
  { id: 'pure-speed', label: 'Pure Speed', blurb: 'Poles and fastest laps. One-lap pace over Sunday craft.', weights: { c: 10, w: 10, p: 5, q: 25, f: 20, r: 10, h: 15, l: 0, d: 5 } },
];

const ERAS = [
  { id: 'all', label: 'All Time', range: '1950–now' },
  { id: 'golden', label: 'Golden Era', range: '1950–1979' },
  { id: 'turbo', label: 'Turbo & Tobacco', range: '1980–2005' },
  { id: 'modern', label: 'Modern', range: '2006–now' },
];

// Mock pre-computed driver stats (0-100 normalized)
const DRIVERS = [
  { id: 'lewis-hamilton', name: 'Lewis Hamilton', country: 'GB', years: '2007–present', stats: { c: 96, w: 100, p: 100, q: 100, f: 88, r: 78, h: 85, l: 80, d: 78 } },
  { id: 'michael-schumacher', name: 'Michael Schumacher', country: 'DE', years: '1991–2012', stats: { c: 94, w: 92, p: 92, q: 90, f: 92, r: 82, h: 90, l: 85, d: 92 } },
  { id: 'max-verstappen', name: 'Max Verstappen', country: 'NL', years: '2015–present', stats: { c: 60, w: 75, p: 60, q: 65, f: 72, r: 88, h: 95, l: 35, d: 95 } },
  { id: 'ayrton-senna', name: 'Ayrton Senna', country: 'BR', years: '1984–1994', stats: { c: 50, w: 60, p: 70, q: 95, f: 65, r: 75, h: 92, l: 25, d: 90 } },
  { id: 'juan-manuel-fangio', name: 'Juan Manuel Fangio', country: 'AR', years: '1950–1958', stats: { c: 75, w: 55, p: 50, q: 80, f: 55, r: 95, h: 88, l: 15, d: 98 } },
  { id: 'alain-prost', name: 'Alain Prost', country: 'FR', years: '1980–1993', stats: { c: 72, w: 70, p: 75, q: 65, f: 68, r: 78, h: 80, l: 60, d: 75 } },
  { id: 'sebastian-vettel', name: 'Sebastian Vettel', country: 'DE', years: '2007–2022', stats: { c: 70, w: 68, p: 65, q: 72, f: 60, r: 65, h: 70, l: 70, d: 80 } },
  { id: 'jackie-stewart', name: 'Jackie Stewart', country: 'GB', years: '1965–1973', stats: { c: 60, w: 52, p: 55, q: 55, f: 50, r: 80, h: 75, l: 35, d: 75 } },
  { id: 'jim-clark', name: 'Jim Clark', country: 'GB', years: '1960–1968', stats: { c: 48, w: 50, p: 48, q: 70, f: 60, r: 82, h: 82, l: 20, d: 88 } },
  { id: 'niki-lauda', name: 'Niki Lauda', country: 'AT', years: '1971–1985', stats: { c: 60, w: 50, p: 55, q: 55, f: 50, r: 65, h: 72, l: 55, d: 70 } },
  { id: 'fernando-alonso', name: 'Fernando Alonso', country: 'ES', years: '2001–present', stats: { c: 50, w: 55, p: 70, q: 55, f: 60, r: 50, h: 78, l: 95, d: 70 } },
  { id: 'nelson-piquet', name: 'Nelson Piquet', country: 'BR', years: '1978–1991', stats: { c: 60, w: 50, p: 50, q: 55, f: 55, r: 60, h: 65, l: 60, d: 65 } },
  { id: 'kimi-raikkonen', name: 'Kimi Räikkönen', country: 'FI', years: '2001–2021', stats: { c: 35, w: 45, p: 60, q: 50, f: 60, r: 45, h: 60, l: 90, d: 55 } },
  { id: 'nigel-mansell', name: 'Nigel Mansell', country: 'GB', years: '1980–1995', stats: { c: 35, w: 50, p: 55, q: 60, f: 55, r: 55, h: 60, l: 60, d: 65 } },
  { id: 'jackie-ickx', name: 'Jacky Ickx', country: 'BE', years: '1966–1979', stats: { c: 25, w: 35, p: 50, q: 45, f: 50, r: 50, h: 60, l: 55, d: 50 } },
  { id: 'stirling-moss', name: 'Stirling Moss', country: 'GB', years: '1951–1961', stats: { c: 30, w: 40, p: 45, q: 50, f: 55, r: 65, h: 70, l: 35, d: 60 } },
  { id: 'mika-hakkinen', name: 'Mika Häkkinen', country: 'FI', years: '1991–2001', stats: { c: 50, w: 45, p: 50, q: 60, f: 55, r: 50, h: 65, l: 45, d: 65 } },
  { id: 'damon-hill', name: 'Damon Hill', country: 'GB', years: '1992–1999', stats: { c: 25, w: 35, p: 45, q: 45, f: 45, r: 45, h: 50, l: 35, d: 55 } },
  { id: 'graham-hill', name: 'Graham Hill', country: 'GB', years: '1958–1975', stats: { c: 30, w: 30, p: 40, q: 35, f: 40, r: 40, h: 55, l: 65, d: 50 } },
  { id: 'jenson-button', name: 'Jenson Button', country: 'GB', years: '2000–2016', stats: { c: 28, w: 35, p: 45, q: 35, f: 45, r: 35, h: 50, l: 75, d: 45 } },
];

const FLAG_EMOJI = { GB: '🇬🇧', DE: '🇩🇪', NL: '🇳🇱', BR: '🇧🇷', AR: '🇦🇷', FR: '🇫🇷', AT: '🇦🇹', ES: '🇪🇸', FI: '🇫🇮', BE: '🇧🇪' };

const METRIC_LABELS = {
  c: 'Championships', w: 'Wins', p: 'Podiums', q: 'Poles', f: 'Fastest Laps',
  r: 'Win Rate', h: 'Teammate H2H', l: 'Longevity', d: 'Peak Dominance',
};

// ============================================================
// SCORING ENGINE (pure)
// ============================================================

function score(driverStats, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let sum = 0;
  for (const key in weights) sum += (driverStats[key] || 0) * weights[key];
  return Math.round((sum / total) * 10) / 10;
}

function rank(drivers, weights) {
  return drivers
    .map(d => ({ ...d, score: score(d.stats, weights) }))
    .sort((a, b) => b.score - a.score);
}

// ============================================================
// COMPONENT
// ============================================================

export default function F1GoatCalculator() {
  const [presetId, setPresetId] = useState('era-adjusted');
  const [era, setEra] = useState('all');
  const [customWeights, setCustomWeights] = useState(PRESETS[0].weights);
  const [mode, setMode] = useState('preset'); // 'preset' | 'custom'

  const activeWeights = mode === 'custom'
    ? customWeights
    : PRESETS.find(p => p.id === presetId).weights;

  const ranked = useMemo(() => rank(DRIVERS, activeWeights), [activeWeights]);

  const handlePreset = (id) => {
    setPresetId(id);
    setMode('preset');
    setCustomWeights(PRESETS.find(p => p.id === id).weights);
  };

  const handleSlider = (key, value) => {
    setCustomWeights(w => ({ ...w, [key]: value }));
    setMode('custom');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0b',
        color: '#e8e8e8',
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        padding: '0',
      }}
    >
      {/* --- HEADER --- */}
      <header
        style={{
          borderBottom: '1px solid #1f1f22',
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: '28px',
              fontWeight: 700,
              fontVariationSettings: '"opsz" 96',
              letterSpacing: '-0.02em',
            }}
          >
            f1<span style={{ color: '#ef3340' }}>·</span>versus
          </span>
          <span style={{ fontSize: '12px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            GOAT Calculator
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#999' }}>
          <a style={{ color: '#e8e8e8', cursor: 'pointer' }}>Ranking</a>
          <a style={{ cursor: 'pointer' }}>Battle</a>
          <a style={{ cursor: 'pointer' }}>Methodology</a>
        </nav>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 32px 96px' }}>
        {/* --- HERO --- */}
        <section style={{ marginBottom: '48px' }}>
          <h1
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: 'clamp(40px, 6vw, 72px)',
              fontWeight: 400,
              fontVariationSettings: '"opsz" 144, "wght" 400',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              margin: '0 0 16px',
              maxWidth: '900px',
            }}
          >
            Settle the <em style={{ fontVariationSettings: '"opsz" 144, "wght" 500', fontStyle: 'italic', color: '#ef3340' }}>GOAT</em> debate.
            <br />
            Your formula, your ranking.
          </h1>
          <p style={{ fontSize: '17px', color: '#999', maxWidth: '620px', lineHeight: 1.5, margin: 0 }}>
            75 years of Formula 1 data. Six pre-built definitions of greatness, or build your own.
            Share the ranking, start the argument.
          </p>
        </section>

        {/* --- ERA FILTER --- */}
        <section style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Era
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ERAS.map(e => (
              <button
                key={e.id}
                onClick={() => setEra(e.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: '1px solid ' + (era === e.id ? '#ef3340' : '#2a2a2e'),
                  background: era === e.id ? 'rgba(239,51,64,0.08)' : 'transparent',
                  color: era === e.id ? '#fff' : '#aaa',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {e.label}
                <span style={{ fontSize: '11px', color: era === e.id ? 'rgba(255,255,255,0.6)' : '#555', fontFamily: '"JetBrains Mono", monospace' }}>
                  {e.range}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* --- PRESET CHIPS --- */}
        <section style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Formula</span>
            <button
              onClick={() => setMode(mode === 'custom' ? 'preset' : 'custom')}
              style={{
                color: mode === 'custom' ? '#ef3340' : '#888',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'inherit',
              }}
            >
              <Sliders size={12} />
              Custom mode
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {PRESETS.map(p => {
              const active = mode === 'preset' && presetId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid ' + (active ? '#ef3340' : '#1f1f22'),
                    background: active ? 'linear-gradient(135deg, rgba(239,51,64,0.12), rgba(239,51,64,0.02))' : '#101012',
                    color: '#e8e8e8',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                >
                  <div style={{
                    fontFamily: '"Fraunces", serif',
                    fontSize: '17px',
                    fontWeight: 600,
                    fontVariationSettings: '"opsz" 36',
                    marginBottom: '4px',
                    letterSpacing: '-0.01em',
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.4 }}>{p.blurb}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* --- CUSTOM SLIDERS (visible when custom mode) --- */}
        {mode === 'custom' && (
          <section
            style={{
              marginBottom: '32px',
              padding: '20px',
              border: '1px solid #1f1f22',
              borderRadius: '12px',
              background: '#0d0d0f',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 24px' }}>
              {Object.entries(METRIC_LABELS).map(([key, label]) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#bbb' }}>{label}</span>
                    <span style={{ color: '#ef3340', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>
                      {customWeights[key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={customWeights[key]}
                    onChange={(e) => handleSlider(key, parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#ef3340',
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- SHARE BAR --- */}
        <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <Trophy size={11} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px' }} />
            Top 20 — {mode === 'custom' ? 'Custom Formula' : PRESETS.find(p => p.id === presetId).label}
          </div>
          <button
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              border: '1px solid #2a2a2e',
              background: '#161618',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
            }}
          >
            <Share2 size={13} />
            Share ranking
          </button>
        </section>

        {/* --- RANKING LIST --- */}
        <section>
          <AnimatePresence>
            {ranked.map((d, idx) => (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] }, delay: idx * 0.015 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr auto auto',
                  alignItems: 'center',
                  gap: '20px',
                  padding: '18px 20px',
                  borderBottom: '1px solid #161618',
                  background: idx === 0 ? 'linear-gradient(90deg, rgba(239,51,64,0.06), transparent 40%)' : 'transparent',
                }}
              >
                <div
                  style={{
                    fontFamily: '"Fraunces", serif',
                    fontVariationSettings: '"opsz" 144, "wght" 700',
                    fontSize: idx === 0 ? '56px' : '36px',
                    lineHeight: 1,
                    color: idx === 0 ? '#ef3340' : idx < 3 ? '#fff' : '#555',
                    letterSpacing: '-0.04em',
                  }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px' }}>{FLAG_EMOJI[d.country] || '🏁'}</span>
                    <span
                      style={{
                        fontFamily: '"Fraunces", serif',
                        fontSize: '20px',
                        fontWeight: 500,
                        fontVariationSettings: '"opsz" 48',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {d.name}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', fontFamily: '"JetBrains Mono", monospace' }}>
                    {d.years}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '28px',
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {d.score.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Score
                  </div>
                </div>
                <button
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #1f1f22',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Versus mode"
                >
                  <ArrowLeftRight size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </section>

        {/* --- FOOTER --- */}
        <footer
          style={{
            marginTop: '64px',
            paddingTop: '24px',
            borderTop: '1px solid #1f1f22',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#555',
          }}
        >
          <span>
            Data: <a style={{ color: '#888' }}>F1DB</a> · Unofficial · Built by <a style={{ color: '#ef3340' }}>Nokta Studio</a>
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>v0.1.0</span>
        </footer>
      </main>
    </div>
  );
}
