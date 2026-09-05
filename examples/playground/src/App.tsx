import { useRef, useState } from 'react';
import { Handwriting, type Payload, type Playback, type Trigger } from '@pothooks/react';
import fixture from '../../../fixtures/signature.json';

const payload = fixture as unknown as Payload;
const triggers: Trigger[] = ['mount', 'visible', 'hover', 'manual'];

export function App() {
  const playback = useRef<Playback>(null);
  const [trigger, setTrigger] = useState<Trigger>('mount');
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [seek, setSeek] = useState(1);
  const [done, setDone] = useState(0);

  return (
    <main style={{ font: '14px/1.5 system-ui, sans-serif', margin: '0 auto', maxWidth: 720, padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>Pothooks playground</h1>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 24 }}>
        {/* Remounts on a control change so the trigger is re-armed. */}
        <Handwriting
          key={`${trigger}-${speed}-${String(loop)}`}
          ref={playback}
          payload={payload}
          trigger={trigger}
          speed={speed}
          loop={loop}
          color="#111"
          onDone={() => setDone((n) => n + 1)}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>

      <fieldset style={{ border: 0, display: 'grid', gap: 12, padding: '16px 0' }}>
        <label>
          trigger{' '}
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>
            {triggers.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <label>
          speed {speed.toFixed(2)}×{' '}
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        <label>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop
        </label>

        <label>
          seek{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={seek}
            onChange={(e) => {
              const t = Number(e.target.value);
              setSeek(t);
              playback.current?.pause();
              playback.current?.seek(t);
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => playback.current?.play()}>play</button>
          <button onClick={() => playback.current?.pause()}>pause</button>
          <button onClick={() => playback.current?.restart()}>restart</button>
        </div>
      </fieldset>

      <p style={{ color: '#666' }}>
        {payload.strokes.length} strokes · {playback.current?.duration ?? 0}ms · finished {done}×
      </p>
    </main>
  );
}
