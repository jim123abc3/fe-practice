import { useEffect, useRef } from "react";

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  enabled?: boolean;
}

export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  cb: () => void,
  opts: UseIntersectionObserverOptions = {},
) {
  const { enabled = true, ...observerOptions } = opts;
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) cbRef.current();
    }, observerOptions);

    observer.observe(el);

    return () => observer.disconnect();
  }, [ref, enabled]);
}
