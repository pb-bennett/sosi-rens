/**
 * @file SettingsDropdown.js
 * Dropdown menu for import/export settings, consistent across all steps.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Download, Upload, Trash2 } from 'lucide-react';

/**
 * Settings dropdown component for import/export functionality.
 * @param {Object} props
 * @param {Object} props.theme - Theme tokens.
 * @param {() => void} props.onExport - Export settings callback.
 * @param {(file: File) => void} props.onImport - Import settings callback.
 * @param {() => void} [props.onClear] - Optional clear settings callback.
 * @param {string} [props.exportLabel] - Label for export button.
 * @param {string} [props.importLabel] - Label for import button.
 * @param {string} [props.clearLabel] - Label for clear button.
 * @returns {JSX.Element}
 */
export function SettingsDropdown({
  theme,
  onExport,
  onImport,
  onClear,
  exportLabel = 'Eksporter innstillinger',
  importLabel = 'Importer innstillinger',
  clearLabel = 'Nullstill innstillinger',
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleImportClick() {
    fileInputRef.current?.click();
    setOpen(false);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }

  function handleExportClick() {
    onExport();
    setOpen(false);
  }

  function handleClearClick() {
    if (onClear) {
      onClear();
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${theme.border} ${theme.surface} ${theme.text} hover:opacity-80`}
        onClick={() => setOpen(!open)}
      >
        Innstillinger
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute right-0 z-50 mt-2 w-56 rounded-lg border shadow-lg ${theme.border} ${theme.surface}`}
        >
          <div className="py-1">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${theme.text} hover:${theme.surfaceMuted}`}
              onClick={handleExportClick}
            >
              <Download className="h-4 w-4" />
              {exportLabel}
            </button>
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${theme.text} hover:${theme.surfaceMuted}`}
              onClick={handleImportClick}
            >
              <Upload className="h-4 w-4" />
              {importLabel}
            </button>
            {onClear && (
              <>
                <div className={`my-1 border-t ${theme.border}`} />
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:${theme.surfaceMuted}`}
                  onClick={handleClearClick}
                >
                  <Trash2 className="h-4 w-4" />
                  {clearLabel}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
