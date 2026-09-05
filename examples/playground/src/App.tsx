import { useMemo, useRef, useState } from 'react';
import { renderMarkup } from '@pothooks/core';
import { Handwriting, type Payload, type Playback, type Trigger } from '@pothooks/react';
import fixture from '../../../fixtures/signature.json';
import { Button, LabelValue, PanelSection, Segmented, Slider } from './ui.js';

/**
 * A harness for the runtime, not a product surface — but it is the only place
 * the packages get looked at, so it borrows the app's ink so the two read as
 * one thing.
 *
 * The paste box is the point: take a payload out of the app's USE IT panel,
 * drop it in here, and watch it replay through the real component rather than
 * through the SMIL file. If those two ever disagree, the payload spec is what
 * was wrong.
 */

const FIXTURE = fixture as unknown as Payload;
const TRIGGER_LABELS = ['MOUNT', 'VISIBLE', 'HOVER', 'MANUAL'] as const;
type TriggerLabel = (typeof TRIGGER_LABELS)[number];
const LOOPING = ['OFF', 'ON'] as const;

const durationOf = (p: Payload): number =>
  p.strokes.reduce((total, s) => total + s.delay + s.dur, 0);

const kb = (s: string): string => `${(s.length / 1024).toFixed(1)}KB`;

/** Uses the runtime's own guard, so the harness rejects exactly what the
 *  packages reject — no second, kinder validator drifting away from it. */
function parsePayload(text: string): { payload: Payload } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not valid JSON.' };
  }
  try {
    renderMarkup(parsed as Payload, { idPrefix: 'check' });
    return { payload: parsed as Payload };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not a payload this runtime understands.' };
  }
}

export function App() {
  const playback = useRef<Playback>(null);

  const [payload, setPayload] = useState<Payload>(FIXTURE);
  const [draft, setDraft] = useState(() => JSON.stringify(FIXTURE, null, 2));
  const [error, setError] = useState<string | null>(null);

  const [trigger, setTrigger] = useState<TriggerLabel>('MOUNT');
  const [speed, setSpeed] = useState(1);
  const [startDelay, setStartDelay] = useState(0);
  const [looping, setLooping] = useState<(typeof LOOPING)[number]>('OFF');
  const [gap, setGap] = useState(600);
  const [seek, setSeek] = useState(1);
  const [finished, setFinished] = useState(0);

  const total = useMemo(() => durationOf(payload), [payload]);
  const recorded = useMemo(() => payload.strokes.some((s) => s.k?.length), [payload]);
  const dirty = draft !== JSON.stringify(payload, null, 2);

  const load = () => {
    const result = parsePayload(draft);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPayload(result.payload);
    setSeek(1);
  };

  const reset = () => {
    setDraft(JSON.stringify(FIXTURE, null, 2));
    setPayload(FIXTURE);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="wordmark">POTHOOKS</span>
          <span className="context">PLAYGROUND</span>
        </div>
        <div>
          <a href="https://pothooks.com">POTHOOKS.COM</a>
        </div>
      </header>

      <div className="body">
        <main className="main">
          <section>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 8 }}>
              <h1 className="eyebrow">REPLAY</h1>
              <span className="eyebrow">{finished ? `FINISHED ${finished}×` : 'WAITING'}</span>
            </div>

            <button
              type="button"
              className="stage"
              aria-label="Replay"
              onClick={() => playback.current?.restart()}
            >
              <Handwriting
                // A payload change is a different piece of handwriting, so it
                // gets a fresh component rather than a re-armed one.
                key={payload.viewBox + payload.strokes.length}
                ref={playback}
                payload={payload}
                trigger={trigger.toLowerCase() as Trigger}
                speed={speed}
                loop={looping === 'ON' ? gap : false}
                startDelay={startDelay}
                color="#111111"
                onDone={() => setFinished((n) => n + 1)}
              />
            </button>

            <p className="note">
              Click the ink to replay. Under <code>prefers-reduced-motion</code> this stays finished
              and never animates — that is the runtime, not the harness.
            </p>
          </section>
        </main>

        <aside className="aside">
          <PanelSection title="PAYLOAD" status={kb(draft)}>
            <textarea
              className={error ? 'paste invalid' : 'paste'}
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              aria-label="Payload JSON"
            />
            <div className="buttons">
              <Button onClick={load} disabled={!dirty}>
                {dirty ? 'LOAD' : 'LOADED'}
              </Button>
              <Button onClick={reset}>FIXTURE</Button>
            </div>
            {error ? (
              <p className="note alarm">{error}</p>
            ) : (
              <p className="note">
                Paste a payload from the app&rsquo;s USE IT panel, or edit this one. It is checked
                with the runtime&rsquo;s own guard, so what fails here fails in production.
              </p>
            )}
          </PanelSection>

          <PanelSection title="RECORDING" status={payload.meta?.text ?? '—'}>
            <LabelValue label="STROKES" value={String(payload.strokes.length)} />
            <LabelValue label="DURATION" value={`${(total / 1000).toFixed(1)}s`} />
            <LabelValue label="PEN TIMING" value={recorded ? 'RECORDED' : 'NONE'} />
            <LabelValue label="VIEWBOX" value={payload.viewBox} />
          </PanelSection>

          <PanelSection title="PLAYBACK" status={`${TRIGGER_LABELS.length} triggers`}>
            <span className="row-label">TRIGGER</span>
            <Segmented options={TRIGGER_LABELS} value={trigger} onChange={setTrigger} />

            <Slider label="SPEED" value={speed} min={0.25} max={3} step={0.05} unit="×" onChange={setSpeed} />
            <Slider
              label="START DELAY"
              value={startDelay}
              min={0}
              max={2000}
              step={50}
              unit="ms"
              onChange={setStartDelay}
            />

            <div style={{ paddingTop: 12 }}>
              <span className="row-label">LOOP</span>
              <Segmented options={LOOPING} value={looping} onChange={setLooping} />
            </div>
            <Slider
              label="PAUSE BETWEEN LOOPS"
              value={gap}
              min={0}
              max={3000}
              step={100}
              unit="ms"
              disabled={looping === 'OFF'}
              onChange={setGap}
            />

            <Slider
              label="SEEK"
              value={seek}
              min={0}
              max={1}
              step={0.005}
              onChange={(t) => {
                setSeek(t);
                playback.current?.pause();
                playback.current?.seek(t);
              }}
            />

            <div className="buttons">
              <Button onClick={() => playback.current?.play()}>PLAY</Button>
              <Button onClick={() => playback.current?.pause()}>PAUSE</Button>
              <Button onClick={() => playback.current?.restart()}>REPLAY</Button>
            </div>
          </PanelSection>
        </aside>
      </div>
    </div>
  );
}
