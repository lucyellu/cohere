import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current viewport is mobile (< 768px) or tablet (< 1024px).
 * Listens to matchMedia events so it reacts dynamically to screen resize and orientation changes.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    const onChange = (e) => {
      setIsMobile(e.matches);
    };

    setIsMobile(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    } else {
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    }
  }, [breakpoint]);

  return isMobile;
}

export function useResponsive() {
  const isMobile = useIsMobile(768);
  const isTablet = useIsMobile(1024);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }
  }, []);

  return { isMobile, isTablet, isDesktop: !isTablet, isTouch };
}
