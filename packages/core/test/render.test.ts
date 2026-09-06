import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/signature.json';
import { ATTR, DASH, render, renderMarkup, renderToString, type Payload } from '../src/index.js';

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
      expect(path.getAttribute('stroke-dashoffset')).toBe(String(DASH.drawn));
      expect(path.getAttribute('stroke-dasharray')).toBe(DASH.array);
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

  it('gives each mask a region that covers its own stroke and no more', () => {
    // Two failures to catch at once, and they pull in opposite directions.
    //
    // Too small and the mask clips its own ink. The default region is
    // -10%/-10%/120%/120% resolved against the *viewport*, which cuts off
    // everything above the origin — and ink sits at negative y — so the region
    // has to be stated at all.
    //
    // Too large and every mask is a full-canvas offscreen surface: a piece
    // with a couple of hundred strokes then asks the compositor for a couple
    // of hundred of them, and playback falls to a few frames a second. So it
    // must not be the whole viewBox either.
    const svg = render(payload, { idPrefix: 'fx' });
    const [, , vw, vh] = payload.viewBox.trim().split(/[\s,]+/).map(Number) as number[];

    const masks = [...svg.querySelectorAll('mask')];
    expect(masks.length).toBe(payload.strokes.length);

    masks.forEach((mask, i) => {
      const stroke = payload.strokes[i]!;
      const x = Number(mask.getAttribute('x'));
      const y = Number(mask.getAttribute('y'));
      const w = Number(mask.getAttribute('width'));
      const h = Number(mask.getAttribute('height'));
      expect([x, y, w, h].every(Number.isFinite)).toBe(true);

      // Every coordinate in this stroke's ink falls inside its own region.
      const pairs = [...stroke.o.matchAll(/(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g)];
      expect(pairs.length).toBeGreaterThan(0);
      for (const [, px, py] of pairs) {
        expect(Number(px)).toBeGreaterThanOrEqual(x);
        expect(Number(px)).toBeLessThanOrEqual(x + w);
        expect(Number(py)).toBeGreaterThanOrEqual(y);
        expect(Number(py)).toBeLessThanOrEqual(y + h);
      }
    });

    // And at least one is meaningfully smaller than the whole canvas, or the
    // regions are the viewBox by another name.
    const areas = masks.map((m) => Number(m.getAttribute('width')) * Number(m.getAttribute('height')));
    expect(Math.min(...areas)).toBeLessThan(vw! * vh! * 0.5);
  });

  it('never emits NaN for a region, whatever the viewBox says', () => {
    const svg = render({ ...payload, viewBox: 'not a viewBox' }, { idPrefix: 'fx' });
    for (const mask of svg.querySelectorAll('mask')) {
      for (const name of ['x', 'y', 'width', 'height']) {
        const v = mask.getAttribute(name);
        // Either stated and finite, or not stated at all.
        if (v !== null) expect(Number.isFinite(Number(v))).toBe(true);
      }
    }
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
