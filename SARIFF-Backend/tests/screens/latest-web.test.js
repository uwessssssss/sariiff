// Web screen tests for the 18 Nov changes (client edit: alerts, active, clearing fields).
//   node latest-web.test.js <web>                         every test must pass
//   node latest-web.test.js <old web> <web> --expect-fail every test must fail on the defect (old = 4556a36)
const { world, withBrowser, suite, signedInBureau, app, mount, mountHook, text, find, tag, pressable, tick, vm, proof, server, toasts } = require("./kit");

const KES = 0, USD = 1, UGX = 2;
const client = { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", whatsAppNumber: "+256700000010", email: "wrong@example.com", idPassport: "X123",
  clientType: 1, isActive: true, balanceKES: 0, balanceUSD: 120, otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 250000 }] };
const editVm = (extra) => vm({ showEditModal: true, selectedClient: client, homeCurrency: UGX, allowedCurrencies: [UGX, USD], isSubmitting: false,
  samples: { phoneCompact: "+256772123456" }, editFormData: { fullName: client.fullName, whatsAppNumber: client.whatsAppNumber, email: client.email, idPassport: client.idPassport, isActive: true }, ...extra });

suite(async () => {
  await signedInBureau(UGX);

  await proof("W67", "Edit client: an emptied email box removes the email (it was sent as 'no change')", async (expect) => {
    server.reply(() => ({ ...client, email: null }));
    const m = mountHook(app("components/office/clients/hooks/useClientManagementState").useClientManagementState);
    m.api.setSelectedClient(client);
    m.api.setEditFormData({ fullName: client.fullName, whatsAppNumber: client.whatsAppNumber, email: "", idPassport: "", isActive: true });
    await m.render().handleUpdateClient({ preventDefault() {} });
    const put = server.requests.find((r) => r.method === "PUT" && r.url.includes("/api/client/c1"));
    expect(!!put, `nothing saved: ${JSON.stringify(toasts)}`);
    if (put) expect(put.body.email === "" && put.body.idPassport === "", `sent email=${JSON.stringify(put.body.email)}, idPassport=${JSON.stringify(put.body.idPassport)} (undefined keeps the old value)`);
  });

  let panel = null;
  await proof("W68", "Edit client: a Balance alerts tab lists this client's alerts and adds one in the home currency", async (expect) => {
    server.reply((url, body, method) => {
      if (url.includes("/api/balance-alerts") && method === "GET")
        return [{ id: "r1", clientId: "c1", clientName: "Amina Hassan", currency: UGX, direction: 0, threshold: 100000, isActive: true, lastTriggeredAt: null, createdAt: "2026-11-01T00:00:00Z" },
                { id: "r0", clientId: null, currency: USD, direction: 0, threshold: 10, isActive: true, lastTriggeredAt: null, createdAt: "2026-10-01T00:00:00Z" }];
      if (url.includes("/api/balance-alerts") && method === "POST") return { id: "r2", ...body, isActive: true, createdAt: "2026-11-18T00:00:00Z" };
      return undefined;
    });
    await withBrowser(async () => {
      const { EditModal } = app("components/office/clients/sections/EditModal");
      const m = mount(EditModal, { vm: editVm({}) });
      const tab = pressable(m.tree, /^Balance alerts$/);
      expect(!!tab, `no Balance alerts tab in Edit client: ${text(m.tree).slice(0, 200)}`);
      if (!tab) return;
      tab.props.onClick(); m.render();
      const el = find(m.tree, (e) => typeof e.type === "function" && e.props.clientId === "c1")[0];
      expect(!!el, "the alerts panel is not drawn");
      if (!el) return;
      const p = mount(el.type, el.props);
      for (let i = 0; i < 4; i++) { await tick(10); p.render(); }
      const t = text(p.tree);
      expect(/UGX balance below UGX 100,000/.test(t), `this client's alert is not listed: ${t.slice(0, 260)}`);
      expect(/set for every client/.test(t) && /USD balance below USD 10\.00/.test(t), "the bureau-wide alert is not shown apart");
      find(p.tree, (e) => tag(e) === "input" && e.props.id === "alert-threshold")[0].props.onChange({ target: { value: "50,000" } });
      p.render();
      await pressable(p.tree, /^Add$/).props.onClick();
      await tick(10);
      const post = server.requests.find((r) => r.method === "POST" && r.url.includes("/api/balance-alerts"));
      expect(post && post.body.clientId === "c1" && post.body.currency === UGX && post.body.direction === 0 && post.body.threshold === 50000, `created: ${JSON.stringify(post && post.body)}`);
      panel = p;
    });
  });

  await proof("W69", "Edit client: the client can be set inactive (the server supports it; no screen offered it)", async (expect) => {
    let next = null;
    await withBrowser(async () => {
      const { EditModal } = app("components/office/clients/sections/EditModal");
      const m = mount(EditModal, { vm: editVm({ setEditFormData: (f) => { next = f; } }) });
      const sw = find(m.tree, (e) => e.props.role === "switch")[0];
      expect(!!sw, "no Active switch");
      if (sw) sw.props.onClick();
    });
    expect(next && next.isActive === false, `after the switch: ${JSON.stringify(next && { isActive: next.isActive })}`);
  });

  await proof("W70", "Edit client: Save is off until something is changed, and an empty name cannot be saved", async (expect) => {
    await withBrowser(async () => {
      const { EditModal } = app("components/office/clients/sections/EditModal");
      const save = (tree) => find(tree, (e) => tag(e) === "button" && /Save|No changes/.test(text(e)))[0];
      const same = mount(EditModal, { vm: editVm({}) });
      expect(save(same.tree) && save(same.tree).props.disabled === true, "Save is pressable with nothing changed");
      const noName = mount(EditModal, { vm: editVm({ editFormData: { fullName: "  ", whatsAppNumber: client.whatsAppNumber, email: client.email, idPassport: client.idPassport, isActive: true } }) });
      expect(save(noName.tree) && save(noName.tree).props.disabled === true && /A name is required/.test(text(noName.tree)), "an empty name can be saved without a word");
    });
  });
});
