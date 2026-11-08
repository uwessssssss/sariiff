import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, borderRadius } from '../theme';

import OfficeDashboardScreen from '../screens/office/OfficeDashboardScreen';
import ClientsScreen from '../screens/office/ClientsScreen';
import ExchangeScreen from '../screens/office/ExchangeScreen';
import TransactionsScreen from '../screens/office/TransactionsScreen';
import MoreScreen from '../screens/office/MoreScreen';

export type OfficeTabParamList = {
  Dashboard: undefined;
  Clients: undefined;
  Exchange: undefined;
  Transactions: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<OfficeTabParamList>();

const tabIcons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { active: 'grid', inactive: 'grid-outline' },
  Clients: { active: 'people', inactive: 'people-outline' },
  Exchange: { active: 'swap-horizontal-outline', inactive: 'swap-horizontal-outline' },
  Transactions: { active: 'receipt', inactive: 'receipt-outline' },
  More: { active: 'apps', inactive: 'apps-outline' },
};

export function OfficeTabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => {
          const iconName = focused ? tabIcons[route.name].active : tabIcons[route.name].inactive;
          return (
            <View style={focused ? styles.activeIconWrap : undefined}>
              <Ionicons name={iconName} size={focused ? 22 : 24} color={focused ? colors.primary : colors.textTertiary} />
            </View>
          );
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        // Lift the bar above the device nav bar / gesture area
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,17,26,0.92)' }]} />
          ),
      })}
    >
      <Tab.Screen name="Dashboard" component={OfficeDashboardScreen} />
      <Tab.Screen name="Clients" component={ClientsScreen} />
      <Tab.Screen name="Exchange" component={ExchangeScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    paddingTop: 8,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  activeIconWrap: {
    backgroundColor: 'rgba(233,185,73,0.16)',
    borderRadius: borderRadius.sm,
    padding: 6, marginBottom: -4,
  },
});
