import { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export function FormField({
  label,
  hint,
  error,
  children,
  ...inputProps
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {children ?? (
        <TextInput
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
  hint: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
});
