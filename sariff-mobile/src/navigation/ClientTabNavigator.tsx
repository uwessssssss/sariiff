import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, borderRadius } from '../theme';

import ClientDashboardScreen from '../screens/client/ClientDashboardScreen';
import StatementsScreen from '../screens/client/statements/StatementsScreen';
import AnalyticsScreen from '../screens/client/AnalyticsScreen';
import AlertsScreen from '../screens/client/AlertsScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

export type ClientTabParamList = {
  Home: undefined;
  Statements: undefined;
  Analytics: undefined;
  Alerts: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<ClientTabParamList>();

const tabIcons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Statements: { active: 'document-text', inactive: 'document-text-outline' },
  Analytics: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  Alerts: { active: 'notifications', inactive: 'notifications-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function ClientTabNavigator() {
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
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,17,26,0.92)' }]} />
          ),
      })}
    >
      <Tab.Screen name="Home" component={ClientDashboardScreen} />
      <Tab.Screen name="Statements" component={StatementsScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
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
