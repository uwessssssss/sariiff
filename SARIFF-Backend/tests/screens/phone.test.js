// Screen tests for the phone app's "by reading" fixes (M13-M35). See phone-kit.js.
//   node phone.test.js <sariff-mobile/src> <web>                       every test must pass
//   node phone.test.js <old sariff-mobile/src> <web> --expect-fail     every test must fail on the defect
const { suite, app, mount, hook, text, find, tick, proof, server, toasts, world, phone, tappable, field, signedIn } = require("./phone-kit");

const KES = 0, USD = 1, UGX = 2;
const noop = () => {};

suite(async () => {
  signedIn();
  const api = app("services/api");

  await proof("M13", "SMS code: a pasted or autofilled 6-digit code fills all six boxes", (expect) => {
    world.context = { verifyOtp: async () => ({ success: true }), resendOtp: async () => ({ success: true }), pendingLogin: { phone: "+256700000010", whatsAppNumber: "+256700000010" }, isLoading: false };
    try {
      const OtpScreen = app("screens/auth/OtpScreen").default;
      const m = mount(OtpScreen, {});
      const boxes = () => find(m.tree, (e) => typeof e.props.onChangeText === "function");
      boxes()[0].props.onChangeText("483920");
      m.render();
      const shown = boxes().map((b) => b.props.value).join("");
      expect(shown === "483920", `the code 483920 from the SMS became "${shown}"`);
      expect(boxes()[0].props.textContentType === "oneTimeCode" || boxes()[0].props.autoComplete === "sms-otp", "the first box is not marked as the one-time-code field");
    } finally { world.context = undefined; }
  });

  await proof("M14", "Phone sign-in: the super admin is refused and told the dashboard is on the web", async (expect) => {
    server.reply((url) => (url.includes("/api/auth/login") ? { accessToken: "sa-token", refreshToken: "sa-refresh", role: 0, name: "Platform", code: "SA-1" } : undefined));
    const { AuthProvider } = app("hooks/useAuth");
    const m = mount(AuthProvider, { children: null });
    await tick(20); m.render();
    const result = await m.tree.props.value.login({ code: "SA-1", whatsAppNumber: "+254700000001", password: "x" });
    await tick(20); m.render();
    expect(result && result.success === false && /web/i.test(result.message || ""), `sign-in answered: ${JSON.stringify(result)}`);
    expect(m.tree.props.value.isAuthenticated !== true, "the super admin was let into the bureau tabs");
    signedIn();
  });

  await proof("M17", "A server outage page (HTML) is reported in plain words, not as a JSON parse error", async (expect) => {
    server.reply(() => ({ __status: 503, __text: "<html><body>Service Unavailable</body></html>" }));
    let r, thrown = "";
    try { r = await api.getCompanyCurrencies(); } catch (e) { thrown = String(e && e.message); }
    const message = thrown || (r && r.message) || "";
    expect(r && r.success === false && /starting up or unavailable/i.test(message), `the screen would show: "${message}"`);
  });

  await proof("M18", "Exchange daily summaries ask the server with from/to (the names it reads)", async (expect) => {
    await api.getExchangeDailySummaries("2026-11-01", "2026-11-14");
    const url = (server.requests.find((r) => r.url.includes("/daily/summaries")) || {}).url || "";
    expect(/from=2026-11-01/.test(url) && /to=2026-11-14/.test(url), `asked: ${url}`);
  });

  await proof("M16", "A receipt asked for after the one-hour sign-in refreshes the token instead of failing with 401", async (expect) => {
    signedIn();
    server.reply((url, _b, _m, headers) => url.includes("/api/auth/refresh")
      ? { accessToken: "fresh", refreshToken: "r2", role: 1, name: "Amina", code: "KB-OFF-1" }
      : headers.Authorization === "Bearer fresh" ? { receipt: "TXN-1" } : { __status: 401 });
    const r = await api.downloadFile("/api/transaction/t1/receipt");
    expect(r && r.success === true, `download answered: ${JSON.stringify(r)}`);
    signedIn();
  });

  await proof("M21", "Password and email boxes do not capitalise or auto-correct what is typed", (expect) => {
    const { Input } = app("components/ui/controls");
    const box = (props) => find(hook(Input, { label: "x", value: "", onChangeText: noop, ...props }), (e) => typeof e.props.onChangeText === "function")[0];
    const password = box({ secureTextEntry: true }), email = box({ keyboardType: "email-address" }), name = box({});
    expect(password && password.props.autoCapitalize === "none" && password.props.autoCorrect === false, `password box: autoCapitalize=${password && password.props.autoCapitalize}, autoCorrect=${password && password.props.autoCorrect}`);
    expect(email && email.props.autoCapitalize === "none", `email box: autoCapitalize=${email && email.props.autoCapitalize}`);
    expect(name && name.props.autoCapitalize !== "none", "an ordinary box must keep the keyboard's default");
  });
});
