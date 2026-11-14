import { ActivityIndicator, Animated, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { EmptyState, Shimmer } from "../../../components/ui";
import { Ionicons } from "@expo/vector-icons";
import { borderRadius, colors, spacing } from "../../../theme";
import { styles } from "./helpers";
import { useStatementsScreen } from "./useStatementsScreen";
import { ReceiptSheet } from "./sections/ReceiptSheet";

export default function StatementsScreen() {
  const vm = useStatementsScreen();
  const { SummaryHeader, currencyFilter, currencyFilters, handleDownloadPdf, handleExportCsv, headerAnim, insets, loading, loadingMore, onLoadMore, onRefresh, refreshing, renderTransaction, setCurrencyFilter, setTypeFilter, transactions, typeFilter, typeFilters } = vm;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View>
          <Text style={styles.title}>Statements</Text>
          <Text style={styles.subtitle}>Your transaction history</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Statement"
            onPress={handleDownloadPdf}
            style={styles.dlBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="document-outline"
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Download"
            onPress={handleExportCsv}
            style={styles.dlBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="download-outline"
              size={18}
              color={colors.success}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Currency Filters */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {currencyFilters.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                currencyFilter === f.key && styles.filterPillActive,
              ]}
              onPress={() => setCurrencyFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  currencyFilter === f.key && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterSpacer} />
          {typeFilters.map((f) => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show ${f.key === "all" ? "all transactions" : f.key === "credit" ? "money in" : "money out"}`}               key={f.key}
              style={[
                styles.typeBtn,
                typeFilter === f.key && styles.typeBtnActive,
              ]}
              onPress={() => setTypeFilter(f.key)}
            >
              <Ionicons
                name={f.icon}
                size={14}
                color={typeFilter === f.key ? "#FFF" : colors.textTertiary}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Shimmer
              key={i}
              height={72}
              radius={borderRadius.md}
              style={{ marginBottom: spacing.sm }}
            />
          ))}
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          ListHeaderComponent={SummaryHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="No transactions"
              subtitle="Your transaction history will appear here"
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={{ padding: 20 }}
                color={colors.primary}
              />
            ) : (
              <View style={{ height: 100 }} />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Transaction Detail Modal */}
      <ReceiptSheet vm={vm} />
    </View>
  );
}
