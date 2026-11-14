// Screen tests for the PHONE app (sariff-mobile/src), in Node, on the same kit as the web screens.
//
//   node phone.test.js <sariff-mobile/src> <web dir that has node_modules>
//
// React Native, Expo and navigation are replaced by small stand-ins: a <View>/<Text>/<TextInput> is
// just a named element the kit can read and press (onPress, onChangeText); a FlatList draws its rows;
// Toast, Alert, the secure store, file downloads and printing are recorded so a test can see them.
// The screens, hooks and API client themselves are the app's own files, unchanged.
const Module = require("module");
const nodeCrypto = require("crypto");
global.__DEV__ = true;
const kit = require("./kit");
const { React, toasts } = kit;

const phone = {
  alerts: [],        // Alert.alert(title, message, buttons)
  secure: {},        // expo-secure-store contents
  storage: {},       // AsyncStorage contents
  calls: [],         // [module, function, args] for expo-* calls (printing, sharing, downloads)
  answers: {},       // "expo-print.printToFileAsync": (args...) => value   to choose a reply
  navigation: { navigated: [], route: { params: {} } },
  reset() { phone.alerts.length = 0; phone.calls.length = 0; phone.navigation.navigated.length = 0; },
};

const host = (name) => name;                                     // <View> is the element "View"
const named = (extra = {}) => new Proxy(extra, { get: (t, k) => (k in t ? t[k] : typeof k === "symbol" ? undefined : k === "__esModule" ? true : k === "default" ? named(extra) : host(String(k))) });
const el = React.createElement;
const part = (x) => (x == null ? null : typeof x === "function" ? el(x) : x);
const animation = { start: (done) => done && done({ finished: true }), stop() {}, reset() {} };
class AnimatedValue { constructor(v) { this._value = v; } setValue(v) { this._value = v; } interpolate() { return this; } addListener() { return "l"; } removeListener() {} removeAllListeners() {} stopAnimation() {} }

const reactNative = named({
  StyleSheet: { create: (s) => s, flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : s || {}), absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, compose: (a, b) => [a, b] },
  Platform: { OS: "android", Version: 34, select: (o) => (o.android !== undefined ? o.android : o.default) },
  Dimensions: { get: () => ({ width: 390, height: 800, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 390, height: 800, scale: 2, fontScale: 1 }),
  useColorScheme: () => "light",
  PixelRatio: { get: () => 2, roundToNearestPixel: (n) => n, getFontScale: () => 1 },
  Alert: { alert: (title, message, buttons) => { phone.alerts.push({ title, message, buttons: buttons || [] }); } },
  Keyboard: { dismiss() {}, addListener: () => ({ remove() {} }) },
  Linking: { openURL: async (u) => { phone.calls.push(["Linking", "openURL", [u]]); }, canOpenURL: async () => true },
  Share: { share: async (o) => { phone.calls.push(["Share", "share", [o]]); return { action: "sharedAction" }; } },
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  InteractionManager: { runAfterInteractions: (f) => { if (f) f(); return { cancel() {} }; } },
  LayoutAnimation: { configureNext() {}, Presets: {}, Types: {}, Properties: {} },
  UIManager: {}, NativeModules: {}, I18nManager: { isRTL: false }, Vibration: { vibrate() {} },
  Easing: new Proxy({}, { get: () => () => (t) => t }),
  Animated: named({ Value: AnimatedValue, ValueXY: AnimatedValue, timing: () => animation, spring: () => animation, decay: () => animation, delay: () => animation,
    parallel: () => animation, sequence: () => animation, stagger: () => animation, loop: () => animation, event: () => () => {}, createAnimatedComponent: (c) => c, add: (a) => a, multiply: (a) => a }),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }) =>
    el("FlatList", null, part(ListHeaderComponent), data && data.length ? data.map((item, index) => el(React.Fragment, { key: index }, renderItem({ item, index }))) : part(ListEmptyComponent), part(ListFooterComponent)),
  SectionList: ({ sections, renderItem, renderSectionHeader, ListHeaderComponent, ListEmptyComponent }) =>
    el("SectionList", null, part(ListHeaderComponent), sections && sections.length
      ? sections.map((section, s) => el(React.Fragment, { key: s }, renderSectionHeader ? renderSectionHeader({ section }) : null, section.data.map((item, index) => el(React.Fragment, { key: index }, renderItem({ item, index, section })))))
      : part(ListEmptyComponent)),
  Modal: ({ visible, children }) => (visible === false ? null : el("Modal", null, children)),
});

const asyncModule = (name, extra = {}) => new Proxy(extra, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === "__esModule") return true;
    if (typeof k === "symbol") return undefined;
    if (k === "default") return asyncModule(name, extra);
    const key = String(k);
    if (/^[A-Z]/.test(key)) return new Proxy({}, { get: (_e, v) => String(v) });   // an enum such as ImpactFeedbackStyle.Light
    return async (...args) => { phone.calls.push([name, key, args]); const a = phone.answers[`${name}.${key}`]; return a ? a(...args) : {}; };
  },
});
const navigation = { navigate: (...a) => phone.navigation.navigated.push(a), goBack() {}, setOptions() {}, addListener: () => () => {}, reset() {}, replace: (...a) => phone.navigation.navigated.push(a), dispatch() {}, canGoBack: () => true, isFocused: () => true, getParent: () => navigation, setParams() {} };
const stubs = {
  "react-native": reactNative,
  "@expo/vector-icons": named(),
  "react-native-safe-area-context": named({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 800 }) }),
  "react-native-toast-message": { __esModule: true, default: Object.assign(() => null, { show: (o) => toasts.push([o.type || "info", `${o.text1 || ""} ${o.text2 || ""}`.trim()]), hide() {} }) },
  "expo-linear-gradient": named(), "expo-blur": named(), "expo-status-bar": named(), "react-native-gesture-handler": named(),
  "expo-secure-store": { getItemAsync: async (k) => (k in phone.secure ? phone.secure[k] : null), setItemAsync: async (k, v) => { phone.secure[k] = String(v); }, deleteItemAsync: async (k) => { delete phone.secure[k]; } },
  "@react-native-async-storage/async-storage": { __esModule: true, default: { getItem: async (k) => (k in phone.storage ? phone.storage[k] : null), setItem: async (k, v) => { phone.storage[k] = String(v); },
    removeItem: async (k) => { delete phone.storage[k]; }, multiRemove: async (ks) => ks.forEach((k) => delete phone.storage[k]), clear: async () => { for (const k in phone.storage) delete phone.storage[k]; }, getAllKeys: async () => Object.keys(phone.storage) } },
  "@react-navigation/native": named({ useNavigation: () => navigation, useRoute: () => phone.navigation.route, useIsFocused: () => true, useFocusEffect: (cb) => React.useEffect(() => cb(), [cb]),
    DefaultTheme: { colors: {} }, DarkTheme: { colors: {} }, CommonActions: { reset: (x) => x, navigate: (x) => x }, useTheme: () => ({ colors: {} }) }),
  "@react-navigation/native-stack": { createNativeStackNavigator: () => ({ Navigator: "Navigator", Screen: "Screen", Group: "Group" }) },
  "@react-navigation/bottom-tabs": { createBottomTabNavigator: () => ({ Navigator: "Navigator", Screen: "Screen" }), useBottomTabBarHeight: () => 0 },
  "expo-crypto": { getRandomBytes: (n) => new Uint8Array(nodeCrypto.randomBytes(n)), getRandomBytesAsync: async (n) => new Uint8Array(nodeCrypto.randomBytes(n)), randomUUID: () => nodeCrypto.randomUUID(),
    getRandomValues: (a) => nodeCrypto.randomFillSync(a), digestStringAsync: async (_alg, s) => nodeCrypto.createHash("sha256").update(s).digest("hex"), CryptoDigestAlgorithm: { SHA256: "SHA-256" } },
  "expo-constants": { __esModule: true, default: { expoConfig: { extra: { apiBaseUrl: "http://phone.test" }, version: "1.0.0" } } },
  "expo-font": { useFonts: () => [true, null], loadAsync: async () => {} },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request in stubs) return stubs[request];
  if (/^@expo-google-fonts\//.test(request)) return named({ useFonts: () => [true, null] });
  if (/^expo-/.test(request)) return (stubs[request] = asyncModule(request.replace(/\/.*$/, "")));
  return load.call(this, request, parent, isMain);
};

/** Something pressable (onPress) whose words match. */
const tappable = (tree, words) => kit.find(tree, (e) => typeof e.props.onPress === "function" && words.test(kit.text(e)))[0];
/** A text box by its placeholder or label. */
const field = (tree, words) => kit.find(tree, (e) => typeof e.props.onChangeText === "function" && words.test(`${e.props.placeholder || ""} ${e.props.label || ""}`))[0];
/** Sign the phone in (the secure store holds the token, as after a real sign-in). */
function signedIn(user = { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1 }) {
  phone.secure.sariff_token = "t"; phone.secure.sariff_refresh = "r"; phone.secure.sariff_user = JSON.stringify(user);
}

module.exports = { ...kit, phone, tappable, field, signedIn };
