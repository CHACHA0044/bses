import { useEffect, useState } from 'react';

/**
 * useDebounce — returns `value` after it has been stable for `delay` ms.
 * Used for search inputs so we don't fire an API call per keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
