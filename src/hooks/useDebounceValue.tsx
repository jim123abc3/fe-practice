import { useEffect, useState } from "react";

export function useDebounceValue<T>(value: T, delay = 500): T {
  const [val, setVal] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVal(value);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return val;
}
