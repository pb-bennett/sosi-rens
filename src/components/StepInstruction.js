/**
 * @file StepInstruction.js
 * Consistent instruction banner shown at the top of each step.
 */

/**
 * Step instruction banner component.
 * @param {Object} props
 * @param {Object} props.theme - Theme tokens.
 * @param {string} props.title - Step title.
 * @param {string} props.description - Step description.
 * @returns {JSX.Element}
 */
export function StepInstruction({ theme, title, description }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className={`mt-1 text-sm ${theme.muted}`}>{description}</p>
    </div>
  );
}
