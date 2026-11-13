import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { Input, Button } from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  fonts,
} from "../../theme";
import { RootStackParamList } from "../../navigation";
import PhoneLogin from "./PhoneLogin";
import { identityEnabled } from "../../services/api";

const { height } = Dimensions.get("window");

export default function LoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { login, requiresOtp } = useAuth();

  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Phone login (one login, several bureaus) only shows when the server has it on.
  const [mode, setMode] = useState<"code" | "phone">("code");
  const [phoneLoginOn, setPhoneLoginOn] = useState(false);
  useEffect(() => {
    let alive = true;
    identityEnabled().then((on) => alive && setPhoneLoginOn(on));
    return () => {
      alive = false;
    };
  }, []);

  const logoAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logoAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(formAnim, {
        toValue: 1,
        tension: 50,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (requiresOtp) {
      navigation.navigate("Otp");
    }
  }, [requiresOtp, navigation]);

  const handleLogin = async () => {
    if (loading) return;

    if (!code.trim() || !phone.trim() || !password.trim()) {
      Toast.show({
        type: "error",
        text1: "Missing fields",
        text2: "Please fill all fields",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await login({
        code: code.trim(),
        phoneNumber: phone.trim(),
        password,
      });

      if (!result.success) {
        Toast.show({
          type: "error",
          text1: "Login failed",
          text2: result.message,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (result.message === "OTP sent") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const orbTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const orb2TranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-15, 10],
  });

  return (
    <LinearGradient
      colors={["#0A0C12", "#11141F", "#0A0C12"]}
      style={styles.container}
    >
      <Animated.View
        style={[
          styles.orb,
          styles.orb1,
          { transform: [{ translateY: orbTranslateY }] },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orb2,
          { transform: [{ translateY: orb2TranslateY }] },
        ]}
      />
      <Animated.View style={[styles.orb, styles.orb3]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.logoSection,
              {
                opacity: logoAnim,
                transform: [
                  { scale: logoAnim },
                  {
                    translateY: logoAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={colors.gradients.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.logoIcon, shadows.gold]}
            >
              <Ionicons name="swap-horizontal" size={36} color={colors.textInverse} />
            </LinearGradient>

            <Text style={styles.logoText}>SARIF</Text>
            <Text style={styles.logoSubtext}>Forex Bureau Management</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formCard,
              shadows.xl,
              {
                opacity: formAnim,
                transform: [
                  {
                    translateY: formAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.formTitle}>Sign In</Text>

            {phoneLoginOn && (
              <View style={styles.tabs} accessibilityRole="tablist">
                {([
                  ["code", "Code & password"],
                  ["phone", "Phone number"],
                ] as const).map(([m, label]) => (
                  <TouchableOpacity
                    key={m}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m }}
                    onPress={() => setMode(m)}
                    style={[styles.tab, mode === m && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {phoneLoginOn && mode === "phone" ? (
              <PhoneLogin />
            ) : (
            <>
            <Text style={styles.formSubtitle}>
              Enter your credentials to continue
            </Text>

            <Input
              label="Bureau Code"
              placeholder="e.g. AFB-2026-0001"
              value={code}
              onChangeText={setCode}
              icon="business-outline"
            />

            <Input
              label="Phone Number"
              placeholder="e.g. +254711111111"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              icon="call-outline"
            />

            <View style={styles.passwordRow}>
              <View style={styles.flex}>
                <Input
                  label="Password"
                  placeholder="Enter password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  icon="lock-closed-outline"
                />
              </View>

              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <Button
              title={loading ? "Signing in..." : "Sign In"}
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              icon="log-in-outline"
              size="lg"
              style={{ marginTop: spacing.sm }}
            />
            </>
            )}
          </Animated.View>

          <Animated.View style={[styles.footer, { opacity: formAnim }]}>
            <Ionicons
              name="shield-checkmark"
              size={16}
              color={colors.textMuted}
            />
            <Text style={styles.footerText}>
              Secured with end-to-end encryption
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xxl },

  orb: { position: "absolute", borderRadius: 999 },
  orb1: {
    width: 220,
    height: 220,
    top: -50,
    right: -60,
    backgroundColor: "rgba(91, 156, 255, 0.16)",
  },
  orb2: {
    width: 150,
    height: 150,
    top: height * 0.35,
    left: -50,
    backgroundColor: "rgba(57, 217, 176, 0.12)",
  },
  orb3: {
    width: 110,
    height: 110,
    bottom: 100,
    right: -30,
    backgroundColor: "rgba(233, 185, 73, 0.12)",
  },

  logoSection: { alignItems: "center", marginBottom: 36 },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  logoText: {
    fontSize: 36,
    fontWeight: "800",
    fontFamily: fonts.display,
    color: colors.goldLight,
    letterSpacing: 6,
  },
  logoSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    letterSpacing: 1,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  formTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  formSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },

  passwordRow: { flexDirection: "row", alignItems: "flex-end" },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.sm,
    padding: 4,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  tab: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: "#FFFFFF" },
  eyeButton: {
    height: 48,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    marginLeft: -44,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
