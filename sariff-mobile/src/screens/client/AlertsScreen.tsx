import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
  Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { ClientAlertDto, formatDateTime } from '../../types';
import { EmptyState, Shimmer } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

const alertTypeConfig: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}> = {
  success: { icon: 'checkmark-circle', color: colors.success, bg: colors.successLight },
  info: { icon: 'information-circle', color: colors.primary, bg: colors.infoLight },
  warning: { icon: 'warning', color: colors.warning, bg: colors.warningLight },
  error: { icon: 'alert-circle', color: colors.danger, bg: colors.dangerLight },
  transaction: { icon: 'swap-horizontal', color: colors.primary, bg: colors.infoLight },
  rate: { icon: 'trending-up', color: '#8B5CF6', bg: 'rgba(154,123,255,0.12)' },
  system: { icon: 'settings', color: colors.textSecondary, bg: colors.surfaceAlt },
  default: { icon: 'notifications', color: colors.primary, bg: colors.infoLight },
};

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<ClientAlertDto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  const loadAlerts = useCallback(async (pageNum = 1, append = false) => {
    try {
      const res = await api.getClientAlerts(pageNum, 20);
      if (res.success && res.data) {
        setAlerts(prev => append ? [...prev, ...(res.data.items || [])] : (res.data.items || []));
        setTotalPages(res.data.totalPages);
        setPage(pageNum);
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await loadAlerts();
      setLoading(false);
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadAlerts(1); setRefreshing(false); };

  const onLoadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadAlerts(page + 1, true);
    setLoadingMore(false);
  };

  const unreadCount = alerts.filter(a => !a.isRead).length;
  // Only render alerts that actually have content — filtering the DATA (instead
  // of returning null in renderItem) prevents empty cells/boxes in the FlatList.
  const visibleAlerts = alerts.filter(a => a.title || a.message);

  const handleMarkRead = async (alertId: string) => {
    const prev = alerts;
    setAlerts(p => p.map(a => a.id === alertId ? { ...a, isRead: true } : a)); // optimistic
    try {
      const res = await api.markAlertAsRead(alertId);
      if (!res.success) setAlerts(prev); // rollback
    } catch { setAlerts(prev); }
  };

  const handleMarkAllRead = async () => {
    const prev = alerts;
    setAlerts(p => p.map(a => ({ ...a, isRead: true }))); // optimistic
    try {
      const res = await api.markAllAlertsAsRead();
      if (!res.success) setAlerts(prev); // rollback
    } catch { setAlerts(prev); }
  };

  const renderAlert = ({ item, index }: { item: ClientAlertDto; index: number }) => {
    // Skip alerts with no content (prevents empty boxes)
    if (!item.title && !item.message) return null;
    const config = alertTypeConfig[item.type?.toLowerCase()] || alertTypeConfig.default;
    return (
      <TouchableOpacity
        style={[
          styles.alertCard,
          shadows.sm,
          !item.isRead && styles.alertCardUnread,
        ]}
        activeOpacity={0.7}
        onPress={() => !item.isRead && handleMarkRead(item.id)}
      >
        {/* Unread dot */}
        {!item.isRead && <View style={styles.unreadDot} />}

        <View style={[styles.alertIcon, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={18} color={config.color} />
        </View>

        <View style={styles.alertContent}>
          <View style={styles.alertTitleRow}>
            <Text style={[styles.alertTitle, !item.isRead && styles.alertTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.alertTime}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.alertMessage} numberOfLines={2}>{item.message}</Text>
          <View style={styles.alertTypeBadge}>
            <Text style={[styles.alertTypeText, { color: config.color }]}>
              {item.type}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.header, {
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
      }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Alerts</Text>
            <Text style={styles.subtitle}>Stay updated on your account</Text>
          </View>
          {(unreadCount > 0 || page < totalPages) && (   // older pages may hold unread alerts
            <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
              <Ionicons name="checkmark-done" size={16} color={colors.primary} />
              <Text style={styles.markAllText}>Read all</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.list}>
          {[0,1,2,3,4,5].map(i => <Shimmer key={i} height={84} radius={borderRadius.md} style={{ marginBottom: spacing.sm }} />)}
        </View>
      ) : (
        <FlatList
          data={visibleAlerts}
          keyExtractor={item => item.id}
          renderItem={renderAlert}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title="No alerts"
              subtitle="You'll be notified about important account updates"
            />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ padding: 20 }} color={colors.primary} /> : <View style={{ height: 100 }} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: fontSize.xxxl, fontWeight: fontWeight.extrabold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },

  unreadBadge: {
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  unreadBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#FFF' },

  // List
  list: { paddingHorizontal: spacing.lg },

  // Alert Card
  alertCard: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.lg,
    marginBottom: spacing.sm, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  alertCardUnread: {
    borderLeftWidth: 3, borderLeftColor: colors.gold,
    backgroundColor: colors.surfaceAlt,
  },
  unreadDot: {
    position: 'absolute', top: spacing.md, right: spacing.md,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary,
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  alertContent: { flex: 1 },
  alertTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4,
  },
  alertTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, flex: 1, marginRight: spacing.sm },
  alertTitleUnread: { fontWeight: fontWeight.bold },
  alertTime: { fontSize: fontSize.xs, color: colors.textTertiary },
  alertMessage: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  alertTypeBadge: { marginTop: spacing.xs },
  alertTypeText: { fontSize: 10, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.infoLight, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, gap: 4 },
  markAllText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary },
});
