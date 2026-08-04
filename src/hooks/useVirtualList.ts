import { useEffect, useRef, useState, type RefObject } from "react";

interface UseVirtualListProps<T> {
  items: T[];
  rowHeight: number;
  overscan?: number;
  containerRef: RefObject<HTMLElement>;
}

interface VirtualItem<T> {
  index: number;
  item: T;
  offsetTop: number;
}

interface UseVirtualListResult<T> {
  virtualItems: VirtualItem<T>[];
  totalHeight: number;
}

export function useVirtualList<T>({
  items,
  rowHeight,
  overscan = 5,
  containerRef,
}: UseVirtualListProps<T>): UseVirtualListResult<T> {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const tickingRef = useRef(false);

  const handleScroll = () => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
      tickingRef.current = false;
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setViewportHeight(container.clientHeight);

    container.addEventListener("scroll", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);

  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  const virtualItems: VirtualItem<T>[] = [];

  for (let index = startIndex; index <= endIndex; index++) {
    virtualItems.push({
      index,
      item: items[index],
      offsetTop: index * rowHeight,
    });
  }

  return {
    virtualItems,
    totalHeight: items.length * rowHeight,
  };
}
