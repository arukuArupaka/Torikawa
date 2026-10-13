import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

type ShowAlert = typeof Alert.alert;
type Dialog = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const nativeAlert: ShowAlert = (...args) => Alert.alert(...args);
const AppAlertContext = createContext<ShowAlert>(nativeAlert);
const AppAlertVisibilityContext = createContext(false);

/** Keep native alerts on devices and provide the same choices in the web app. */
export function AppAlertProvider({ children }: PropsWithChildren) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const pending = useRef<Dialog[]>([]);
  const current = useRef<Dialog | null>(null);
  const nativeDialogs = useRef(new Set<number>());
  const nativeId = useRef(0);
  const [nativeVisible, setNativeVisible] = useState(false);
  const showAlert = useCallback<ShowAlert>((title, message, buttons, options) => {
    if (Platform.OS !== 'web') {
      const id = ++nativeId.current;
      nativeDialogs.current.add(id);
      setNativeVisible(true);
      const finishNative = () => {
        if (!nativeDialogs.current.delete(id)) return false;
        setNativeVisible(nativeDialogs.current.size > 0);
        return true;
      };
      const nativeButtons = (buttons?.length ? buttons : [{ text: 'OK' }]).map((button) => ({ ...button,
        onPress: () => { if (finishNative()) button.onPress?.(); },
      }));
      try {
        nativeAlert(title, message, nativeButtons, { ...options,
          onDismiss: () => { if (finishNative()) options?.onDismiss?.(); },
        });
      } catch (error) { finishNative(); throw error; }
      return;
    }
    const next = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options };
    if (current.current) {
      pending.current.push(next);
    } else {
      current.current = next;
      setDialog(next);
    }
  }, []);

  const finish = (target: Dialog, button?: AlertButton) => {
    // A repeated press on an old button must never repeat a destructive action.
    if (current.current !== target) return;
    const next = pending.current.shift() ?? null;
    current.current = next;
    setDialog(next);
    if (button) button.onPress?.();
    else target.options?.onDismiss?.();
  };
  const dismiss = () => {
    if (!dialog) return;
    const cancel = dialog.buttons.find((button) => button.style === 'cancel');
    if (cancel) finish(dialog, cancel);
    else if (dialog.options?.cancelable !== false) finish(dialog);
  };

  return (
    <AppAlertVisibilityContext.Provider value={dialog !== null || nativeVisible}>
    <AppAlertContext.Provider value={showAlert}>
      {children}
      {dialog ? (
        <Modal transparent visible animationType="none" onRequestClose={dismiss}>
          <View style={styles.backdrop}>
            <View role="alertdialog" accessibilityLabel={dialog.title} accessibilityViewIsModal style={styles.card}>
              <ScrollView contentContainerStyle={styles.content}>
                <Text accessibilityRole="header" style={styles.title}>{dialog.title}</Text>
                {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
                <View style={styles.actions}>
                  {[...dialog.buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel')).map((button, index) => (
                    <Pressable
                      key={index}
                      accessibilityRole="button"
                      onPress={() => finish(dialog, button)}
                      style={({ pressed }) => [styles.button, button.style === 'cancel' && styles.cancel, button.style === 'destructive' && styles.destructive, pressed && styles.pressed]}
                    >
                      <Text style={[styles.buttonText, button.style === 'cancel' && styles.cancelText, button.style === 'destructive' && styles.destructiveText]}>{button.text ?? 'OK'}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </AppAlertContext.Provider>
    </AppAlertVisibilityContext.Provider>
  );
}

export function useAppAlert() { return useContext(AppAlertContext); }
export function useIsAppAlertVisible() { return useContext(AppAlertVisibilityContext); }

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(23,32,26,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: '85%', maxWidth: 420, width: '100%', overflow: 'hidden' },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  message: { color: colors.text, fontSize: 15, lineHeight: 24 },
  actions: { gap: spacing.sm },
  button: { minHeight: 48, borderRadius: radius.sm, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { color: colors.surface, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  cancel: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
  cancelText: { color: colors.text },
  destructive: { backgroundColor: colors.dangerSoft },
  destructiveText: { color: '#B52D2D' },
  pressed: { opacity: 0.75 },
});
