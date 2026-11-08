import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { AuthProvider } from './src/hooks/useAuth';
import { RootNavigator, handlePushNavigation } from './src/navigation';
import { InactivityWrapper } from './src/components/InactivityWrapper';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { toastConfig } from './src/components/toastConfig';
import { colors } from './src/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
  });

  useEffect(() => {
    // Setup notification response handler — fails gracefully in Expo Go
    let sub: any;
    try {
      const Notifications = require('expo-notifications');
      if (Notifications?.setNotificationHandler) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      }
      // Tap on a notification -> route to the relevant screen
      if (Notifications?.addNotificationResponseReceivedListener) {
        sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          handlePushNavigation(response?.notification?.request?.content?.data);
        });
      }
    } catch {
      // expo-notifications not available (Expo Go SDK 53+)
    }
    return () => { try { sub?.remove?.(); } catch {} };
  }, []);

  // Keep a dark canvas while fonts load (avoids a white flash). Render once
  // loaded OR if loading errored, so missing fonts never block the app.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <InactivityWrapper>
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </InactivityWrapper>
          <Toast config={toastConfig} position="top" topOffset={60} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
