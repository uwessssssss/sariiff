import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
} from "../../theme";

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const { verifyOtp, resendOtp, pendingLogin } = useAuth();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const boxAnims = useRef(
    Array(OTP_LENGTH)
      .fill(null)
      .map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 50,
      friction: 9,
      useNativeDriver: true,
    }).start();

    boxAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
        delay: i * 80,
      }).start();
    });

    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    const digits = text.replace(/\D/g, "");
    // A pasted or SMS-autofilled code arrives whole in one box: spread it over the boxes
    // (each box took only its first digit, so the code from the SMS never fitted).
    if (digits.length > 1) {
      const newOtp = [...otp];
      digits.slice(0, OTP_LENGTH - index).split("").forEach((d, k) => { newOtp[index + k] = d; });
      setOtp(newOtp);
      const next = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[next]?.focus();
      setFocusedIndex(next);
      return;
    }
    const value = digits.slice(0, 1);

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);

      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleVerify = async () => {
    if (loading) return;

    const otpCode = otp.join("");

    if (otpCode.length !== OTP_LENGTH) {
      Toast.show({
        type: "error",
        text1: "Incomplete code",
        text2: "Enter all 6 digits",
      });
      return;
    }

    setLoading(true);

    try {
      const result = await verifyOtp(otpCode);

      if (!result.success) {
        shake();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        Toast.show({
          type: "error",
          text1: "Code not accepted",
          text2: result.message,
        });

        setOtp(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
        setFocusedIndex(0);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      shake();
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending || loading) return;
    setResending(true);
    try {
      const result = await resendOtp();
      if (result.success) {
        setOtp(Array(OTP_LENGTH).fill(""));
        setCountdown(60);
        inputRefs.current[0]?.focus();
        setFocusedIndex(0);
        Toast.show({
          type: "success",
          text1: "New code sent",
          text2: "Earlier codes no longer work.",
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Couldn't send a new code",
          text2: result.message,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Couldn't send a new code",
        text2: err?.message || "Check your connection and try again.",
      });
    } finally {
      setResending(false);
    }
  };

  const maskedPhone = pendingLogin?.phoneNumber
    ? pendingLogin.phoneNumber.replace(/(.{3})(.*)(.{2})/, "$1****$3")
    : "****";

  return (
    <LinearGradient
      colors={["#0A0C12", "#11141F", "#0A0C12"]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 60,
              paddingBottom: insets.bottom + 40,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.header,
              {
                opacity: slideAnim,
                transform: [
                  {
                    translateY: slideAnim.interpolate({
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
              style={styles.iconWrap}
            >
              <Ionicons name="shield-checkmark" size={32} color="#FFF" />
            </LinearGradient>

            <Text style={styles.title}>Verify OTP</Text>

            <Text style={styles.subtitle}>
              We sent a 6-digit code to{"\n"}
              <Text style={styles.phoneText}>{maskedPhone}</Text>
            </Text>
          </Animated.View>

          <Animated.View
            style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}
          >
            {otp.map((digit, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.otpBox,
                  focusedIndex === i && styles.otpBoxFocused,
                  digit && styles.otpBoxFilled,
                  {
                    opacity: boxAnims[i],
                    transform: [
                      {
                        scale: boxAnims[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[i] = ref;
                  }}
                  style={styles.otpInput}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? OTP_LENGTH : 1}
                  textContentType={i === 0 ? "oneTimeCode" : "none"}
                  autoComplete={i === 0 ? "sms-otp" : "off"}
                  value={digit}
                  onChangeText={(text) => handleChange(text, i)}
                  onKeyPress={({ nativeEvent }) =>
                    handleKeyPress(nativeEvent.key, i)
                  }
                  onFocus={() => setFocusedIndex(i)}
                  selectTextOnFocus
                />
              </Animated.View>
            ))}
          </Animated.View>

          <Button
            title={loading ? "Verifying..." : "Verify Code"}
            onPress={handleVerify}
            loading={loading}
            disabled={loading || otp.some((d) => !d)}
            icon="checkmark-circle-outline"
            size="lg"
            style={{ marginTop: spacing.xxxl, marginHorizontal: spacing.xxl }}
          />

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive the code? </Text>
            {countdown > 0 ? (
              <Text style={styles.countdownText}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={resending || loading}>
                <Text style={styles.resendLink}>
                  {resending ? "Sending..." : "Resend"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl },

  header: { alignItems: "center", marginBottom: 40 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    color: "#FFF",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  phoneText: {
    color: colors.primaryLight,
    fontWeight: fontWeight.bold,
  },

  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFocused: {
    borderColor: colors.primary,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
  },
  otpBoxFilled: {
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    borderColor: colors.primaryLight,
  },
  otpInput: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFF",
    textAlign: "center",
    width: "100%",
    height: "100%",
  },

  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xxl,
  },
  resendText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  countdownText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  resendLink: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    fontWeight: fontWeight.bold,
  },
});
