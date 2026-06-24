import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

type ImageSource = 'camera' | 'library';

export function FoodImagePicker({ image, onChange }: { image: string; onChange: (uri: string) => void }) {
  const openPicker = async (source: ImageSource) => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        '写真へのアクセスが必要です',
        source === 'camera'
          ? '食材を撮影するため、カメラの使用を許可してください。'
          : '食材写真を選ぶため、写真ライブラリへのアクセスを許可してください。',
      );
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ['images'],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ['images'],
          quality: 0.8,
        });

    if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
  };

  const showOptions = () => {
    Alert.alert('食材の写真', '写真の追加方法を選んでください。', [
      { text: '写真を撮る', onPress: () => void openPicker('camera') },
      { text: 'ライブラリから選ぶ', onPress: () => void openPicker('library') },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: image }} style={styles.image} />
      <Pressable onPress={showOptions} style={styles.button}>
        <Ionicons color={colors.primary} name="camera-outline" size={19} />
        <Text style={styles.buttonText}>写真を変更</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  image: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 124, width: 124 },
  button: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  buttonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
