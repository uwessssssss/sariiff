import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { UserRole, balanceRowsFrom, formatCurrency } from '../../types';
import { Input, Button, SectionHeader } from '../../components/ui';
import * as api from '../../services/api';
import LinkedBureaus from '../../components/LinkedBureaus';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const anims = useRef(Array(5).fill(null).map(() => new Animated.Value(0))).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Load full profile from API
    (async () => {
      try {
        if (user?.role === UserRole.Client) {
          const res = await api.getClientProfile();
          if (res.success) setProfile(res.data);
        } else {
          const res = await api.getMyCompanyInfo();
          if (res.success) setProfile(res.data);
        }
      } catch {}
    })();
    anims.forEach((a, i) => {
      Animated.spring(a, { toValue: 1, tension: 55, friction: 9, delay: i * 60, useNativeDriver: true }).start();
    });
  }, []);

  useEffect(() => {
    Animated.spring(passwordAnim, {
      toValue: showPasswordForm ? 1 : 0,
      tension: 60, friction: 10, useNativeDriver: false,
    }).start();
  }, [showPasswordForm]);

  const isClient = user?.role === UserRole.Client;

  const getRoleLabel = (role?: number) => {
    switch (role) {
      case UserRole.SuperAdmin: return 'Super Admin';
      case UserRole.OfficeUser: return 'Office User';
      case UserRole.Client: return 'Client';
      default: return 'User';
    }
  };

  const getRoleColor = (role?: number) => {
    switch (role) {
      case UserRole.SuperAdmin: return colors.gradients.purple;
      case UserRole.OfficeUser: return colors.gradients.blue;
      case UserRole.Client: return colors.gradients.emerald;
      default: return colors.gradients.primary;
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Fill all password fields' });
      return;
    }
    if (newPassword !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Mismatch', text2: 'New passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      Toast.show({ type: 'error', text1: 'Too short', text2: 'Password must be at least 8 characters' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.changeClientPassword(currentPassword, newPassword, confirmPassword);
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({ type: 'success', text1: 'Password changed', text2: 'Your password has been updated' });
        setShowPasswordForm(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setChangingPassword(false);
    }
  };

  const openEditProfile = () => {
    setEditEmail(profile?.email || '');
    setEditPhone(profile?.whatsAppNumber || '');
    setShowEditProfile(true);
  };

  const handleUpdateProfile = async () => {
    if (!editPhone.trim()) { Toast.show({ type: 'error', text1: 'Phone required' }); return; }
    setUpdatingProfile(true);
    try {
      const res = await api.updateClientProfile({ email: editEmail || undefined, whatsAppNumber: editPhone });
      if (res.success) {
        Toast.show({ type: 'success', text1: 'Profile updated' });
        setShowEditProfile(false);
        // Reload profile
        const pRes = await api.getClientProfile();
        if (pRes.success) setProfile(pRes.data);
      } else { Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setUpdatingProfile(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out', style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
          },
        },
      ]
    );
  };

  const makeAnim = (i: number) => ({
    opacity: anims[i],
    transform: [{ translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  });

  const initials = (user?.fullName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Back button (when navigated from stack) */}
        {navigation.canGoBack() && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back"
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        )}

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Card */}
          <Animated.View style={[styles.profileCard, shadows.lg, makeAnim(0)]}>
            <LinearGradient
              colors={getRoleColor(user?.role)}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.profileGradient}
            >
              <View style={styles.profileDecor} />
              <View style={styles.profileDecor2} />
              <View style={styles.profileContent}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{initials}</Text>
                </View>
                <Text style={styles.profileName}>{user?.fullName || 'User'}</Text>
                <View style={styles.roleBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.roleText}>{getRoleLabel(user?.role)}</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Info Section */}
          <Animated.View style={makeAnim(1)}>
            <SectionHeader title="Account Information" />
            <View style={[styles.infoCard, shadows.sm]}>
              <InfoRow icon="finger-print" label="User ID" value={user?.id?.slice(0, 8) || '—'} />
              <InfoRow icon="qr-code-outline" label="Code" value={user?.code || '—'} />
              {user?.companyName && (
                <InfoRow icon="business-outline" label="Company" value={user.companyName} />
              )}
              {profile?.whatsAppNumber && <InfoRow icon="call-outline" label="Phone" value={profile.whatsAppNumber} />}
              {profile?.email && <InfoRow icon="mail-outline" label="Email" value={profile.email} />}
              {profile?.idPassport && <InfoRow icon="card-outline" label="ID/Passport" value={profile.idPassport} />}
              {/* Balance in every currency the client holds (KES, USD, UGX, EUR) */}
              {isClient && profile &&
                balanceRowsFrom(profile, true).map((r) => (
                  <InfoRow key={r.currency} icon="cash-outline" label={`${r.code} Balance`} value={formatCurrency(r.balance, r.currency)} />
                ))}
              {!isClient && profile?.address && <InfoRow icon="location-outline" label="Address" value={profile.address} />}
              {!isClient && profile?.taxId && <InfoRow icon="document-outline" label="Tax ID" value={profile.taxId} />}
            </View>
            {/* Account Summary for Clients */}
            {isClient && profile && (
              <View style={[styles.infoCard, shadows.sm, { marginTop: spacing.sm }]}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm }}>ACCOUNT SUMMARY</Text>
                {profile.createdAt && <InfoRow icon="calendar-outline" label="Member Since" value={new Date(profile.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />}
                {profile.lastLoginAt && <InfoRow icon="time-outline" label="Last Login" value={new Date(profile.lastLoginAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />}
                {balanceRowsFrom(profile, true)
                  .filter((r) => r.currency === 0 || r.totalIn || r.totalOut)
                  .flatMap((r) => [
                    <InfoRow key={`in-${r.currency}`} icon="swap-horizontal-outline" label={`Total Credited (${r.code})`} value={formatCurrency(r.totalIn, r.currency)} />,
                    <InfoRow key={`out-${r.currency}`} icon="swap-horizontal-outline" label={`Total Debited (${r.code})`} value={formatCurrency(r.totalOut, r.currency)} />,
                  ])}
                <InfoRow icon="checkmark-circle-outline" label="Status" value={profile.isActive ? 'Active' : 'Inactive'} />
              </View>
            )}
            {isClient && (
              <TouchableOpacity style={[styles.editProfileBtn, shadows.sm]} onPress={openEditProfile} activeOpacity={0.7}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
            {showEditProfile && (
              <View style={[styles.infoCard, shadows.sm, { marginTop: spacing.sm }]}>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>Update Profile</Text>
                <Input label="Phone Number" value={editPhone} onChangeText={setEditPhone} icon="call-outline" keyboardType="phone-pad" placeholder="+254..." />
                <Input label="Email" value={editEmail} onChangeText={setEditEmail} icon="mail-outline" keyboardType="email-address" placeholder="email@example.com" />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><Button title="Save" onPress={handleUpdateProfile} loading={updatingProfile} icon="checkmark-circle-outline" /></View>
                  <View style={{ flex: 1 }}><Button title="Cancel" onPress={() => setShowEditProfile(false)} variant="outline" /></View>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Password Change (Client only) */}
          {isClient && (
            <Animated.View style={makeAnim(2)}>
              <SectionHeader title="Security" />
              <TouchableOpacity
                style={[styles.menuItem, shadows.sm]}
                onPress={() => setShowPasswordForm(!showPasswordForm)}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="key" size={18} color={colors.warning} />
                </View>
                <Text style={styles.menuLabel}>Change Password</Text>
                <Ionicons
                  name={showPasswordForm ? 'chevron-up' : 'chevron-down'}
                  size={18} color={colors.textTertiary}
                />
              </TouchableOpacity>

              {showPasswordForm && (
                <Animated.View style={[styles.passwordForm, shadows.sm]}>
                  <Input
                    label="Current Password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    icon="lock-closed-outline"
                  />
                  <Input
                    label="New Password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    icon="lock-open-outline"
                  />
                  <Input
                    label="Confirm Password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    icon="checkmark-circle-outline"
                  />
                  <Button
                    title={changingPassword ? 'Updating...' : 'Update Password'}
                    onPress={handleChangePassword}
                    loading={changingPassword}
                    icon="shield-checkmark-outline"
                  />
                </Animated.View>
              )}
            </Animated.View>
          )}

          {/* Phone login: bureaus linked to this phone (hidden for code+password sign-ins) */}
          {isClient && <LinkedBureaus />}

          {/* App Info */}
          <Animated.View style={makeAnim(3)}>
            <SectionHeader title="App" />
            <View style={[styles.infoCard, shadows.sm]}>
              <InfoRow icon="information-circle-outline" label="Version" value="1.0.0" />
              <InfoRow icon="code-slash-outline" label="Build" value="2026.03" />
            </View>
          </Animated.View>

          {/* Logout */}
          <Animated.View style={makeAnim(4)}>
            <Button
              title="Sign Out"
              onPress={handleLogout}
              variant="danger"
              icon="log-out-outline"
              size="lg"
              style={{ marginTop: spacing.xl, marginBottom: spacing.xxxxl }}
            />
          </Animated.View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// Info Row sub-component
function InfoRow({ icon, label, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={infoStyles.row}>
      <View style={infoStyles.iconWrap}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: colors.infoLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  label: { fontSize: fontSize.sm, color: colors.textSecondary, width: 80 },
  value: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, textAlign: 'right' },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg },

  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.lg, marginBottom: spacing.sm,
    ...shadows.sm,
  },

  // Profile Card
  profileCard: { borderRadius: borderRadius.xl, overflow: 'hidden', marginBottom: spacing.md },
  profileGradient: { padding: spacing.xxl, paddingVertical: spacing.xxxl, overflow: 'hidden' },
  profileDecor: {
    position: 'absolute', top: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  profileDecor2: {
    position: 'absolute', bottom: -20, left: 20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  profileContent: { alignItems: 'center', position: 'relative' },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: spacing.lg,
  },
  avatarLargeText: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  profileName: {
    fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold,
    color: '#FFF', marginBottom: spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  roleText: {
    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 1,
  },

  // Info Card
  infoCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  editProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.infoLight, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, gap: spacing.xs, marginTop: spacing.sm,
  },
  editProfileText: { color: colors.primary, fontWeight: fontWeight.bold, fontSize: fontSize.sm },

  // Menu Item
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.lg, gap: spacing.md,
  },
  menuIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },

  // Password Form
  passwordForm: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.xl, marginTop: spacing.sm,
  },
});
