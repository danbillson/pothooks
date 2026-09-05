import type { ReactNode } from 'react';

/** The handful of ink primitives this harness needs, kept deliberately dumb. */

export function PanelSection({
  title,
  status,
  children,
}: {
  title: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="panel-status">{status ?? '—'}</span>
      </div>
      {children}
    </section>
  );
}

export function LabelValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
    </span>
  );
}

function formatValue(v: number, unit?: string): string {
  // A multiplier is the one unit where the fraction is the point: rounding 1.05
  // to 1 would make a third of the speed slider read the same.
  if (unit === '×') return `${v.toFixed(2)}×`;
  if (unit) return `${Math.round(v)}${unit}`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={disabled ? 'slider disabled' : 'slider'}>
      <span className="slider-head">
        <span>{label}</span>
        <span>{formatValue(value, unit)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(min)}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
