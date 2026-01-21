/**
 * @file CategoryTabs.js
 * Reusable tab switcher for Punkter/Ledninger categories.
 */

/**
 * Tab switcher for Punkter/Ledninger.
 * @param {Object} props
 * @param {Object} props.theme - Current theme tokens.
 * @param {'punkter' | 'ledninger'} props.value - Active tab.
 * @param {(tab: 'punkter' | 'ledninger') => void} props.onChange - Tab change handler.
 * @param {Object} [props.visitedTabs] - Optional visited state { punkter: bool, ledninger: bool }.
 * @returns {JSX.Element}
 */
export function CategoryTabs({
  theme,
  value,
  onChange,
  visitedTabs,
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border p-1 ${theme.border} ${theme.tabList}`}
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'punkter'}
        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          value === 'punkter' ? theme.tabActive : theme.tabInactive
        }`}
        onClick={() => onChange('punkter')}
      >
        Punkter
        {visitedTabs && visitedTabs.punkter && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
            title="Besøkt"
          />
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'ledninger'}
        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          value === 'ledninger' ? theme.tabActive : theme.tabInactive
        }`}
        onClick={() => onChange('ledninger')}
      >
        Ledninger
        {visitedTabs && visitedTabs.ledninger && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
            title="Besøkt"
          />
        )}
      </button>
    </div>
  );
}
