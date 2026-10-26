import { ReactNode, Ref } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, type TextInputInstance } from 'react-native';
import { colors, radius } from '../constants/theme';

export function FormField({
  label,
  hint,
  error,
  children,
  inputRef,
  ...inputProps
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
  inputRef?: Ref<TextInputInstance>;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {children ?? (
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, inputProps.multiline && styles.multiline, error && styles.inputError]}
          {...inputProps}
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
