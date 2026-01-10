'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  Filter,
  Loader2,
  Palette,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { analyzeSosiText } from '../lib/sosi/analyze.js';
import { cleanSosiText } from '../lib/sosi/clean.js';
import {
  decodeSosiArrayBuffer,
  encodeSosiTextToBytes,
} from '../lib/sosi/browserEncoding.js';

const STORAGE_KEY = 'sosi-rens:v0';
const THEME_KEY = 'sosi-rens:theme';
const HOSTED_BODY_LIMIT_BYTES = 2_000_000;

const THEMES = {
  neutral: {
    label: 'Nøytral',
    appBg: 'bg-zinc-50',
    headerBg: 'bg-white/80 backdrop-blur',
    surface: 'bg-white',
    surfaceMuted: 'bg-zinc-50',
    border: 'border-zinc-200',
    text: 'text-zinc-950',
    muted: 'text-zinc-600',
    primary: 'bg-zinc-900 hover:bg-zinc-800',
    primarySoft: 'bg-zinc-100 hover:bg-zinc-200',
    primaryRing: 'focus-visible:ring-zinc-400',
    hoverSurfaceMuted: 'hover:bg-zinc-50',
    tabList: 'bg-zinc-100',
    tabActive: 'bg-white text-zinc-950 shadow-sm',
    tabInactive: 'text-zinc-700 hover:text-zinc-950',
    accentBar: 'bg-zinc-900',
    accentSoft: 'bg-zinc-50',
    hoverAccentSoft: 'hover:bg-zinc-50',
  },
  ocean: {
    label: 'Hav',
    appBg: 'bg-slate-50',
    headerBg: 'bg-white/80 backdrop-blur',
    surface: 'bg-white',
    surfaceMuted: 'bg-indigo-50/50',
    border: 'border-slate-200',
    text: 'text-slate-950',
    muted: 'text-slate-600',
    primary: 'bg-indigo-600 hover:bg-indigo-700',
    primarySoft: 'bg-indigo-50 hover:bg-indigo-100',
    primaryRing: 'focus-visible:ring-indigo-400',
    hoverSurfaceMuted: 'hover:bg-indigo-50/50',
    tabList: 'bg-indigo-50',
    tabActive: 'bg-indigo-600 text-white shadow-sm',
    tabInactive: 'text-indigo-900/80 hover:text-indigo-950',
    accentBar: 'bg-indigo-600',
    accentSoft: 'bg-indigo-50',
    hoverAccentSoft: 'hover:bg-indigo-50',
  },
  forest: {
    label: 'Skog',
    appBg: 'bg-zinc-50',
    headerBg: 'bg-white/80 backdrop-blur',
    surface: 'bg-white',
    surfaceMuted: 'bg-emerald-50/50',
    border: 'border-zinc-200',
    text: 'text-zinc-950',
    muted: 'text-zinc-600',
    primary: 'bg-emerald-600 hover:bg-emerald-700',
    primarySoft: 'bg-emerald-50 hover:bg-emerald-100',
    primaryRing: 'focus-visible:ring-emerald-400',
    hoverSurfaceMuted: 'hover:bg-emerald-50/50',
    tabList: 'bg-emerald-50',
    tabActive: 'bg-emerald-600 text-white shadow-sm',
    tabInactive: 'text-emerald-900/80 hover:text-emerald-950',
    accentBar: 'bg-emerald-600',
    accentSoft: 'bg-emerald-50',
    hoverAccentSoft: 'hover:bg-emerald-50',
  },
};

function sortEntriesDesc(obj) {
  return Object.entries(obj || {}).sort(
    (a, b) =>
      (b[1] || 0) - (a[1] || 0) ||
      String(a[0]).localeCompare(String(b[0]))
  );
}

function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Kunne ikke lese fil.'));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '{}')));
      } catch {
        reject(new Error('Ugyldig JSON-fil.'));
      }
    };
    reader.readAsText(file);
  });
}

function forEachLine(text, onLine) {
  const str = String(text || '');
  let start = 0;
  for (;;) {
    const idx = str.indexOf('\n', start);
    if (idx === -1) {
      const last = str.slice(start);
      onLine(last.endsWith('\r') ? last.slice(0, -1) : last);
      return;
    }
    const line = str.slice(start, idx);
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
    start = idx + 1;
  }
}

function isFeatureStartLine(line) {
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(String(line));
}

function getSectionName(line) {
  const match = String(line).match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

function computeValueFrequencyForField(
  sosiText,
  fieldKeyUpper,
  category
) {
  const counts = new Map();
  let currentCategory = 'unknown';
  let currentSection = null;

  forEachLine(sosiText, (rawLine) => {
    const line = String(rawLine || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      return;
    }

    if (currentCategory !== category) return;

    if (!(line.startsWith('..') || line.startsWith('...'))) return;
    const match = line.match(/^\.{2,}(\S+)(?:\s+(.*))?$/);
    if (!match) return;
    const key = String(match[1] || '').toUpperCase();
    if (key !== fieldKeyUpper) return;

    const value = String(match[2] || '').trim();
    const normalized = value ? value : '(tom)';
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  return Array.from(counts.entries()).sort(
    (a, b) =>
      (b[1] || 0) - (a[1] || 0) ||
      String(a[0]).localeCompare(String(b[0]))
  );
}

function StepButton({
  theme,
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}) {
  return (
    <button
      className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? `${theme.primary} ${theme.primaryRing} border-transparent text-white`
          : `${theme.surface} ${theme.text} ${theme.primaryRing} ${theme.border} ${theme.hoverSurfaceMuted}`
      } disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className={`h-4 w-4 ${active ? 'text-white' : ''}`} />
      <span>{label}</span>
    </button>
  );
}

function Tabs({ theme, value, onChange }) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border p-1 ${theme.border} ${theme.tabList}`}
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'punkter'}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          value === 'punkter' ? theme.tabActive : theme.tabInactive
        }`}
        onClick={() => onChange('punkter')}
      >
        Punkter
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'ledninger'}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          value === 'ledninger' ? theme.tabActive : theme.tabInactive
        }`}
        onClick={() => onChange('ledninger')}
      >
        Ledninger
      </button>
    </div>
  );
}

function LoadingOverlay({ theme, label }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div
        className={`w-full max-w-sm rounded-xl border p-5 shadow-lg ${theme.border} ${theme.surface}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <Loader2 className={`h-5 w-5 animate-spin ${theme.text}`} />
          <div>
            <div className={`text-base font-semibold ${theme.text}`}>
              {label || 'Behandler…'}
            </div>
            <div className={`mt-0.5 text-sm ${theme.muted}`}>
              Vennligst vent.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState('upload'); // upload | explore | filter | download
  const [activeTab, setActiveTab] = useState('punkter'); // punkter | ledninger

  const [themeKey, setThemeKey] = useState('neutral');
  const theme = THEMES[themeKey] || THEMES.neutral;

  const [file, setFile] = useState(null);
  const [fileArrayBuffer, setFileArrayBuffer] = useState(null);
  const [sosiText, setSosiText] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [encodingInfo, setEncodingInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const [backendInfo, setBackendInfo] = useState(null);
  const [processingMode, setProcessingMode] = useState(null); // 'browser' | 'api'

  const [expandedFieldsByCategory, setExpandedFieldsByCategory] =
    useState({ punkter: [], ledninger: [] });
  const [pivotCacheByCategory, setPivotCacheByCategory] = useState({
    punkter: {},
    ledninger: {},
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && THEMES[saved]) setThemeKey(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, themeKey);
    } catch {
      // ignore
    }
  }, [themeKey]);

  useEffect(() => {
    if (step !== 'upload') {
      dragCounterRef.current = 0;
      setDragActive(false);
      return;
    }

    const hasFiles = (dt) =>
      !!dt &&
      ((dt.types && Array.from(dt.types).includes('Files')) ||
        (dt.files && dt.files.length > 0));

    const onDragEnter = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragCounterRef.current += 1;
      setDragActive(true);
    };

    const onDragOver = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDragActive(true);
    };

    const onDragLeave = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragActive(false);
      }
    };

    const onDrop = () => {
      dragCounterRef.current = 0;
      setDragActive(false);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [step]);

  const [selection, setSelection] = useState({
    objTypesByCategory: { punkter: [], ledninger: [] },
    fieldsByCategory: { punkter: [], ledninger: [] },
    lastFileName: null,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSelection((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setBackendInfo(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      // ignore
    }
  }, [selection]);

  const exploreData = useMemo(() => {
    if (!analysis?.analysis) return null;
    const byCategory = analysis.analysis.byCategory || {};

    return {
      punkter: {
        features: byCategory.punkter?.features || 0,
        objTypes: sortEntriesDesc(byCategory.punkter?.objTypes || {}),
        fields: sortEntriesDesc(byCategory.punkter?.fields || {}),
        tema: sortEntriesDesc(byCategory.punkter?.pTema || {}),
      },
      ledninger: {
        features: byCategory.ledninger?.features || 0,
        objTypes: sortEntriesDesc(
          byCategory.ledninger?.objTypes || {}
        ),
        fields: sortEntriesDesc(byCategory.ledninger?.fields || {}),
        tema: sortEntriesDesc(byCategory.ledninger?.lTema || {}),
      },
    };
  }, [analysis]);

  const available = useMemo(() => {
    if (!exploreData) return null;
    return {
      punkter: {
        objTypes: exploreData.punkter.objTypes.map(([k]) => k),
        fields: exploreData.punkter.fields.map(([k]) => k),
      },
      ledninger: {
        objTypes: exploreData.ledninger.objTypes.map(([k]) => k),
        fields: exploreData.ledninger.fields.map(([k]) => k),
      },
    };
  }, [exploreData]);

  async function runAnalyzeClient(selectedFile) {
    setProcessingMode('browser');
    const arrayBuffer = await selectedFile.arrayBuffer();
    setFileArrayBuffer(arrayBuffer);

    const decoded = decodeSosiArrayBuffer(arrayBuffer);
    setSosiText(decoded.text);
    const analysisObj = analyzeSosiText(decoded.text);

    const payload = {
      file: {
        name: selectedFile.name || null,
        sizeBytes: arrayBuffer.byteLength,
      },
      encoding: decoded.encoding,
      analysis: analysisObj,
    };

    setAnalysis(payload);
    setEncodingInfo(payload.encoding || null);
    setStep('explore');
  }

  async function runAnalyze(selectedFile) {
    setError(null);
    setBusy(true);
    setBusyLabel('Analyserer fil…');
    setExpandedFieldsByCategory({ punkter: [], ledninger: [] });
    setPivotCacheByCategory({ punkter: {}, ledninger: {} });
    try {
      // Always analyze in-browser so we can support per-field value pivots.
      await runAnalyzeClient(selectedFile);
      setSelection((prev) => ({
        ...prev,
        lastFileName: selectedFile.name || null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  function ensureDefaultsFromAnalysis() {
    if (!available) return;
    setSelection((prev) => {
      const next = { ...prev };
      next.objTypesByCategory = {
        punkter: prev.objTypesByCategory?.punkter?.length
          ? prev.objTypesByCategory.punkter
          : available.punkter.objTypes,
        ledninger: prev.objTypesByCategory?.ledninger?.length
          ? prev.objTypesByCategory.ledninger
          : available.ledninger.objTypes,
      };
      next.fieldsByCategory = {
        punkter: prev.fieldsByCategory?.punkter?.length
          ? prev.fieldsByCategory.punkter
          : available.punkter.fields,
        ledninger: prev.fieldsByCategory?.ledninger?.length
          ? prev.fieldsByCategory.ledninger
          : available.ledninger.fields,
      };
      return next;
    });
  }

  useEffect(() => {
    // When analysis arrives, bootstrap selection if empty.
    if (!available) return;
    ensureDefaultsFromAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    available?.punkter?.objTypes?.length,
    available?.ledninger?.objTypes?.length,
  ]);

  function toggleInList(list, value) {
    const set = new Set(list || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return [...set];
  }

  function setAll(category, kind, values) {
    setSelection((prev) => {
      const next = { ...prev };
      next[`${kind}ByCategory`] = {
        ...prev[`${kind}ByCategory`],
        [category]: [...values],
      };
      return next;
    });
  }

  async function downloadCleanedClient() {
    if (!file) return;
    setProcessingMode('browser');
    const arrayBuffer = fileArrayBuffer || (await file.arrayBuffer());
    setFileArrayBuffer(arrayBuffer);

    const decoded = decodeSosiArrayBuffer(arrayBuffer);
    const cleanedText = cleanSosiText(decoded.text, {
      objTypesByCategory: selection.objTypesByCategory,
      fieldsByCategory: selection.fieldsByCategory,
    }).text;

    const outBytes = encodeSosiTextToBytes(
      cleanedText,
      decoded.encoding?.used || 'utf8'
    );
    const blob = new Blob([outBytes], {
      type: 'application/octet-stream',
    });

    const originalName = file.name || 'fil.sos';
    const cleanedName = originalName.replace(
      /(\.[^.]+)?$/,
      '-renset$1'
    );
    downloadBlob(blob, cleanedName);
  }

  async function downloadCleaned() {
    if (!file) return;
    setError(null);
    setBusy(true);
    setBusyLabel('Genererer renset fil…');
    try {
      if (backendInfo?.env === 'vercel') {
        await downloadCleanedClient();
        return;
      }

      if ((file?.size || 0) > HOSTED_BODY_LIMIT_BYTES) {
        await downloadCleanedClient();
        return;
      }

      setProcessingMode('api');
      const fd = new FormData();
      fd.set('file', file);
      fd.set(
        'selection',
        JSON.stringify({
          objTypesByCategory: selection.objTypesByCategory,
          fieldsByCategory: selection.fieldsByCategory,
        })
      );

      const res = await fetch('/api/clean', {
        method: 'POST',
        body: fd,
      });

      if (res.status === 413) {
        await downloadCleanedClient();
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Rensing feilet.');
      }

      const blob = await res.blob();
      const header = res.headers.get('Content-Disposition') || '';
      const match = header.match(/filename="([^"]+)"/);
      const name = match?.[1] || 'renset.sos';
      downloadBlob(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  function exportSettings() {
    const payload = {
      objTypesByCategory: selection.objTypesByCategory,
      fieldsByCategory: selection.fieldsByCategory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, 'sosi-rens-utvalg.json');
  }

  async function importSettingsFromFile(fileObj) {
    setError(null);
    try {
      const imported = await readJsonFile(fileObj);
      setSelection((prev) => ({
        ...prev,
        objTypesByCategory:
          imported.objTypesByCategory || prev.objTypesByCategory,
        fieldsByCategory:
          imported.fieldsByCategory || prev.fieldsByCategory,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function clearSavedSettings() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSelection({
      objTypesByCategory: { punkter: [], ledninger: [] },
      fieldsByCategory: { punkter: [], ledninger: [] },
      lastFileName: null,
    });
    if (available) ensureDefaultsFromAnalysis();
  }

  const tabData = exploreData ? exploreData[activeTab] : null;
  const selectedObjTypes =
    selection.objTypesByCategory?.[activeTab] || [];
  const selectedFields =
    selection.fieldsByCategory?.[activeTab] || [];

  const mandatoryFields = useMemo(
    () => new Set(['OBJTYPE', 'EGS_PUNKT', 'EGS_LEDNING']),
    []
  );

  const exploreFieldRows = useMemo(() => {
    if (!tabData) return [];
    const base = tabData.fields.map(([k, v]) => ({
      key: String(k),
      keyUpper: String(k).toUpperCase(),
      count: Number(v || 0),
    }));
    return [
      {
        key: 'OBJTYPE',
        keyUpper: 'OBJTYPE',
        count: Number(tabData.features || 0),
        isObjType: true,
      },
      ...base,
    ];
  }, [tabData]);

  function toggleExpandedField(category, fieldKeyUpper) {
    setExpandedFieldsByCategory((prev) => {
      const current = new Set(prev?.[category] || []);
      if (current.has(fieldKeyUpper)) current.delete(fieldKeyUpper);
      else current.add(fieldKeyUpper);
      return { ...prev, [category]: Array.from(current) };
    });
  }

  async function ensurePivot(category, fieldKeyUpper) {
    if (fieldKeyUpper === 'OBJTYPE') return;
    if (!sosiText) return;

    const existing =
      pivotCacheByCategory?.[category]?.[fieldKeyUpper];
    if (
      existing?.status === 'loading' ||
      existing?.status === 'ready'
    )
      return;

    setPivotCacheByCategory((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [fieldKeyUpper]: { status: 'loading', entries: [] },
      },
    }));

    // Allow UI to paint the expanded state before heavy work starts.
    await new Promise((r) => setTimeout(r, 0));

    const entries = computeValueFrequencyForField(
      sosiText,
      fieldKeyUpper,
      category
    );

    setPivotCacheByCategory((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [fieldKeyUpper]: { status: 'ready', entries },
      },
    }));
  }

  return (
    <div
      className={`h-screen overflow-hidden ${theme.appBg} ${theme.text}`}
    >
      <div className="flex h-full flex-col">
        <header
          className={`shrink-0 border-b ${theme.border} ${theme.headerBg}`}
        >
          <div className="mx-auto w-full max-w-7xl px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {step !== 'upload' ? (
                  <img
                    src="/sosi-rens-logo.svg"
                    alt="SOSI-Rens"
                    className="h-8 w-auto"
                  />
                ) : null}
                {step === 'upload' ? (
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight">
                      SOSI-Rens
                    </h1>
                    <div className={`text-sm ${theme.muted}`}>
                      Last opp → utforsk → filtrer → last ned
                    </div>
                  </div>
                ) : (
                  <h1 className="sr-only">SOSI-Rens</h1>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${theme.border} ${theme.surface}`}
                >
                  <Palette className="h-4 w-4" />
                  <span className={theme.muted}>Tema</span>
                  <select
                    className={`ml-1 bg-transparent text-sm font-semibold outline-none ${theme.text}`}
                    value={themeKey}
                    onChange={(e) => setThemeKey(e.target.value)}
                  >
                    {Object.entries(THEMES).map(([key, t]) => (
                      <option key={key} value={key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StepButton
                theme={theme}
                active={step === 'upload'}
                disabled={busy}
                icon={Upload}
                label="1. Last opp"
                onClick={() => setStep('upload')}
              />
              <StepButton
                theme={theme}
                active={step === 'explore'}
                disabled={busy || !analysis}
                icon={Settings2}
                label="2. Utforsk"
                onClick={() => analysis && setStep('explore')}
              />
              <StepButton
                theme={theme}
                active={step === 'filter'}
                disabled={busy || !analysis}
                icon={Filter}
                label="3. Filtrer"
                onClick={() => analysis && setStep('filter')}
              />
              <StepButton
                theme={theme}
                active={step === 'download'}
                disabled={busy || !analysis}
                icon={Download}
                label="4. Last ned"
                onClick={() => analysis && setStep('download')}
              />
            </div>

            <div className={`mt-2 text-xs ${theme.muted}`}>
              Backend: {backendInfo?.env || 'ukjent'}
              {backendInfo?.commit ? ` (${backendInfo.commit})` : ''}
              {processingMode
                ? ` · Behandling: ${
                    processingMode === 'browser'
                      ? 'nettleser'
                      : 'server'
                  }`
                : ''}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto h-full w-full max-w-7xl px-6 py-6">
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                {error}
              </div>
            ) : null}

            {encodingInfo?.fallbackUsed ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                Filen ble tolket med tegnsett «{encodingInfo.used}».
              </div>
            ) : null}

            {step === 'upload' ? (
              <section className="flex h-full flex-col">
                <div
                  className={`rounded-xl border p-6 ${theme.border} ${theme.surface} flex h-full flex-col`}
                >
                  <img
                    src="/sosi-rens-logo.svg"
                    alt="SOSI-Rens"
                    className="mx-auto mb-6 h-20 w-auto"
                  />
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Last opp SOSI-fil
                  </h2>
                  <p className={`mt-1 text-sm ${theme.muted}`}>
                    Støtter <span className="font-mono">.sos</span> og{' '}
                    <span className="font-mono">.sosi</span>. Analyse
                    starter automatisk.
                  </p>

                  <div
                    className={`mt-5 flex flex-1 flex-col rounded-xl border-2 border-dashed p-6 transition-colors ${
                      dragActive ? theme.accentSoft : theme.surfaceMuted
                    } ${theme.border}`}
                    onClick={() => {
                      if (busy) return;
                      fileInputRef.current?.click();
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      const f = e.dataTransfer.files?.[0] || null;
                      if (!f || busy) return;
                      setAnalysis(null);
                      setEncodingInfo(null);
                      setSosiText(null);
                      setFile(f);
                      runAnalyze(f);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (busy) return;
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <FileUp className="mt-0.5 h-5 w-5" />
                      <div className="min-w-0">
                        <div className="text-base font-semibold">
                          Dra og slipp fil her
                        </div>
                        <div className={`mt-0.5 text-sm ${theme.muted}`}>
                          Eller klikk for å velge fil.
                        </div>
                        <div className={`mt-3 text-xs ${theme.muted}`}>
                          Tips: Store filer analyseres i nettleseren.
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <button
                        type="button"
                        disabled={busy}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing} disabled:opacity-50`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (busy) return;
                          fileInputRef.current?.click();
                        }}
                      >
                        <Upload className="h-4 w-4" />
                        Velg fil
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".sos,.sosi"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          if (!f) return;
                          setAnalysis(null);
                          setEncodingInfo(null);
                          setSosiText(null);
                          setFile(f);
                          runAnalyze(f);
                          e.target.value = '';
                        }}
                      />
                    </div>

                    {file ? (
                      <div
                        className={`mt-6 rounded-lg border p-3 ${theme.border} ${theme.surface}`}
                      >
                        <div className={`text-xs ${theme.muted}`}>
                          Valgt fil
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {file.name}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 'explore' && exploreData ? (
              <section className="flex h-full flex-col">
                <div
                  className={`flex h-full flex-col rounded-xl border p-4 ${theme.border} ${theme.surface}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Utforsk data
                      </h2>
                      <div className={`mt-1 text-sm ${theme.muted}`}>
                        Utvid et felt for å se fordeling av verdier.
                      </div>
                      <div className="mt-2">
                        <Tabs
                          theme={theme}
                          value={activeTab}
                          onChange={setActiveTab}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
                      <div
                        className={`rounded-lg border px-3 py-2 ${theme.border} ${theme.surfaceMuted}`}
                      >
                        <div className={`text-xs ${theme.muted}`}>
                          Antall objekter
                        </div>
                        <div className="mt-0.5 text-xl font-semibold tabular-nums">
                          {tabData.features.toLocaleString('nb-NO')}
                        </div>
                      </div>
                      <div
                        className={`rounded-lg border px-3 py-2 ${theme.border} ${theme.surfaceMuted}`}
                      >
                        <div className={`text-xs ${theme.muted}`}>
                          Unike objekttyper
                        </div>
                        <div className="mt-0.5 text-xl font-semibold tabular-nums">
                          {tabData.objTypes.length.toLocaleString(
                            'nb-NO'
                          )}
                        </div>
                      </div>
                      <div
                        className={`rounded-lg border px-3 py-2 ${theme.border} ${theme.surfaceMuted}`}
                      >
                        <div className={`text-xs ${theme.muted}`}>
                          Unike felter
                        </div>
                        <div className="mt-0.5 text-xl font-semibold tabular-nums">
                          {tabData.fields.length.toLocaleString(
                            'nb-NO'
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                    <div
                      className={`flex h-full flex-col overflow-hidden rounded-xl border ${theme.border}`}
                    >
                      <div
                        className={`px-4 py-2 text-sm font-semibold ${theme.surfaceMuted}`}
                      >
                        Felter (klikk for å utvide)
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {exploreFieldRows.map((row) => {
                          const isExpanded = (
                            expandedFieldsByCategory?.[activeTab] ||
                            []
                          ).includes(row.keyUpper);
                          const pivot = row.isObjType
                            ? {
                                status: 'ready',
                                entries: tabData.objTypes,
                              }
                            : pivotCacheByCategory?.[activeTab]?.[
                                row.keyUpper
                              ];

                          return (
                            <div
                              key={row.keyUpper}
                              className="border-t"
                            >
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${theme.hoverAccentSoft}`}
                                onClick={async () => {
                                  toggleExpandedField(
                                    activeTab,
                                    row.keyUpper
                                  );
                                  if (!isExpanded) {
                                    await ensurePivot(
                                      activeTab,
                                      row.keyUpper
                                    );
                                  }
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">
                                      {row.key}
                                    </div>
                                    <div
                                      className={`text-xs ${theme.muted}`}
                                    >
                                      Forekomst:{' '}
                                      {Number(
                                        row.count || 0
                                      ).toLocaleString('nb-NO')}
                                    </div>
                                  </div>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div
                                  className={`px-4 pb-4 ${theme.surface}`}
                                >
                                  {pivot?.status === 'loading' ? (
                                    <div
                                      className={`flex items-center gap-2 py-3 text-sm ${theme.muted}`}
                                    >
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Beregner fordeling…
                                    </div>
                                  ) : null}

                                  {pivot?.status === 'ready' ? (
                                      <div
                                        className={`mt-2 overflow-hidden rounded-lg border ${theme.border}`}
                                      >
                                        <div className="mx-auto w-full max-w-xl">
                                          <div
                                            className={`grid grid-cols-[minmax(0,1fr)_7rem] border-b px-3 py-2 text-xs font-semibold ${theme.surfaceMuted} ${theme.muted}`}
                                          >
                                            <div>Verdi</div>
                                            <div className="text-right">Antall</div>
                                          </div>
                                          <div>
                                            {(pivot.entries || []).map(
                                              ([value, count]) => (
                                                <div
                                                  key={`${row.keyUpper}:${value}`}
                                                  className={`grid grid-cols-[minmax(0,1fr)_7rem] gap-3 px-3 py-2 text-sm border-t ${theme.border} first:border-t-0`}
                                                >
                                                  <div className="break-all">
                                                    {String(value)}
                                                  </div>
                                                  <div className="text-right tabular-nums">
                                                    {Number(
                                                      count || 0
                                                    ).toLocaleString(
                                                      'nb-NO'
                                                    )}
                                                  </div>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing}`}
                      onClick={() => setStep('filter')}
                    >
                      <Filter className="h-4 w-4" />
                      Gå til filtrering
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 'filter' && exploreData && available ? (
              <section className="flex h-full flex-col">
                <div
                  className={`flex h-full flex-col rounded-xl border p-6 ${theme.border} ${theme.surface}`}
                >
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Filtrer
                    </h2>
                    <div className={`mt-1 text-sm ${theme.muted}`}>
                      Velg hvilke objekttyper og felter som skal være
                      med i eksporten.
                    </div>
                    <div className={`mt-1 text-xs ${theme.muted}`}>
                      Noen felter er låst (f.eks. OBJTYPE/EGS_*) fordi
                      de er nødvendige for gyldig SOSI.
                    </div>
                    <div className="mt-4">
                      <Tabs
                        theme={theme}
                        value={activeTab}
                        onChange={setActiveTab}
                      />
                    </div>
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-hidden">
                    <div className="grid h-full grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2">
                      <div className="min-h-0 flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">
                            Objekttyper
                          </h3>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                              onClick={() =>
                                setAll(
                                  activeTab,
                                  'objTypes',
                                  available[activeTab].objTypes
                                )
                              }
                            >
                              Velg alle
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                              onClick={() =>
                                setAll(activeTab, 'objTypes', [])
                              }
                            >
                              Velg ingen
                            </button>
                          </div>
                        </div>

                        <div
                          className={`mt-2 min-h-0 flex-1 overflow-auto rounded-md border p-2 ${theme.border}`}
                        >
                          {available[activeTab].objTypes.map(
                            (objType) => {
                              const checked =
                                selectedObjTypes.includes(objType);
                              return (
                                <label
                                  key={objType}
                                  className={`flex items-center gap-2 rounded px-2 py-1 ${theme.hoverAccentSoft}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelection((prev) => ({
                                        ...prev,
                                        objTypesByCategory: {
                                          ...prev.objTypesByCategory,
                                          [activeTab]: toggleInList(
                                            prev.objTypesByCategory?.[
                                              activeTab
                                            ] || [],
                                            objType
                                          ),
                                        },
                                      }));
                                    }}
                                  />
                                  <span className="text-sm">
                                    {objType}
                                  </span>
                                </label>
                              );
                            }
                          )}
                        </div>
                      </div>

                      <div className="min-h-0 flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">
                            Felter
                          </h3>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                              onClick={() =>
                                setAll(
                                  activeTab,
                                  'fields',
                                  uniq([
                                    ...available[activeTab].fields,
                                    ...Array.from(mandatoryFields),
                                  ])
                                )
                              }
                            >
                              Velg alle
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                              onClick={() =>
                                setAll(
                                  activeTab,
                                  'fields',
                                  Array.from(mandatoryFields)
                                )
                              }
                            >
                              Velg ingen
                            </button>
                          </div>
                        </div>

                        <div
                          className={`mt-2 min-h-0 flex-1 overflow-auto rounded-md border p-2 ${theme.border}`}
                        >
                          {uniq([
                            ...available[activeTab].fields,
                            ...Array.from(mandatoryFields),
                          ]).map((fieldKey) => {
                            const keyUpper =
                              String(fieldKey).toUpperCase();
                            const locked =
                              mandatoryFields.has(keyUpper);
                            const checked =
                              locked ||
                              selectedFields
                                .map((f) => String(f).toUpperCase())
                                .includes(keyUpper);
                            return (
                              <label
                                key={fieldKey}
                                className={`flex items-center gap-2 rounded px-2 py-1 ${theme.hoverAccentSoft}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={locked}
                                  onChange={() => {
                                    if (locked) return;
                                    setSelection((prev) => ({
                                      ...prev,
                                      fieldsByCategory: {
                                        ...prev.fieldsByCategory,
                                        [activeTab]: toggleInList(
                                          prev.fieldsByCategory?.[
                                            activeTab
                                          ] || [],
                                          keyUpper
                                        ),
                                      },
                                    }));
                                  }}
                                />
                                <span
                                  className={`text-sm ${
                                    locked ? 'text-zinc-500' : ''
                                  }`}
                                >
                                  {fieldKey}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing}`}
                      onClick={() => setStep('download')}
                    >
                      <Download className="h-4 w-4" />
                      Gå til nedlasting
                    </button>

                    <details className="relative">
                      <summary
                        className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                      >
                        <Filter className="h-4 w-4" />
                        Avanserte valg
                        <ChevronDown className="h-4 w-4" />
                      </summary>
                      <div
                        className={`absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border shadow-lg ${theme.border} ${theme.surface}`}
                      >
                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                          onClick={() => ensureDefaultsFromAnalysis()}
                        >
                          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Tilbakestill til standard (fra fil)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Bruk feltene/objekttypene som finnes i
                              den opplastede filen.
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 border-t px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                          onClick={exportSettings}
                        >
                          <Download className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Eksporter utvalg (JSON)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Lagre filtervalgene for deling/backup.
                            </div>
                          </div>
                        </button>
                        <label
                          className={`flex w-full cursor-pointer items-start gap-3 border-t px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                        >
                          <FileUp className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Importer utvalg (JSON)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Last inn tidligere lagrede filtervalg.
                            </div>
                          </div>
                          <input
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) importSettingsFromFile(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 border-t px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                          onClick={clearSavedSettings}
                        >
                          <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Slett lagrede innstillinger
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Fjerner lagrede valg fra denne
                              nettleseren.
                            </div>
                          </div>
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 'download' ? (
              <section className="flex h-full flex-col">
                <div
                  className={`flex h-full flex-col rounded-xl border p-6 ${theme.border} ${theme.surface}`}
                >
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Last ned renset fil
                  </h2>
                  <p className={`mt-2 text-sm ${theme.muted}`}>
                    Viktig: Du er selv ansvarlig for at eksportert fil
                    ikke inneholder sensitiv informasjon.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!file || busy}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing} disabled:opacity-50`}
                      onClick={downloadCleaned}
                    >
                      <Download className="h-4 w-4" />
                      Last ned renset SOSI
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                      onClick={() => setStep('filter')}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Tilbake til filtrering
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>

      {busy ? (
        <LoadingOverlay theme={theme} label={busyLabel} />
      ) : null}
    </div>
  );
}
