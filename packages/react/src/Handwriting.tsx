import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type SVGProps,
} from 'react';
import { play, renderMarkup, type Payload, type Playback } from '@pothooks/core';

/** How playback starts. `"manual"` waits for a call on the forwarded ref. */
export type Trigger = 'mount' | 'visible' | 'hover' | 'manual';

export interface HandwritingProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children' | 'color' | 'dangerouslySetInnerHTML'> {
  payload: Payload;
  /** 1 = the recorded cadence. */
  speed?: number;
  /** `true` loops immediately; a number loops after that many ms. */
  loop?: boolean | number;
  startDelay?: number;
  trigger?: Trigger;
  /** CSS colour for the ink. Defaults to inheriting `currentColor`. */
  color?: string;
  /** Accessible name. Defaults to `payload.meta.text`. */
  title?: string;
  reducedMotion?: 'respect' | 'ignore';
  /** Fires each time the piece finishes drawing, including on every loop. */
  onDone?: () => void;
  style?: CSSProperties;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders the finished SVG — on the server too — then animates after
 * hydration. There is never a blank first paint.
 */
export const Handwriting = forwardRef<Playback | null, HandwritingProps>(function Handwriting(
  {
    payload,
    speed = 1,
    loop = false,
    startDelay,
    trigger = 'visible',
    color,
    title,
    reducedMotion,
    onDone,
    style,
    onMouseEnter,
    onFocus,
    ...rest
  },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const playbackRef = useRef<Playback | null>(null);

  // The markup is built once per payload; nothing here re-renders per frame.
  const idPrefix = useId();
  const { attrs, inner } = useMemo(
    () => renderMarkup(payload, { idPrefix, title }),
    [payload, idPrefix, title],
  );

  // Keep the callback fresh without tearing down the rAF loop.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useIsomorphicLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const playback = play(svg, {
      speed,
      loop,
      startDelay,
      reducedMotion,
      autoplay: trigger === 'mount',
      onDone: () => onDoneRef.current?.(),
    });
    playbackRef.current = playback;

    let started = trigger !== 'visible';
    let observer: IntersectionObserver | undefined;

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          // The trigger fires once; the gate keeps working, so a piece
          // scrolled away stops burning frames.
          if (visible && !started) {
            started = true;
            playback.play();
          }
          playback.setInView(visible);
        },
        { threshold: 0.01 },
      );
      observer.observe(svg);
    } else if (trigger === 'visible') {
      playback.play();
    }

    return () => {
      observer?.disconnect();
      playback.destroy();
      playbackRef.current = null;
    };
  }, [speed, loop, startDelay, trigger, reducedMotion, inner]);

  // A stable facade, so a consumer's ref survives the playback being rebuilt
  // when a prop like `speed` changes.
  const facade = useMemo<Playback>(
    () => ({
      play: () => playbackRef.current?.play(),
      pause: () => playbackRef.current?.pause(),
      restart: () => playbackRef.current?.restart(),
      seek: (t) => playbackRef.current?.seek(t),
      setInView: (v) => playbackRef.current?.setInView(v),
      destroy: () => playbackRef.current?.destroy(),
      get duration() {
        return playbackRef.current?.duration ?? 0;
      },
      get playing() {
        return playbackRef.current?.playing ?? false;
      },
    }),
    [],
  );
  useImperativeHandle(ref, () => facade, [facade]);

  const startOnHover = useCallback(() => {
    if (trigger === 'hover') playbackRef.current?.restart();
  }, [trigger]);

  return (
    <svg
      {...attrs}
      {...rest}
      ref={svgRef}
      style={color ? { ...style, color } : style}
      onMouseEnter={(event) => {
        startOnHover();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        startOnHover();
        onFocus?.(event);
      }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
});
