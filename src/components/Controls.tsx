import type { ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type {
  ConnectorParams,
  OrientationMode,
  StickType,
} from '../geometry/connector';

interface ControlsProps {
  params: ConnectorParams;
  onChange: (patch: Partial<ConnectorParams>) => void;
  onExport: () => void;
  building: boolean;
  showSticks: boolean;
  onToggleSticks: (v: boolean) => void;
  exportNote?: string | null;
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit && <em>{unit}</em>}
      </span>
      <div className="field-inputs">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
      </div>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Controls({
  params,
  onChange,
  onExport,
  building,
  showSticks,
  onToggleSticks,
  exportNote,
}: ControlsProps) {
  const p = params;
  const widthLabel =
    p.stickType === 'ROUND'
      ? 'Stick diameter'
      : p.stickType === 'SQUARE'
        ? 'Stick side'
        : 'Stick width (wide side)';

  return (
    <aside className="controls">
      <Section title="Stick Profile">
        <label className="field">
          <span className="field-label">Stick profile type</span>
          <select
            value={p.stickType}
            onChange={(e) => onChange({ stickType: e.target.value as StickType })}
          >
            <option value="RECTANGULAR">Rectangular</option>
            <option value="SQUARE">Square</option>
            <option value="ROUND">Round (dowel)</option>
          </select>
        </label>
        <NumberField
          label={widthLabel}
          unit="mm"
          value={p.rectWidth}
          min={2}
          max={50}
          step={0.5}
          onChange={(v) => onChange({ rectWidth: v })}
        />
        {p.stickType === 'RECTANGULAR' && (
          <NumberField
            label="Stick height (thin side)"
            unit="mm"
            value={p.rectHeight}
            min={1}
            max={50}
            step={0.5}
            onChange={(v) => onChange({ rectHeight: v })}
          />
        )}
        <label className="field">
          <span className="field-label">Orientation (orthonormal basis)</span>
          <select
            value={p.orientationMode}
            onChange={(e) =>
              onChange({ orientationMode: e.target.value as OrientationMode })
            }
          >
            <option value="TANGENTIAL">Tangential (Flat) — wide side around the ring</option>
            <option value="RADIAL">Radial (Upright) — wide side along the slope</option>
          </select>
        </label>
      </Section>

      <Section title="Umbrella Layout">
        <NumberField
          label="Number of sticks"
          value={p.numSticks}
          min={1}
          max={24}
          step={1}
          onChange={(v) => onChange({ numSticks: Math.round(v) })}
        />
        <NumberField
          label="Umbrella slope angle"
          unit="°"
          value={p.umbrellaAngleDeg}
          min={0}
          max={80}
          step={1}
          onChange={(v) => onChange({ umbrellaAngleDeg: v })}
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={p.includeCenterStem}
            onChange={(e) => onChange({ includeCenterStem: e.target.checked })}
          />
          <span>Include center stem socket (hub axis)</span>
        </label>
      </Section>

      <Section title="Fit &amp; Strength">
        <NumberField
          label="Printer offset (clearance per side)"
          unit="mm"
          value={p.printerOffset}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ printerOffset: v })}
        />
        <NumberField
          label="Socket depth"
          unit="mm"
          value={p.socketDepth}
          min={5}
          max={60}
          step={1}
          onChange={(v) => onChange({ socketDepth: v })}
        />
        <NumberField
          label="Wall thickness"
          unit="mm"
          value={p.wallThickness}
          min={1}
          max={10}
          step={0.25}
          onChange={(v) => onChange({ wallThickness: v })}
        />
        <NumberField
          label="Screw hole diameter (0 = off)"
          unit="mm"
          value={p.screwHoleDiameter}
          min={0}
          max={8}
          step={0.1}
          onChange={(v) => onChange({ screwHoleDiameter: v })}
        />
        <NumberField
          label="Entry chamfer (0 = off)"
          unit="mm"
          value={p.chamferEntry}
          min={0}
          max={5}
          step={0.25}
          onChange={(v) => onChange({ chamferEntry: v })}
        />
      </Section>

      <Section title="Preview &amp; Export">
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={showSticks}
            onChange={(e) => onToggleSticks(e.target.checked)}
          />
          <span>Show ghost sticks</span>
        </label>
        <button className="export" onClick={onExport} disabled={building}>
          {building ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
          Export STL
        </button>
        {exportNote && <p className="export-note">{exportNote}</p>}
      </Section>
    </aside>
  );
}
