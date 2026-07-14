import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthOnboardingFlow } from '@/components/auth-onboarding-flow';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

function LayoutContent() {
  const { isAuthenticated, isOnboarded, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.void, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={color.signal} />
      </View>
    );
  }

  if (!isAuthenticated || !isOnboarded) {
    return <AuthOnboardingFlow />;
  }

  return <AppTabs />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <LayoutContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
