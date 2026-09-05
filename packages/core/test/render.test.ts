import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/signature.json';
import { ATTR, render, renderMarkup, renderToString, type Payload } from '../src/index.js';

const payload = fixture as unknown as Payload;
const text = payload.meta!.text!;

describe('render', () => {
  it('renders the shared fixture fully drawn', () => {
    const svg = render(payload, { idPrefix: 'fx' });

    expect(svg.getAttribute('viewBox')).toBe(payload.viewBox);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(text);

    const masks = svg.querySelectorAll('mask');
    expect(masks).toHaveLength(payload.strokes.length);

    // Served state is the drawn state: no-JS, reduced-motion and unsupported
    // contexts must never show a blank box.
    for (const path of svg.querySelectorAll(`[${ATTR.index}]`)) {
      expect(path.getAttribute('stroke-dashoffset')).toBe('0');
      expect(path.getAttribute('stroke-dasharray')).toBe('1 1');
      expect(path.getAttribute('pathLength')).toBe('1');
      expect(path.getAttribute('fill')).toBe('none');
    }
  });

  it('pairs each ink path with its own mask, in stroke order', () => {
    const svg = render(payload, { idPrefix: 'fx' });
    const ink = svg.querySelectorAll('svg > path');

    expect(ink).toHaveLength(payload.strokes.length);
    ink.forEach((path, i) => {
      expect(path.getAttribute('mask')).toBe(`url(#fx-m${i})`);
      expect(path.getAttribute('d')).toBe(payload.strokes[i]!.o);
      expect(path.getAttribute('fill')).toBe('currentColor');
    });
  });

  it('carries the recorded timing on the mask paths', () => {
    const svg = render(payload, { idPrefix: 'fx' });
    const masks = svg.querySelectorAll(`[${ATTR.index}]`);

    masks.forEach((path, i) => {
      const stroke = payload.strokes[i]!;
      expect(path.getAttribute('d')).toBe(stroke.c);
      expect(path.getAttribute('stroke-width')).toBe(String(stroke.w));
      expect(Number(path.getAttribute(ATTR.delay))).toBe(stroke.delay);
      expect(Number(path.getAttribute(ATTR.dur))).toBe(stroke.dur);
      expect(path.getAttribute(ATTR.keyTimes)).toBe(stroke.k ? stroke.k.join(' ') : null);
    });
  });

  it('states a mask region covering the whole viewBox, so ink above the origin survives', () => {
    // The default region is -10%/-10%/120%/120% resolved against the viewport,
    // which clips everything above the origin — and ink sits at negative y.
    // Structural assertions alone will not catch that, so pin the geometry.
    const svg = render(payload, { idPrefix: 'fx' });
    const [vx, vy, vw, vh] = payload.viewBox.trim().split(/[\s,]+/).map(Number) as number[];
    const widest = Math.max(...payload.strokes.map((s) => s.w));

    const masks = svg.querySelectorAll('mask');
    expect(masks.length).toBeGreaterThan(0);

    for (const mask of masks) {
      const x = Number(mask.getAttribute('x'));
      const y = Number(mask.getAttribute('y'));
      const w = Number(mask.getAttribute('width'));
      const h = Number(mask.getAttribute('height'));

      expect(x).toBeLessThanOrEqual(vx! - widest);
      expect(y).toBeLessThanOrEqual(vy! - widest);
      expect(x + w).toBeGreaterThanOrEqual(vx! + vw! + widest);
      expect(y + h).toBeGreaterThanOrEqual(vy! + vh! + widest);
    }
  });

  it('omits the mask region rather than emitting NaN for an unparseable viewBox', () => {
    const svg = render({ ...payload, viewBox: 'not a viewBox' }, { idPrefix: 'fx' });
    const mask = svg.querySelector('mask')!;
    expect(mask.getAttribute('x')).toBeNull();
    expect(mask.getAttribute('width')).toBeNull();
  });

  it('gives every instance its own mask ids', () => {
    const a = render(payload).querySelector('mask')!.id;
    const b = render(payload).querySelector('mask')!.id;
    expect(a).not.toBe(b);
  });

  it('sanitises an id prefix that is not safe inside url(#…)', () => {
    expect(render(payload, { idPrefix: ':r7:' }).querySelector('mask')!.id).toBe('r7-m0');
    expect(render(payload, { idPrefix: '7up' }).querySelector('mask')!.id).toBe('ph7up-m0');
  });

  it('marks the SVG decorative when there is no text to announce', () => {
    const svg = render({ ...payload, meta: undefined }, { idPrefix: 'fx' });
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('rejects a payload from a future exporter', () => {
    expect(() => render({ ...payload, v: 2 } as unknown as Payload)).toThrow(/version 2/);
  });
});

describe('renderToString', () => {
  it('produces the same structure as the DOM renderer', () => {
    const markup = renderToString(payload, { idPrefix: 'fx', color: 'rebeccapurple' });

    expect(markup.startsWith('<svg ')).toBe(true);
    expect(markup).toContain('style="color:rebeccapurple"');
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup.match(/<mask /g)).toHaveLength(payload.strokes.length);
    expect(markup).toContain(`mask="url(#fx-m0)"`);

    const { inner } = renderMarkup(payload, { idPrefix: 'fx' });
    expect(markup).toContain(inner);
  });

  it('escapes attribute values rather than trusting the payload', () => {
    const nasty = { ...payload, meta: { text: 'a "quoted" <tag> & co' } };
    expect(renderToString(nasty)).toContain('aria-label="a &quot;quoted&quot; &lt;tag&gt; &amp; co"');
  });
});
