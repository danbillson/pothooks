import { SVG_NS, escapeAttr, safeId, serialize, toDom, uid, type El } from './dom.js';
import type { Payload } from './types.js';

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
 * The area each mask is allowed to paint, stated rather than defaulted.
 *
 * A `<mask>` with no `x`/`y`/`width`/`height` takes the defaults
 * `-10% -10% 120% 120%`, and under `maskUnits="userSpaceOnUse"` those
 * percentages resolve against the *viewport*, not against the shape being
 * masked. Ink sits at negative y — the baseline is zero and up is positive,
 * flipped — so the default region starts a little above the origin and clips
 * away everything higher than it. What survives is the few strokes nearest the
 * baseline, which looks exactly like a mask that is too narrow and is nothing
 * of the sort.
 *
 * Sized to the viewBox with a whole stroke of margin, so a round cap sitting on
 * the edge is not shaved either.
 */
function maskRegion(payload: Payload): Record<string, string> {
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

function tree(payload: Payload, opts: RenderOptions): { attrs: Record<string, string>; children: El[] } {
  assertPayload(payload);
  const prefix = safeId(opts.idPrefix ?? uid());
  const region = maskRegion(payload);

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
      'stroke-dasharray': '1 1',
      // Served fully drawn. Animation removes the ink, then restores it.
      'stroke-dashoffset': '0',
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
      attrs: { id, maskUnits: 'userSpaceOnUse', ...region },
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
