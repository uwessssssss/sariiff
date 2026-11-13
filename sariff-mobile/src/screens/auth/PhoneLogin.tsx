import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import Toast from "react-native-toast-message";
import * as api from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import { Button, Input } from "../../components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "../../theme";
import { getDeviceName } from "../../utils/notifications";

// Phone login: prove the phone with an SMS code (or a trusted phone skips it for
// 30 days), then pick a bureau linked to it. Each bureau is linked once with THAT
// bureau's client code + password; a matching number alone never links anything.

const PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;
const cleanPhone = (v: string) => v.replace(/[\s-]/g, "");

type Step = "checking" | "remembered" | "phone" | "code" | "bureaus";

// A trusted phone skips the SMS code only after the phone's owner unlocks it
// (fingerprint, face or the phone's own PIN). Without that, anyone holding an
// unlocked phone could open every linked bureau with two taps.
async function ownerUnlocks(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return false; // no lock set up: use SMS
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm it's you",
      cancelLabel: "Use SMS code",
    });
    return r.success;
  } catch {
    return false;
  }
}

export default function PhoneLogin() {
  const { signInWithTokens } = useAuth();
  const [step, setStep] = useState<Step>("checking");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null); // limited phone token, memory only
  const [bureaus, setBureaus] = useState<api.IdentityBureauDto[]>([]);
  const [linking, setLinking] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (title: string, message?: string) => {
    Toast.show({ type: "error", text1: title, text2: message });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const open = (t: api.IdentityTokenDto) => {
    setToken(t.accessToken);
    setBureaus(t.bureaus);
    setLinking(t.bureaus.length === 0);
    setStep("bureaus");
  };

  // A phone trusted earlier can skip the SMS code (after the owner unlocks it).
  useEffect(() => {
    let alive = true;
    api.getRememberedIdentityPhone().then((remembered: string | null) => {
      if (!alive) return;
      if (remembered) {
        setPhone(remembered);
        setStep("remembered");
      } else setStep("phone");
    }).catch(() => { if (alive) setStep("phone"); });   // a failing store must not leave the spinner up
    return () => {
      alive = false;
    };
  }, []);

  const continueTrusted = async () => {
    setBusy("trusted");
    if (!(await ownerUnlocks())) {
      setBusy(null);
      setStep("phone");
      return;
    }
    const secret = await api.getIdentityDeviceSecret();
    const r = secret ? await api.identityDeviceLogin(phone, secret) : { success: false as const, data: null };
    setBusy(null);
    if (r.success && r.data) open(r.data);
    else {
      Toast.show({ type: "info", text1: "Please confirm with an SMS code" });
      setStep("phone");
    }
  };

  const sendCode = async () => {
    const p = cleanPhone(phone);
    if (!PHONE_PATTERN.test(p)) return fail("Check the number", "Start with your country code, e.g. +254712345678");
    setBusy("send");
    const r = await api.identityRequestCode(p);
    setBusy(null);
    if (!r.success) return fail("Couldn't send a code", r.message);
    setCode("");
    Toast.show({ type: "success", text1: "Code sent", text2: r.message });
    setStep("code");
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6 digits from the SMS");
    setBusy("verify");
    const p = cleanPhone(phone);
    const r = await api.identityVerifyCode(p, code, await api.getIdentityDeviceSecret(), getDeviceName());
    setBusy(null);
    if (!r.success || !r.data) {
      setCode("");
      return fail("That code didn't work", r.message);
    }
    await api.rememberIdentityPhone(p);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    open(r.data);
  };

  const pick = async (b: api.IdentityBureauDto) => {
    if (!token || busy) return;
    setBusy(b.companyId);
    const r = await api.identityPick(token, b.companyId);
    if (!r.success || !r.data) {
      setBusy(null);
      return fail("Couldn't open that bureau", r.message);
    }
    await signInWithTokens(r.data); // navigation switches to the client tabs
  };

  const link = async () => {
    if (!token) return;
    if (!clientCode.trim() || !password) return fail("Enter the client code and password from that bureau");
    setBusy("link");
    const r = await api.identityLink(token, clientCode.trim().toUpperCase(), password);
    setBusy(null);
    if (!r.success || !r.data) return fail("Couldn't link that account", r.message);
    const linked = r.data;
    setBureaus((list) =>
      [...list.filter((x) => x.companyId !== linked.companyId), linked].sort((a, b) => a.companyName.localeCompare(b.companyName)),
    );
    setClientCode("");
    setPassword("");
    setLinking(false);
    Toast.show({ type: "success", text1: `${linked.companyName} linked`, text2: "Tap it to open" });
  };

  const restart = async () => {
    await api.forgetIdentityDevice(); // "different number" also stops trusting this phone
    setToken(null);
    setBureaus([]);
    setPhone("");
    setStep("phone");
  };

  if (step === "checking") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (step === "remembered") {
    return (
      <View>
        <Text style={styles.hint}>Welcome back. This phone is trusted for {phone}.</Text>
        <Button title={`Continue as ${phone}`} onPress={continueTrusted} loading={busy === "trusted"} disabled={!!busy} icon="finger-print-outline" size="lg" />
        <TouchableOpacity accessibilityRole="button" onPress={() => setStep("phone")} style={{ marginTop: spacing.lg }}>
          <Text style={styles.link}>Use an SMS code instead</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={restart} style={{ marginTop: spacing.md }}>
          <Text style={styles.muted}>Use a different number</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "phone") {
    return (
      <View>
        <Text style={styles.hint}>One sign-in for every bureau you use. We'll text you a code.</Text>
        <Input label="Phone Number" placeholder="e.g. +254711111111" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" />
        <Button title={busy ? "Sending..." : "Send code"} onPress={sendCode} loading={busy === "send"} disabled={!!busy} icon="chatbubble-outline" size="lg" />
      </View>
    );
  }

  if (step === "code") {
    return (
      <View>
        <Text style={styles.hint}>Enter the code sent to {cleanPhone(phone)}.</Text>
        <Input label="Code" placeholder="6 digits" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="numeric" icon="keypad-outline" />
        <Button title={busy ? "Checking..." : "Continue"} onPress={verify} loading={busy === "verify"} disabled={!!busy} icon="checkmark-outline" size="lg" />
        <View style={styles.row}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setStep("phone")}>
            <Text style={styles.link}>Change number</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={sendCode} disabled={!!busy}>
            <Text style={styles.link}>Send a new code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.hint}>{bureaus.length ? "Choose the bureau to open." : "Link the first bureau you use."}</Text>

      {bureaus.map((b) => (
        <TouchableOpacity
          key={b.companyId}
          accessibilityRole="button"
          accessibilityLabel={`Open ${b.companyName}`}
          style={styles.bureau}
          onPress={() => pick(b)}
          disabled={!!busy}
        >
          <View style={styles.bureauIcon}>
            <Ionicons name="business-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bureauName} numberOfLines={1}>{b.companyName}</Text>
            <Text style={styles.bureauCode} numberOfLines={1}>{b.clientCode}</Text>
          </View>
          {busy === b.companyId ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
        </TouchableOpacity>
      ))}

      {linking ? (
        <View style={styles.linkBox}>
          <Text style={styles.hint}>Use the client code and password from that bureau. The account must be on {cleanPhone(phone)}.</Text>
          <Input label="Client Code" placeholder="e.g. AFB-CL-2026-0001" value={clientCode} onChangeText={(t) => setClientCode(t.toUpperCase())} icon="id-card-outline" />
          <Input label="Password" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry icon="lock-closed-outline" />
          <Button title="Link bureau" onPress={link} loading={busy === "link"} disabled={!!busy} icon="link-outline" />
          {bureaus.length > 0 && (
            <TouchableOpacity accessibilityRole="button" onPress={() => setLinking(false)} style={{ marginTop: spacing.md }}>
              <Text style={[styles.link, { textAlign: "center" }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => setLinking(true)} style={{ marginTop: spacing.md }}>
          <Text style={styles.link}>+ Link another bureau</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity accessibilityRole="button" onPress={restart} style={{ marginTop: spacing.xl }}>
        <Text style={styles.muted}>Use a different number</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: "center" },
  hint: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  link: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  muted: { fontSize: fontSize.sm, color: colors.textTertiary },
  bureau: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  bureauIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  bureauName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  bureauCode: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  linkBox: { marginTop: spacing.md },
});
