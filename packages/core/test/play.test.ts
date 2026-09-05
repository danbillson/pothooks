import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/signature.json';
import { ATTR, play, render, type Payload } from '../src/index.js';

const payload = fixture as unknown as Payload;
const total = payload.strokes.reduce((sum, s) => sum + s.delay + s.dur, 0);

const offsets = (svg: SVGSVGElement): number[] =>
  Array.from(svg.querySelectorAll(`[${ATTR.index}]`), (el) =>
    Number(el.getAttribute('stroke-dashoffset')),
  );

let reduceMotion = false;

beforeEach(() => {
  reduceMotion = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') && reduceMotion,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('play', () => {
  it('reports the recorded duration of the whole piece', () => {
    const svg = render(payload);
    const playback = play(svg, { autoplay: false });
    expect(playback.duration).toBe(total);
    playback.destroy();
  });

  it('hides the ink when it starts and restores it when it ends', () => {
    const svg = render(payload);
    const playback = play(svg, { autoplay: false });

    playback.seek(0);
    expect(offsets(svg)).toEqual(payload.strokes.map(() => 1));

    playback.seek(1);
    expect(offsets(svg)).toEqual(payload.strokes.map(() => 0));

    playback.destroy();
  });

  it('reveals strokes one at a time, in the order the hand drew them', () => {
    const svg = render(payload);
    const playback = play(svg, { autoplay: false });

    // Midway through the second stroke: first done, second partial, rest untouched.
    const first = payload.strokes[0]!;
    const second = payload.strokes[1]!;
    playback.seek((first.delay + first.dur + second.delay + second.dur / 2) / total);

    const [a, b, c] = offsets(svg);
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
    expect(c).toBe(1);

    playback.destroy();
  });

  it('follows the recorded intra-stroke cadence when the payload carries one', () => {
    const withCadence = payload.strokes.findIndex((s) => s.k && s.p);
    expect(withCadence).toBeGreaterThan(-1);

    const stroke = payload.strokes[withCadence]!;
    const before = payload.strokes.slice(0, withCadence).reduce((sum, s) => sum + s.delay + s.dur, 0);
    const start = before + stroke.delay;

    const svg = render(payload);
    const playback = play(svg, { autoplay: false });

    // At each recorded keytime the reveal must sit on the recorded fraction.
    stroke.k!.forEach((k, i) => {
      playback.seek((start + k * stroke.dur) / total);
      expect(offsets(svg)[withCadence]).toBeCloseTo(1 - stroke.p![i]!, 3);
    });

    playback.destroy();
  });

  it('advances on animation frames and finishes once', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const svg = render(payload);
    const playback = play(svg, { onDone });

    expect(offsets(svg).every((o) => o === 1)).toBe(true);

    await vi.advanceTimersByTimeAsync(total + 200);

    expect(offsets(svg)).toEqual(payload.strokes.map(() => 0));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(playback.playing).toBe(false);

    playback.destroy();
  });

  it('replays from the start when it loops', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const svg = render(payload);
    const playback = play(svg, { loop: true, onDone });

    await vi.advanceTimersByTimeAsync(total * 2 + 200);
    expect(onDone.mock.calls.length).toBeGreaterThan(1);
    expect(playback.playing).toBe(true);

    playback.destroy();
  });

  it('halves the wall-clock time at double speed', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const svg = render(payload);
    const playback = play(svg, { speed: 2, onDone });

    await vi.advanceTimersByTimeAsync(total / 2 - 100);
    expect(onDone).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(onDone).toHaveBeenCalledTimes(1);

    playback.destroy();
  });

  it('holds the ink hidden through startDelay', async () => {
    vi.useFakeTimers();
    const svg = render(payload);
    const playback = play(svg, { startDelay: 500 });

    await vi.advanceTimersByTimeAsync(400);
    expect(offsets(svg).every((o) => o === 1)).toBe(true);

    playback.destroy();
  });

  it('stops burning frames while out of view', async () => {
    vi.useFakeTimers();
    const svg = render(payload);
    const playback = play(svg);

    playback.setInView(false);
    expect(playback.playing).toBe(false);
    await vi.advanceTimersByTimeAsync(total + 200);
    expect(offsets(svg).some((o) => o > 0)).toBe(true);

    playback.setInView(true);
    expect(playback.playing).toBe(true);
    await vi.advanceTimersByTimeAsync(total + 200);
    expect(offsets(svg)).toEqual(payload.strokes.map(() => 0));

    playback.destroy();
  });

  it('renders finished and never animates under prefers-reduced-motion', async () => {
    vi.useFakeTimers();
    reduceMotion = true;
    const onDone = vi.fn();
    const svg = render(payload);
    const playback = play(svg, { loop: true, onDone });

    await vi.advanceTimersByTimeAsync(total + 200);

    expect(offsets(svg)).toEqual(payload.strokes.map(() => 0));
    expect(playback.playing).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);

    playback.destroy();
  });

  it('leaves the ink drawn when destroyed mid-stroke', async () => {
    vi.useFakeTimers();
    const svg = render(payload);
    const playback = play(svg);

    await vi.advanceTimersByTimeAsync(total / 3);
    expect(offsets(svg).some((o) => o > 0)).toBe(true);

    playback.destroy();
    expect(offsets(svg)).toEqual(payload.strokes.map(() => 0));

    await vi.advanceTimersByTimeAsync(total);
    expect(playback.playing).toBe(false);
  });

  it('is inert on an SVG with no strokes', () => {
    const playback = play(render({ ...payload, strokes: [] }));
    expect(playback.duration).toBe(0);
    playback.destroy();
  });
});
