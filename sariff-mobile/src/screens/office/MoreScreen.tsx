import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

interface MenuItem {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: string[];
  screen: string;
}

const menuItems: MenuItem[] = [
  { id: 'accounts', label: 'Accounts', subtitle: 'Cash, bank, mobile money balances', icon: 'wallet-outline', gradient: ['#10B981', '#0D9488'], screen: 'Accounts' },
  { id: 'expenses', label: 'Expenses', subtitle: 'Track business expenses', icon: 'receipt-outline', gradient: ['#EF4444', '#DC2626'], screen: 'Expenses' },
  { id: 'invoices', label: 'Invoices', subtitle: 'Manage client invoices', icon: 'document-text-outline', gradient: ['#3B82F6', '#4F46E5'], screen: 'Invoices' },
  { id: 'reconciliation', label: 'Reconciliation', subtitle: 'Match and verify transactions', icon: 'checkmark-done-outline', gradient: ['#F59E0B', '#D97706'], screen: 'Reconciliation' },
  { id: 'reports', label: 'Reports', subtitle: 'Daily reports & exchange summaries', icon: 'bar-chart-outline', gradient: ['#8B5CF6', '#7C3AED'], screen: 'Reports' },
  { id: 'profile', label: 'Profile & Settings', subtitle: 'Your account settings', icon: 'person-outline', gradient: ['#64748B', '#475569'], screen: 'Profile' },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const anims = useRef(menuItems.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    anims.forEach((a, i) => {
      Animated.spring(a, { toValue: 1, tension: 60, friction: 9, useNativeDriver: true, delay: i * 60 }).start();
    });
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>{user?.fullName || 'Office User'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}>
        {menuItems.map((item, i) => (
          <Animated.View key={item.id} style={{
            opacity: anims[i],
            transform: [{ translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
          }}>
            <TouchableOpacity
              style={[styles.menuCard, shadows.md]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <LinearGradient colors={item.gradient as [string, string]} style={styles.menuIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name={item.icon} size={22} color="#FFF" />
              </LinearGradient>
              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={[styles.logoutCard, shadows.sm]} onPress={logout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  menuCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.sm,
  },
  menuIcon: {
    width: 48, height: 48, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.lg,
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  menuSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  logoutCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dangerLight, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginTop: spacing.lg, gap: spacing.sm,
  },
  logoutText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.danger },
});
