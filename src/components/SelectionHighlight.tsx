import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';
import { useReducedMotion } from '../context/MotionPreferenceContext';

/** Move one background beneath the labels; their tap areas stay still. */
export function SelectionHighlight({ index, width }: { index: number; width: number }) {
  const reduceMotion = useReducedMotion();
  const translateX = useRef(new Animated.Value(index * width)).current;
  const previous = useRef({ index, width });
  useEffect(() => {
    const changed = previous.current.index !== index;
    const resized = previous.current.width !== width;
    previous.current = { index, width };
    translateX.stopAnimation();
    if (changed && !resized && width > 0 && !reduceMotion) {
      Animated.timing(translateX, { toValue: index * width, duration: 280,
        easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    } else {
      translateX.setValue(index * width);
    }
    return () => translateX.stopAnimation();
  }, [index, width, reduceMotion, translateX]);
  if (width <= 0) return null;
  return <Animated.View pointerEvents="none" aria-hidden accessible={false}
    style={[styles.background, { width, transform: [{ translateX }] }]} />;
}

const styles = StyleSheet.create({
  background: { position: 'absolute', top: 0, bottom: 0, left: 0,
    backgroundColor: colors.primarySoft, borderColor: '#CBE4D0', borderWidth: 1, borderRadius: 7 },
});
