import React, { useEffect, useRef } from 'react';

interface StylusPointerProps {
  enabled?: boolean;
}

export default function StylusPointer({ enabled = true }: StylusPointerProps) {
  const pointerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(false);
  const isMouseDownRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const coordsRef = useRef({ x: -100, y: -100 });

  useEffect(() => {
    // Detect if client is strictly a touch-only mobile device
    const isTouchOnly = typeof window !== 'undefined' && 
      window.matchMedia('(pointer: coarse)').matches && 
      !window.matchMedia('(pointer: fine)').matches;

    if (!enabled || isTouchOnly) return;

    const pointerEl = pointerRef.current;
    const ringEl = ringRef.current;
    if (!pointerEl) return;

    const render = () => {
      if (pointerEl) {
        pointerEl.style.transform = `translate3d(${coordsRef.current.x}px, ${coordsRef.current.y}px, 0)`;
        if (!isVisibleRef.current) {
          isVisibleRef.current = true;
          pointerEl.style.opacity = '1';
        }
      }
      rafIdRef.current = null;
    };

    const hidePointer = () => {
      isVisibleRef.current = false;
      if (pointerEl) {
        pointerEl.style.opacity = '0';
      }
      if (isMouseDownRef.current && ringEl) {
        isMouseDownRef.current = false;
        ringEl.className = 'relative flex items-center justify-center rounded-full border border-cyan-400/90 bg-cyan-400/20 backdrop-blur-[1px] transition-all duration-100 ease-out w-5 h-5 shadow-sm shadow-cyan-500/30';
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        hidePointer();
        return;
      }

      const x = e.clientX;
      const y = e.clientY;

      // Hide pointer smoothly when cursor reaches window boundaries
      if (x <= 2 || y <= 2 || x >= window.innerWidth - 2 || y >= window.innerHeight - 2) {
        hidePointer();
        return;
      }

      coordsRef.current.x = x;
      coordsRef.current.y = y;

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(render);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && ringEl) {
        isMouseDownRef.current = true;
        ringEl.className = 'relative flex items-center justify-center rounded-full border border-cyan-300 bg-cyan-400/40 backdrop-blur-[1px] transition-all duration-100 ease-out w-3.5 h-3.5 shadow-xs shadow-cyan-300/60';
      }
    };

    const handleMouseUp = () => {
      if (ringEl) {
        isMouseDownRef.current = false;
        ringEl.className = 'relative flex items-center justify-center rounded-full border border-cyan-400/90 bg-cyan-400/20 backdrop-blur-[1px] transition-all duration-100 ease-out w-5 h-5 shadow-sm shadow-cyan-500/30';
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { passive: true });
    window.addEventListener('blur', hidePointer);
    document.addEventListener('mouseleave', hidePointer);
    document.addEventListener('visibilitychange', hidePointer);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', hidePointer);
      document.removeEventListener('mouseleave', hidePointer);
      document.removeEventListener('visibilitychange', hidePointer);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={pointerRef}
      className="fixed top-0 left-0 z-[999999] pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 ease-out select-none will-change-transform"
      style={{
        transform: 'translate3d(-100px, -100px, 0)',
      }}
    >
      <div
        ref={ringRef}
        className="relative flex items-center justify-center rounded-full border border-cyan-400/90 bg-cyan-400/20 backdrop-blur-[1px] transition-all duration-100 ease-out w-5 h-5 shadow-sm shadow-cyan-500/30"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-xs shadow-cyan-200 shrink-0" />
        <div className="absolute w-0.5 h-0.5 rounded-full bg-white shrink-0" />
      </div>
    </div>
  );
}
