// One test per screen defect of the line audit that was first fixed "by reading".
// Each draws the real screen with data that shows the defect, and reads or presses what a user would.
//   node screens.test.js <web>                  every test must pass
//   node screens.test.js <old web> <web> --expect-fail
//                                               on the screens as they were before the fixes every
//                                               test must fail on the defect itself (the proof)
const { app, mount, text, find, tag, pressable, tick, vm, proof, finish, server, clipboard, toasts } = require("./kit");

const KES = 0, USD = 1, UGX = 2, EUR = 3;
const iso = "2026-11-10T09:30:00Z";
const noop = () => {};
const options = (tree, has) => {
  const select = find(tree, (e) => tag(e) === "select").filter((s) => has.test(text(s)))[0];
  return select ? find(select, (e) => tag(e) === "option") : [];
};
const count = (s, re) => (s.match(re) || []).length;

(async () => {
  // The signed-in bureau is Ugandan (home currency UGX) unless a test says otherwise.
  server.reply((url) => (url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
  await app("lib/useBaseCurrency").loadBaseCurrency();

  // ------------------------------------------------------------------ client portal
  await proof("W38", "Portal: the button that downloads a PDF says Download, not Print", (expect) => {
    const { DashboardView } = app("components/client-portal/sections/DashboardView");
    const t = text(DashboardView({ vm: vm({ activeView: "dashboard", firstName: "Amina", profile: { code: "AFB-CL-1" }, alerts: [], balanceRows: [], monthRows: [], recentTransactions: [], sectionHead: "", th: "" }) }));
    expect(/Download statement/.test(t), `no "Download statement": ${t.slice(0, 200)}`);
    expect(!/Print statement/.test(t), `still says "Print statement"`);
  });

  await proof("W39", "Portal: a refused clipboard shows an error, not 'copied'", async (expect) => {
    const { TransactionDetailModal } = app("components/client-portal/sections/TransactionDetailModal");
    const txn = { id: "1", type: "Credit", currency: UGX, date: iso, description: "Deposit", amount: 1000, code: "TXN-1", reference: "REF-9", balanceBefore: 0, balanceAfter: 1000 };
    const tree = TransactionDetailModal({ vm: vm({ selectedTransaction: txn }) });
    const copy = find(tree, (e) => e.props["aria-label"] === "Copy reference")[0];
    expect(!!copy, "no Copy reference button");
    clipboard.ok = false;
    if (copy) copy.props.onClick();
    await tick(20);
    expect(!toasts.some(([k]) => k === "success"), `said: ${JSON.stringify(toasts)}`);
    expect(toasts.some(([k]) => k === "error"), `no error shown: ${JSON.stringify(toasts)}`);
  });

  await proof("W40", "Portal analytics: negative growth is red, not green", (expect) => {
    const { AnalyticsView } = app("components/client-portal/sections/AnalyticsView");
    const tree = AnalyticsView({ vm: vm({ activeView: "analytics", statementCurrencies: [], loadingAnalytics: false, analyticsCode: "UGX", analyticsCur: UGX, avgIn: () => 0, netIncomeIn: () => 0, categoryChartData: [], monthlyChartData: [], weeklyChartData: [],
      analytics: { totals: { growthPercentage: -12.5, totalTransactions: 4 } } }) });
    const growth = find(tree, (e) => tag(e) === "span" && /-12\.5\s*%/.test(text(e)))[0];
    expect(!!growth, "growth figure not found");
    if (growth) expect(/text-red/.test(growth.props.className) && !/text-emerald/.test(growth.props.className), `classes: ${growth.props.className}`);
  });

  // ------------------------------------------------------------------ delete warnings
  await proof("W41", "Bank delete: says what the server does (no 'all associated data' wipe)", (expect) => {
    const { DeleteAccountPanel } = app("components/office/banks/sections/DeleteAccountPanel");
    const t = text(DeleteAccountPanel({ vm: vm({ showDeleteAccount: true, getCurrencySymbol: () => "KES ", accountToDelete: { accountName: "Main", bankName: "KCB", code: "BNK-1", currency: KES, balance: 0 } }) }));
    expect(/no transactions can be deleted/i.test(t), `rule missing: ${t.slice(0, 300)}`);
    expect(!/all associated data/i.test(t), "still promises to remove all associated data");
  });

  await proof("W42", "Mobile money agent delete: same", (expect) => {
    const { DeleteAgentPanel } = app("components/office/mpesa/sections/DeleteAgentPanel");
    const t = text(DeleteAgentPanel({ vm: vm({ showDeleteAgent: true, selectedAgent: { agentName: "Kampala Rd", code: "MP-1", phoneNumber: "+256700000002", currency: UGX, balance: 0 } }) }));
    expect(/no transactions can be deleted/i.test(t), `rule missing: ${t.slice(0, 300)}`);
    expect(!/all associated data/i.test(t), "still promises to remove all associated data");
  });

  await proof("W43", "Client delete: real rules, and the client's own currencies (UGX, no empty KES box)", (expect) => {
    const { DeleteConfirmPanel } = app("components/office/clients/sections/DeleteConfirmPanel");
    const client = { id: "c1", fullName: "Amina Hassan", code: "AFB-CL-1", clientType: 0, whatsAppNumber: "+256700000003", email: "",
      balanceKES: 0, balanceUSD: 0, netMovementKES: 0, netMovementUSD: 0, openingBalanceKES: 0, openingBalanceUSD: 0, totalCreditKES: 0, totalDebitKES: 0, totalCreditUSD: 0, totalDebitUSD: 0,
      otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 0, totalIn: 5000, totalOut: 5000 }] };
    const t = text(DeleteConfirmPanel({ vm: vm({ showDeleteConfirm: true, selectedClient: client, homeCurrency: UGX, isSubmitting: false }) }));
    expect(/UGX balance/.test(t), `the client's UGX is not listed: ${t.slice(0, 300)}`);
    expect(!/KES balance/.test(t), "shows a KES box for a client who never held KES");
    expect(/can no longer sign in/i.test(t) && /last 30 days/i.test(t), "does not state the real rules");
    expect(!/Transaction history/i.test(t), "still says the transaction history is removed");
  });

  await proof("W63", "Expense category delete: says a category with expenses is refused", (expect) => {
    const { DeleteModal } = app("components/office/settings/sections/DeleteModal");
    const t = text(DeleteModal({ vm: vm({ showDeleteModal: true, deletingCategoryId: null, categoryToDelete: { id: "c", name: "Fuel", description: "" } }) }));
    expect(/no expenses can be deleted/i.test(t), `rule missing: ${t.slice(0, 300)}`);
    expect(!/remove it permanently/i.test(t), "still promises a permanent removal");
  });

  // ------------------------------------------------------------------ mobile money
  await proof("W44", "Mobile money: net movement card says it includes the opening balance", (expect) => {
    const { TotalAgentsCardSection } = app("components/office/mpesa/sections/TotalAgentsCardSection");
    const t = text(TotalAgentsCardSection({ vm: vm({ allAgents: [], baseCode: "UGX", stats: { totalAgents: 1, totalDebit: 700, totalCredit: 200, netMovement: 1500 } }) }));
    expect(/Opening \+ money in/.test(t), `label: ${t.slice(-160)}`);
    expect(!/Debit - Credit/.test(t), 'still labelled "Debit - Credit" (1,500 is opening 1,000 + 700 − 200)');
  });

  await proof("W45", "Edit agent (Kenyan bureau): only networks it can hold, each with its currency; opening balance has a currency", (expect) => {
    const { EditAgentPanel } = app("components/office/mpesa/sections/EditAgentPanel");
    const tree = EditAgentPanel({ vm: vm({ showEditAgent: true, base: KES, isSubmitting: false,
      networks: [{ value: 0, label: "M-Pesa" }, { value: 2, label: "Airtel Money" }],
      selectedAgent: { id: "a", code: "MP-1", isActive: true, currency: KES, provider: 0, openingBalance: 1000, balance: 2500, phoneNumber: "+254700000004", agentNumber: "AGT-1", createdAt: iso },
      editFormData: { agentName: "CBD", storeNumber: "", isActive: true, provider: 0, agentType: 0 } }) });
    const nets = options(tree, /M-Pesa/).map(text);
    expect(nets.length === 2, `networks offered: ${JSON.stringify(nets)} (MTN MoMo holds UGX, which a Kenyan bureau cannot)`);
    expect(nets.every((n) => /\((KES|UGX)\)/.test(n)), `no wallet currency: ${JSON.stringify(nets)}`);
    expect(/Opening Balance\s+KES\s+1,000/.test(text(tree)), "opening balance has no currency");
  });

  // ------------------------------------------------------------------ expenses
  const expenseVm = (formData, capture) => vm({ showAddExpense: true, allCategories: [], availableAccounts: [], base: UGX, currencyOk: () => true, isSubmitting: false,
    hasCashAccounts: true, hasBankAccounts: true, hasMpesaAccounts: true,
    mpesaAgents: [{ id: "m1", isActive: true, currency: KES }, { id: "m2", isActive: true, currency: UGX }],
    formData: { categoryId: "", description: "", amount: 0, vendor: "", paymentAccountId: "", expenseDate: "2026-11-14", reference: "", ...formData },
    setFormData: capture });

  await proof("W46a", "Record expense: switching to UGX keeps Mobile money when an MTN (UGX) wallet exists", (expect) => {
    const { AddExpenseModal } = app("components/office/expenses/sections/AddExpenseModal");
    let next;
    const tree = AddExpenseModal({ vm: expenseVm({ currency: KES, paymentAccountType: 2 }, (f) => { next = f; }) });
    const currency = find(tree, (e) => tag(e) === "select" && e.props.value === KES)[0];
    expect(!!currency, "currency box not found");
    if (currency) currency.props.onChange({ target: { value: String(UGX) } });
    expect(next && next.currency === UGX && next.paymentAccountType === 2, `after choosing UGX: ${JSON.stringify(next && { currency: next.currency, paymentAccountType: next.paymentAccountType })}`);
  });

  await proof("W46b", "Record expense: choosing Mobile money does not change the currency typed", (expect) => {
    const { AddExpenseModal } = app("components/office/expenses/sections/AddExpenseModal");
    let next;
    const tree = AddExpenseModal({ vm: expenseVm({ currency: KES, paymentAccountType: 0 }, (f) => { next = f; }) });
    const mobile = pressable(tree, /^Mobile money$/);
    expect(!!mobile, "Mobile money button not found");
    if (mobile) mobile.props.onClick();
    expect(next && next.paymentAccountType === 2 && next.currency === KES, `a KES expense paid from M-Pesa became: ${JSON.stringify(next && { currency: next.currency, paymentAccountType: next.paymentAccountType })}`);
  });

  await proof("W46c", "Expense delete: says a reversal is posted, not a permanent delete", (expect) => {
    const { DeleteModal } = app("components/office/expenses/sections/DeleteModal");
    const t = text(DeleteModal({ vm: vm({ showDeleteModal: true, isDeleting: false, expenseToDelete: { description: "Fuel", reference: "EXP-1", currency: "UGX", amount: 5000 } }) }));
    expect(/reversal entry is posted/i.test(t), `wording: ${t.slice(0, 300)}`);
    expect(!/permanently deleted/i.test(t), "still says permanently deleted");
  });

  // ------------------------------------------------------------------ exchange
  const rates = { [USD]: { buyRate: 3700, sellRate: 3750 }, [EUR]: { buyRate: 4000, sellRate: 4100 } };

  await proof("W47", "Quick calculator: the amount label names the currency (not the text '{baseCode} amount')", (expect) => {
    const { CalculatorModal } = app("components/office/exchange/parts/CalculatorModal");
    const m = mount(CalculatorModal, { rates, onClose: noop });
    const sell = pressable(m.tree, /^UGX\s*→\s*USD$/);
    expect(!!sell, "UGX → USD button not found");
    if (sell) sell.props.onClick();
    const t = text(m.render());
    expect(/UGX amount/.test(t), `label: ${t.slice(0, 200)}`);
    expect(!/\{baseCode\}/.test(t), 'shows the literal "{baseCode} amount"');
  });

  await proof("W48a", "Quick calculator: a purchase shows no profit (none is booked)", (expect) => {
    const { CalculatorModal } = app("components/office/exchange/parts/CalculatorModal");
    const m = mount(CalculatorModal, { rates, onClose: noop });
    const amount = find(m.tree, (e) => tag(e) === "input")[0];
    amount.props.onChange({ target: { value: "100" } });
    const t = text(m.render());
    expect(/None on a purchase/.test(t), `profit line: ${t.slice(-120)}`);
  });

  await proof("W48b", "Quick calculator: a sale shows the server's profit (average cost), not spread x amount", async (expect) => {
    const { CalculatorModal } = app("components/office/exchange/parts/CalculatorModal");
    server.reply((url) => (url.includes("/api/exchange/calculate") ? { inputAmount: 375000, outputAmount: 100, rate: 3750, estimatedProfit: 12345 } : undefined));
    const m = mount(CalculatorModal, { rates, onClose: noop });
    find(m.tree, (e) => tag(e) === "input")[0].props.onChange({ target: { value: "375000" } });
    pressable(m.render(), /^UGX\s*→\s*USD$/).props.onClick();
    m.render();
    await tick(500);
    const t = text(m.render());
    expect(server.requests.some((r) => r.url.includes("/api/exchange/calculate") && r.body && r.body.amount === 375000), "the server was not asked");
    expect(/UGX\s+12,345/.test(t), `profit shown: ${t.slice(-120)} (spread x amount would be UGX 5,000)`);
  });

  await proof("W49", "Set rate: choosing EUR loads the EUR rate; saving sends EUR figures, not the USD ones", (expect) => {
    const { SetRateModal } = app("components/office/exchange/parts/SetRateModal");
    let saved;
    const m = mount(SetRateModal, { rates, currentRate: rates[USD], onClose: noop, loading: false, onSubmit: (...a) => { saved = a; } });
    const eur = pressable(m.tree, /^EUR$/);
    expect(!!eur, "EUR button not found");
    if (eur) eur.props.onClick();
    const boxes = find(m.render(), (e) => tag(e) === "input").map((e) => String(e.props.value));
    expect(boxes.includes("4000") && boxes.includes("4100"), `after choosing EUR the boxes hold ${JSON.stringify(boxes)} (USD is 3700 / 3750)`);
    const save = pressable(m.tree, /^Set Rate$/);
    if (save) save.props.onClick();
    expect(saved && saved[0] === 4000 && saved[1] === 4100 && saved[2] === EUR, `saved: ${JSON.stringify(saved)}`);
  });

  await proof("W49b", "Set rate: a currency with no rate yet starts empty (not 130/140, not the USD rate)", (expect) => {
    const { SetRateModal } = app("components/office/exchange/parts/SetRateModal");
    const m = mount(SetRateModal, { rates: { [USD]: rates[USD] }, currentRate: rates[USD], onClose: noop, loading: false, onSubmit: noop });
    pressable(m.tree, /^EUR$/).props.onClick();
    const boxes = find(m.render(), (e) => tag(e) === "input").map((e) => String(e.props.value));
    expect(boxes.every((v) => v === ""), `boxes hold ${JSON.stringify(boxes)}`);
  });

  await proof("W50", "Rate history: each row says which currency it is", (expect) => {
    const { RateHistoryModal } = app("components/office/exchange/sections/RateHistoryModal");
    const t = text(RateHistoryModal({ vm: vm({ showRateHistoryModal: true, rateHistory: [
      { id: "1", buyRate: 4000, sellRate: 4100, effectiveFrom: iso, foreignCurrency: EUR, foreignCurrencyCode: "EUR" },
      { id: "2", buyRate: 3700, sellRate: 3750, effectiveFrom: iso, foreignCurrency: USD, foreignCurrencyCode: "USD" }] }) }));
    expect(/Currency/.test(t) && /EUR/.test(t) && /USD/.test(t), `no currency shown: ${t.slice(0, 300)}`);
  });

  const trade = { id: "x1", code: "EX-1", date: iso, clientName: "Amina", clientType: "Walk-in", exchangeType: 0, direction: 0, amountGiven: 100000, currencyGiven: UGX, amountReceived: 3450, currencyReceived: KES, exchangeRate: 0.0345, profit: 0, profitCurrency: KES, status: "Completed", isLargeTransaction: false };

  await proof("W51", "Exchange table: a rate under 1 keeps its digits (0.0345, not 0.03)", (expect) => {
    const { TableHeaderSection } = app("components/office/exchange/sections/TableHeaderSection");
    const t = text(TableHeaderSection({ vm: vm({ dateFilter: "all", page: 1, pageSize: 20, searchTerm: "", totalCount: 1, totalPages: 1, transactions: [trade] }) }));
    expect(/0\.0345/.test(t), `rate shown: ${(t.match(/0\.0\d+/) || ["none"])[0]}`);
  });

  await proof("W52", "Current rate card: says which currency the rate is for", (expect) => {
    const { CurrentRateCard } = app("components/office/exchange/sections/CurrentRateCard");
    const t = text(CurrentRateCard({ vm: vm({ base: UGX, baseCode: "UGX", currentRate: rates[USD], marginPercent: "1.35", spread: 50, todaySummary: null, usdPosition: null,
      exchangeFloat: { kesBalance: 5000000, usdBalance: 100, otherBalances: [] } }) }));
    expect(/Buy Rate \(UGX per USD\)/.test(t), `label: ${t.slice(0, 160)}`);
  });

  await proof("W53", "Exchange detail: a refused clipboard shows an error, not 'Copied'", async (expect) => {
    const { TransactionDetailModal } = app("components/office/exchange/parts/TransactionDetailModal");
    const m = mount(TransactionDetailModal, { transaction: trade, onClose: noop, onVoid: noop, loading: false });
    const copy = find(m.tree, (e) => e.props.title === "Copy" && typeof e.props.onClick === "function")[0];
    expect(!!copy, "Copy button not found");
    clipboard.ok = false;
    if (copy) copy.props.onClick();
    await tick(20);
    expect(!toasts.some(([k]) => k === "success"), `said: ${JSON.stringify(toasts)}`);
    expect(toasts.some(([k]) => k === "error"), `no error shown: ${JSON.stringify(toasts)}`);
  });

  // ------------------------------------------------------------------ invoices
  await proof("W54", "Invoice duplicate: a UGX invoice with 16% tax is copied as UGX with 16% tax", async (expect) => {
    const { NoInvoicesFoundSection } = app("components/office/invoices/sections/NoInvoicesFoundSection");
    const invoice = { id: "i1", invoiceNumber: "INV-1", createdAt: iso, date: iso, dueDate: iso, clientName: "Kampala Traders", clientEmail: "", clientPhone: "", clientAddress: "",
      items: [{ id: "l1", description: "Service", quantity: 1, unitPrice: 100000, amount: 100000 }], subtotal: 100000, tax: 16000, taxRate: 16, discount: 0, total: 116000, status: "draft", currency: "UGX", notes: "" };
    const tree = NoInvoicesFoundSection({ vm: vm({ loading: false, filteredInvoices: [invoice] }) });
    const dup = find(tree, (e) => e.props.title === "Duplicate")[0];
    expect(!!dup, "Duplicate button not found");
    if (dup) await dup.props.onClick();
    await tick(20);
    const sent = server.requests.find((r) => r.method === "POST" && r.body && r.body.clientName === "Kampala Traders");
    expect(!!sent, `nothing sent: ${JSON.stringify(server.requests.map((r) => r.method + " " + r.url))}`);
    if (sent) expect(sent.body.currency === UGX && sent.body.taxRate === 16, `the copy was sent as currency ${sent.body.currency} (UGX is ${UGX}), tax ${sent.body.taxRate}%`);
  });

  // ------------------------------------------------------------------ reconciliation
  await proof("W55", "Reconciliation: a negative amount is printed with its minus", (expect) => {
    const { formatCurrency } = app("components/office/reconciliation/helpers");
    const shown = formatCurrency(-500, KES);
    expect(/^[−-]/.test(shown), `-500 is shown as "${shown}"`);
    expect(formatCurrency(500, KES) === shown.replace(/^[−-]/, ""), "a positive amount changed");
  });

  await proof("W55b", "Reconciliation: 'how to clear' shows a short statement as a negative variance", (expect) => {
    const { AdjustmentFormPanel } = app("components/office/reconciliation/sections/AdjustmentFormPanel");
    const t = text(AdjustmentFormPanel({ vm: vm({ showAdjustmentForm: true, adjustmentNote: "", currentVariance: -500, selectedAccount: { id: "b", name: "KCB", currency: KES, balance: 10000 } }) }));
    expect(/[−-]\s*KES\s*500/.test(t), `variance of -500 shown as: ${(t.match(/Variance to adjust:[^A-Za-z]*[A-Z]{3}[^A-Za-z]*/) || [t.slice(0, 200)])[0]}`);
  });

  await proof("W56", "Reconciliation: the comparison bar is never a negative width (overdrawn account)", (expect) => {
    const { VisualComparison } = app("components/office/reconciliation/sections/VisualComparison");
    const tree = VisualComparison({ vm: vm({ selectedAccount: { id: "b", name: "KCB", currency: KES, balance: -1000 }, actualBalanceInput: 500, currentVariance: 1500, hasLargeVariance: true, isBalanced: false, isReconciliationComplete: false, variancePercentage: "150.00" }) });
    const widths = find(tree, (e) => e.props.animate && e.props.animate.width !== undefined).map((e) => String(e.props.animate.width));
    expect(widths.length > 0, "no bars found");
    expect(widths.every((w) => /^\d/.test(w)), `bar widths: ${JSON.stringify(widths)}`);
  });

  // ------------------------------------------------------------------ reports
  await proof("W58", "Reports: the mobile money column does not claim the home currency for a KES wallet", (expect) => {
    const { AccountsView } = app("components/office/reports/sections/AccountsView");
    const t = text(AccountsView({ vm: vm({ reportType: "accounts", loading: false, base: UGX, baseCode: "UGX",
      accountSummary: { cashAccounts: [], cashByCurrency: {}, bankAccounts: [], bankByCurrency: {}, totalMpesa: 0, mpesaByCurrency: { [KES]: 4200 },
        mpesaAgents: [{ id: "a", agentName: "M-Pesa till", phoneNumber: "+254700000005", balance: 4200, currency: KES }] } }) }));
    expect(/M-Pesa till/.test(t), `agent not listed: ${t.slice(0, 200)}`);
    expect(!/Balance \(UGX\)/.test(t), 'a KES wallet is listed under "Balance (UGX)"');
  });

  const exchangeReport = { reportType: "exchange", loading: false, baseCode: "UGX", exchangeSummary: { currentBuyRate: 3700, currentSellRate: 3750, floatKES: 0, floatUSD: 0, floatOther: [],
    totalExchanges: 1, kesProfit: 0, usdProfit: 0, volumeByCurrency: { [USD]: { bought: 250, sold: 0 } },   // "bought" is filled when the CLIENT receives USD: the bureau sold it
    transactions: [{ id: "x", date: iso, code: "EX-9", clientName: "Amina", direction: 0, currencyGiven: USD, currencyReceived: UGX, amountGiven: 100, amountReceived: 370000, exchangeRate: 3700, profit: 0 }] } };

  await proof("W59", "Exchange report: USD the bureau sold is labelled sold, not bought", (expect) => {
    const { ExchangeView } = app("components/office/reports/sections/ExchangeView");
    const t = text(ExchangeView({ vm: vm(exchangeReport) }));
    expect(/USD sold to clients:.{0,10}250/.test(t), `volume line: ${(t.match(/USD [a-z ]*:\s*\S+/) || ["none"])[0]}`);
  });

  await proof("W60", "Exchange report: a purchase shows a dash for profit, not 'UGX 0'", (expect) => {
    const { ExchangeView } = app("components/office/reports/sections/ExchangeView");
    const t = text(ExchangeView({ vm: vm(exchangeReport) }));
    expect(/3700\.00\s+—/.test(t), `after the rate comes: ${(t.match(/3700\.00\s+\S+\s+\S+/) || ["?"])[0]}`);
  });

  await proof("W52b", "Exchange report: the rates card says which currency it quotes", (expect) => {
    const { ExchangeView } = app("components/office/reports/sections/ExchangeView");
    expect(/Current Rates \(UGX per USD\)/.test(text(ExchangeView({ vm: vm(exchangeReport) }))), "no currency on the rates card");
  });

  await proof("W61", "Profit chart: the axis prints 500 as 500, not 0k", (expect) => {
    const { ProfitCharts } = app("components/office/reports/sections/ProfitCharts");
    const tree = ProfitCharts({ vm: vm({ reportType: "profit", loading: false, baseCode: "UGX", profitLossData: { dailyProfits: [], profitByCategory: [] } }) });
    const axis = find(tree, (e) => typeof e.props.tickFormatter === "function")[0];
    expect(!!axis, "axis not found");
    if (axis) expect(axis.props.tickFormatter(500) === "500" && axis.props.tickFormatter(25000) === "25k", `500 → "${axis.props.tickFormatter(500)}", 25000 → "${axis.props.tickFormatter(25000)}"`);
  });

  // ------------------------------------------------------------------ settings
  await proof("W62", "Office settings: bureau name and phone cannot be typed over", (expect) => {
    const { OfficeInformationSection } = app("components/office/settings/sections/OfficeInformationSection");
    const tree = OfficeInformationSection({ vm: vm({ companyLoading: false, officeName: "Amana Forex", officePhone: "+254711000111", officeEmail: "a@b.co", officeAddress: "Kampala Rd" }) });
    const box = (v) => find(tree, (e) => tag(e) === "input" && e.props.value === v)[0];
    expect(box("Amana Forex") && box("Amana Forex").props.readOnly === true, "the name box is editable (the administrator sets the name)");
    expect(box("+254711000111") && box("+254711000111").props.readOnly === true, "the phone box is editable (and was never saved)");
    expect(box("a@b.co") && !box("a@b.co").props.readOnly, "the email box must stay editable");
  });

  // ------------------------------------------------------------------ super admin
  await proof("W64", "Super admin: a KES M-Pesa wallet at a Ugandan bureau is shown in the KES row", (expect) => {
    const { BureauDetailPanel } = app("components/super-admin/sections/BureauDetailPanel");
    const company = { id: "co1", name: "Kampala Bureau", code: "KB-2026-0001", ownerName: "Amina", email: "", whatsAppNumber: "+256700000006", subscriptionStatus: "Active", subscriptionPlan: "Starter",
      canChangeBaseCurrency: false, baseCurrency: UGX, totalUsers: 1, totalClients: 2, totalPaid: 0, monthlyFee: 0, bankAccountsCount: 0, mpesaAgentsCount: 2, isActive: true,
      monthlyVolumeByCurrency: [], otherCurrencyHoldings: [], totalCashBalanceKES: 0, totalBankBalanceKES: 0, totalClientBalanceKES: 0, totalCashBalanceUSD: 0, totalBankBalanceUSD: 0, totalClientBalanceUSD: 0,
      mobileMoneyByCurrency: [{ currency: KES, currencyCode: "KES", amount: 54321 }, { currency: UGX, currencyCode: "UGX", amount: 70000 }] };
    const t = text(BureauDetailPanel({ vm: vm({ modals: { companyDetails: true }, selectedCompany: company }) }));
    expect(/Money held/.test(t), `panel not drawn: ${t.slice(0, 200)}`);
    expect(count(t, /54,321/g) >= 2, `KES 54,321 of M-Pesa appears ${count(t, /54,321/g)} time(s): in Total held but not under Mobile money`);
  });

  await proof("W65", "Super admin overview: a currency with no trades this month still shows its all-time volume", (expect) => {
    const { OverviewView } = app("components/super-admin/sections/OverviewView");
    const dashboard = { totalCompanies: 2, activeCompanies: 2, trialCompanies: 0, expiredCompanies: 0, suspendedCompanies: 0, companiesByBaseCurrency: [], companiesGrowth: 0, usersGrowth: 0, revenueGrowth: 0,
      totalUsers: 3, activeUsersToday: 1, monthlyRecurringRevenue: 0, totalRevenue: 0, monthlyTransactionsCount: 5, totalTransactionsCount: 50, systemStatus: "Healthy", errorsLast24h: 0, securityAlertsActive: 0,
      topCompaniesByTransactions: [], topCompaniesByVolume: [], expiringSubscriptions: [], recentSignups: [],
      monthlyVolumeByCurrency: [{ currency: UGX, currencyCode: "UGX", amount: 1000 }],
      totalVolumeByCurrency: [{ currency: UGX, currencyCode: "UGX", amount: 9000 }, { currency: USD, currencyCode: "USD", amount: 77777 }] };
    const t = text(OverviewView({ vm: vm({ activeTab: "overview", loading: false, refreshing: false, dashboard }) }));
    expect(/Volume by currency/.test(t), `overview not drawn: ${t.slice(0, 200)}`);
    expect(/77,777/.test(t), "USD 77,777 all-time volume is missing (no USD trades this month)");
  });

  await proof("SA9w", "Super admin: the country filter is sent to the server", async (expect) => {
    const api = app("lib/superadmin-api");
    await api.getCompanies({ page: 1, pageSize: 10, baseCurrency: String(UGX) });
    const asked = server.requests.map((r) => r.url).find((u) => u.includes("/admin/companies"));
    expect(asked && /baseCurrency=2/.test(asked), `asked for: ${asked}`);
  });

  // ------------------------------------------------------------------ office: notes
  await proof("W37", "Transaction form: the notes box says the client sees the notes", async (expect) => {
    const { TransactionForm } = app("components/office/transaction-form/TransactionForm");
    server.reply((url) => (url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : { items: [], totalCount: 0, totalPages: 0, page: 1, pageSize: 100 }));
    const m = mount(TransactionForm, { onClose: noop, onSuccess: noop });
    for (let i = 0; i < 20 && /Loading accounts/.test(text(m.render())); i++) await tick(50);
    const t = text(m.render());
    expect(/the client sees them/i.test(t), `notes label: ${(t.match(/Notes[^|]{0,40}/) || [t.slice(0, 200)])[0]}`);
  });

  finish();
})();
