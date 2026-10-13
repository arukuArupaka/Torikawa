import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';

const MotionPreferenceContext = createContext(true);

export function MotionPreferenceProvider({ children }: PropsWithChildren) {
  // Keep the UI still until the device preference is known.
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      changed = true;
      if (active) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => undefined);
    return () => { active = false; subscription?.remove(); };
  }, []);
  return <MotionPreferenceContext.Provider value={reduceMotion}>{children}</MotionPreferenceContext.Provider>;
}

export function useReducedMotion() { return useContext(MotionPreferenceContext); }
