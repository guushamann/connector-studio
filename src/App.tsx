import { useCallback, useEffect, useRef, useState } from 'react';
import { Umbrella } from 'lucide-react';
import { STLExporter } from 'three-stdlib';
import {
  buildConnector,
  DEFAULT_PARAMS,
  type ConnectorParams,
  type ConnectorResult,
} from './geometry/connector';
import { Viewer } from './components/Viewer';
import { Controls } from './components/Controls';

export default function App() {
  const [params, setParams] = useState<ConnectorParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<ConnectorResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSticks, setShowSticks] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBuilding(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        setResult(buildConnector(params));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBuilding(false);
      }
    }, 120);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [params]);

  const onChange = useCallback(
    (patch: Partial<ConnectorParams>) =>
      setParams((prev) => ({ ...prev, ...patch })),
    [],
  );

  const [exportNote, setExportNote] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    const filename = `connector_${params.numSticks}x${params.rectWidth}x${params.rectHeight}_${params.umbrellaAngleDeg}deg.stl`;
    const download = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    setExportNote(null);
    try {
      // Preferred path: manifold3d via the dev-server API (watertight STL).
      const res = await fetch(
        `/api/connector.stl?params=${encodeURIComponent(JSON.stringify(params))}`,
      );
      if (!res.ok) throw new Error(await res.text());
      download(await res.blob());
    } catch (e) {
      // Fallback: in-browser CSG export (may need slicer mesh repair).
      console.warn('manifold export unavailable, falling back to browser CSG:', e);
      if (!result) return;
      const data = new STLExporter().parse(result.mesh, { binary: true }) as DataView;
      download(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
      setExportNote(
        'Python export unavailable — used browser export (run via `npm run dev` with python3 + manifold3d for watertight STLs)',
      );
    }
  }, [result, params]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Umbrella size={20} />
          <h1>Connector Studio</h1>
        </div>
        {result && (
          <div className="stats">
            <span>hub Ø {result.stats.hubDiameter.toFixed(1)} mm</span>
            <span>height {result.stats.overallHeight.toFixed(1)} mm</span>
            <span>{result.stats.triangleCount.toLocaleString()} tris</span>
            {building && <span className="building">rebuilding…</span>}
          </div>
        )}
      </header>
      <div className="body">
        <Controls
          params={params}
          onChange={onChange}
          onExport={onExport}
          building={building}
          showSticks={showSticks}
          onToggleSticks={setShowSticks}
          exportNote={exportNote}
        />
        <main className="viewport">
          {error ? (
            <div className="error">Geometry failed: {error}</div>
          ) : (
            <Viewer
              mesh={result?.mesh ?? null}
              sticks={result?.sticks ?? null}
              showSticks={showSticks}
            />
          )}
        </main>
      </div>
    </div>
  );
}
