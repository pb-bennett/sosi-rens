/**
 * @file ObjectFilterStep.js
 * Step component for object filtering with dynamic field-based filters.
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus,
  X,
  GripVertical,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { StepInstruction } from './StepInstruction.js';
import { CategoryTabs } from './CategoryTabs.js';
import { SettingsDropdown } from './SettingsDropdown.js';
import {
  computeFieldValues,
  HIGH_CARDINALITY_THRESHOLD,
  TOKEN_MISSING,
  TOKEN_EMPTY,
} from '../lib/sosi/filterPreview.js';

/**
 * Object filter step component.
 * @param {Object} props
 * @param {Object} props.theme - Theme tokens.
 * @param {string} props.sosiText - Full SOSI file text.
 * @param {Object} props.exploreData - Analysis data with fields per category.
 * @param {Object} props.selection - Current selection state.
 * @param {(updater: (prev: Object) => Object) => void} props.setSelection - Selection updater.
 * @param {'punkter' | 'ledninger'} props.activeTab - Currently active tab.
 * @param {(tab: 'punkter' | 'ledninger') => void} props.setActiveTab - Tab change handler.
 * @param {Object} props.visitedTabs - { punkter: bool, ledninger: bool }.
 * @param {() => void} props.onExportSettings - Export settings handler.
 * @param {(file: File) => void} props.onImportSettings - Import settings handler.
 * @returns {JSX.Element}
 */
export function ObjectFilterStep({
  theme,
  sosiText,
  exploreData,
  selection,
  setSelection,
  activeTab,
  setActiveTab,
  visitedTabs,
  onExportSettings,
  onImportSettings,
}) {
  const [fieldSearch, setFieldSearch] = useState('');
  const [valueSearches, setValueSearches] = useState({}); // fieldKey -> search string
  const [expandedFilters, setExpandedFilters] = useState({}); // fieldKey -> bool
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draftFilters, setDraftFilters] = useState(null);
  const [fieldValuesCache, setFieldValuesCache] = useState({}); // `${tab}:${FIELD}` -> { values, isHighCardinality }

  // Get active filters for current tab - memoized to fix exhaustive deps warning
  const activeFilters = useMemo(
    () => selection.objectFiltersByCategory?.[activeTab] || [],
    [selection.objectFiltersByCategory, activeTab]
  );

  const priorityFieldKeys = useMemo(() => ['OBJTYPE', 'EIER', 'STATUS'], []);

  const computeAndCacheFieldValues = useCallback(
    (fieldKeyUpper) => {
      const fieldKey = String(fieldKeyUpper).toUpperCase();
      const cacheKey = `${activeTab}:${fieldKey}`;
      const computed = computeFieldValues(sosiText, activeTab, fieldKey);
      setFieldValuesCache((prev) => ({
        ...prev,
        [cacheKey]: computed,
      }));
      return computed;
    },
    [activeTab, sosiText]
  );

  // Get all available fields for current tab
  const allFields = useMemo(() => {
    const base = exploreData?.[activeTab]?.fields || [];
    const byKey = new Map();

    for (const [key, count] of base) {
      const keyUpper = String(key).toUpperCase();
      byKey.set(keyUpper, Number(count || 0));
    }

    // Always expose priority keys at the top.
    // Even if not present in the file, users may want to filter on (mangler)/(tom).
    for (const key of priorityFieldKeys) {
      if (!byKey.has(key)) byKey.set(key, 0);
    }

    const prioritizedIndex = new Map(
      priorityFieldKeys.map((k, i) => [k, i])
    );

    return Array.from(byKey.entries()).sort(([aKey], [bKey]) => {
      const aPri = prioritizedIndex.has(aKey)
        ? prioritizedIndex.get(aKey)
        : Number.POSITIVE_INFINITY;
      const bPri = prioritizedIndex.has(bKey)
        ? prioritizedIndex.get(bKey)
        : Number.POSITIVE_INFINITY;
      if (aPri !== bPri) return aPri - bPri;
      return String(aKey).localeCompare(String(bKey));
    });
  }, [exploreData, activeTab, priorityFieldKeys]);

  // Fields not yet added to active filters
  const availableFields = useMemo(() => {
    const activeKeys = new Set(activeFilters.map((f) => f.fieldKeyUpper));
    return allFields.filter(([key]) => !activeKeys.has(key));
  }, [allFields, activeFilters]);

  // Filtered available fields based on search
  const filteredAvailableFields = useMemo(() => {
    if (!fieldSearch.trim()) return availableFields;
    const search = fieldSearch.toLowerCase();
    return availableFields.filter(([key]) =>
      key.toLowerCase().includes(search)
    );
  }, [availableFields, fieldSearch]);

  // Add a field to active filters
  const addFilter = useCallback(
    (fieldKeyUpper) => {
      const computed = computeAndCacheFieldValues(fieldKeyUpper);
      if (computed?.isHighCardinality) {
        const confirmed = window.confirm(
          `Feltet "${fieldKeyUpper}" har mer enn ${HIGH_CARDINALITY_THRESHOLD} unike verdier, ` +
            `noe som kan gjøre filtreringen kompleks. Vil du fortsatt legge det til?`
        );
        if (!confirmed) return;
      }

      // Start with all values selected
      const allValueTokens = (computed?.values || []).map((v) => v.value);

      setSelection((prev) => {
        const currentFilters = prev.objectFiltersByCategory?.[activeTab] || [];
        const newFilter = {
          fieldKeyUpper,
          selectedValues: allValueTokens,
        };
        return {
          ...prev,
          objectFiltersByCategory: {
            ...prev.objectFiltersByCategory,
            [activeTab]: [...currentFilters, newFilter],
          },
        };
      });

      // Expand the new filter
      setExpandedFilters((prev) => ({ ...prev, [fieldKeyUpper]: true }));
    },
    [activeTab, computeAndCacheFieldValues, setSelection, setExpandedFilters]
  );

  // Remove a filter
  const removeFilter = useCallback(
    (index) => {
      setSelection((prev) => {
        const currentFilters = prev.objectFiltersByCategory?.[activeTab] || [];
        const removed = currentFilters[index];
        const newFilters = currentFilters.filter((_, i) => i !== index);
        
        // Clean up expanded state
        if (removed) {
          setExpandedFilters((exp) => {
            const next = { ...exp };
            delete next[removed.fieldKeyUpper];
            return next;
          });
        }
        
        return {
          ...prev,
          objectFiltersByCategory: {
            ...prev.objectFiltersByCategory,
            [activeTab]: newFilters,
          },
        };
      });
    },
    [activeTab, setSelection]
  );

  // Toggle a value in a filter
  const toggleValue = useCallback(
    (filterIndex, value) => {
      setSelection((prev) => {
        const currentFilters = prev.objectFiltersByCategory?.[activeTab] || [];
        const filter = currentFilters[filterIndex];
        if (!filter) return prev;

        const selectedSet = new Set(filter.selectedValues || []);
        if (selectedSet.has(value)) {
          selectedSet.delete(value);
        } else {
          selectedSet.add(value);
        }

        const newFilters = [...currentFilters];
        newFilters[filterIndex] = {
          ...filter,
          selectedValues: [...selectedSet],
        };

        return {
          ...prev,
          objectFiltersByCategory: {
            ...prev.objectFiltersByCategory,
            [activeTab]: newFilters,
          },
        };
      });
    },
    [activeTab, setSelection]
  );

  // Select all values for a filter
  const selectAllValues = useCallback(
    (filterIndex, allValues) => {
      setSelection((prev) => {
        const currentFilters = prev.objectFiltersByCategory?.[activeTab] || [];
        const filter = currentFilters[filterIndex];
        if (!filter) return prev;

        const newFilters = [...currentFilters];
        newFilters[filterIndex] = {
          ...filter,
          selectedValues: allValues,
        };

        return {
          ...prev,
          objectFiltersByCategory: {
            ...prev.objectFiltersByCategory,
            [activeTab]: newFilters,
          },
        };
      });
    },
    [activeTab, setSelection]
  );

  // Deselect all values for a filter
  const deselectAllValues = useCallback(
    (filterIndex) => {
      setSelection((prev) => {
        const currentFilters = prev.objectFiltersByCategory?.[activeTab] || [];
        const filter = currentFilters[filterIndex];
        if (!filter) return prev;

        const newFilters = [...currentFilters];
        newFilters[filterIndex] = {
          ...filter,
          selectedValues: [],
        };

        return {
          ...prev,
          objectFiltersByCategory: {
            ...prev.objectFiltersByCategory,
            [activeTab]: newFilters,
          },
        };
      });
    },
    [activeTab, setSelection]
  );

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    setDraftFilters(activeFilters);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setDraftFilters((prevDraft) => {
      const base = prevDraft || activeFilters;
      const next = [...base];
      const [removed] = next.splice(draggedIndex, 1);
      next.splice(index, 0, removed);
      setDraggedIndex(index);
      return next;
    });
  };

  const handleDragEnd = () => {
    if (draftFilters) {
      setSelection((prev) => ({
        ...prev,
        objectFiltersByCategory: {
          ...prev.objectFiltersByCategory,
          [activeTab]: draftFilters,
        },
      }));
    }
    setDraggedIndex(null);
    setDraftFilters(null);
  };

  // Copy filters from other category
  const copyFiltersFromOther = useCallback(() => {
    const otherTab = activeTab === 'punkter' ? 'ledninger' : 'punkter';
    const otherFilters = selection.objectFiltersByCategory?.[otherTab] || [];
    
    if (otherFilters.length === 0) {
      alert(`Ingen filtre å kopiere fra ${otherTab === 'punkter' ? 'Punkter' : 'Ledninger'}.`);
      return;
    }

    // Deep copy and reset expanded state
    const copiedFilters = otherFilters.map((f) => ({
      fieldKeyUpper: f.fieldKeyUpper,
      selectedValues: [...(f.selectedValues || [])],
    }));

    setSelection((prev) => ({
      ...prev,
      objectFiltersByCategory: {
        ...prev.objectFiltersByCategory,
        [activeTab]: copiedFilters,
      },
    }));

    // Expand all copied filters
    const newExpanded = {};
    copiedFilters.forEach((f) => {
      newExpanded[f.fieldKeyUpper] = true;
    });
    setExpandedFilters(newExpanded);
  }, [activeTab, selection.objectFiltersByCategory, setSelection]);

  const displayFilters = draftFilters || activeFilters;

  // Lazy-compute field values for expanded filters after render to keep UI responsive.
  useEffect(() => {
    if (!sosiText || displayFilters.length === 0) return;

    const expandedKeys = displayFilters
      .filter((f) => (expandedFilters[f.fieldKeyUpper] ?? true) === true)
      .map((f) => String(f.fieldKeyUpper).toUpperCase());

    const nextMissing = expandedKeys.find((key) => {
      const cacheKey = `${activeTab}:${key}`;
      return fieldValuesCache[cacheKey] == null;
    });

    if (!nextMissing) return;

    const handle = setTimeout(() => {
      // compute one per tick; effect will rerun until all are cached
      computeAndCacheFieldValues(nextMissing);
    }, 0);

    return () => clearTimeout(handle);
  }, [
    sosiText,
    activeTab,
    displayFilters,
    expandedFilters,
    fieldValuesCache,
    computeAndCacheFieldValues,
  ]);

  return (
    <section className="flex h-full flex-col">
      <div
        className={`flex h-full flex-col rounded-xl border p-6 ${theme.border} ${theme.surface}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <StepInstruction
              theme={theme}
              title="Filtrer objekter"
              description="Velg hvilke felt som skal brukes til å filtrere objekter. Legg til felt i ønsket rekkefølge – hvert filter reduserer antall objekter basert på de forrige."
            />
          </div>
          <SettingsDropdown
            theme={theme}
            onExport={onExportSettings}
            onImport={onImportSettings}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <CategoryTabs
            theme={theme}
            value={activeTab}
            onChange={setActiveTab}
            visitedTabs={visitedTabs}
          />

          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${theme.border} ${theme.surface}`}
            onClick={copyFiltersFromOther}
            title={`Kopier filtre fra ${activeTab === 'punkter' ? 'Ledninger' : 'Punkter'}`}
          >
            <Copy className="h-4 w-4" />
            Kopier fra {activeTab === 'punkter' ? 'Ledninger' : 'Punkter'}
          </button>
        </div>

        {/* Lightweight summary (no live preview counts to keep UI snappy) */}
        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${theme.border} ${theme.surfaceMuted}`}
        >
          <div className={`text-sm ${theme.muted}`}>
            Totalt i fil: <span className={`font-semibold ${theme.text}`}>{
              (exploreData?.[activeTab]?.features || 0).toLocaleString('nb-NO')
            }</span>
          </div>
          <div className={`text-sm ${theme.muted}`}>
            Aktive filtre: <span className={`font-semibold ${theme.text}`}>{
              displayFilters.length
            }</span>
          </div>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2">
          {/* Available fields */}
          <div className="flex min-h-0 flex-col">
            <h3 className="text-sm font-semibold">Tilgjengelige felt</h3>
            <p className={`mt-1 text-xs ${theme.muted}`}>
              Klikk på et felt for å legge det til som filter.
            </p>

            <div className="relative mt-2">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
              <input
                type="text"
                placeholder="Søk i felt..."
                className={`w-full rounded-lg border py-2 pl-10 pr-4 text-sm ${theme.border} ${theme.surface} ${theme.text}`}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
              />
            </div>

            <div
              className={`mt-2 min-h-0 flex-1 overflow-auto rounded-lg border p-2 ${theme.border}`}
            >
              <div className="flex flex-wrap gap-2">
                {filteredAvailableFields.map(([key, count]) => {
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${theme.border} ${theme.surface} hover:${theme.primarySoft}`}
                      onClick={() => addFilter(key)}
                      title={count ? `${count.toLocaleString('nb-NO')} forekomster` : undefined}
                    >
                      <span>{key}</span>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
                {filteredAvailableFields.length === 0 && (
                  <p className={`text-sm ${theme.muted}`}>
                    {fieldSearch ? 'Ingen felt matcher søket.' : 'Alle felt er lagt til som filtre.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Active filters */}
          <div className="flex min-h-0 flex-col">
            <h3 className="text-sm font-semibold">Aktive filtre</h3>
            <p className={`mt-1 text-xs ${theme.muted}`}>
              Dra for å endre rekkefølge. Velg verdier som skal beholdes.
            </p>

            <div
              className={`mt-2 min-h-0 flex-1 overflow-auto rounded-lg border p-2 ${theme.border}`}
            >
              {activeFilters.length === 0 ? (
                <p className={`p-4 text-center text-sm ${theme.muted}`}>
                  Ingen filtre er lagt til. Alle objekter vil bli beholdt.
                </p>
              ) : (
                <div className="space-y-2">
                  {displayFilters.map((filter, index) => {
                    const isExpanded = expandedFilters[filter.fieldKeyUpper] ?? true;
                    const cacheKey = `${activeTab}:${String(filter.fieldKeyUpper).toUpperCase()}`;
                    const cached = fieldValuesCache[cacheKey];
                    const values = cached?.values || [];
                    const selectedSet = new Set(filter.selectedValues || []);
                    const valueSearch = valueSearches[filter.fieldKeyUpper] || '';
                    const filteredValues = valueSearch
                      ? values.filter((v) =>
                          v.value.toLowerCase().includes(valueSearch.toLowerCase())
                        )
                      : values;

                    return (
                      <div
                        key={filter.fieldKeyUpper}
                        className={`rounded-lg border ${theme.border} ${
                          draggedIndex === index ? 'opacity-50' : ''
                        }`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                      >
                        {/* Filter header */}
                        <div
                          className={`flex items-center gap-2 p-2 ${theme.surfaceMuted}`}
                        >
                          <GripVertical
                            className={`h-4 w-4 cursor-grab ${theme.muted}`}
                          />
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-2"
                            onClick={() =>
                              setExpandedFilters((prev) => ({
                                ...prev,
                                [filter.fieldKeyUpper]: !isExpanded,
                              }))
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="font-medium">
                              {filter.fieldKeyUpper}
                            </span>
                            <span className={`text-xs ${theme.muted}`}>
                              ({selectedSet.size}/{values.length} valgt)
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`rounded p-1 hover:bg-red-100 ${theme.muted}`}
                            onClick={() => removeFilter(index)}
                            title="Fjern filter"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Filter values */}
                        {isExpanded && (
                          <div className="border-t p-2">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <div className="relative flex-1">
                                <Search
                                  className={`absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${theme.muted}`}
                                />
                                <input
                                  type="text"
                                  placeholder="Søk i verdier..."
                                  className={`w-full rounded border py-1 pl-8 pr-2 text-xs ${theme.border} ${theme.surface}`}
                                  value={valueSearch}
                                  onChange={(e) =>
                                    setValueSearches((prev) => ({
                                      ...prev,
                                      [filter.fieldKeyUpper]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                className={`rounded border px-2 py-1 text-xs ${theme.border}`}
                                onClick={() =>
                                  selectAllValues(
                                    index,
                                    values.map((v) => v.value)
                                  )
                                }
                              >
                                Alle
                              </button>
                              <button
                                type="button"
                                className={`rounded border px-2 py-1 text-xs ${theme.border}`}
                                onClick={() => deselectAllValues(index)}
                              >
                                Ingen
                              </button>
                            </div>

                            <div className="max-h-48 overflow-auto">
                              {!cached ? (
                                <p className={`p-2 text-xs ${theme.muted}`}>
                                  Laster verdier…
                                </p>
                              ) : null}
                              {filteredValues.map((item) => {
                                const isSelected = selectedSet.has(item.value);
                                const displayValue =
                                  item.value === TOKEN_MISSING
                                    ? '(mangler)'
                                    : item.value === TOKEN_EMPTY
                                      ? '(tom)'
                                      : item.value;

                                return (
                                  <label
                                    key={item.value}
                                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${theme.hoverAccentSoft}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleValue(index, item.value)}
                                      className="h-4 w-4"
                                    />
                                    <span className="flex-1 truncate">{displayValue}</span>
                                    <span className={`text-xs tabular-nums ${theme.muted}`}>
                                      {item.count.toLocaleString('nb-NO')}
                                    </span>
                                  </label>
                                );
                              })}
                              {filteredValues.length === 0 && (
                                <p className={`p-2 text-xs ${theme.muted}`}>
                                  Ingen verdier matcher søket.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
