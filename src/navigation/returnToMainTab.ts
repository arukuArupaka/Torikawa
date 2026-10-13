import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from './types';

type RootNavigation = Pick<NativeStackNavigationProp<RootStackParamList>, 'getState' | 'popToTop' | 'navigate'>;

export function returnToMainTab(navigation: RootNavigation, screen: keyof MainTabParamList = 'Home') {
  // MainTabs is the first root route. Close every detail/modal (including any
  // duplicate tabs left by earlier navigate calls), then select the existing tab.
  if (navigation.getState().index > 0) navigation.popToTop();
  navigation.navigate('MainTabs', { screen });
}
