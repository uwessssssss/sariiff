import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import * as api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { Button, Input, SectionHeader } from "./ui";
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from "../theme";

// Profile section for clients who signed in with their phone: open another bureau,
// link one more, remove one, or sign out everywhere. Hidden for code+password sign-ins.
// Each bureau is a separate account: nothing (money, history, alerts) moves between them.

export default function LinkedBureaus() {
  const { user, switchBureau, logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [bureaus, setBureaus] = useState<api.IdentityBureauDto[]>([]);
  const [linking, setLinking] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!(await api.hasPhoneLogin())) return;
      const r = await api.getLinkedBureaus();
      if (alive && r.success && r.data) {
        setBureaus(r.data);
        setVisible(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;
  const here = user?.companyId;

  const open = async (b: api.IdentityBureauDto) => {
    setBusy(b.companyId);
    const r = await switchBureau(b.companyId);
    if (!r.success) {
      setBusy(null);
      Toast.show({ type: "error", text1: "Couldn't open that bureau", text2: r.message });
    }
    // On success the whole client area reloads for the new bureau.
  };

  const link = async () => {
    if (!clientCode.trim() || !password) {
      Toast.show({ type: "error", text1: "Enter the client code and password from that bureau" });
      return;
    }
    setBusy("link");
    const r = await api.linkBureau(clientCode.trim().toUpperCase(), password);
    setBusy(null);
    if (!r.success || !r.data) {
      Toast.show({ type: "error", text1: "Couldn't link that account", text2: r.message });
      return;
    }
    const linked = r.data;
    setBureaus((list) =>
      [...list.filter((x) => x.companyId !== linked.companyId), linked].sort((a, b) => a.companyName.localeCompare(b.companyName)),
    );
    setClientCode("");
    setPassword("");
    setLinking(false);
    Toast.show({ type: "success", text1: `${linked.companyName} linked` });
  };

  const remove = (b: api.IdentityBureauDto) =>
    Alert.alert(
      `Remove ${b.companyName}?`,
      "Your account there stays. You can still sign in with its code and password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(b.companyId);
            const r = await api.unlinkBureau(b.companyId);
            setBusy(null);
            if (!r.success) {
              Toast.show({ type: "error", text1: "Couldn't remove it", text2: r.message });
              return;
            }
            setBureaus((list) => list.filter((x) => x.companyId !== b.companyId));
          },
        },
      ],
    );

  const everywhere = () =>
    Alert.alert("Sign out on every device?", "Every phone, including this one, will need a new SMS code.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setBusy("everywhere");
          const r = await api.signOutEverywhere();
          setBusy(null);
          if (!r.success) {
            Toast.show({ type: "error", text1: "Couldn't sign out everywhere", text2: r.message });
            return;
          }
          await api.forgetIdentityDevice();
          await logout();
        },
      },
    ]);

  return (
    <View>
      <SectionHeader title="Linked bureaus" />
      <View style={[styles.card, shadows.sm]}>
        {bureaus.map((b) => {
          const isHere = b.companyId === here;
          return (
            <View key={b.companyId} style={styles.row}>
              <Ionicons name="business-outline" size={18} color={colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{b.companyName}</Text>
                <Text style={styles.code} numberOfLines={1}>{b.clientCode}</Text>
              </View>
              {isHere ? (
                <Text style={styles.here}>Open now</Text>
              ) : busy === b.companyId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${b.companyName}`} onPress={() => open(b)} disabled={!!busy}>
                    <Text style={styles.action}>Open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${b.companyName}`} onPress={() => remove(b)} disabled={!!busy}>
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}

        {linking ? (
          <View style={{ marginTop: spacing.md }}>
            <Input label="Client Code" placeholder="e.g. KRB-CL-2026-0001" value={clientCode} onChangeText={(t) => setClientCode(t.toUpperCase())} icon="id-card-outline" />
            <Input label="Password" placeholder="Password from that bureau" value={password} onChangeText={setPassword} secureTextEntry icon="lock-closed-outline" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Button title="Link" onPress={link} loading={busy === "link"} icon="link-outline" /></View>
              <View style={{ flex: 1 }}><Button title="Cancel" onPress={() => setLinking(false)} variant="outline" /></View>
            </View>
          </View>
        ) : (
          <TouchableOpacity accessibilityRole="button" onPress={() => setLinking(true)} style={{ marginTop: spacing.md }}>
            <Text style={styles.action}>+ Link another bureau</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity accessibilityRole="button" onPress={everywhere} disabled={!!busy} style={{ marginTop: spacing.lg }}>
          <Text style={styles.remove}>{busy === "everywhere" ? "Signing out..." : "Sign out on every device"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  name: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  code: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  here: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  action: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary, paddingHorizontal: 4 },
  remove: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.danger, paddingHorizontal: 4 },
});
