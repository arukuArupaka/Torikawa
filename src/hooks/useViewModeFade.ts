import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReducedMotion } from '../context/MotionPreferenceContext';

/** Reveal the new grouping without delaying data or remounting the list. */
export function useViewModeFade(viewMode: string) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const previousMode = useRef(viewMode);
  useEffect(() => {
    const changed = previousMode.current !== viewMode;
    previousMode.current = viewMode;
    opacity.stopAnimation();
    translateY.stopAnimation();
    if (changed && !reduceMotion) {
      opacity.setValue(0.55);
      translateY.setValue(10);
      Animated.timing(opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
      Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    } else {
      opacity.setValue(1);
      translateY.setValue(0);
    }
    return () => { opacity.stopAnimation(); translateY.stopAnimation(); };
  }, [viewMode, reduceMotion, opacity, translateY]);
  return { opacity, translateY };
}
