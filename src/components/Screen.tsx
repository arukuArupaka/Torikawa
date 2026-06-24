import { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

export function Screen({
  children,
  style,
  bottomSafe = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  bottomSafe?: boolean;
}) {
  return (
    <SafeAreaView
      edges={bottomSafe ? ['top', 'bottom'] : ['top']}
      style={[styles.container, style]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
