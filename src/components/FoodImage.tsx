import { useState } from 'react';
import { Image, ImageProps, Text, View } from 'react-native';
import { colors } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { foodIconCategory, isYahooImage } from '../utils/yahooImagePolicy';

/** A missing local photo or offline remote image must not hide the rest of a card. */
export function FoodImage({ source, style, ...props }: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps['source']>();
  const uri = typeof source === 'object' && source && 'uri' in source ? source.uri : source;
  const category = foodIconCategory(uri) ?? (isYahooImage(uri) ? 'other' : null);
  if (category) {
    const icons = { vegetables: 'leaf-outline', meat: 'restaurant-outline', seafood: 'fish-outline',
      dairy: 'water-outline', eggs: 'egg-outline', staples: 'nutrition-outline', seasonings: 'flask-outline',
      beverages: 'cafe-outline', other: 'restaurant-outline' } as const;
    return <View accessibilityRole="image" accessibilityLabel="食材アイコン" style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }]}>
      <Ionicons name={icons[category]} color={colors.primary} size={32} />
    </View>;
  }
  const failedUri = typeof failedSource === 'object' && failedSource && 'uri' in failedSource ? failedSource.uri : failedSource;
  if (!source || (failedSource !== undefined && uri === failedUri)) return (
    <View accessibilityLabel="写真を表示できません" style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }]}>
      <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>写真なし</Text>
    </View>
  );
  return <Image {...props} source={source} style={style} onError={(event) => { setFailedSource(source); props.onError?.(event); }} />;
}
