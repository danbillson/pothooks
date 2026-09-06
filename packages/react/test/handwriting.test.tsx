import { act, cleanup, render as mount, screen } from '@testing-library/react';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DASH, type Payload, type Playback } from '@pothooks/core';
import fixture from '../../../fixtures/signature.json';
import { Handwriting } from '../src/index.js';

const payload = fixture as unknown as Payload;
const total = payload.strokes.reduce((sum, s) => sum + s.delay + s.dur, 0);
const text = payload.meta!.text!;

/** happy-dom has no IntersectionObserver; drive one by hand. */
const observers: { el: Element; fire: (visible: boolean) => void }[] = [];

class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    observers.push({
      el,
      fire: (visible) =>
        this.cb(
          [{ target: el, isIntersecting: visible } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
    });
  }
  disconnect() {
    observers.length = 0;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const scrollIntoView = (visible = true) =>
  act(() => {
    for (const o of observers) o.fire(visible);
  });

const offsets = (svg: Element): number[] =>
  Array.from(svg.querySelectorAll('[data-ph-i]'), (el) =>
    Number(el.getAttribute('stroke-dashoffset')),
  );

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('<Handwriting> on the server', () => {
  it('renders the piece fully drawn, so there is never a blank first paint', () => {
    const html = renderToStaticMarkup(<Handwriting payload={payload} />);

    expect(html).toContain(`aria-label="${text}"`);
    expect(html).toContain(`viewBox="${payload.viewBox}"`);
    expect(html.match(/<mask /g)).toHaveLength(payload.strokes.length);
    expect(html).not.toContain(`stroke-dashoffset="${DASH.hidden}"`);
    expect(html.match(new RegExp(`stroke-dashoffset="${DASH.drawn}"`, 'g'))).toHaveLength(
      payload.strokes.length,
    );
  });

  it('gives two pieces on one page different mask ids', () => {
    const html = renderToStaticMarkup(
      <>
        <Handwriting payload={payload} />
        <Handwriting payload={payload} />
      </>,
    );
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('<Handwriting> in the browser', () => {
  it('draws from empty once it scrolls into view', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    mount(<Handwriting payload={payload} onDone={onDone} />);
    const svg = screen.getByRole('img');

    // Not yet in view: still the served, fully-drawn state.
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);

    scrollIntoView();
    expect(offsets(svg).every((o) => o === DASH.hidden)).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(total + 200));
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('pauses when it scrolls back out of view', async () => {
    vi.useFakeTimers();
    mount(<Handwriting payload={payload} />);
    const svg = screen.getByRole('img');

    scrollIntoView(true);
    await act(() => vi.advanceTimersByTimeAsync(total / 4));
    const mid = offsets(svg);

    scrollIntoView(false);
    await act(() => vi.advanceTimersByTimeAsync(total));
    expect(offsets(svg)).toEqual(mid);
  });

  it('starts on mount when asked to', async () => {
    vi.useFakeTimers();
    mount(<Handwriting payload={payload} trigger="mount" />);
    const svg = screen.getByRole('img');
    expect(offsets(svg).every((o) => o === DASH.hidden)).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(total + 200));
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);
  });

  it('waits for the ref when the trigger is manual', async () => {
    vi.useFakeTimers();
    const ref = createRef<Playback>();
    mount(<Handwriting payload={payload} trigger="manual" ref={ref} />);
    const svg = screen.getByRole('img');
    scrollIntoView();

    await act(() => vi.advanceTimersByTimeAsync(total));
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);
    expect(ref.current!.duration).toBe(total);

    act(() => ref.current!.play());
    expect(offsets(svg).every((o) => o === DASH.hidden)).toBe(true);
  });

  it('replays on hover', async () => {
    vi.useFakeTimers();
    mount(<Handwriting payload={payload} trigger="hover" />);
    const svg = screen.getByRole('img');
    scrollIntoView();

    await act(() => vi.advanceTimersByTimeAsync(total));
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);

    act(() => svg.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(offsets(svg).every((o) => o === DASH.hidden)).toBe(true);
  });

  it('passes className, style and colour through to the svg', () => {
    mount(<Handwriting payload={payload} className="sig" color="rebeccapurple" />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('class')).toBe('sig');
    expect((svg as unknown as SVGElement).style.color).toBe('rebeccapurple');
  });

  it('takes an explicit accessible name over the payload text', () => {
    mount(<Handwriting payload={payload} title="Ada Lovelace's signature" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe("Ada Lovelace's signature");
  });

  it('leaves the ink drawn when it unmounts mid-stroke', async () => {
    vi.useFakeTimers();
    const { unmount } = mount(<Handwriting payload={payload} trigger="mount" />);
    const svg = screen.getByRole('img');

    await act(() => vi.advanceTimersByTimeAsync(total / 3));
    expect(offsets(svg).some((o) => o > 0)).toBe(true);

    unmount();
    expect(offsets(svg).every((o) => o === DASH.drawn)).toBe(true);
  });
});
