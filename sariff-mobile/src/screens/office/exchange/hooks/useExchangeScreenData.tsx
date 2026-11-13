import { AccountType, currencyCode } from "../../../../types";
import { Animated, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Input } from "../../../../components/ui";
import { Ionicons } from "@expo/vector-icons";
import { borderRadius, colors, fontSize, fontWeight, spacing } from "../../../../theme";
import { styles } from "../helpers";
import { useEffect } from "react";
import * as api from "../../../../services/api";
import { type useExchangeScreenState } from "./useExchangeScreenState";

/** ExchangeScreen: data (part 2 of 2 of useExchangeScreen). */
export function useExchangeScreenData(prev: ReturnType<typeof useExchangeScreenState>) {
  const { anims, base, exchClientId, exchClientName, exchClientSearch, exchClients, floatAccounts, floatCurrency, load, modal, setExchClientId, setExchClientName, setExchClientSearch, setExchClients, setLoading, settleCurrency } = prev;
  // The lookup returns at most 200 clients, so searching only those never found client 201
  // onward: ask the server (name, phone or code), keeping the chosen client in the list.
  useEffect(() => {
    const term = exchClientSearch.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.getClientLookup(term);
        if (r.success && Array.isArray(r.data)) {
          const keep = exchClients.find((c: any) => c.id === exchClientId);
          setExchClients(keep && !r.data.some((c: any) => c.id === keep.id) ? [keep, ...r.data] : r.data);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchClientSearch]);
  // Searchable vertical client picker (mirrors the Transactions account picker — render fn avoids focus loss)
  const renderExchClientPicker = (required: boolean) => {
    const q = exchClientSearch.trim().toLowerCase();
    const matches = q
      ? exchClients.filter((c: any) =>
          [c.fullName, c.code, c.whatsAppNumber].some((v) => (v || "").toLowerCase().includes(q)),
        )
      : exchClients;
    const selected = exchClients.find((c: any) => c.id === exchClientId);
    return (
      <View style={{ marginBottom: spacing.sm }}>
        {selected ? (
          <View
            style={[
              styles.chipActive,
              {
                flexDirection: "row",
                alignItems: "center",
                padding: spacing.md,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.bold,
                  color: colors.primary,
                }}
              >
                {selected.fullName}
              </Text>
              {selected.code ? (
                <Text style={{ fontSize: fontSize.xs, color: colors.primary }}>
                  {selected.code}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear"
              onPress={() => {
                setExchClientId(undefined);
                if (required) setExchClientName("");
                setExchClientSearch("");
              }}
            >
              <Ionicons name="close-circle" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {!required && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  !exchClientId && styles.chipActive,
                  {
                    alignSelf: "flex-start",
                    paddingHorizontal: 16,
                    marginBottom: spacing.sm,
                  },
                ]}
                onPress={() => setExchClientId(undefined)}
              >
                <Text
                  style={[
                    styles.chipText,
                    !exchClientId && styles.chipTextActive,
                  ]}
                >
                  Walk-in
                </Text>
              </TouchableOpacity>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surfaceAlt,
                borderRadius: borderRadius.md,
                paddingHorizontal: spacing.md,
                height: 42,
                marginBottom: spacing.xs,
              }}
            >
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={{
                  flex: 1,
                  marginLeft: spacing.sm,
                  fontSize: fontSize.sm,
                  color: colors.text,
                  paddingVertical: 0,
                }}
                placeholder="Search client by name..."
                placeholderTextColor={colors.textTertiary}
                value={exchClientSearch}
                onChangeText={setExchClientSearch}
                autoCorrect={false}
              />
              {exchClientSearch ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setExchClientSearch("")}>
                  <Ionicons
                    name="close"
                    size={16}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <View
              style={{
                maxHeight: 200,
                borderWidth: matches.length > 0 ? 1 : 0,
                borderColor: colors.borderLight,
                borderRadius: borderRadius.md,
                overflow: "hidden",
              }}
            >
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {matches.map((c: any) => (
                  <TouchableOpacity
                    key={c.id}
                    style={{
                      padding: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.borderLight,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onPress={() => {
                      setExchClientId(c.id);
                      setExchClientName(c.fullName);
                      setExchClientSearch("");
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.text,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {c.fullName}
                    </Text>
                    {c.code ? (
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          color: colors.textTertiary,
                          marginLeft: spacing.sm,
                        }}
                      >
                        {c.code}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {matches.length === 0 && (
                  <Text
                    style={{
                      padding: spacing.md,
                      color: colors.textTertiary,
                      fontSize: fontSize.sm,
                    }}
                  >
                    No matching clients
                  </Text>
                )}
              </ScrollView>
            </View>
            {!required && !exchClientId && (
              <Input
                label=""
                value={exchClientName}
                onChangeText={setExchClientName}
                icon="person-outline"
                placeholder="Walk-in client name"
              />
            )}
          </>
        )}
      </View>
    );
  };
  const getFloatAccountList = (type: number) => {
    // settleProfit -> settle currency; withdraw -> float currency (money goes INTO that-currency account);
    // fund -> always the home currency: foreign float is bought with it at the purchase rate.
    const cur =
      modal === "settleProfit"
        ? settleCurrency
        : modal === "fundFloat"
          ? base // the bureau's home currency (was hard-coded to KES: a Ugandan bureau saw no accounts)
          : floatCurrency;
    switch (type) {
      case AccountType.Cash:
        return floatAccounts.cash
          .filter((a: any) => a.currency === cur) // Filter by selected currency
          .map((a: any) => ({
            id: a.id,
            name: `Cash ${currencyCode(a.currency)}`,
          }));
      case AccountType.Bank:
        return floatAccounts.bank
          .filter((a: any) => a.currency === cur)
          .map((a: any) => ({ id: a.id, name: a.bankName }));
      case AccountType.Mpesa:
        // Each wallet holds its network's currency (M-Pesa = KES even in Uganda)
        return floatAccounts.mpesa
          .filter((a: any) => (a.currency ?? base) === cur)
          .map((a: any) => ({
            id: a.id,
            name: a.agentName,
          }));
      default:
        return [];
    }
  };
  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
      anims.forEach((a, i) =>
        Animated.spring(a, {
          toValue: 1,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
          delay: i * 70,
        }).start(),
      );
    })();
  }, []);

  return {
    renderExchClientPicker,
    getFloatAccountList,
  };
}
