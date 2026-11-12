import { Animated, Pressable, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef } from "react";

// ==================== PRESS SCALE (internal motion helper) ====================
// Spring-press micro-interaction. Wraps any tappable element. Pure built-in Animated (no worklets).
export function PressScale({
  children,
  onPress,
  disabled,
  activeScale = 0.96,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  activeScale?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, {
      toValue: v,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) {
          to(activeScale);
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
        }
      }}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style as any]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
// ==================== GRADIENT CARD ====================
export interface GradientCardProps {
  gradient: readonly [string, string, ...string[]];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
}
