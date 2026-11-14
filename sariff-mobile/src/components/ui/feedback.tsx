import { Animated, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { borderRadius, colors } from "../../theme";
import { useEffect, useRef, useState } from "react";
import { styles } from "./styles";

// ==================== COUNT UP (animated number) ====================
// Animates from 0 to `value` and renders via `format`. Final output equals format(value).
export function CountUp({
  value,
  format,
  style,
  duration = 650,
}: {
  value: number;
  format: (n: number) => string;
  style?: TextStyle | TextStyle[];
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value]);
  return (
    <Text
      style={style}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {format(display)}
    </Text>
  );
}
// ==================== SHIMMER / SKELETON ====================
// Premium loading placeholder with a sweeping highlight. Use to build content-shaped
// skeletons instead of spinners (perceived-performance win).
export function Shimmer({
  width = "100%",
  height = 16,
  radius = 12,
  style,
}: {
  width?: any;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const x = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateX = x.interpolate({
    inputRange: [-1, 1],
    outputRange: [-180, 180],
  });
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.glass,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.borderLight,
        },
        style as any,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.10)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, width: 180 }}
        />
      </Animated.View>
    </View>
  );
}
// ==================== LOADING ====================
export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={{ width: "88%", gap: 14 }}>
        <Shimmer height={120} radius={borderRadius.lg} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Shimmer height={90} radius={borderRadius.lg} style={{ flex: 1 }} />
          <Shimmer height={90} radius={borderRadius.lg} style={{ flex: 1 }} />
        </View>
        <Shimmer height={56} radius={borderRadius.md} />
        <Shimmer height={56} radius={borderRadius.md} />
        <Shimmer height={56} radius={borderRadius.md} />
      </View>
      {message ? <Text style={styles.loadingText}>{message}</Text> : null}
    </View>
  );
}
