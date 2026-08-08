import type { ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  evenGapsDeg,
  type ConnectorParams,
  type OrientationMode,
  type StickType,
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
          onChange={(v) => {
            const n = Math.round(v);
            onChange({
              numSticks: n,
              // Keep the custom gap list in sync with the stick count.
              spacingAnglesDeg: p.spacingAnglesDeg ? evenGapsDeg(n) : null,
            });
          }}
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={p.spacingAnglesDeg !== null}
            onChange={(e) =>
              onChange({
                spacingAnglesDeg: e.target.checked
                  ? evenGapsDeg(p.numSticks)
                  : null,
              })
            }
          />
          <span>Custom angles between sticks</span>
        </label>
        {p.spacingAnglesDeg && (
          <div className="field">
            <span className="field-label">
              Gap from stick i to stick i+1 (wraps around)
              <em>°</em>
            </span>
            <div className="angle-grid">
              {p.spacingAnglesDeg.map((v, i) => (
                <label key={i} className="angle-cell">
                  <span>
                    {i + 1}→{((i + 1) % p.numSticks) + 1}
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={355}
                    step={1}
                    value={Math.round(v * 10) / 10}
                    onChange={(e) => {
                      const nv = Number(e.target.value);
                      if (!Number.isFinite(nv)) return;
                      const next = p.spacingAnglesDeg!.slice();
                      next[i] = Math.min(355, Math.max(5, nv));
                      onChange({ spacingAnglesDeg: next });
                    }}
                  />
                </label>
              ))}
            </div>
            {(() => {
              const sum = p.spacingAnglesDeg!.reduce((a, b) => a + b, 0);
              const ok = Math.abs(sum - 360) < 0.05;
              return (
                <p className={ok ? 'angle-sum' : 'angle-sum bad'}>
                  Σ = {Math.round(sum * 10) / 10}°{!ok && ' — should be 360° (will be rescaled)'}
                </p>
              );
            })()}
            <button
              className="even-out"
              onClick={() => onChange({ spacingAnglesDeg: evenGapsDeg(p.numSticks) })}
            >
              Reset to even spacing
            </button>
          </div>
        )}
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
