import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

// Bespoke dark-glass toasts with a colored accent bar + icon.
// Wired in App.tsx: <Toast config={toastConfig} ... />
function ToastCard({ accent, bg, icon, text1, text2 }: { accent: string; bg: string; icon: keyof typeof Ionicons.glyphMap; text1?: string; text2?: string }) {
  return (
    <View style={s.wrap}>
      <View style={[s.bar, { backgroundColor: accent }]} />
      <View style={[s.iconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={s.textWrap}>
        {!!text1 && <Text style={s.t1} numberOfLines={1}>{text1}</Text>}
        {!!text2 && <Text style={s.t2} numberOfLines={2}>{text2}</Text>}
      </View>
    </View>
  );
}

export const toastConfig = {
  success: ({ text1, text2 }: any) => (
    <ToastCard accent={colors.success} bg={colors.successLight} icon="checkmark-circle" text1={text1} text2={text2} />
  ),
  error: ({ text1, text2 }: any) => (
    <ToastCard accent={colors.danger} bg={colors.dangerLight} icon="alert-circle" text1={text1} text2={text2} />
  ),
  info: ({ text1, text2 }: any) => (
    <ToastCard accent={colors.info} bg={colors.infoLight} icon="information-circle" text1={text1} text2={text2} />
  ),
};

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '92%',
    backgroundColor: 'rgba(17,20,31,0.96)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 13,
    paddingRight: 16,
    paddingLeft: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  textWrap: { flex: 1 },
  t1: { fontSize: 14.5, fontWeight: '700', fontFamily: fonts.display, color: colors.text },
  t2: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
});
