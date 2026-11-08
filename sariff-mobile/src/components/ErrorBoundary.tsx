import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type State = { error: Error | null; attempt: number };

/**
 * Last line of defence: if any screen throws while rendering (an unexpected
 * API shape, a null where an object was expected), show a recoverable screen
 * instead of a blank app. "Try again" remounts the tree, which reloads data.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SARIFF] Screen crashed:', error?.message, info?.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  reset = () => this.setState((s: State) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This screen hit an unexpected problem. Your data is safe; nothing was saved or changed.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} accessibilityRole="button">
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  btn: { backgroundColor: colors.primaryDark, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: borderRadius.md },
  btnText: { color: '#FFF', fontSize: fontSize.md, fontWeight: '700' },
});
