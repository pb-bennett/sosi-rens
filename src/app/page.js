/**
 * @file page.js
 * Main client-side UI for SOSI-Rens.
 * Implements a five-step flow: Upload → Explore → Filter → Exclude → Download.
 * Handles file decoding, analysis, filtering, theming, and selection persistence.
 */

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
import {
  cleanSosiText,
  extractExcludedSosiText,
} from '../lib/sosi/clean.js';
import {
  decodeSosiArrayBuffer,
  encodeSosiTextToBytes,
} from '../lib/sosi/browserEncoding.js';
import { computePivot2D } from '../lib/sosi/pivot2d.js';

/** localStorage key for persisting user selection (objTypes, fields). */
const STORAGE_KEY = 'sosi-rens:v0';

/** localStorage key for persisting the selected theme. */
const THEME_KEY = 'sosi-rens:theme';

/** Max file size (bytes) for which we attempt server-side cleaning via API. */
const HOSTED_BODY_LIMIT_BYTES = 2_000_000;

/**
 * Theme definitions (Tailwind class tokens).
 * Each theme defines colors for backgrounds, text, borders, buttons, etc.
 */
const THEMES = {
  light: {
    label: 'Lys',
    appBg: 'bg-slate-50',
    headerBg: 'bg-white/80 backdrop-blur',
    surface: 'bg-white',
    surfaceMuted: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-950',
    muted: 'text-slate-600',
    logo: '',
    primary: 'bg-emerald-700 hover:bg-emerald-800',
    primarySoft: 'bg-emerald-50 hover:bg-emerald-100',
    primaryRing: 'focus-visible:ring-emerald-400',
    hoverSurfaceMuted: 'hover:bg-slate-50',
    tabList: 'bg-slate-100',
    tabActive: 'bg-white text-slate-950 shadow-sm',
    tabInactive: 'text-slate-700 hover:text-slate-950',
    accentBar: 'bg-blue-600',
    accentSoft: 'bg-blue-50',
    hoverAccentSoft: 'hover:bg-blue-50',
    dangerBorder: 'border-red-200',
    dangerBg: 'bg-red-50',
    dangerText: 'text-red-800',
    warningBorder: 'border-amber-200',
    warningBg: 'bg-amber-50',
    warningText: 'text-amber-900',
  },
  dark: {
    label: 'Mørk',
    appBg: 'bg-zinc-900',
    headerBg: 'bg-zinc-900/70 backdrop-blur',
    surface: 'bg-zinc-800',
    surfaceMuted: 'bg-zinc-800/60',
    border: 'border-zinc-700',
    text: 'text-zinc-50',
    muted: 'text-zinc-400',
    logo: 'invert brightness-110',
    primary: 'bg-emerald-600 hover:bg-emerald-500',
    primarySoft: 'bg-zinc-800 hover:bg-zinc-700',
    primaryRing: 'focus-visible:ring-emerald-400',
    hoverSurfaceMuted: 'hover:bg-zinc-800',
    tabList: 'bg-zinc-800',
    tabActive: 'bg-zinc-900 text-zinc-50 shadow-sm',
    tabInactive: 'text-zinc-300 hover:text-zinc-50',
    accentBar: 'bg-blue-500',
    accentSoft: 'bg-blue-500/10',
    hoverAccentSoft: 'hover:bg-blue-500/10',
    dangerBorder: 'border-red-900/40',
    dangerBg: 'bg-red-950/30',
    dangerText: 'text-red-200',
    warningBorder: 'border-amber-900/40',
    warningBg: 'bg-amber-950/30',
    warningText: 'text-amber-200',
  },
};

/**
 * Aliases for migrating old theme keys to current theme keys.
 * Allows users with legacy localStorage values to seamlessly update.
 */
const THEME_KEY_ALIASES = {
  neutral: 'light',
  githubLight: 'light',
  githubDark: 'dark',
};

/**
 * Sort object entries by value descending, then key ascending.
 * @param {Record<string, number>} obj - Object with numeric values.
 * @returns {[string, number][]} Sorted entries.
 */
function sortEntriesDesc(obj) {
  return Object.entries(obj || {}).sort(
    (a, b) =>
      (b[1] || 0) - (a[1] || 0) ||
      String(a[0]).localeCompare(String(b[0]))
  );
}

/**
 * Deduplicate and filter falsy values from an array.
 * @param {any[]} list - Input array.
 * @returns {any[]} Unique truthy values.
 */
function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

/**
 * Trigger a browser download for a Blob.
 * @param {Blob} blob - File content.
 * @param {string} filename - Suggested filename.
 */
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

/**
 * Read a File object as JSON.
 * @param {File} file - File to read.
 * @returns {Promise<any>} Parsed JSON.
 */
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

/**
 * Iterate over lines in a string without splitting into a large array.
 * Handles both LF and CRLF line endings.
 * @param {string} text - Input text.
 * @param {(line: string) => void} onLine - Callback for each line.
 */
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

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeExcludedByCategory(excludedByCategory) {
  const base = {
    punkter: [],
    ledninger: [],
  };
  const src =
    excludedByCategory && typeof excludedByCategory === 'object'
      ? excludedByCategory
      : null;

  for (const category of ['punkter', 'ledninger']) {
    const list = Array.isArray(src?.[category]) ? src[category] : [];
    base[category] = list
      .map((e) => {
        const id = String(e?.id ?? '').trim();
        const idType = String(e?.idType ?? 'SID').toUpperCase();
        const comment = String(e?.comment ?? '').trim();
        const meta =
          e?.meta && typeof e.meta === 'object' ? e.meta : null;
        if (!id) return null;
        if (!['SID', 'PSID', 'LSID'].includes(idType)) return null;
        return { id, idType, comment, meta };
      })
      .filter(Boolean);
  }

  return base;
}

function buildExcludedKey(entry) {
  return `${String(entry?.idType || '').toUpperCase()}:${String(
    entry?.id || ''
  ).trim()}`;
}

function getCategoryLabel(category) {
  return category === 'ledninger' ? 'Ledninger' : 'Punkter';
}

/**
 * Search for all objects with a given SID across both categories.
 * Returns an array of matches with metadata for user to pick from.
 * @param {string} sosiText - Full SOSI text.
 * @param {string} sid - The SID value to search for.
 * @returns {{ category: string, sid: string, objType: string | null, tema: string | null, material: string | null, dimensjon: string | null }[]}
 */
function searchBySid(sosiText, sid) {
  const wantedSid = String(sid).trim();
  if (!sosiText || !wantedSid) return [];
  if (!/^[0-9]+$/.test(wantedSid)) return [];

  const sidLineRe = new RegExp(
    `^\\.\\.\\.SID\\s+${escapeRegExp(wantedSid)}\\s*$`
  );

  const matches = [];
  let currentSection = null;
  let currentCategory = 'unknown';
  let currentObjType = null;
  let currentTema = null;
  let currentMaterial = null;
  let currentDimensjon = null;
  let matchInThisBlock = false;

  function resetForBlock() {
    currentObjType = null;
    currentTema = null;
    currentMaterial = null;
    currentDimensjon = null;
    matchInThisBlock = false;
  }

  function finalizeBlock() {
    if (!matchInThisBlock) return;
    if (currentCategory === 'unknown') return;
    matches.push({
      category: currentCategory,
      sid: wantedSid,
      objType: currentObjType || null,
      tema: currentTema || null,
      material: currentMaterial || null,
      dimensjon: currentDimensjon || null,
    });
  }

  resetForBlock();

  forEachLine(sosiText, (lineRaw) => {
    const line = String(lineRaw || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      finalizeBlock();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      resetForBlock();
      return;
    }

    if (line.startsWith('..OBJTYPE')) {
      const objType = line.replace('..OBJTYPE', '').trim();
      if (objType) currentObjType = objType;
      return;
    }

    if (line.startsWith('...P_TEMA')) {
      const value = line.replace('...P_TEMA', '').trim();
      if (value) currentTema = value;
      return;
    }

    if (line.startsWith('...L_TEMA')) {
      const value = line.replace('...L_TEMA', '').trim();
      if (value) currentTema = value;
      return;
    }

    if (line.startsWith('...MATERIAL')) {
      const value = line.replace('...MATERIAL', '').trim();
      if (value) currentMaterial = value;
      return;
    }

    if (line.startsWith('...DIMENSJON')) {
      const value = line.replace('...DIMENSJON', '').trim();
      if (value) currentDimensjon = value;
      return;
    }

    if (sidLineRe.test(line.trim())) {
      matchInThisBlock = true;
      return;
    }
  });

  // Finalize last block
  finalizeBlock();

  return matches;
}

function lookupExclusionMeta(sosiText, category, idType, id) {
  const wantedCategory = String(category);
  const wantedType = String(idType).toUpperCase();
  const wantedId = String(id).trim();

  if (!sosiText || !wantedId) return null;
  if (!['SID', 'PSID', 'LSID'].includes(wantedType)) return null;

  const idLineRe = new RegExp(
    `^\\.\\.\\.${escapeRegExp(wantedType)}\\s+${escapeRegExp(
      wantedId
    )}\\s*$`
  );

  let currentSection = null;
  let currentCategory = 'unknown';
  let currentObjType = null;
  let currentTema = null;
  let currentMaterial = null;
  let currentDimensjon = null;
  let matchInThisBlock = false;

  function resetForBlock() {
    currentObjType = null;
    currentTema = null;
    currentMaterial = null;
    currentDimensjon = null;
    matchInThisBlock = false;
  }

  function finalizeIfMatch() {
    if (!matchInThisBlock) return null;
    if (currentCategory !== wantedCategory) return null;
    return {
      objType: currentObjType || null,
      tema: currentTema || null,
      material: currentMaterial || null,
      dimensjon: currentDimensjon || null,
    };
  }

  resetForBlock();

  forEachLine(sosiText, (lineRaw) => {
    const line = String(lineRaw || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      const resolved = finalizeIfMatch();
      if (resolved) throw resolved;
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      resetForBlock();
      return;
    }

    if (line.startsWith('..OBJTYPE')) {
      const objType = line.replace('..OBJTYPE', '').trim();
      if (objType) currentObjType = objType;
      return;
    }

    if (line.startsWith('...P_TEMA')) {
      const value = line.replace('...P_TEMA', '').trim();
      if (value) currentTema = value;
      return;
    }

    if (line.startsWith('...L_TEMA')) {
      const value = line.replace('...L_TEMA', '').trim();
      if (value) currentTema = value;
      return;
    }

    if (line.startsWith('...MATERIAL')) {
      const value = line.replace('...MATERIAL', '').trim();
      if (value) currentMaterial = value;
      return;
    }

    if (line.startsWith('...DIMENSJON')) {
      const value = line.replace('...DIMENSJON', '').trim();
      if (value) currentDimensjon = value;
      return;
    }

    if (idLineRe.test(line.trim())) {
      matchInThisBlock = true;
      return;
    }
  });

  return finalizeIfMatch();
}

/**
 * Check if a line starts a new SOSI feature block.
 * @param {string} line - Raw SOSI line.
 * @returns {boolean} True if the line starts a feature.
 */
function isFeatureStartLine(line) {
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(String(line));
}

/**
 * Extract the section name from a feature-start line.
 * @param {string} line - Raw SOSI line.
 * @returns {string | null} Uppercased section name (e.g. `.PUNKT`).
 */
function getSectionName(line) {
  const match = String(line).match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

/**
 * Map a section name to a category.
 * @param {string | null} section - Section name.
 * @returns {'punkter' | 'ledninger' | 'unknown'} Category.
 */
function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

/**
 * Compute value frequency distribution for a specific field in a category.
 * Used by the Explore pivot tables to show value counts.
 * @param {string} sosiText - Full SOSI text.
 * @param {string} fieldKeyUpper - Uppercased field key.
 * @param {'punkter' | 'ledninger'} category - Category to filter by.
 * @returns {[string, number][]} Sorted [value, count] pairs.
 */
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

/**
 * Extract unique EIER values and their counts from a SOSI text, grouped by category.
 * @param {string} sosiText - Full SOSI text.
 * @returns {{ punkter: { value: string, count: number }[], ledninger: { value: string, count: number }[] }}
 */
function extractEierValues(sosiText) {
  const countsPunkter = new Map();
  const countsLedninger = new Map();

  let currentCategory = 'unknown';
  let currentSection = null;
  let blockEierValue = null;

  function finalizeBlock() {
    if (blockEierValue !== null) {
      const val = blockEierValue || '(tom)';
      if (currentCategory === 'punkter') {
        countsPunkter.set(val, (countsPunkter.get(val) || 0) + 1);
      } else if (currentCategory === 'ledninger') {
        countsLedninger.set(val, (countsLedninger.get(val) || 0) + 1);
      }
    }
    blockEierValue = null;
  }

  forEachLine(sosiText, (rawLine) => {
    const line = String(rawLine || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      finalizeBlock();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      blockEierValue = null;
      return;
    }

    if (currentCategory === 'unknown') return;

    if (line.startsWith('...EIER')) {
      const value = line.replace('...EIER', '').trim();
      blockEierValue = value || '';
    }
  });

  finalizeBlock();

  const sortEntries = (map) =>
    Array.from(map.entries())
      .sort(
        (a, b) =>
          (b[1] || 0) - (a[1] || 0) ||
          String(a[0]).localeCompare(String(b[0]))
      )
      .map(([value, count]) => ({ value, count }));

  return {
    punkter: sortEntries(countsPunkter),
    ledninger: sortEntries(countsLedninger),
  };
}

/**
 * Extract unique STATUS values and their counts from a SOSI text, grouped by category.
 * @param {string} sosiText - Full SOSI text.
 * @returns {{ punkter: { value: string, count: number }[], ledninger: { value: string, count: number }[] }}
 */
function extractStatusValues(sosiText) {
  const countsPunkter = new Map();
  const countsLedninger = new Map();

  let currentCategory = 'unknown';
  let currentSection = null;
  let blockStatusValue = null;

  function finalizeBlock() {
    if (blockStatusValue !== null) {
      const val = blockStatusValue || '(tom)';
      if (currentCategory === 'punkter') {
        countsPunkter.set(
          val,
          (countsPunkter.get(val) || 0) + 1
        );
      } else if (currentCategory === 'ledninger') {
        countsLedninger.set(
          val,
          (countsLedninger.get(val) || 0) + 1
        );
      }
    }
    blockStatusValue = null;
  }

  forEachLine(sosiText, (rawLine) => {
    const line = String(rawLine || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      finalizeBlock();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      blockStatusValue = null;
      return;
    }

    if (currentCategory === 'unknown') return;

    if (line.startsWith('...STATUS')) {
      const value = line.replace('...STATUS', '').trim();
      blockStatusValue = value || '';
    }
  });

  finalizeBlock();

  const sortEntries = (map) =>
    Array.from(map.entries())
      .sort(
        (a, b) =>
          (b[1] || 0) - (a[1] || 0) ||
          String(a[0]).localeCompare(String(b[0]))
      )
      .map(([value, count]) => ({ value, count }));

  return {
    punkter: sortEntries(countsPunkter),
    ledninger: sortEntries(countsLedninger),
  };
}

/**
 * Step navigation button used in the header.
 * Displays an icon + label, handles active/disabled states, and shows tooltip when disabled.
 * @param {Object} props
 * @param {Object} props.theme - Current theme tokens.
 * @param {boolean} props.active - Whether this step is the current step.
 * @param {boolean} props.disabled - Whether the button is disabled.
 * @param {string} [props.disabledReason] - Tooltip text when disabled.
 * @param {React.ComponentType} props.icon - Lucide icon component.
 * @param {string} props.label - Button label.
 * @param {() => void} props.onClick - Click handler.
 * @returns {JSX.Element}
 */
function StepButton({
  theme,
  active,
  disabled,
  disabledReason,
  icon: Icon,
  label,
  onClick,
}) {
  const button = (
    <button
      className={`group inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? `${theme.primary} ${theme.primaryRing} border-transparent text-white`
          : `${theme.surface} ${theme.text} ${theme.primaryRing} ${theme.border} ${theme.hoverSurfaceMuted}`
      } disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : ''}`} />
      <span>{label}</span>
    </button>
  );

  if (disabled && disabledReason) {
    return (
      <span className="inline-flex" title={disabledReason}>
        {button}
      </span>
    );
  }

  return button;
}

/**
 * Tab switcher for Punkter/Ledninger.
 * @param {Object} props
 * @param {Object} props.theme - Current theme tokens.
 * @param {'punkter' | 'ledninger'} props.value - Active tab.
 * @param {(tab: 'punkter' | 'ledninger') => void} props.onChange - Tab change handler.
 * @returns {JSX.Element}
 */
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

/**
 * Full-screen loading overlay with spinner and message.
 * @param {Object} props
 * @param {Object} props.theme - Current theme tokens.
 * @param {string} [props.label] - Loading message.
 * @returns {JSX.Element}
 */
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

/**
 * Main page component implementing the five-step SOSI-Rens flow.
 * Manages file upload, analysis, filtering, and download.
 * @returns {JSX.Element}
 */
export default function Home() {
  // Step state: upload | explore | filter | exclude | download
  const [step, setStep] = useState('upload');
  // Active tab for Explore/Filter views
  const [activeTab, setActiveTab] = useState('punkter');
  const [filterVisitedTabs, setFilterVisitedTabs] = useState({
    punkter: false,
    ledninger: false,
  });
  const [exclusionsVisited, setExclusionsVisited] = useState(false);
  const [downloadFieldMode, setDownloadFieldMode] = useState(null); // 'remove-fields' | 'clear-values'

  const [themeKey, setThemeKey] = useState('neutral');
  const theme = THEMES[themeKey] || THEMES.light;

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

  const [pivot2dUiByCategory, setPivot2dUiByCategory] = useState({
    punkter: {},
    ledninger: {},
  });
  const [pivot2dCacheByCategory, setPivot2dCacheByCategory] =
    useState({
      punkter: {},
      ledninger: {},
    });

  useEffect(() => {
    setFilterVisitedTabs({ punkter: false, ledninger: false });
    setExclusionsVisited(false);
    setDownloadFieldMode(null);
  }, [file]);

  useEffect(() => {
    if (step !== 'filter') return;
    setFilterVisitedTabs((prev) => ({
      ...prev,
      [activeTab]: true,
    }));
  }, [step, activeTab]);

  useEffect(() => {
    if (step !== 'exclude') return;
    setExclusionsVisited(true);
  }, [step]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const normalized = (saved && THEME_KEY_ALIASES[saved]) || saved;
      if (normalized && THEMES[normalized]) {
        setThemeKey(normalized);
        if (saved !== normalized) {
          localStorage.setItem(THEME_KEY, normalized);
        }
      }
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
    excludedByCategory: { punkter: [], ledninger: [] },
    eierByCategory: { punkter: ['K'], ledninger: ['K'] }, // Default: only EIER=K
    statusByCategory: { punkter: [], ledninger: [] },
    lastFileName: null,
  });

  // Memoized EIER values from current SOSI text
  const availableEierValues = useMemo(() => {
    if (!sosiText) return { punkter: [], ledninger: [] };
    return extractEierValues(sosiText);
  }, [sosiText]);

  // Memoized STATUS values from current SOSI text
  const availableStatusValues = useMemo(() => {
    if (!sosiText) return { punkter: [], ledninger: [] };
    return extractStatusValues(sosiText);
  }, [sosiText]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSelection((prev) => ({
        ...prev,
        ...parsed,
        excludedByCategory: normalizeExcludedByCategory(
          parsed?.excludedByCategory ?? prev.excludedByCategory
        ),
        eierByCategory: {
          punkter: Array.isArray(parsed?.eierByCategory?.punkter)
            ? parsed.eierByCategory.punkter
            : prev.eierByCategory.punkter,
          ledninger: Array.isArray(parsed?.eierByCategory?.ledninger)
            ? parsed.eierByCategory.ledninger
            : prev.eierByCategory.ledninger,
        },
        statusByCategory: {
          punkter: Array.isArray(parsed?.statusByCategory?.punkter)
            ? parsed.statusByCategory.punkter
            : prev.statusByCategory.punkter,
          ledninger: Array.isArray(parsed?.statusByCategory?.ledninger)
            ? parsed.statusByCategory.ledninger
            : prev.statusByCategory.ledninger,
        },
      }));
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
    setPivot2dUiByCategory({ punkter: {}, ledninger: {} });
    setPivot2dCacheByCategory({ punkter: {}, ledninger: {} });
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
      next.excludedByCategory = normalizeExcludedByCategory(
        prev.excludedByCategory
      );
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

  /**
   * Toggle a single EIER value in/out of the filter for a category.
   * @param {string} category - 'punkter' or 'ledninger'
   * @param {string} eierValue - The EIER value to toggle
   */
  function toggleEier(category, eierValue) {
    setSelection((prev) => ({
      ...prev,
      eierByCategory: {
        ...prev.eierByCategory,
        [category]: toggleInList(
          prev.eierByCategory[category],
          eierValue
        ),
      },
    }));
  }

  /**
   * Select all EIER values for a category.
   */
  function selectAllEier(category) {
    const allValues =
      availableEierValues[category]?.map((v) => v.value) || [];
    setSelection((prev) => ({
      ...prev,
      eierByCategory: {
        ...prev.eierByCategory,
        [category]: allValues,
      },
    }));
  }

  /**
   * Deselect all EIER values for a category.
   */
  function deselectAllEier(category) {
    setSelection((prev) => ({
      ...prev,
      eierByCategory: {
        ...prev.eierByCategory,
        [category]: [],
      },
    }));
  }

  /**
   * Toggle a single STATUS value in/out of the filter for a category.
   * @param {string} category - 'punkter' or 'ledninger'
   * @param {string} statusValue - The STATUS value to toggle
   */
  function toggleStatus(category, statusValue) {
    setSelection((prev) => ({
      ...prev,
      statusByCategory: {
        ...prev.statusByCategory,
        [category]: toggleInList(
          prev.statusByCategory[category],
          statusValue
        ),
      },
    }));
  }

  /**
   * Select all STATUS values for a category.
   */
  function selectAllStatus(category) {
    const allValues =
      availableStatusValues[category]?.map((v) => v.value) || [];
    setSelection((prev) => ({
      ...prev,
      statusByCategory: {
        ...prev.statusByCategory,
        [category]: allValues,
      },
    }));
  }

  /**
   * Deselect all STATUS values for a category.
   */
  function deselectAllStatus(category) {
    setSelection((prev) => ({
      ...prev,
      statusByCategory: {
        ...prev.statusByCategory,
        [category]: [],
      },
    }));
  }

  async function downloadCleanedClient() {
    if (!file) return;
    setProcessingMode('browser');
    const arrayBuffer = fileArrayBuffer || (await file.arrayBuffer());
    setFileArrayBuffer(arrayBuffer);

    const decoded = decodeSosiArrayBuffer(arrayBuffer);
    const cleanedText = cleanSosiText(
      decoded.text,
      {
        objTypesByCategory: selection.objTypesByCategory,
        fieldsByCategory: selection.fieldsByCategory,
        excludedByCategory: selection.excludedByCategory,
        eierByCategory: selection.eierByCategory,
        statusByCategory: selection.statusByCategory,
      },
      {
        fieldMode:
          downloadFieldMode === 'clear-values'
            ? 'clear-values'
            : 'remove-fields',
      }
    ).text;

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

  async function downloadExcludedOnlyClient() {
    if (!file) return;
    setProcessingMode('browser');
    const arrayBuffer = fileArrayBuffer || (await file.arrayBuffer());
    setFileArrayBuffer(arrayBuffer);

    const decoded = decodeSosiArrayBuffer(arrayBuffer);
    const excludedText = extractExcludedSosiText(decoded.text, {
      excludedByCategory: selection.excludedByCategory,
    }).text;

    const outBytes = encodeSosiTextToBytes(
      excludedText,
      decoded.encoding?.used || 'utf8'
    );
    const blob = new Blob([outBytes], {
      type: 'application/octet-stream',
    });

    const originalName = file.name || 'fil.sos';
    const name = originalName.replace(
      /(\.[^.]+)?$/,
      '-ekskluderte$1'
    );
    downloadBlob(blob, name);
  }

  async function downloadExcludedOnly() {
    if (!file) return;
    const hasAnyExclusions =
      (selection?.excludedByCategory?.punkter?.length || 0) +
        (selection?.excludedByCategory?.ledninger?.length || 0) >
      0;
    if (!hasAnyExclusions) {
      setError('Ingen ekskluderte objekter å eksportere.');
      return;
    }

    setError(null);
    setBusy(true);
    setBusyLabel('Genererer fil med ekskluderte objekter…');
    try {
      if (backendInfo?.env === 'vercel') {
        await downloadExcludedOnlyClient();
        return;
      }

      if ((file?.size || 0) > HOSTED_BODY_LIMIT_BYTES) {
        await downloadExcludedOnlyClient();
        return;
      }

      setProcessingMode('api');
      const fd = new FormData();
      fd.set('file', file);
      fd.set(
        'selection',
        JSON.stringify({
          excludedByCategory: selection.excludedByCategory,
        })
      );
      fd.set('mode', 'excluded-only');

      const res = await fetch('/api/clean', {
        method: 'POST',
        body: fd,
      });

      if (res.status === 413) {
        await downloadExcludedOnlyClient();
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Kunne ikke generere filen.');
      }

      const blob = await res.blob();
      const header = res.headers.get('Content-Disposition') || '';
      const match = header.match(/filename="([^"]+)"/);
      const name = match?.[1] || 'ekskluderte.sos';
      downloadBlob(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
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
          excludedByCategory: selection.excludedByCategory,
          eierByCategory: selection.eierByCategory,
          statusByCategory: selection.statusByCategory,
        })
      );
      fd.set(
        'fieldMode',
        downloadFieldMode === 'clear-values'
          ? 'clear-values'
          : 'remove-fields'
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

  /**
   * Export all settings (filters, exclusions, EIER) as a unified JSON file.
   * Includes metadata for versioning and identification.
   */
  function exportSettings() {
    const payload = {
      // Metadata
      _meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceFile: selection.lastFileName || null,
        appVersion: 'sosi-rens:v0',
      },
      // Filter settings
      objTypesByCategory: selection.objTypesByCategory,
      fieldsByCategory: selection.fieldsByCategory,
      eierByCategory: selection.eierByCategory,
      statusByCategory: selection.statusByCategory,
      // Exclusions
      excludedByCategory: selection.excludedByCategory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseName = selection.lastFileName
      ? selection.lastFileName.replace(/\.[^.]+$/, '')
      : 'sosi-rens';
    downloadBlob(blob, `${baseName}-innstillinger-${dateStr}.json`);
  }

  function exportExclusionsOnly() {
    const payload = {
      _meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        type: 'exclusions-only',
        sourceFile: selection.lastFileName || null,
      },
      excludedByCategory: selection.excludedByCategory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, 'sosi-rens-ekskluderinger.json');
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
        eierByCategory: {
          punkter: Array.isArray(imported?.eierByCategory?.punkter)
            ? imported.eierByCategory.punkter
            : prev.eierByCategory.punkter,
          ledninger: Array.isArray(
            imported?.eierByCategory?.ledninger
          )
            ? imported.eierByCategory.ledninger
            : prev.eierByCategory.ledninger,
        },
        statusByCategory: {
          punkter: Array.isArray(imported?.statusByCategory?.punkter)
            ? imported.statusByCategory.punkter
            : prev.statusByCategory.punkter,
          ledninger: Array.isArray(
            imported?.statusByCategory?.ledninger
          )
            ? imported.statusByCategory.ledninger
            : prev.statusByCategory.ledninger,
        },
        excludedByCategory: normalizeExcludedByCategory(
          imported.excludedByCategory ?? prev.excludedByCategory
        ),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function importExclusionsOnlyFromFile(fileObj) {
    setError(null);
    try {
      const imported = await readJsonFile(fileObj);
      const nextExcluded = normalizeExcludedByCategory(
        imported?.excludedByCategory
      );
      setSelection((prev) => ({
        ...prev,
        excludedByCategory: nextExcluded,
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
      excludedByCategory: { punkter: [], ledninger: [] },
      eierByCategory: { punkter: ['K'], ledninger: ['K'] },
      statusByCategory: { punkter: [], ledninger: [] },
      lastFileName: null,
    });
    if (available) ensureDefaultsFromAnalysis();
  }

  const [excludedDraftByCategory, setExcludedDraftByCategory] =
    useState({
      punkter: { idType: 'SID', id: '', comment: '' },
      ledninger: { idType: 'SID', id: '', comment: '' },
    });

  // New SID search state for simplified exclude UX
  const [sidSearchInput, setSidSearchInput] = useState('');
  const [sidSearchResults, setSidSearchResults] = useState([]);
  const [sidSearchPerformed, setSidSearchPerformed] = useState(false);
  const [selectedSidMatch, setSelectedSidMatch] = useState(null);
  const [sidExcludeComment, setSidExcludeComment] = useState('');

  // Reset confirmation dialog state
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  /**
   * Reset filters (objTypes, fields, EIER) to file defaults.
   * Preserves exclusion list.
   */
  function resetFiltersToDefaults() {
    if (!available) return;
    setSelection((prev) => ({
      ...prev,
      objTypesByCategory: {
        punkter: available.punkter.objTypes,
        ledninger: available.ledninger.objTypes,
      },
      fieldsByCategory: {
        punkter: available.punkter.fields,
        ledninger: available.ledninger.fields,
      },
      eierByCategory: { punkter: ['K'], ledninger: ['K'] },
      statusByCategory: { punkter: [], ledninger: [] },
      // Keep excludedByCategory unchanged
    }));
    setShowResetConfirm(false);
  }

  const [editingExcluded, setEditingExcluded] = useState(null);
  const [editingExcludedDraft, setEditingExcludedDraft] =
    useState(null);

  /**
   * Search for objects matching the entered SID.
   */
  function performSidSearch() {
    const sid = sidSearchInput.trim();
    setSidSearchPerformed(true);
    setSelectedSidMatch(null);
    setSidExcludeComment('');

    if (!sid) {
      setSidSearchResults([]);
      return;
    }

    if (!/^[0-9]+$/.test(sid)) {
      setError('SID må være et tall.');
      setSidSearchResults([]);
      return;
    }

    if (!sosiText) {
      setError('Last inn en SOSI-fil før du søker etter SID.');
      setSidSearchResults([]);
      return;
    }

    setError(null);
    const results = searchBySid(sosiText, sid);
    setSidSearchResults(results);
  }

  /**
   * Add the selected match to the exclusion list.
   */
  function addSelectedSidMatch() {
    if (!selectedSidMatch) {
      setError('Velg et objekt fra søkeresultatene først.');
      return;
    }

    const cat = selectedSidMatch.category;
    const sid = selectedSidMatch.sid;
    const comment = sidExcludeComment.trim();

    const entry = {
      idType: 'SID',
      id: sid,
      comment,
      meta: {
        objType: selectedSidMatch.objType,
        tema: selectedSidMatch.tema,
        material: selectedSidMatch.material,
        dimensjon: selectedSidMatch.dimensjon,
      },
    };

    const key = buildExcludedKey(entry);
    const existing = selection?.excludedByCategory?.[cat] || [];
    if (existing.some((e) => buildExcludedKey(e) === key)) {
      setError('Dette objektet er allerede ekskludert.');
      return;
    }

    setSelection((prev) => {
      const nextExcluded = normalizeExcludedByCategory(
        prev.excludedByCategory
      );
      nextExcluded[cat] = [...nextExcluded[cat], entry];
      return { ...prev, excludedByCategory: nextExcluded };
    });

    // Reset search state
    setSidSearchInput('');
    setSidSearchResults([]);
    setSidSearchPerformed(false);
    setSelectedSidMatch(null);
    setSidExcludeComment('');
    setError(null);
  }

  /**
   * Clear the SID search state.
   */
  function clearSidSearch() {
    setSidSearchInput('');
    setSidSearchResults([]);
    setSidSearchPerformed(false);
    setSelectedSidMatch(null);
    setSidExcludeComment('');
  }

  async function addExcludedEntry(category) {
    const cat = String(category);
    const draft = excludedDraftByCategory?.[cat] || {
      idType: 'SID',
      id: '',
      comment: '',
    };
    const idType = String(draft.idType || 'SID').toUpperCase();
    const id = String(draft.id || '').trim();
    const comment = String(draft.comment || '').trim();

    if (!['SID', 'PSID', 'LSID'].includes(idType)) {
      setError('Ugyldig ID-type.');
      return;
    }

    if (!id) {
      setError('Skriv inn et ID-nummer.');
      return;
    }

    if (!/^[0-9]+$/.test(id)) {
      setError('ID må være et tall.');
      return;
    }

    const entry = { idType, id, comment, meta: null };
    const key = buildExcludedKey(entry);

    const existing = selection?.excludedByCategory?.[cat] || [];
    if (existing.some((e) => buildExcludedKey(e) === key)) {
      setError('Dette ID-et er allerede ekskludert.');
      return;
    }

    setError(null);
    setBusy(true);
    setBusyLabel('Legger til ekskludert objekt…');

    await new Promise((r) => setTimeout(r, 0));

    const meta = sosiText
      ? (() => {
          try {
            return lookupExclusionMeta(sosiText, cat, idType, id);
          } catch (resolved) {
            return resolved;
          }
        })()
      : null;

    if (!sosiText) {
      setError(
        'Last inn en SOSI-fil før du legger til ekskluderinger.'
      );
      setBusy(false);
      setBusyLabel('');
      return;
    }

    if (meta instanceof Error) {
      setError(meta.message);
      setBusy(false);
      setBusyLabel('');
      return;
    }

    if (meta === null) {
      setError(
        `Fant ikke ${idType} ${id} i «${getCategoryLabel(
          cat
        )}» i denne filen.`
      );
      setBusy(false);
      setBusyLabel('');
      return;
    }

    setSelection((prev) => {
      const nextExcluded = normalizeExcludedByCategory(
        prev.excludedByCategory
      );
      nextExcluded[cat] = [...nextExcluded[cat], { ...entry, meta }];
      return { ...prev, excludedByCategory: nextExcluded };
    });

    setExcludedDraftByCategory((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], id: '', comment: '' },
    }));

    setBusy(false);
    setBusyLabel('');
  }

  function removeExcludedEntry(category, index) {
    const cat = String(category);
    setSelection((prev) => {
      const nextExcluded = normalizeExcludedByCategory(
        prev.excludedByCategory
      );
      nextExcluded[cat] = (nextExcluded[cat] || []).filter(
        (_, i) => i !== index
      );
      return { ...prev, excludedByCategory: nextExcluded };
    });
  }

  function startEditExcludedEntry(category, index) {
    const cat = String(category);
    const list = selection?.excludedByCategory?.[cat] || [];
    const entry = list[index];
    if (!entry) return;
    setEditingExcluded({ category: cat, index });
    setEditingExcludedDraft({
      idType: String(entry.idType || 'SID').toUpperCase(),
      id: String(entry.id || '').trim(),
      comment: String(entry.comment || '').trim(),
    });
  }

  function cancelEditExcludedEntry() {
    setEditingExcluded(null);
    setEditingExcludedDraft(null);
  }

  async function saveEditExcludedEntry() {
    if (!editingExcluded) return;
    const cat = String(editingExcluded.category);
    const index = Number(editingExcluded.index);
    const draft = editingExcludedDraft || {};

    const idType = String(draft.idType || 'SID').toUpperCase();
    const id = String(draft.id || '').trim();
    const comment = String(draft.comment || '').trim();

    if (!['SID', 'PSID', 'LSID'].includes(idType)) {
      setError('Ugyldig ID-type.');
      return;
    }
    if (!id) {
      setError('Skriv inn et ID-nummer.');
      return;
    }
    if (!/^[0-9]+$/.test(id)) {
      setError('ID må være et tall.');
      return;
    }

    const existingList = selection?.excludedByCategory?.[cat] || [];
    const nextKey = buildExcludedKey({ idType, id });
    const hasDuplicate = existingList.some(
      (e, i) => i !== index && buildExcludedKey(e) === nextKey
    );
    if (hasDuplicate) {
      setError('Dette ID-et er allerede ekskludert.');
      return;
    }

    setError(null);
    setBusy(true);
    setBusyLabel('Oppdaterer ekskludert objekt…');
    await new Promise((r) => setTimeout(r, 0));

    const meta = sosiText
      ? (() => {
          try {
            return lookupExclusionMeta(sosiText, cat, idType, id);
          } catch (resolved) {
            return resolved;
          }
        })()
      : null;

    if (!sosiText) {
      setError(
        'Last inn en SOSI-fil før du redigerer ekskluderinger.'
      );
      setBusy(false);
      setBusyLabel('');
      return;
    }

    if (meta instanceof Error) {
      setError(meta.message);
      setBusy(false);
      setBusyLabel('');
      return;
    }

    if (meta === null) {
      setError(
        `Fant ikke ${idType} ${id} i «${getCategoryLabel(
          cat
        )}» i denne filen.`
      );
      setBusy(false);
      setBusyLabel('');
      return;
    }

    setSelection((prev) => {
      const nextExcluded = normalizeExcludedByCategory(
        prev.excludedByCategory
      );
      const nextList = [...(nextExcluded[cat] || [])];
      const nextEntry = { idType, id, comment, meta };

      nextList[index] = nextEntry;
      nextExcluded[cat] = nextList;
      return { ...prev, excludedByCategory: nextExcluded };
    });

    cancelEditExcludedEntry();
    setBusy(false);
    setBusyLabel('');
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

  const canProceedToExclusionsFromFilter =
    filterVisitedTabs.punkter && filterVisitedTabs.ledninger;

  const canProceedToDownloadFromExclusions =
    canProceedToExclusionsFromFilter && exclusionsVisited;

  const downloadGateReason = !analysis
    ? null
    : !canProceedToExclusionsFromFilter
    ? 'Du må åpne både «Punkter» og «Ledninger» i «Filtrer» før du kan gå til nedlasting.'
    : !exclusionsVisited
    ? 'Gå til «Ekskluder» før du kan gå til nedlasting.'
    : null;

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

  /**
   * Build a stable cache key for a 2D pivot based on (primary, secondary).
   * @param {string} primaryKeyUpper - Uppercased primary field key.
   * @param {string} secondaryKeyUpper - Uppercased secondary field key.
   * @returns {string} Cache key.
   */
  function pivot2dCacheKey(primaryKeyUpper, secondaryKeyUpper) {
    return `${String(primaryKeyUpper || '').toUpperCase()}::${String(
      secondaryKeyUpper || ''
    ).toUpperCase()}`;
  }

  /**
   * Sort an axis array either by totals (desc) or alphabetically.
   * Keeps the "Andre" bucket last when present.
   * @param {string[]} labels - Axis labels.
   * @param {Record<string, number>} totals - Totals per label.
   * @param {'total' | 'alpha'} sortMode - Sort mode.
   * @returns {string[]} Sorted labels.
   */
  function getSortedAxis(labels, totals, sortMode) {
    const ANDRE = 'Andre';
    const base = Array.isArray(labels) ? [...labels] : [];
    const hasAndre = base.includes(ANDRE);
    const withoutAndre = hasAndre
      ? base.filter((x) => x !== ANDRE)
      : base;

    if (sortMode === 'alpha') {
      withoutAndre.sort((a, b) => String(a).localeCompare(String(b)));
    } else {
      withoutAndre.sort(
        (a, b) =>
          Number(totals?.[b] || 0) - Number(totals?.[a] || 0) ||
          String(a).localeCompare(String(b))
      );
    }

    return hasAndre ? [...withoutAndre, ANDRE] : withoutAndre;
  }

  /**
   * Build the list of selectable secondary fields for a given Explore tab.
   * Always includes OBJTYPE and excludes the primary field.
   * @param {any} tabData - Explore data for the active category.
   * @param {string} primaryKeyUpper - Uppercased primary field key.
   * @returns {{ keyUpper: string, label: string }[]} Secondary field options.
   */
  function getSecondaryFieldOptions(tabData, primaryKeyUpper) {
    const primaryUpper = String(primaryKeyUpper || '').toUpperCase();
    const options = [{ keyUpper: 'OBJTYPE', label: 'OBJTYPE' }];

    const fields = Array.isArray(tabData?.fields)
      ? tabData.fields
      : [];
    for (const [key] of fields) {
      const upper = String(key || '').toUpperCase();
      if (!upper) continue;
      if (upper === primaryUpper) continue;
      if (upper === 'OBJTYPE') continue;
      options.push({ keyUpper: upper, label: String(key) });
    }
    return options;
  }

  /**
   * Toggle the "Utvidet visning" panel for a field in Explore.
   * @param {'punkter' | 'ledninger'} category
   * @param {string} primaryKeyUpper - Uppercased primary field key.
   */
  function togglePivot2dUi(category, primaryKeyUpper) {
    setPivot2dUiByCategory((prev) => {
      const current = prev?.[category] || {};
      const existing = current?.[primaryKeyUpper] || null;
      const isOpen = !!existing?.open;
      const next = {
        ...current,
        [primaryKeyUpper]: {
          open: !isOpen,
          secondaryKeyUpper: String(
            existing?.secondaryKeyUpper || 'OBJTYPE'
          ).toUpperCase(),
          sortRows: existing?.sortRows || 'total',
          sortCols: existing?.sortCols || 'total',
          heatmap: !!existing?.heatmap,
        },
      };
      return { ...prev, [category]: next };
    });
  }

  /**
   * Update the "Utvidet visning" UI state for a field in Explore.
   * @param {'punkter' | 'ledninger'} category
   * @param {string} primaryKeyUpper - Uppercased primary field key.
   * @param {any} patch - Partial update.
   */
  function updatePivot2dUi(category, primaryKeyUpper, patch) {
    setPivot2dUiByCategory((prev) => {
      const current = prev?.[category] || {};
      const existing = current?.[primaryKeyUpper] || {
        open: true,
        secondaryKeyUpper: 'OBJTYPE',
        sortRows: 'total',
        sortCols: 'total',
        heatmap: false,
      };

      return {
        ...prev,
        [category]: {
          ...current,
          [primaryKeyUpper]: {
            ...existing,
            ...patch,
          },
        },
      };
    });
  }

  /**
   * Ensure that the 2D pivot result exists in cache (compute on-demand).
   * @param {'punkter' | 'ledninger'} category
   * @param {string} primaryKeyUpper - Uppercased primary field key.
   * @param {string} secondaryKeyUpper - Uppercased secondary field key.
   */
  async function ensurePivot2D(
    category,
    primaryKeyUpper,
    secondaryKeyUpper
  ) {
    if (!sosiText) return;
    const key = pivot2dCacheKey(primaryKeyUpper, secondaryKeyUpper);
    const existing = pivot2dCacheByCategory?.[category]?.[key];
    if (
      existing?.status === 'loading' ||
      existing?.status === 'ready'
    )
      return;

    setPivot2dCacheByCategory((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: { status: 'loading', result: null },
      },
    }));

    await new Promise((r) => setTimeout(r, 0));

    const result = computePivot2D(
      sosiText,
      category,
      String(primaryKeyUpper || '').toUpperCase(),
      String(secondaryKeyUpper || '').toUpperCase(),
      {
        topColumns: 25,
        rowCap: 200,
        numericBins: 10,
        numericBinning: 'equal-width',
      }
    );

    setPivot2dCacheByCategory((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: { status: 'ready', result },
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {step !== 'upload' ? (
                    <img
                      src="/sosi-rens-logo.svg"
                      alt="SOSI-Rens"
                      className={`h-16 w-auto ${theme.logo}`}
                    />
                  ) : (
                    <div className="h-16 w-28" aria-hidden="true" />
                  )}
                  <h1 className="sr-only">SOSI-Rens</h1>
                </div>

                <div className="flex items-center gap-3">
                  <label
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${theme.border} ${theme.surface}`}
                  >
                    <Palette className="h-4 w-4" />
                    <span className={theme.muted}>Tema</span>
                    <select
                      className={`ml-1 rounded-md border px-2 py-1 text-sm font-semibold outline-none ${theme.surface} ${theme.text} ${theme.border}`}
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

              <div className="flex w-full flex-wrap items-center justify-start gap-2">
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
                  active={step === 'exclude'}
                  disabled={
                    busy ||
                    !analysis ||
                    !canProceedToExclusionsFromFilter
                  }
                  disabledReason={
                    canProceedToExclusionsFromFilter
                      ? null
                      : 'Åpne både «Punkter» og «Ledninger» i «Filtrer» først.'
                  }
                  icon={Trash2}
                  label="4. Ekskluder"
                  onClick={() =>
                    analysis &&
                    canProceedToExclusionsFromFilter &&
                    setStep('exclude')
                  }
                />
                <StepButton
                  theme={theme}
                  active={step === 'download'}
                  disabled={
                    busy ||
                    !analysis ||
                    !canProceedToDownloadFromExclusions
                  }
                  disabledReason={downloadGateReason}
                  icon={Download}
                  label="5. Last ned"
                  onClick={() =>
                    analysis &&
                    canProceedToDownloadFromExclusions &&
                    setStep('download')
                  }
                />
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto h-full w-full max-w-7xl px-6 py-6">
            {error ? (
              <div
                className={`mb-4 rounded-lg border px-4 py-3 ${theme.dangerBorder} ${theme.dangerBg} ${theme.dangerText}`}
              >
                {error}
              </div>
            ) : null}

            {encodingInfo?.fallbackUsed ? (
              <div
                className={`mb-4 rounded-lg border px-4 py-3 ${theme.warningBorder} ${theme.warningBg} ${theme.warningText}`}
              >
                Filen ble tolket med tegnsett «{encodingInfo.used}».
              </div>
            ) : null}

            {step === 'upload' ? (
              <section className="flex h-full items-center justify-center">
                <div
                  className={`w-full max-w-3xl rounded-xl border p-5 ${theme.border} ${theme.surface} flex flex-col`}
                >
                  <img
                    src="/sosi-rens-logo.svg"
                    alt="SOSI-Rens"
                    className={`mx-auto mb-4 h-20 w-auto ${theme.logo}`}
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
                    className={`mt-4 flex min-h-56 flex-col rounded-xl border-2 border-dashed p-4 transition-colors ${
                      dragActive
                        ? theme.accentSoft
                        : theme.surfaceMuted
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
                        <div
                          className={`mt-0.5 text-sm ${theme.muted}`}
                        >
                          Eller klikk for å velge fil.
                        </div>
                        <div
                          className={`mt-3 text-xs ${theme.muted}`}
                        >
                          Tips: Store filer analyseres i nettleseren.
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
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
                        className={`mt-4 rounded-lg border p-2.5 ${theme.border} ${theme.surface}`}
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
                                className={`flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left ${theme.hoverAccentSoft}`}
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
                                  <div className="min-w-0 truncate text-sm font-semibold">
                                    {row.key}
                                  </div>
                                  <div
                                    className={`shrink-0 text-xs tabular-nums ${theme.muted}`}
                                  >
                                    {Number(
                                      row.count || 0
                                    ).toLocaleString('nb-NO')}
                                  </div>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div
                                  className={`px-4 pb-4 ${theme.surface}`}
                                >
                                  {(() => {
                                    const isPivot2dOpen =
                                      !!pivot2dUiByCategory?.[
                                        activeTab
                                      ]?.[row.keyUpper]?.open;

                                    return (
                                      <>
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                          <div
                                            className={`text-xs ${theme.muted}`}
                                          >
                                            Utvidet visning viser
                                            2D-krysstabell (maks 200
                                            rader og 25 kolonner;
                                            resten = Andre).
                                          </div>
                                          <button
                                            type="button"
                                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surfaceMuted} ${theme.primaryRing}`}
                                            onClick={async () => {
                                              togglePivot2dUi(
                                                activeTab,
                                                row.keyUpper
                                              );
                                              const nextUi =
                                                pivot2dUiByCategory?.[
                                                  activeTab
                                                ]?.[row.keyUpper];
                                              const secondaryKeyUpper =
                                                String(
                                                  nextUi?.secondaryKeyUpper ||
                                                    'OBJTYPE'
                                                ).toUpperCase();
                                              // Only compute when opening.
                                              if (!nextUi?.open) {
                                                await ensurePivot2D(
                                                  activeTab,
                                                  row.keyUpper,
                                                  secondaryKeyUpper
                                                );
                                              }
                                            }}
                                          >
                                            <Settings2 className="h-3.5 w-3.5" />
                                            {isPivot2dOpen
                                              ? 'Enkel visning'
                                              : 'Utvidet visning'}
                                          </button>
                                        </div>

                                        {!isPivot2dOpen ? (
                                          <>
                                            {pivot?.status ===
                                            'loading' ? (
                                              <div
                                                className={`flex items-center gap-2 py-3 text-sm ${theme.muted}`}
                                              >
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Beregner fordeling…
                                              </div>
                                            ) : null}

                                            {pivot?.status ===
                                            'ready' ? (
                                              <div
                                                className={`mt-2 overflow-hidden rounded-lg border ${theme.border}`}
                                              >
                                                <div className="w-full max-w-lg">
                                                  <div
                                                    className={`grid grid-cols-[minmax(0,1fr)_6rem] border-b px-2 py-1.5 text-[11px] font-semibold ${theme.surfaceMuted} ${theme.muted}`}
                                                  >
                                                    <div>Verdi</div>
                                                    <div className="text-right">
                                                      Antall
                                                    </div>
                                                  </div>
                                                  <div>
                                                    {(
                                                      pivot.entries ||
                                                      []
                                                    ).map(
                                                      ([
                                                        value,
                                                        count,
                                                      ]) => (
                                                        <div
                                                          key={`${row.keyUpper}:${value}`}
                                                          className={`grid grid-cols-[minmax(0,1fr)_6rem] gap-2 px-2 py-1.5 text-xs border-t ${theme.border} first:border-t-0`}
                                                        >
                                                          <div className="break-all">
                                                            {String(
                                                              value
                                                            )}
                                                          </div>
                                                          <div className="text-right tabular-nums">
                                                            {Number(
                                                              count ||
                                                                0
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
                                          </>
                                        ) : null}

                                        {pivot2dUiByCategory?.[
                                          activeTab
                                        ]?.[row.keyUpper]?.open
                                          ? (() => {
                                              const ui =
                                                pivot2dUiByCategory?.[
                                                  activeTab
                                                ]?.[row.keyUpper] ||
                                                {};
                                              const secondaryKeyUpper =
                                                String(
                                                  ui.secondaryKeyUpper ||
                                                    'OBJTYPE'
                                                ).toUpperCase();
                                              const cacheKey =
                                                pivot2dCacheKey(
                                                  row.keyUpper,
                                                  secondaryKeyUpper
                                                );
                                              const cached =
                                                pivot2dCacheByCategory?.[
                                                  activeTab
                                                ]?.[cacheKey] || null;
                                              const result =
                                                cached?.result ||
                                                null;

                                              const secondaryOptions =
                                                getSecondaryFieldOptions(
                                                  tabData,
                                                  row.keyUpper
                                                );

                                              const sortRows =
                                                ui.sortRows ||
                                                'total';
                                              const sortCols =
                                                ui.sortCols ||
                                                'total';
                                              const heatmap =
                                                !!ui.heatmap;

                                              const rows = result
                                                ? getSortedAxis(
                                                    result.rows,
                                                    result.rowTotals,
                                                    sortRows ===
                                                      'alpha'
                                                      ? 'alpha'
                                                      : 'total'
                                                  )
                                                : [];
                                              const cols = result
                                                ? getSortedAxis(
                                                    result.cols,
                                                    result.colTotals,
                                                    sortCols ===
                                                      'alpha'
                                                      ? 'alpha'
                                                      : 'total'
                                                  )
                                                : [];

                                              let maxCell = 0;
                                              if (result && heatmap) {
                                                for (const r of rows) {
                                                  for (const c of cols) {
                                                    const v = Number(
                                                      result.cells?.[
                                                        r
                                                      ]?.[c] || 0
                                                    );
                                                    if (v > maxCell)
                                                      maxCell = v;
                                                  }
                                                }
                                              }

                                              return (
                                                <div
                                                  className={`mt-3 rounded-lg border p-3 ${theme.border} ${theme.surfaceMuted}`}
                                                >
                                                  <div className="flex flex-col gap-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      <div className="text-xs font-semibold">
                                                        Sekundært felt
                                                      </div>
                                                      <select
                                                        className={`rounded-lg border px-2 py-1 text-xs ${theme.border} ${theme.surface} ${theme.text}`}
                                                        value={
                                                          secondaryKeyUpper
                                                        }
                                                        onChange={async (
                                                          e
                                                        ) => {
                                                          const next =
                                                            String(
                                                              e.target
                                                                .value ||
                                                                'OBJTYPE'
                                                            ).toUpperCase();
                                                          updatePivot2dUi(
                                                            activeTab,
                                                            row.keyUpper,
                                                            {
                                                              secondaryKeyUpper:
                                                                next,
                                                            }
                                                          );
                                                          await ensurePivot2D(
                                                            activeTab,
                                                            row.keyUpper,
                                                            next
                                                          );
                                                        }}
                                                      >
                                                        {secondaryOptions.map(
                                                          (opt) => (
                                                            <option
                                                              key={
                                                                opt.keyUpper
                                                              }
                                                              value={
                                                                opt.keyUpper
                                                              }
                                                            >
                                                              {
                                                                opt.label
                                                              }
                                                            </option>
                                                          )
                                                        )}
                                                      </select>

                                                      <div className="ml-auto flex flex-wrap items-center gap-2">
                                                        <label
                                                          className={`flex items-center gap-1.5 text-xs ${theme.muted}`}
                                                        >
                                                          <input
                                                            type="checkbox"
                                                            className="h-3.5 w-3.5"
                                                            checked={
                                                              heatmap
                                                            }
                                                            onChange={(
                                                              e
                                                            ) =>
                                                              updatePivot2dUi(
                                                                activeTab,
                                                                row.keyUpper,
                                                                {
                                                                  heatmap:
                                                                    e
                                                                      .target
                                                                      .checked,
                                                                }
                                                              )
                                                            }
                                                          />
                                                          Varmekart
                                                        </label>
                                                        <select
                                                          className={`rounded-lg border px-2 py-1 text-xs ${theme.border} ${theme.surface} ${theme.text}`}
                                                          value={
                                                            sortRows
                                                          }
                                                          onChange={(
                                                            e
                                                          ) =>
                                                            updatePivot2dUi(
                                                              activeTab,
                                                              row.keyUpper,
                                                              {
                                                                sortRows:
                                                                  e
                                                                    .target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        >
                                                          <option value="total">
                                                            Sorter
                                                            rader:
                                                            Totalt
                                                          </option>
                                                          <option value="alpha">
                                                            Sorter
                                                            rader:
                                                            Alfabetisk
                                                          </option>
                                                        </select>
                                                        <select
                                                          className={`rounded-lg border px-2 py-1 text-xs ${theme.border} ${theme.surface} ${theme.text}`}
                                                          value={
                                                            sortCols
                                                          }
                                                          onChange={(
                                                            e
                                                          ) =>
                                                            updatePivot2dUi(
                                                              activeTab,
                                                              row.keyUpper,
                                                              {
                                                                sortCols:
                                                                  e
                                                                    .target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        >
                                                          <option value="total">
                                                            Sorter
                                                            kolonner:
                                                            Totalt
                                                          </option>
                                                          <option value="alpha">
                                                            Sorter
                                                            kolonner:
                                                            Alfabetisk
                                                          </option>
                                                        </select>
                                                      </div>
                                                    </div>

                                                    {cached?.status ===
                                                    'loading' ? (
                                                      <div
                                                        className={`flex items-center gap-2 py-2 text-xs ${theme.muted}`}
                                                      >
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Beregner
                                                        krysstabell…
                                                      </div>
                                                    ) : null}

                                                    {result ? (
                                                      <div>
                                                        {result.meta
                                                          ?.secondaryIsNumeric ? (
                                                          <div
                                                            className={`text-xs ${theme.muted}`}
                                                          >
                                                            Sekundært
                                                            felt
                                                            tolkes som
                                                            tall og er
                                                            gruppert i
                                                            intervaller.
                                                          </div>
                                                        ) : null}
                                                        {result.meta
                                                          ?.note ? (
                                                          <div
                                                            className={`mt-1 text-xs ${theme.muted}`}
                                                          >
                                                            {
                                                              result
                                                                .meta
                                                                .note
                                                            }
                                                          </div>
                                                        ) : null}

                                                        <div
                                                          className={`mt-2 overflow-auto rounded-lg border ${theme.border} ${theme.surface}`}
                                                        >
                                                          <table className="w-full border-collapse text-xs">
                                                            <thead>
                                                              <tr
                                                                className={`${theme.surfaceMuted} ${theme.muted}`}
                                                              >
                                                                <th
                                                                  className={`sticky left-0 z-10 border-b px-2 py-1 text-left font-semibold ${theme.border} ${theme.surfaceMuted}`}
                                                                >
                                                                  Verdi
                                                                </th>
                                                                {cols.map(
                                                                  (
                                                                    c
                                                                  ) => (
                                                                    <th
                                                                      key={
                                                                        c
                                                                      }
                                                                      className={`border-b px-2 py-1 text-right font-semibold tabular-nums ${theme.border}`}
                                                                    >
                                                                      {
                                                                        c
                                                                      }
                                                                    </th>
                                                                  )
                                                                )}
                                                                <th
                                                                  className={`border-b px-2 py-1 text-right font-semibold tabular-nums ${theme.border}`}
                                                                >
                                                                  Totalt
                                                                </th>
                                                              </tr>
                                                            </thead>
                                                            <tbody>
                                                              {rows.map(
                                                                (
                                                                  r
                                                                ) => (
                                                                  <tr
                                                                    key={
                                                                      r
                                                                    }
                                                                  >
                                                                    <td
                                                                      className={`sticky left-0 z-10 border-t px-2 py-1 font-semibold ${theme.border} ${theme.surface}`}
                                                                    >
                                                                      {
                                                                        r
                                                                      }
                                                                    </td>
                                                                    {cols.map(
                                                                      (
                                                                        c
                                                                      ) => {
                                                                        const v =
                                                                          Number(
                                                                            result
                                                                              .cells?.[
                                                                              r
                                                                            ]?.[
                                                                              c
                                                                            ] ||
                                                                              0
                                                                          );
                                                                        const intensity =
                                                                          heatmap &&
                                                                          maxCell >
                                                                            0
                                                                            ? v /
                                                                              maxCell
                                                                            : 0;
                                                                        return (
                                                                          <td
                                                                            key={`${r}:${c}`}
                                                                            className={`relative border-t px-2 py-1 text-right tabular-nums ${theme.border}`}
                                                                          >
                                                                            {heatmap ? (
                                                                              <div
                                                                                className={`pointer-events-none absolute inset-0 ${theme.accentSoft}`}
                                                                                style={{
                                                                                  opacity:
                                                                                    Math.min(
                                                                                      0.8,
                                                                                      Math.max(
                                                                                        0,
                                                                                        intensity
                                                                                      )
                                                                                    ),
                                                                                }}
                                                                              />
                                                                            ) : null}
                                                                            <span className="relative">
                                                                              {v.toLocaleString(
                                                                                'nb-NO'
                                                                              )}
                                                                            </span>
                                                                          </td>
                                                                        );
                                                                      }
                                                                    )}
                                                                    <td
                                                                      className={`border-t px-2 py-1 text-right font-semibold tabular-nums ${theme.border}`}
                                                                    >
                                                                      {Number(
                                                                        result
                                                                          .rowTotals?.[
                                                                          r
                                                                        ] ||
                                                                          0
                                                                      ).toLocaleString(
                                                                        'nb-NO'
                                                                      )}
                                                                    </td>
                                                                  </tr>
                                                                )
                                                              )}
                                                              <tr
                                                                className={`${theme.surfaceMuted}`}
                                                              >
                                                                <td
                                                                  className={`sticky left-0 z-10 border-t px-2 py-1 font-semibold ${theme.border} ${theme.surfaceMuted}`}
                                                                >
                                                                  Totalt
                                                                </td>
                                                                {cols.map(
                                                                  (
                                                                    c
                                                                  ) => (
                                                                    <td
                                                                      key={`tot:${c}`}
                                                                      className={`border-t px-2 py-1 text-right font-semibold tabular-nums ${theme.border}`}
                                                                    >
                                                                      {Number(
                                                                        result
                                                                          .colTotals?.[
                                                                          c
                                                                        ] ||
                                                                          0
                                                                      ).toLocaleString(
                                                                        'nb-NO'
                                                                      )}
                                                                    </td>
                                                                  )
                                                                )}
                                                                <td
                                                                  className={`border-t px-2 py-1 text-right font-semibold tabular-nums ${theme.border}`}
                                                                >
                                                                  {Number(
                                                                    result.grandTotal ||
                                                                      0
                                                                  ).toLocaleString(
                                                                    'nb-NO'
                                                                  )}
                                                                </td>
                                                              </tr>
                                                            </tbody>
                                                          </table>
                                                        </div>
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                </div>
                                              );
                                            })()
                                          : null}
                                      </>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
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

                    {/* EIER filter section */}
                    {availableEierValues[activeTab]?.length > 0 && (
                      <div
                        className={`mt-4 rounded-lg border p-3 ${theme.border} ${theme.surfaceMuted}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">
                              Eier (EIER)
                            </h3>
                            <p className={`text-xs ${theme.muted}`}>
                              Velg hvilke eiertyper som skal
                              inkluderes i eksporten. Standard: K
                              (kommunal).
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`rounded-md border px-2 py-1 text-xs font-medium ${theme.border} ${theme.surface}`}
                              onClick={() => selectAllEier(activeTab)}
                            >
                              Alle
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border px-2 py-1 text-xs font-medium ${theme.border} ${theme.surface}`}
                              onClick={() =>
                                deselectAllEier(activeTab)
                              }
                            >
                              Ingen
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableEierValues[activeTab].map(
                            ({ value, count }) => {
                              const checked = (
                                selection.eierByCategory[activeTab] ||
                                []
                              ).includes(value);
                              return (
                                <label
                                  key={value}
                                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 ${theme.hoverAccentSoft}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleEier(activeTab, value)
                                    }
                                    className="h-4 w-4"
                                  />
                                  <span className="text-sm font-medium">
                                    {value}
                                  </span>
                                  <span
                                    className={`text-xs ${theme.muted}`}
                                  >
                                    ({count.toLocaleString('nb-NO')})
                                  </span>
                                </label>
                              );
                            }
                          )}
                        </div>

                        {availableStatusValues[activeTab]?.length > 0 ? (
                          <div className={`mt-4 border-t pt-3 ${theme.border}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-semibold">
                                  Status (STATUS)
                                </h3>
                                <p className={`text-xs ${theme.muted}`}>
                                  Valgfritt eksportfilter basert på STATUS. Tomt valg betyr ingen filtrering.
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className={`rounded-md border px-2 py-1 text-xs font-medium ${theme.border} ${theme.surface}`}
                                  onClick={() =>
                                    selectAllStatus(activeTab)
                                  }
                                >
                                  Alle
                                </button>
                                <button
                                  type="button"
                                  className={`rounded-md border px-2 py-1 text-xs font-medium ${theme.border} ${theme.surface}`}
                                  onClick={() =>
                                    deselectAllStatus(activeTab)
                                  }
                                >
                                  Ingen
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {availableStatusValues[activeTab].map(
                                ({ value, count }) => {
                                  const checked = (
                                    selection.statusByCategory?.[
                                      activeTab
                                    ] || []
                                  ).includes(value);
                                  return (
                                    <label
                                      key={value}
                                      className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 ${theme.hoverAccentSoft}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleStatus(
                                            activeTab,
                                            value
                                          )
                                        }
                                        className="h-4 w-4"
                                      />
                                      <span className="text-sm font-medium">
                                        {value}
                                      </span>
                                      <span
                                        className={`text-xs ${theme.muted}`}
                                      >
                                        ({count.toLocaleString('nb-NO')})
                                      </span>
                                    </label>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
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
                                    className="h-4 w-4"
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
                          <div className="space-y-0.5">
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
                                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                                    theme.hoverAccentSoft
                                  } ${
                                    locked
                                      ? 'cursor-not-allowed opacity-60'
                                      : 'cursor-pointer'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={locked}
                                    className="h-4 w-4"
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
                                    className={`font-mono text-xs ${
                                      locked ? 'italic' : ''
                                    }`}
                                  >
                                    {fieldKey}
                                  </span>
                                  {locked && (
                                    <span
                                      className={`ml-auto text-xs ${theme.muted}`}
                                    >
                                      låst
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className="inline-flex"
                        title={
                          canProceedToExclusionsFromFilter
                            ? ''
                            : 'Du må åpne både «Punkter» og «Ledninger» før du kan gå videre.'
                        }
                      >
                        <button
                          type="button"
                          disabled={!canProceedToExclusionsFromFilter}
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing} disabled:opacity-50`}
                          onClick={() => {
                            if (!canProceedToExclusionsFromFilter)
                              return;
                            setStep('exclude');
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Gå til ekskludering
                        </button>
                      </span>
                      {!canProceedToExclusionsFromFilter ? (
                        <div className={`text-xs ${theme.muted}`}>
                          Åpne både «Punkter» og «Ledninger» før du
                          går videre.
                        </div>
                      ) : null}
                    </div>

                    <details className="relative">
                      <summary
                        className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                      >
                        <Filter className="h-4 w-4" />
                        Avanserte valg
                        <ChevronDown className="h-4 w-4" />
                      </summary>
                      <div
                        className={`absolute right-0 bottom-full z-20 mb-2 w-80 overflow-hidden rounded-xl border shadow-lg ${theme.border} ${theme.surface}`}
                      >
                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                          onClick={() => setShowResetConfirm(true)}
                        >
                          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Tilbakestill til standard (fra fil)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Nullstiller objekttyper, felter og eier.
                              Ekskluderingslisten beholdes.
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

            {step === 'exclude' && exploreData && available ? (
              <section className="flex h-full flex-col">
                <div
                  className={`flex h-full flex-col rounded-xl border p-6 ${theme.border} ${theme.surface}`}
                >
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Ekskluder objekter
                    </h2>
                    <div className={`mt-1 text-sm ${theme.muted}`}>
                      Søk etter SID for å finne objekter. Objekter i
                      ekskluderingslisten fjernes fra eksporten.
                    </div>
                  </div>

                  {/* SID Search Section */}
                  <div
                    className={`mt-4 rounded-xl border p-4 ${theme.border} ${theme.surfaceMuted}`}
                  >
                    <div className="text-sm font-semibold">
                      Søk etter SID
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex min-w-48 flex-1 flex-col">
                        <span className={`text-xs ${theme.muted}`}>
                          SID-nummer
                        </span>
                        <input
                          className={`mt-1 rounded-md border px-3 py-2 text-sm outline-none ${theme.surface} ${theme.text} ${theme.border}`}
                          inputMode="numeric"
                          placeholder="f.eks. 1234"
                          value={sidSearchInput}
                          onChange={(e) =>
                            setSidSearchInput(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              performSidSearch();
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className={`rounded-md border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                        onClick={performSidSearch}
                      >
                        Søk
                      </button>
                      {sidSearchPerformed && (
                        <button
                          type="button"
                          className={`rounded-md border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                          onClick={clearSidSearch}
                        >
                          Tøm
                        </button>
                      )}
                    </div>

                    {/* Search Results */}
                    {sidSearchPerformed && (
                      <div className="mt-3">
                        {sidSearchResults.length === 0 ? (
                          <div className={`text-sm ${theme.muted}`}>
                            Ingen objekter funnet med SID «
                            {sidSearchInput}».
                          </div>
                        ) : (
                          <div>
                            <div
                              className={`text-xs font-semibold ${theme.muted}`}
                            >
                              {sidSearchResults.length} objekt
                              {sidSearchResults.length > 1
                                ? 'er'
                                : ''}{' '}
                              funnet:
                            </div>
                            <div
                              className={`mt-2 overflow-hidden rounded-lg border ${theme.border}`}
                            >
                              {sidSearchResults.map((match, idx) => {
                                const isSelected =
                                  selectedSidMatch === match;
                                const metaParts = [
                                  getCategoryLabel(match.category),
                                ];
                                if (match.objType)
                                  metaParts.push(match.objType);
                                if (match.tema)
                                  metaParts.push(match.tema);
                                if (match.category === 'ledninger') {
                                  if (match.dimensjon)
                                    metaParts.push(
                                      `Ø ${match.dimensjon}`
                                    );
                                  if (match.material)
                                    metaParts.push(match.material);
                                }

                                // Check if already excluded
                                const existingList =
                                  selection?.excludedByCategory?.[
                                    match.category
                                  ] || [];
                                const alreadyExcluded =
                                  existingList.some(
                                    (e) =>
                                      e.idType === 'SID' &&
                                      e.id === match.sid
                                  );

                                return (
                                  <div
                                    key={`${match.category}:${idx}`}
                                    className={`border-t px-3 py-2 first:border-t-0 ${
                                      theme.border
                                    } ${
                                      isSelected
                                        ? theme.accentSoft
                                        : ''
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold">
                                          SID {match.sid}
                                        </div>
                                        <div
                                          className={`mt-0.5 text-xs ${theme.muted}`}
                                        >
                                          {metaParts.join(' · ')}
                                        </div>
                                      </div>
                                      {alreadyExcluded ? (
                                        <div
                                          className={`text-xs font-semibold ${theme.muted}`}
                                        >
                                          Allerede ekskludert
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                                            theme.border
                                          } ${theme.surface} ${
                                            theme.primaryRing
                                          } ${
                                            isSelected
                                              ? 'ring-2 ring-emerald-500'
                                              : ''
                                          }`}
                                          onClick={() =>
                                            setSelectedSidMatch(
                                              isSelected
                                                ? null
                                                : match
                                            )
                                          }
                                        >
                                          {isSelected
                                            ? 'Valgt'
                                            : 'Velg'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Comment and Add */}
                    {selectedSidMatch && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="flex min-w-48 flex-1 flex-col">
                          <span className={`text-xs ${theme.muted}`}>
                            Kommentar (valgfri)
                          </span>
                          <input
                            className={`mt-1 rounded-md border px-3 py-2 text-sm outline-none ${theme.surface} ${theme.text} ${theme.border}`}
                            placeholder="f.eks. kritisk infrastruktur"
                            value={sidExcludeComment}
                            onChange={(e) =>
                              setSidExcludeComment(e.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing}`}
                          onClick={addSelectedSidMatch}
                        >
                          <Trash2 className="h-4 w-4" />
                          Legg til i ekskluderingslisten
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Exclusion Lists */}
                  <div className="mt-5 min-h-0 flex-1 overflow-hidden">
                    <div className="grid h-full grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2">
                      {['punkter', 'ledninger'].map((cat) => {
                        const list =
                          selection?.excludedByCategory?.[cat] || [];
                        return (
                          <div
                            key={cat}
                            className={`flex min-h-0 flex-col rounded-xl border p-4 ${theme.border} ${theme.surfaceMuted}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold">
                                {getCategoryLabel(cat)}
                              </div>
                              <div
                                className={`text-xs ${theme.muted}`}
                              >
                                {list.length} ekskludert
                              </div>
                            </div>

                            <div className="mt-3 min-h-0 flex-1 overflow-auto">
                              {list.length === 0 ? (
                                <div
                                  className={`text-xs ${theme.muted}`}
                                >
                                  Ingen ekskluderte objekter.
                                </div>
                              ) : (
                                <div
                                  className={`overflow-hidden rounded-lg border ${theme.border}`}
                                >
                                  {list.map((entry, idx) => {
                                    const meta = entry?.meta || null;
                                    const metaParts = [];
                                    if (meta?.objType)
                                      metaParts.push(meta.objType);
                                    if (cat === 'ledninger') {
                                      if (meta?.dimensjon)
                                        metaParts.push(
                                          `Ø ${meta.dimensjon}`
                                        );
                                      if (meta?.material)
                                        metaParts.push(meta.material);
                                    }
                                    if (cat === 'punkter') {
                                      if (meta?.tema)
                                        metaParts.push(meta.tema);
                                    }

                                    return (
                                      <div
                                        key={`${cat}:${idx}:${entry.id}`}
                                        className={`border-t px-3 py-2 first:border-t-0 ${theme.border}`}
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="text-sm font-semibold">
                                              SID {entry.id}
                                            </div>
                                            <div
                                              className={`mt-0.5 text-xs ${theme.muted}`}
                                            >
                                              {metaParts.length > 0
                                                ? metaParts.join(
                                                    ' · '
                                                  )
                                                : 'Ikke funnet i filen'}
                                            </div>
                                            {entry.comment ? (
                                              <div
                                                className={`mt-0.5 text-xs ${theme.muted}`}
                                              >
                                                {entry.comment}
                                              </div>
                                            ) : null}
                                          </div>
                                          <button
                                            type="button"
                                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                                            onClick={() =>
                                              removeExcludedEntry(
                                                cat,
                                                idx
                                              )
                                            }
                                          >
                                            <Trash2 className="h-3 w-3" />
                                            Fjern
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing}`}
                        onClick={() => setStep('download')}
                      >
                        <Download className="h-4 w-4" />
                        Gå til nedlasting
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
                    <details className="relative">
                      <summary
                        className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                      >
                        <Filter className="h-4 w-4" />
                        Avanserte valg
                        <ChevronDown className="h-4 w-4" />
                      </summary>
                      <div
                        className={`absolute right-0 bottom-full z-20 mb-2 w-80 overflow-hidden rounded-xl border shadow-lg ${theme.border} ${theme.surface}`}
                      >
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !file ||
                            (selection?.excludedByCategory?.punkter
                              ?.length || 0) +
                              (selection?.excludedByCategory
                                ?.ledninger?.length || 0) ===
                              0
                          }
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left ${theme.hoverAccentSoft} disabled:opacity-50`}
                          onClick={downloadExcludedOnly}
                        >
                          <Download className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Last ned ekskluderte (SOSI)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Generer en fil som kun inneholder de
                              ekskluderte objektene.
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 border-t px-4 py-3 text-left ${theme.hoverAccentSoft}`}
                          onClick={() => setShowResetConfirm(true)}
                        >
                          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">
                              Tilbakestill til standard (fra fil)
                            </div>
                            <div className={`text-xs ${theme.muted}`}>
                              Nullstiller objekttyper, felter og eier.
                              Ekskluderingslisten beholdes.
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

                  <div className="mt-5">
                    <div className="text-sm font-semibold">
                      Hvordan skal felter håndteres?
                    </div>
                    <div className={`mt-1 text-xs ${theme.muted}`}>
                      Velg ett alternativ før nedlasting.
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${theme.border} ${theme.surfaceMuted} ${theme.hoverAccentSoft}`}
                      >
                        <input
                          type="radio"
                          name="downloadFieldMode"
                          checked={
                            downloadFieldMode === 'remove-fields'
                          }
                          onChange={() =>
                            setDownloadFieldMode('remove-fields')
                          }
                        />
                        <div>
                          <div className="text-sm font-semibold">
                            Fjern felter helt
                          </div>
                          <div
                            className={`mt-0.5 text-xs ${theme.muted}`}
                          >
                            Uønskede felter fjernes fra objektene.
                          </div>
                        </div>
                      </label>

                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${theme.border} ${theme.surfaceMuted} ${theme.hoverAccentSoft}`}
                      >
                        <input
                          type="radio"
                          name="downloadFieldMode"
                          checked={
                            downloadFieldMode === 'clear-values'
                          }
                          onChange={() =>
                            setDownloadFieldMode('clear-values')
                          }
                        />
                        <div>
                          <div className="text-sm font-semibold">
                            Behold felter, fjern verdier
                          </div>
                          <div
                            className={`mt-0.5 text-xs ${theme.muted}`}
                          >
                            Feltlinjene beholdes, men verdier slettes.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!file || busy || !downloadFieldMode}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing} disabled:opacity-50`}
                      onClick={downloadCleaned}
                    >
                      <Download className="h-4 w-4" />
                      Last ned renset SOSI
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                      onClick={() => setStep('exclude')}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Tilbake til ekskludering
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div
            className={`w-full max-w-sm rounded-xl border p-5 shadow-lg ${theme.border} ${theme.surface}`}
            role="dialog"
            aria-labelledby="reset-dialog-title"
          >
            <h3
              id="reset-dialog-title"
              className={`text-lg font-semibold ${theme.text}`}
            >
              Tilbakestill filtere?
            </h3>
            <p className={`mt-2 text-sm ${theme.muted}`}>
              Dette vil nullstille objekttyper, felter og eiervalg til
              standardverdier fra filen. Ekskluderingslisten beholdes.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${theme.border} ${theme.surface} ${theme.primaryRing}`}
                onClick={() => setShowResetConfirm(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${theme.primary} ${theme.primaryRing}`}
                onClick={resetFiltersToDefaults}
              >
                Tilbakestill
              </button>
            </div>
          </div>
        </div>
      )}

      {busy ? (
        <LoadingOverlay theme={theme} label={busyLabel} />
      ) : null}
    </div>
  );
}
