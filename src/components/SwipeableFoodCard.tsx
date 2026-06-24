import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, radius } from '../constants/theme';
import { FoodItem } from '../types';
import { FoodCard } from './FoodCard';

export function SwipeableFoodCard({
  food,
  onPress,
  onMarkUsed,
  onMarkDisposed,
}: {
  food: FoodItem;
  onPress: () => void;
  onMarkUsed: () => void;
  onMarkDisposed: () => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleSwipeOpen = (direction: 'left' | 'right', swipeable: Swipeable) => {
    swipeable.close();
    if (direction === 'left') {
      onMarkDisposed();
    } else {
      onMarkUsed();
    }
  };

  const renderUsedAction = () => (
    <View style={[styles.action, styles.usedAction]}>
      <Ionicons color={colors.surface} name="checkmark-done" size={24} />
      <Text style={styles.actionText}>使い切った</Text>
      <Text style={styles.actionSubText}>左へ離して確認</Text>
    </View>
  );

  const renderDisposedAction = () => (
    <View style={[styles.action, styles.disposedAction]}>
      <Ionicons color={colors.surface} name="trash-bin-outline" size={23} />
      <Text style={styles.actionText}>捨てた</Text>
      <Text style={styles.actionSubText}>右へ離して確認</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Swipeable
        friction={2}
        leftThreshold={72}
        onSwipeableOpen={handleSwipeOpen}
        overshootLeft={false}
        overshootRight={false}
        ref={swipeableRef}
        renderLeftActions={renderDisposedAction}
        renderRightActions={renderUsedAction}
        rightThreshold={72}
      >
        <FoodCard food={food} onPress={onPress} />
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.md, overflow: 'hidden' },
  action: { alignItems: 'center', gap: 2, justifyContent: 'center', width: 116 },
  usedAction: { backgroundColor: colors.primary },
  disposedAction: { backgroundColor: colors.danger },
  actionText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  actionSubText: { color: colors.surface, fontSize: 9, opacity: 0.85 },
});
