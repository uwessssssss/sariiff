import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types';
import { LoadingScreen } from '../components/ui';

import LoginScreen from '../screens/auth/LoginScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import { OfficeTabNavigator } from './OfficeTabNavigator';
import { ClientTabNavigator } from './ClientTabNavigator';
import ProfileScreen from '../screens/shared/ProfileScreen';

// Office sub-screens (accessed from More tab)
import AccountsScreen from '../screens/office/AccountsScreen';
import ExpensesScreen from '../screens/office/ExpensesScreen';
import InvoicesScreen from '../screens/office/InvoicesScreen';
import ReconciliationScreen from '../screens/office/ReconciliationScreen';
import ReportsScreen from '../screens/office/ReportsScreen';

export type RootStackParamList = {
  Login: undefined;
  Otp: undefined;
  OfficeTabs: undefined;
  ClientTabs: undefined;
  Profile: undefined;
  Accounts: undefined;
  Expenses: undefined;
  Invoices: undefined;
  Reconciliation: undefined;
  Reports: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Ref + guarded router for notification taps. Routes to the right tab for the
// currently mounted navigator; no-ops safely if anything doesn't line up.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function handlePushNavigation(data: any) {
  if (!navigationRef.isReady() || !data) return;
  try {
    const type = String(data.type || '').toLowerCase();
    const root = navigationRef.getRootState();
    const active = root?.routes?.[root.index ?? 0]?.name;
    if (active === 'OfficeTabs') {
      (navigationRef as any).navigate('OfficeTabs', { screen: 'Transactions' });
    } else if (active === 'ClientTabs') {
      (navigationRef as any).navigate('ClientTabs', { screen: type === 'transaction' ? 'Statements' : 'Alerts' });
    }
  } catch {}
}

export function RootNavigator() {
  const { isLoading, isAuthenticated, requiresOtp, user } = useAuth();

  if (isLoading) return <LoadingScreen message="Starting Sarif..." />;

  const isClient = user?.role === UserRole.Client;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            {requiresOtp && <Stack.Screen name="Otp" component={OtpScreen} />}
          </>
        ) : isClient ? (
          <>
            <Stack.Screen name="ClientTabs" component={ClientTabNavigator} />
            <Stack.Screen name="Profile" component={ProfileScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="OfficeTabs" component={OfficeTabNavigator} />
            <Stack.Screen name="Profile" component={ProfileScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
            <Stack.Screen name="Accounts" component={AccountsScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
            <Stack.Screen name="Expenses" component={ExpensesScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
            <Stack.Screen name="Invoices" component={InvoicesScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
            <Stack.Screen name="Reconciliation" component={ReconciliationScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
            <Stack.Screen name="Reports" component={ReportsScreen}
              options={{ animation: 'slide_from_right', presentation: 'card' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
