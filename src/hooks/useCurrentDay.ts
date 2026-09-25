import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toDateString } from '../utils/date';

/** Refresh date-dependent screens at local midnight and when returning to the app. */
export function useCurrentDay() {
  const [day, setDay] = useState(() => toDateString(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setDay(toDateString(now));
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, nextDay.getTime() - now.getTime());
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return day;
}
