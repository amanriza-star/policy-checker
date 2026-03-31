import { useState, useEffect, useCallback, useRef } from 'react'
import { parseFile, compareRecords, downloadReport } from './parser'
import { loadUploads, saveUploads, clearUploads } from './storage'

/* ─── Formatting helpers ─── */
function fmtNum(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/* ─── Small components ─── */
function Badge({ color, children }) {
  const colors = {
    red:   { bg: 'var(--red-dim)',    fg: 'var(--red)' },
    green: { bg: 'var(--green-dim)',  fg: 'var(--green)' },
    amber: { bg: 'var(--amber-dim)',  fg: 'var(--amber)' },
    blue:  { bg: 'var(--accent-glow)', fg: 'var(--accent)' },
  }
  const c = colors[color] || colors.blue
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 16, fontSize: 12, fontWeight: 600,
      fontFamily: 'var(--font-mono)',
      background: c.bg, color: c.fg,
    }}>
      {children}
    </span>
  )
}

function StatCard({ label, value, color, icon, delay }) {
  const fg = {
    red: 'var(--red)', green: 'var(--green)',
    amber: 'var(--amber)', blue: 'var(--accent)',
  }
  return (
    <div className={delay} style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '22px 26px',
      flex: '1 1 200px',
      minWidth: 180,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 80, height: 80, borderRadius: '50%',
        background: fg[color] || 'var(--accent)',
        opacity: 0.06, filter: 'blur(20px)',
      }} />
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, color: fg[color] || 'var(--text)',
        fontFamily: 'var(--font-mono)', letterSpacing: -1,
      }}>
        {icon && <span style={{ marginRight: 8, fontSize: 22 }}>{icon}</span>}
        {value}
      </div>
    </div>
  )
}

function DataTable({ columns, rows, emptyMsg }) {
  if (!rows.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '50px 20px',
        color: 'var(--text-dim)', fontSize: 14,
      }}>
        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>✓</div>
        {emptyMsg || 'Нет данных'}
      </div>
    )
  }
  return (
    <div style={{
      overflowX: 'auto', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{
                textAlign: col.align || 'left',
                padding: '11px 14px',
                background: 'var(--surface)',
                color: 'var(--text-dim)',
                fontWeight: 600,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ transition: 'background 0.12s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = ri % 2 ? 'rgba(255,255,255,0.015)' : 'transparent'}
            >
              {columns.map((col, ci) => (
                <td key={ci} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                  whiteSpace: col.nowrap ? 'nowrap' : 'normal',
                  textAlign: col.align || 'left',
                  maxWidth: col.maxW || 'auto',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Main App ─── */
export default function App() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [selectedPrev, setSelectedPrev] = useState(null)
  const [selectedCurr, setSelectedCurr] = useState(null)
  const [activeTab, setActiveTab] = useState('disappeared')
  const fileRef = useRef()

  // Load on mount
  useEffect(() => {
    const saved = loadUploads()
    setUploads(saved)
    if (saved.length >= 2) {
      setSelectedPrev(saved.length - 2)
      setSelectedCurr(saved.length - 1)
    }
  }, [])

  // Save on change
  useEffect(() => {
    saveUploads(uploads)
  }, [uploads])

  // Auto-compare
  useEffect(() => {
    if (selectedPrev != null && selectedCurr != null &&
        uploads[selectedPrev] && uploads[selectedCurr]) {
      const res = compareRecords(uploads[selectedPrev].records, uploads[selectedCurr].records)
      setResult(res)
    } else {
      setResult(null)
    }
  }, [selectedPrev, selectedCurr, uploads])

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const records = await parseFile(file)
      const label = prompt(
        'Введите дату отчёта (например: 01.03.2026):',
        new Date().toLocaleDateString('ru-RU')
      )
      if (!label) { setLoading(false); return }

      const next = [...uploads, { label, date: Date.now(), records, fileName: file.name }]
      setUploads(next)
      if (next.length >= 2) {
        setSelectedPrev(next.length - 2)
        setSelectedCurr(next.length - 1)
      } else {
        setSelectedCurr(0)
      }
    } catch (err) {
      setError(typeof err === 'string' ? err : err.message)
    }
    setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [uploads])

  const handleDelete = (idx) => {
    if (!confirm(`Удалить отчёт «${uploads[idx].label}»?`)) return
    const next = uploads.filter((_, i) => i !== idx)
    setUploads(next)
    setSelectedPrev(null)
    setSelectedCurr(null)
    setResult(null)
  }

  const handleClearAll = () => {
    if (!confirm('Удалить все загруженные отчёты?')) return
    clearUploads()
    setUploads([])
    setSelectedPrev(null)
    setSelectedCurr(null)
    setResult(null)
  }

  const tabs = [
    { id: 'disappeared', label: 'Исчезнувшие', count: result?.disappeared?.length, color: 'red', icon: '▼' },
    { id: 'appeared',    label: 'Новые',       count: result?.appeared?.length,    color: 'green', icon: '▲' },
    { id: 'changed',     label: 'Расхождения', count: result?.changed?.length,    color: 'amber', icon: '◆' },
  ]

  // Column definitions
  const disappCols = [
    { key: 'kus',      label: 'КУС',                 nowrap: true, mono: true },
    { key: 'policy',   label: 'Полис',               nowrap: true, mono: true },
    { key: 'holder',   label: 'Страхователь',        maxW: 280 },
    { key: 'beneficiary', label: 'Выгодоприобретатель', maxW: 220 },
    { key: 'rznu',     label: 'РЗНУ',     align: 'right', mono: true, render: (r) => fmtNum(r.rznu) },
    { key: 'share',    label: 'Доля перестр.', align: 'right', mono: true, render: (r) => fmtNum(r.reinsurerShare) },
  ]
  const appearedCols = [...disappCols]

  const changedCols = [
    { key: 'kus',    label: 'КУС',    nowrap: true, mono: true },
    { key: 'policy', label: 'Полис',  nowrap: true, mono: true },
    { key: 'holder', label: 'Страхователь', maxW: 220 },
    { key: 'prevR',  label: `РЗНУ (${uploads[selectedPrev]?.label || 'пред.'})`,  align: 'right', mono: true, render: (r) => fmtNum(r.prevRznu) },
    { key: 'currR',  label: `РЗНУ (${uploads[selectedCurr]?.label || 'тек.'})`,   align: 'right', mono: true, render: (r) => fmtNum(r.currRznu) },
    { key: 'diffR',  label: 'Δ РЗНУ', align: 'right', mono: true, render: (r) => (
      <span style={{ color: r.diffRznu > 0 ? 'var(--green)' : r.diffRznu < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
        {r.diffRznu > 0 ? '+' : ''}{fmtNum(r.diffRznu)}
      </span>
    )},
    { key: 'prevS',  label: `Доля (${uploads[selectedPrev]?.label || 'пред.'})`, align: 'right', mono: true, render: (r) => fmtNum(r.prevShare) },
    { key: 'currS',  label: `Доля (${uploads[selectedCurr]?.label || 'тек.'})`,  align: 'right', mono: true, render: (r) => fmtNum(r.currShare) },
    { key: 'diffS',  label: 'Δ Доля', align: 'right', mono: true, render: (r) => (
      <span style={{ color: r.diffShare > 0 ? 'var(--green)' : r.diffShare < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
        {r.diffShare > 0 ? '+' : ''}{fmtNum(r.diffShare)}
      </span>
    )},
  ]

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>

      {/* ─── Header ─── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '28px 0',
        background: 'linear-gradient(180deg, var(--surface) 0%, transparent 100%)',
      }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>
              🛡
            </div>
            <div>
              <h1 style={{
                fontSize: 20, fontWeight: 700, margin: 0,
                letterSpacing: -0.3,
              }}>
                Контроль полисов
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                Журнал учёта неурегулированных убытков · Форма 2
              </p>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 32px' }}>

        {/* ─── Upload bar ─── */}
        <div className="animate-fade" style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          marginBottom: 24,
        }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 24px',
            background: 'var(--accent)',
            color: '#fff', borderRadius: 'var(--radius)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            transition: 'all 0.15s',
            opacity: loading ? 0.6 : 1,
            boxShadow: '0 2px 12px rgba(59,130,246,0.3)',
          }}>
            {loading ? (
              <span>⏳ Обработка...</span>
            ) : (
              <span>+ Загрузить отчёт</span>
            )}
            <input
              ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm"
              style={{ display: 'none' }}
              onChange={handleFile} disabled={loading}
            />
          </label>

          {uploads.length > 0 && (
            <button onClick={handleClearAll} style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-muted)', fontSize: 12,
              cursor: 'pointer', transition: 'color 0.15s',
            }}
              onMouseEnter={(e) => e.target.style.color = 'var(--red)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
            >
              Очистить всё
            </button>
          )}
        </div>

        {/* ─── Error ─── */}
        {error && (
          <div className="animate-fade" style={{
            padding: '14px 18px',
            background: 'var(--red-dim)',
            border: '1px solid rgba(244,63,94,0.2)',
            borderRadius: 'var(--radius)',
            color: 'var(--red)', fontSize: 13,
            marginBottom: 20,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ─── Uploaded files chips ─── */}
        {uploads.length > 0 && (
          <div className="animate-fade" style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 1,
              marginBottom: 10,
            }}>
              Загруженные отчёты
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {uploads.map((u, i) => {
                const isSelected = i === selectedPrev || i === selectedCurr
                return (
                  <div key={i} style={{
                    padding: '8px 14px',
                    background: isSelected ? 'var(--surface-raised)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}>
                    {isSelected && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--accent)',
                        boxShadow: '0 0 6px var(--accent)',
                      }} />
                    )}
                    <span style={{ fontWeight: 600 }}>{u.label}</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--text-dim)',
                    }}>
                      {u.records.length}
                    </span>
                    <button
                      onClick={() => handleDelete(i)}
                      style={{
                        background: 'none', border: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        fontSize: 16, padding: '0 2px', lineHeight: 1,
                      }}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Period selector ─── */}
        {uploads.length >= 2 && (
          <div className="animate-fade" style={{
            display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
            marginBottom: 28,
            padding: '14px 20px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            <span style={{
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 1,
            }}>
              Сравнить
            </span>
            <select
              value={selectedPrev ?? ''}
              onChange={(e) => setSelectedPrev(e.target.value === '' ? null : Number(e.target.value))}
              style={{
                padding: '7px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)', fontSize: 13,
                fontFamily: 'var(--font-display)',
              }}
            >
              <option value="">— Предыдущий —</option>
              {uploads.map((u, i) => (
                <option key={i} value={i}>{u.label} ({u.records.length})</option>
              ))}
            </select>
            <span style={{
              color: 'var(--accent)', fontSize: 16, fontFamily: 'var(--font-mono)',
            }}>→</span>
            <select
              value={selectedCurr ?? ''}
              onChange={(e) => setSelectedCurr(e.target.value === '' ? null : Number(e.target.value))}
              style={{
                padding: '7px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)', fontSize: 13,
                fontFamily: 'var(--font-display)',
              }}
            >
              <option value="">— Текущий —</option>
              {uploads.map((u, i) => (
                <option key={i} value={i}>{u.label} ({u.records.length})</option>
              ))}
            </select>
          </div>
        )}

        {/* ─── Results ─── */}
        {result && (
          <>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
              <StatCard delay="animate-slide-d1" label="Исчезнувшие полисы" value={result.disappeared.length} color="red" icon="▼" />
              <StatCard delay="animate-slide-d2" label="Новые полисы" value={result.appeared.length} color="green" icon="▲" />
              <StatCard delay="animate-slide-d3" label="Расхождения" value={result.changed.length} color="amber" icon="◆" />
              <StatCard delay="animate-slide-d4" label="Всего записей" value={uploads[selectedCurr]?.records?.length || 0} color="blue" icon="Σ" />
            </div>

            {/* Download */}
            {(result.disappeared.length > 0 || result.changed.length > 0) && (
              <div className="animate-fade" style={{ marginBottom: 20 }}>
                <button
                  onClick={() => downloadReport(
                    result.disappeared, result.changed,
                    uploads[selectedPrev]?.label || 'пред.',
                    uploads[selectedCurr]?.label || 'тек.'
                  )}
                  style={{
                    padding: '10px 22px',
                    background: 'linear-gradient(135deg, var(--green), #059669)',
                    color: '#fff', border: 'none',
                    borderRadius: 'var(--radius)', fontSize: 13,
                    fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 2px 12px rgba(16,185,129,0.3)',
                  }}
                >
                  ↓ Скачать отчёт в Excel
                </button>
              </div>
            )}

            {/* Tabs */}
            <div style={{
              display: 'flex', gap: 2, marginBottom: 16,
              borderBottom: '1px solid var(--border)',
            }}>
              {tabs.map((t) => (
                <button key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '10px 18px',
                    background: activeTab === t.id ? 'var(--surface)' : 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`,
                    color: activeTab === t.id ? 'var(--text)' : 'var(--text-dim)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.6 }}>{t.icon}</span>
                  {t.label}
                  {t.count > 0 && <Badge color={t.color}>{t.count}</Badge>}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="animate-fade" style={{ maxHeight: 600, overflow: 'auto' }}>
              {activeTab === 'disappeared' && (
                <DataTable columns={disappCols} rows={result.disappeared}
                  emptyMsg="Все полисы на месте ✓" />
              )}
              {activeTab === 'appeared' && (
                <DataTable columns={appearedCols} rows={result.appeared}
                  emptyMsg="Нет новых полисов" />
              )}
              {activeTab === 'changed' && (
                <DataTable columns={changedCols} rows={result.changed}
                  emptyMsg="Все значения РЗНУ и Доли совпадают ✓" />
              )}
            </div>
          </>
        )}

        {/* ─── Empty states ─── */}
        {uploads.length === 0 && !error && (
          <div className="animate-slide" style={{
            textAlign: 'center', padding: '100px 20px',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'var(--accent-glow)',
              border: '1px solid rgba(59,130,246,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 30,
            }}>
              📊
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Загрузите первый файл
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-dim)',
              maxWidth: 460, margin: '0 auto', lineHeight: 1.7,
            }}>
              Загрузите файл .xls или .xlsx с листом «Форма 2».<br />
              После загрузки второго файла система сравнит данные:
              найдёт исчезнувшие полисы и расхождения в РЗНУ
              и доле перестраховщика.
            </div>
          </div>
        )}

        {uploads.length === 1 && !error && (
          <div className="animate-slide" style={{
            textAlign: 'center', padding: '80px 20px',
          }}>
            <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              «{uploads[0].label}» загружен — {uploads[0].records.length} записей
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Загрузите файл за следующий месяц для сравнения.
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
