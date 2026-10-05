import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const STORAGE_KEY = 'broken-grimoire/log-width';
const MIN_WIDTH = 260;
/** Space the other columns need: board column minimum, action rail, the two gaps and the page padding. */
const RESERVED = 420 + 376 + 2 * 22 + 2 * 24;
const KEY_STEP = 24;

function loadWidth(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v >= MIN_WIDTH ? v : null;
  } catch {
    return null;
  }
}

/** Width of the log column in px, or null for the default layout. Remembered in this browser. */
export function useLogWidth(): [number | null, (w: number | null) => void] {
  const [width, setWidth] = useState<number | null>(loadWidth);
  useEffect(() => {
    try {
      if (width === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
    } catch {
      // Storage blocked: the width just isn't remembered.
    }
  }, [width]);
  return [width, setWidth];
}

interface Props {
  /** The column being resized (it sits to the right of the handle). */
  columnRef: RefObject<HTMLElement | null>;
  /** The grid that holds it, to know how much room there is. */
  layoutRef: RefObject<HTMLElement | null>;
  width: number | null;
  onChange: (w: number | null) => void;
}

/** Drag handle on the left edge of a column: drag, or focus it and use ←/→. Double-click resets. */
export function ColumnResizer({ columnRef, layoutRef, width, onChange }: Props) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleRef = useRef<HTMLDivElement>(null);
  // The width actually on screen (the window may have squeezed a stored width), minus the handle's own strip.
  const current = () => {
    const col = columnRef.current;
    if (!col) return width ?? 360;
    return col.getBoundingClientRect().width - (handleRef.current?.offsetWidth ?? 0);
  };
  const clamp = (w: number) => {
    const room = (layoutRef.current?.clientWidth ?? window.innerWidth) - RESERVED;
    return Math.round(Math.max(MIN_WIDTH, Math.min(w, Math.max(MIN_WIDTH, room))));
  };

  // While dragging, keep the resize cursor everywhere and stop text selection.
  useEffect(() => {
    document.body.classList.toggle('is-col-resizing', dragging);
    return () => document.body.classList.remove('is-col-resizing');
  }, [dragging]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: current() };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // The handle is on the column's left edge: moving left makes it wider.
    onChange(clamp(drag.current.w + (drag.current.x - e.clientX)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(clamp(current() + (e.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP)));
    } else if (e.key === 'Enter' || e.key === 'Home') {
      e.preventDefault();
      onChange(null);
    }
  };

  return (
    <div
      ref={handleRef}
      className={`col-resizer${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the log"
      aria-valuenow={Math.round(current())}
      tabIndex={0}
      title="Drag to resize the log. Double-click to reset."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onChange(null)}
      onKeyDown={onKeyDown}
    />
  );
}
