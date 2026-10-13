import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../context/MotionPreferenceContext';

export type AnimatedDisclosureProps = {
  expanded: boolean;
  header: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Measure the natural content height; only constrain it during an open/close transition. */
export function AnimatedDisclosure({ expanded, header, children, contentStyle }: AnimatedDisclosureProps) {
  const reduceMotion = useReducedMotion();
  const height = useRef(new Animated.Value(0)).current;
  const measuredHeight = useRef(0);
  const sequence = useRef(0);
  const constrained = useRef(false);
  const mounted = useRef(expanded);
  const previousExpanded = useRef(expanded);
  const target = useRef({ expanded, reduceMotion });
  target.current = { expanded, reduceMotion };
  const [present, setPresent] = useState(expanded);
  const [animating, setAnimating] = useState(false);

  const moveHeight = useCallback((toValue: number, opening: boolean) => {
    const run = ++sequence.current;
    height.stopAnimation();
    Animated.timing(height, { toValue, duration: 260, easing: Easing.out(Easing.cubic),
      useNativeDriver: false, isInteraction: false }).start(({ finished }) => {
      if (!finished || run !== sequence.current || target.current.expanded !== opening || target.current.reduceMotion) return;
      constrained.current = false;
      mounted.current = opening;
      if (!opening) measuredHeight.current = 0;
      setAnimating(false);
      setPresent(opening);
    });
  }, [height]);

  useEffect(() => {
    const changed = expanded !== previousExpanded.current;
    previousExpanded.current = expanded;
    if (reduceMotion) {
      constrained.current = false;
      mounted.current = expanded;
      if (!expanded) measuredHeight.current = 0;
      setAnimating(false);
      setPresent(expanded);
    } else if (changed && expanded) {
      if (!constrained.current) height.setValue(0);
      const alreadyMounted = mounted.current;
      constrained.current = true;
      mounted.current = true;
      setAnimating(true);
      setPresent(true);
      // Reversing a close can use the still-mounted content. A fresh open waits for onLayout.
      if (alreadyMounted) moveHeight(measuredHeight.current, true);
    } else if (changed && mounted.current && measuredHeight.current > 0) {
      if (!constrained.current) height.setValue(measuredHeight.current);
      constrained.current = true;
      setAnimating(true);
      moveHeight(0, false);
    } else if (changed) {
      constrained.current = false;
      mounted.current = false;
      measuredHeight.current = 0;
      setAnimating(false);
      setPresent(false);
    }
    return () => { ++sequence.current; height.stopAnimation(); };
  }, [expanded, reduceMotion, height, moveHeight]);

  const measureContent = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(nextHeight) || nextHeight < 0) return;
    measuredHeight.current = nextHeight;
    if (target.current.expanded && !target.current.reduceMotion && constrained.current) moveHeight(nextHeight, true);
  };

  return <View>
    {header}
    {present ? <Animated.View style={[styles.clip, animating && { height }]}
      pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
      <View onLayout={measureContent} style={[contentStyle, animating && styles.measuring]}>{children}</View>
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  measuring: { position: 'absolute', left: 0, right: 0 },
});
