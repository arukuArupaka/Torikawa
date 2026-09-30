import { useState } from 'react';
import { Image, ImageProps, Text, View } from 'react-native';
import { colors } from '../constants/theme';

/** A missing local photo or offline remote image must not hide the rest of a card. */
export function FoodImage({ source, style, ...props }: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps['source']>();
  const uri = typeof source === 'object' && source && !Array.isArray(source) ? source.uri : source;
  const failedUri = typeof failedSource === 'object' && failedSource && !Array.isArray(failedSource) ? failedSource.uri : failedSource;
  if (!source || (failedSource !== undefined && uri === failedUri)) return (
    <View accessibilityLabel="写真を表示できません" style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }]}>
      <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>写真なし</Text>
    </View>
  );
  return <Image {...props} source={source} style={style} onError={(event) => { setFailedSource(source); props.onError?.(event); }} />;
}
