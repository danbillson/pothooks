import { SVG_NS, escapeAttr, safeId, serialize, toDom, uid, type El } from './dom.js';
import type { Payload, Stroke } from './types.js';

export interface RenderOptions {
  /** Id prefix for this instance's masks. Defaults to a generated one; pass a
   *  stable value (React's `useId()`) when the markup must match on a server
   *  render and a client render. */
  idPrefix?: string;
  /** CSS colour for the ink. The ink is always `currentColor`; this sets
   *  `color` on the `<svg>`. */
  color?: string;
  /** Accessible name. Defaults to `meta.text`; when neither is present the
   *  SVG is marked decorative. */
  title?: string;
}

export interface Markup {
  /** Attributes for the root `<svg>`. Does not include `style`. */
  attrs: Record<string, string>;
  /** Serialised children of the root `<svg>`. */
  inner: string;
}

/**
 * The dash pattern the reveal runs on, and the three offsets that matter.
 *
 * Not the obvious `1 1` with the offset running 1 → 0. With a dash exactly one
 * path long and the offset exactly one path, hiding a stroke puts a dash
 * boundary precisely on each end of the path — and the mask has round caps, so
 * a renderer that emits the zero-length dash it finds there paints a disc half
 * the mask width at the start and the end of every stroke that has not been
 * drawn yet. It reads as a dot the hand never made, sitting exactly where the
 * pen is about to arrive, and whether a given stroke shows one comes down to
 * rounding in the renderer's arc-length arithmetic — so it appears on some
 * strokes and not others, and only while the piece is playing.
 *
 * So the pattern is longer than the path on both sides and the hidden offset
 * parks both boundaries a whole path length clear of either end. The only
 * moments a boundary sits on an endpoint are the instant a reveal begins and
 * the instant it completes, and at both the disc it would paint is the ink's
 * own cap.
 *
 * `@pothooks/font` emits the identical numbers in its self-animating SMIL, and
 * `fixtures/signature.svg` there is the copy to check against.
 */
export const DASH = {
  /** Dash and gap, in path lengths. */
  array: '2 3',
  /** Dash end one path length before the path starts: nothing showing. */
  hidden: 3,
  /** Dash end on the path's start: the reveal about to begin. */
  start: 2,
  /** Dash end on the path's end: everything showing. */
  drawn: 1,
} as const;

/** Timing lives on the mask paths so `play()` can drive an SVG it never
 *  rendered — a server-rendered one, say — without being handed the payload. */
export const ATTR = {
  index: 'data-ph-i',
  delay: 'data-ph-delay',
  dur: 'data-ph-dur',
  keyTimes: 'data-ph-k',
  progress: 'data-ph-p',
  glyph: 'data-ph-g',
} as const;

function assertPayload(payload: Payload): void {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('@pothooks/core: payload is required');
  }
  if (payload.v !== 1) {
    throw new TypeError(
      `@pothooks/core: unsupported payload version ${String((payload as { v: unknown }).v)} (expected 1)`,
    );
  }
  if (!Array.isArray(payload.strokes)) {
    throw new TypeError('@pothooks/core: payload.strokes must be an array');
  }
}

/**
 * The area a mask is allowed to paint, stated rather than defaulted, and no
 * bigger than the one stroke it uncovers.
 *
 * It has to be stated. A `<mask>` with no `x`/`y`/`width`/`height` takes the
 * defaults `-10% -10% 120% 120%`, and under `maskUnits="userSpaceOnUse"` those
 * percentages resolve against the *viewport*, not against the shape being
 * masked. Ink sits at negative y — the baseline is zero and up is positive,
 * flipped — so the default region starts a little above the origin and clips
 * away everything higher than it. What survives is the few strokes nearest the
 * baseline, which looks exactly like a mask that is too narrow and is nothing
 * of the sort.
 *
 * And it has to be *small*. Every mask is an offscreen surface the renderer
 * allocates and composites, and a region is what tells it how much surface to
 * find. Sized to the whole viewBox, a piece with two hundred strokes asked for
 * two hundred full-canvas buffers and the compositor spent its whole frame
 * budget on them: measured in Chromium, a 240-stroke piece ran at 433ms a
 * frame — two frames a second — and the same piece with each mask sized to its
 * own stroke ran at a flat 16.7ms. The cost is not in the animation; there is
 * one attribute written per frame either way.
 *
 * The box comes off the ink's own path data rather than the DOM, so this is
 * still pure and still identical on a server. Curves are bounded by their
 * control points, which sit outside the curve — so the box is generous by a
 * hair rather than tight, which is the direction that cannot cost ink.
 */
function fallbackRegion(payload: Payload): Record<string, string> {
  const [x, y, w, h] = payload.viewBox.trim().split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return {};
  const pad = Math.ceil(Math.max(0, ...payload.strokes.map((s) => s.w)));
  // Extent is measured from the rounded-down origin, not from the raw one, so
  // flooring the corner cannot leave the far edge a fraction short.
  const left = Math.floor(x! - pad);
  const top = Math.floor(y! - pad);
  return {
    x: String(left),
    y: String(top),
    width: String(Math.ceil(x! + w! + pad - left)),
    height: String(Math.ceil(y! + h! + pad - top)),
  };
}

const PAIR = /(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g;

function maskRegion(stroke: Stroke, fallback: Record<string, string>): Record<string, string> {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  // Path data is machine-generated and every command in it carries an even
  // number of coordinates, so consecutive pairs are points.
  for (const m of stroke.o.matchAll(PAIR)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  // A path nothing could be read from keeps the old behaviour rather than
  // getting a region that might clip it.
  if (![x0, y0, x1, y1].every(Number.isFinite)) return fallback;

  const pad = Math.ceil(Math.max(0, stroke.w));
  const left = Math.floor(x0 - pad);
  const top = Math.floor(y0 - pad);
  return {
    x: String(left),
    y: String(top),
    width: String(Math.ceil(x1 + pad - left)),
    height: String(Math.ceil(y1 + pad - top)),
  };
}

function tree(payload: Payload, opts: RenderOptions): { attrs: Record<string, string>; children: El[] } {
  assertPayload(payload);
  const prefix = safeId(opts.idPrefix ?? uid());
  const fallback = fallbackRegion(payload);

  const masks: El[] = [];
  const ink: El[] = [];

  payload.strokes.forEach((stroke, i) => {
    const id = `${prefix}-m${i}`;

    const maskPath: Record<string, string> = {
      d: stroke.c,
      stroke: '#fff',
      'stroke-width': String(stroke.w),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      fill: 'none',
      // Normalises the path to length 1 so dash values are fractions. No DOM
      // measurement, so this is identical on a server and in a worker.
      pathLength: '1',
      'stroke-dasharray': DASH.array,
      // Served fully drawn. Animation removes the ink, then restores it.
      'stroke-dashoffset': String(DASH.drawn),
      [ATTR.index]: String(i),
      [ATTR.delay]: String(stroke.delay),
      [ATTR.dur]: String(stroke.dur),
    };

    if (stroke.k?.length && stroke.p?.length === stroke.k.length) {
      maskPath[ATTR.keyTimes] = stroke.k.join(' ');
      maskPath[ATTR.progress] = stroke.p.join(' ');
    }

    // One mask per stroke, never one for all of them: a single wide mask leaks
    // sideways at tight curves and uncovers a neighbouring stroke early.
    masks.push({
      name: 'mask',
      attrs: { id, maskUnits: 'userSpaceOnUse', ...maskRegion(stroke, fallback) },
      children: [{ name: 'path', attrs: maskPath }],
    });

    const inkAttrs: Record<string, string> = {
      d: stroke.o,
      fill: 'currentColor',
      mask: `url(#${id})`,
    };
    if (stroke.g != null) inkAttrs[ATTR.glyph] = String(stroke.g);
    ink.push({ name: 'path', attrs: inkAttrs });
  });

  const label = opts.title ?? payload.meta?.text;
  const attrs: Record<string, string> = {
    xmlns: SVG_NS,
    viewBox: payload.viewBox,
    'data-pothooks': '1',
  };
  if (label) {
    attrs.role = 'img';
    attrs['aria-label'] = label;
  } else {
    attrs['aria-hidden'] = 'true';
  }

  return {
    attrs,
    children: [{ name: 'defs', attrs: {}, children: masks }, ...ink],
  };
}

/**
 * The root attributes and inner markup for a payload, in its final,
 * fully-drawn state. The building block the other renderers and the framework
 * wrappers share — nothing here touches the DOM, so it is safe on a server.
 */
export function renderMarkup(payload: Payload, opts: RenderOptions = {}): Markup {
  const { attrs, children } = tree(payload, opts);
  return { attrs, inner: children.map(serialize).join('') };
}

/** A complete `<svg>` string, fully drawn. */
export function renderToString(payload: Payload, opts: RenderOptions = {}): string {
  const { attrs, inner } = renderMarkup(payload, opts);
  const all = opts.color ? { ...attrs, style: `color:${opts.color}` } : attrs;
  const open = Object.entries(all)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  return `<svg${open}>${inner}</svg>`;
}

/** Builds the SVG in its final, fully-drawn state. Safe to serialise. */
export function render(payload: Payload, opts: RenderOptions = {}): SVGSVGElement {
  const { attrs, children } = tree(payload, opts);
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== 'xmlns') svg.setAttribute(k, v);
  }
  for (const child of children) svg.appendChild(toDom(child));
  if (opts.color) svg.style.color = opts.color;
  return svg;
}
