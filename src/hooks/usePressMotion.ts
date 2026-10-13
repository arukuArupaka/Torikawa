import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReducedMotion } from '../context/MotionPreferenceContext';

/** Animate the button's visual contents while keeping its hit area still. */
export function usePressMotion(disabled = false) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (disabled || reduceMotion) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [disabled, reduceMotion, scale]);
  const animatePress = (pressed: boolean) => {
    if (disabled || reduceMotion) return;
    scale.stopAnimation();
    // Brief taps still show the pressed state before the release animation.
    if (pressed) { scale.setValue(0.94); return; }
    Animated.timing(scale, { toValue: 1, duration: 220,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
  };
  return { scale, onPressIn: () => animatePress(true), onPressOut: () => animatePress(false) };
}
