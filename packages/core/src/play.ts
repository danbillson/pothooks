import { ATTR } from './render.js';

export interface PlayOptions {
  /** 1 = the recorded cadence. */
  speed?: number;
  /** `true` loops immediately; a number loops after that many ms. */
  loop?: boolean | number;
  /** Milliseconds to wait before the first stroke, each time playback starts. */
  startDelay?: number;
  autoplay?: boolean;
  /** Fires each time the piece finishes drawing, including on every loop. */
  onDone?: () => void;
  /** `'ignore'` animates even under `prefers-reduced-motion: reduce`.
   *  Only reach for it if the motion is the content. */
  reducedMotion?: 'respect' | 'ignore';
}

export interface Playback {
  play(): void;
  pause(): void;
  restart(): void;
  /** 0–1 across the whole piece. */
  seek(t: number): void;
  /** Length of the piece in ms at the recorded cadence — excludes
   *  `startDelay` and is not scaled by `speed`. */
  readonly duration: number;
  readonly playing: boolean;
  /** Feeds the same pause gate as tab visibility. Wrappers wire their
   *  IntersectionObserver into this so off-screen pieces stop burning frames. */
  setInView(inView: boolean): void;
  destroy(): void;
}

interface Track {
  el: Element;
  start: number;
  end: number;
  dur: number;
  k: number[] | null;
  p: number[] | null;
  /** Last dashoffset written, so a frame that changes nothing touches no DOM. */
  last: number;
}

const num = (el: Element, name: string): number => {
  const v = Number(el.getAttribute(name));
  return Number.isFinite(v) ? v : 0;
};

const list = (el: Element, name: string): number[] | null => {
  const raw = el.getAttribute(name);
  if (!raw) return null;
  const out = raw.trim().split(/[\s,]+/).map(Number);
  return out.length > 1 && out.every(Number.isFinite) ? out : null;
};

/** Linear interpolation of the recorded intra-stroke cadence. */
function cadence(k: number[], p: number[], u: number): number {
  if (u <= k[0]!) return p[0]!;
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1]!;
    const b = k[i]!;
    if (u <= b) return p[i - 1]! + (p[i]! - p[i - 1]!) * (b > a ? (u - a) / (b - a) : 1);
  }
  return p[p.length - 1]!;
}

const inert: Playback = {
  play() {},
  pause() {},
  restart() {},
  seek() {},
  duration: 0,
  playing: false,
  setInView() {},
  destroy() {},
};

/**
 * Drives an already-rendered SVG. One requestAnimationFrame loop for the whole
 * piece, writing `stroke-dashoffset` on each mask path — not one animation per
 * stroke, because a signature is 40+ strokes.
 */
export function play(svg: SVGSVGElement, opts: PlayOptions = {}): Playback {
  if (typeof document === 'undefined' || !svg) return inert;

  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const startDelay = Math.max(0, opts.startDelay ?? 0);
  const loopGap = typeof opts.loop === 'number' ? Math.max(0, opts.loop) : 0;
  const loops = opts.loop !== undefined && opts.loop !== false;

  const nodes = Array.from(svg.querySelectorAll(`[${ATTR.index}]`));
  nodes.sort((a, b) => num(a, ATTR.index) - num(b, ATTR.index));

  let cursor = 0;
  const tracks: Track[] = nodes.map((el) => {
    const dur = Math.max(0, num(el, ATTR.dur));
    const start = cursor + Math.max(0, num(el, ATTR.delay));
    cursor = start + dur;
    return { el, start, end: cursor, dur, k: list(el, ATTR.keyTimes), p: list(el, ATTR.progress), last: NaN };
  });
  const duration = cursor;

  const media =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = opts.reducedMotion !== 'ignore' && !!media?.matches;

  let t = -startDelay;
  let frame = 0;
  let lastFrameAt = 0;
  let wantPlay = false;
  let inView = true;
  let tabVisible = !document.hidden;
  let announced = false;
  let destroyed = false;

  function offsetFor(track: Track, at: number): number {
    if (at >= track.end) return 0;
    if (at <= track.start) return 1;
    const u = track.dur > 0 ? (at - track.start) / track.dur : 1;
    return 1 - (track.k && track.p ? cadence(track.k, track.p, u) : u);
  }

  function apply(at: number): void {
    for (const track of tracks) {
      const next = offsetFor(track, at);
      // NaN on the first pass, so this always writes once.
      if (Math.abs(next - track.last) < 1e-4) continue;
      track.last = next;
      track.el.setAttribute('stroke-dashoffset', next === 0 ? '0' : next.toFixed(4));
    }
  }

  /** Back to the served state: fully drawn. */
  function settle(): void {
    apply(duration);
  }

  const running = (): boolean => wantPlay && inView && tabVisible && !reduced && !destroyed;

  function step(dt: number): void {
    t += dt;

    if (t < duration) {
      apply(t);
      return;
    }

    apply(duration);
    if (!announced) {
      announced = true;
      opts.onDone?.();
    }

    if (!loops) {
      t = duration;
      wantPlay = false;
      sync();
      return;
    }
    if (t >= duration + loopGap) {
      t = -startDelay;
      announced = false;
      apply(t);
    }
  }

  function tick(now: number): void {
    frame = requestAnimationFrame(tick);
    step((now - lastFrameAt) * speed);
    lastFrameAt = now;
  }

  function sync(): void {
    if (running() && !frame) {
      lastFrameAt = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!running() && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  const onVisibility = (): void => {
    tabVisible = !document.hidden;
    // Don't credit the piece with time spent in a background tab.
    lastFrameAt = performance.now();
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onMedia = (): void => {
    reduced = opts.reducedMotion !== 'ignore' && !!media?.matches;
    sync();
    if (reduced) settle();
  };
  media?.addEventListener?.('change', onMedia);

  const playback: Playback = {
    play() {
      if (destroyed) return;
      if (reduced) {
        // Render finished, never animate, never loop.
        settle();
        if (!announced) {
          announced = true;
          queueMicrotask(() => opts.onDone?.());
        }
        return;
      }
      if (t >= duration) {
        t = -startDelay;
        announced = false;
      }
      apply(t);
      wantPlay = true;
      sync();
    },
    pause() {
      wantPlay = false;
      sync();
    },
    restart() {
      if (destroyed) return;
      t = -startDelay;
      announced = false;
      if (reduced) {
        settle();
        return;
      }
      apply(t);
      wantPlay = true;
      sync();
    },
    seek(fraction) {
      if (destroyed || reduced) return;
      t = Math.min(1, Math.max(0, fraction)) * duration;
      announced = t >= duration;
      apply(t);
    },
    get duration() {
      return duration;
    },
    get playing() {
      return running();
    },
    setInView(next) {
      if (inView === next) return;
      inView = next;
      lastFrameAt = performance.now();
      sync();
    },
    destroy() {
      destroyed = true;
      wantPlay = false;
      sync();
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener?.('change', onMedia);
      settle();
    },
  };

  if (opts.autoplay !== false) playback.play();
  return playback;
}
