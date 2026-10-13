import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../constants/theme';
import { useToastState, type ToastAction } from '../context/AppToastContext';
import { useIsAppAlertVisible } from '../context/AppAlertContext';
import { useReducedMotion } from '../context/MotionPreferenceContext';

export function AppToast() {
  const { toast, dismiss, runAction } = useToastState();
  const alertVisible = useIsAppAlertVisible();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!toast || alertVisible) return null;
  return <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom + 88, keyboardHeight + spacing.md) }]}>
    <ToastNotice key={toast.id} message={toast.message} action={toast.action}
      onAction={() => runAction(toast.id)} onDismiss={() => dismiss(toast.id)} />
  </View>;
}

function ToastNotice({ message, action, onAction, onDismiss }: {
  message: string; action?: ToastAction; onAction: () => void; onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const closing = useRef(false);
  const [screenReader, setScreenReader] = useState(true);
  const readingTime = action ? 8000 : 4000;
  const [timeout, setTimeoutMs] = useState<number | null>(Platform.OS === 'android' ? null : readingTime);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (closing.current) { onDismiss(); return; }
    if (reduceMotion) { progress.stopAnimation(); progress.setValue(1); }
    else Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    return () => progress.stopAnimation();
  }, [progress, reduceMotion]);

  useEffect(() => {
    // Browsers cannot reliably detect a screen reader; announce through the live region.
    if (Platform.OS === 'web') { setScreenReader(false); return; }
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      changed = true;
      if (active) setScreenReader(enabled);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (active && !changed) setScreenReader(enabled);
    }).catch(() => undefined);
    if (Platform.OS === 'android') {
      void AccessibilityInfo.getRecommendedTimeoutMillis(readingTime).then((value) => {
        if (active) setTimeoutMs(Number.isFinite(value) ? Math.max(readingTime, value) : readingTime);
      }).catch(() => { if (active) setTimeoutMs(readingTime); });
    }
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(
      [message, action?.hint, action?.label].filter(Boolean).join('。'), { queue: true });
    return () => { active = false; subscription?.remove(); };
  }, [message, action, readingTime]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion) { onDismiss(); return; }
    Animated.timing(progress, { toValue: 0, duration: 140, easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [onDismiss, progress, reduceMotion]);

  useEffect(() => {
    if (screenReader || focused || timeout === null) return;
    const timer = setTimeout(close, timeout);
    return () => clearTimeout(timer);
  }, [close, screenReader, focused, timeout]);

  return <Animated.View style={[styles.card, { opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
    <View style={styles.content}>
      <Ionicons name="checkmark-circle" size={24} color={colors.primaryDark} accessible={false} />
      <View style={styles.messageBlock} role={Platform.OS === 'web' ? 'status' : undefined}
        accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}>
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {action?.hint && <Text style={styles.hint}>{action.hint}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="完了通知を閉じる" onPress={close}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={20} color={colors.textMuted} accessible={false} />
      </Pressable>
    </View>
    {action && <Pressable accessibilityRole="button" accessibilityLabel={action.label}
      accessibilityHint={action.hint} onPress={() => { if (!closing.current) onAction(); }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Ionicons name="arrow-undo-outline" size={18} color={colors.primaryDark} accessible={false} />
      <Text style={styles.actionLabel}>{action.label}</Text>
    </Pressable>}
  </Animated.View>;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', zIndex: 20 },
  card: { width: '100%', maxWidth: 460, gap: spacing.xs,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
    paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs,
    shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  messageBlock: { flex: 1, paddingVertical: spacing.sm },
  message: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  action: { minHeight: 44, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-end', borderRadius: radius.sm, paddingHorizontal: spacing.md,
    marginRight: spacing.sm, marginBottom: spacing.xs, backgroundColor: colors.primarySoft },
  actionLabel: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  pressed: { opacity: 0.6 },
});
