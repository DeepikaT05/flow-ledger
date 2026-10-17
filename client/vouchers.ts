import { api, openWin, GridList, confirmBox, toast, money, esc, today, fmtDate, pick, reloadOnClose } from './ui.ts';
import { pickLedger, type Ledger } from './masters.ts';
import { canAction, canBackdate, canDelete, session, NO_DATE, NO_DELETE } from './session.ts';

export const V_TITLE: Record<string, string> = {
  RECEIPT: 'Receipt', PAYMENT: 'Payment', CONTRA: 'Contra', JOURNAL: 'Journal', DEBIT_NOTE: 'Debit Note', CREDIT_NOTE: 'Credit Note',
};
// Marg: inside voucher entry F2..F7 switch voucher type.
const SWITCH: Record<string, string> = { F2: 'PAYMENT', F3: 'RECEIPT', F4: 'JOURNAL', F5: 'DEBIT_NOTE', F6: 'CREDIT_NOTE', F7: 'CONTRA' };
const CASH_BANK = 'Cash-in-hand,Bank Accounts';
const isSimple = (t: string) => t === 'RECEIPT' || t === 'PAYMENT' || t === 'CONTRA';

interface VLine { ledger_id?: number; ledger?: string; side: 'Dr' | 'Cr'; amount: number }

/** Alt+V: choose voucher type. */
export async function voucherMenu() {
  const rows = Object.entries(V_TITLE).map(([id, name]) => ({ id, name, key: Object.entries(SWITCH).find(([, v]) => v === id)![0] }))
    .filter((r) => canAction(`voucher.new:${r.id}`));   // only the voucher types this role may enter
  const r = await pick({ title: 'Voucher Entry (Alt+V)', rows, key: (x) => x.name, cols: [{ title: 'Voucher', get: (x) => x.name }, { title: 'Key', get: (x) => x.key }] });
  if (r) (await import('./receipt.ts')).receiptEntry(r.id as any);
}

export async function voucherEntry(initialType: string, voucherId?: number) {
  let type = initialType;
  let lines: VLine[] = [];
  let account: Ledger | null = null;
  let dirty = false;
  const w = openWin('', 'wide', '');
  w.body.style.height = '100%';

  const setTitle = () => {
    (w.el.querySelector('.win-title span') as HTMLElement).textContent = `${V_TITLE[type]} Voucher${voucherId ? ' - Modify' : ''}`;
    w.setFoot('<span><b>Enter</b> Next</span><span><b>Ctrl+W</b> Save</span><span><b>Ctrl+Del</b> Delete Row</span>' +
      (voucherId ? '<span><b>Ctrl+D</b> Delete Voucher</span>' : '<span><b>F2</b> Payment <b>F3</b> Receipt <b>F4</b> Journal <b>F5</b> Debit Note <b>F6</b> Credit Note <b>F7</b> Contra</span>') +
      '<span><b>F11</b> Last Narration</span><span><b>Esc</b> Exit</span>');
  };

  function layout() {
    const simple = isSimple(type);
    const accLabel = type === 'RECEIPT' ? 'Received In (Cash/Bank)' : type === 'PAYMENT' ? 'Paid From (Cash/Bank)' : 'Cash/Bank A/c (Cr)';
    w.body.innerHTML = `
      <div class="bill-head" style="grid-template-columns:auto 1fr auto 1fr auto 2fr">
        <label>Date</label><input type="date" data-h="date">
        <label>Voucher No.</label><input data-h="no">
        ${simple ? `<label>${accLabel}</label><input data-h="acc" placeholder="Enter to select" style="font-weight:bold">` : '<span></span><span></span>'}
      </div>
      <div class="party-info acc-info"></div>
      <div class="bill-grid-wrap" style="height:calc(100% - 150px)"><table class="grid"><thead><tr><th style="width:5%">S.No</th>
        ${simple ? '' : '<th style="width:8%">Dr/Cr</th>'}
        <th>${simple ? (type === 'CONTRA' ? 'Deposited To (Dr)' : type === 'RECEIPT' ? 'Received From (Party)' : 'Paid To (Party)') : 'Ledger'}</th>
        <th class="n" style="width:18%">Amount</th><th class="n" style="width:18%">Balance</th></tr></thead><tbody></tbody></table></div>
      <div class="row" style="margin-top:4px"><label>Narration</label><input data-h="narration" style="flex:1"></div>
      <div class="bill-totals"></div>`;
    w.body.addEventListener('input', () => (dirty = true));
  }
  const $ = (s: string) => w.body.querySelector(s) as HTMLInputElement;
  const blank = (): VLine => ({ side: type === 'RECEIPT' || type === 'CREDIT_NOTE' ? 'Cr' : 'Dr', amount: 0 });
  const balances = new Map<number, number>();

  function renderGrid() {
    const simple = isSimple(type);
    w.body.querySelector('tbody')!.innerHTML = lines.map((l, i) => `<tr><td class="n">${i + 1}</td>
      ${simple ? '' : `<td><input data-r="${i}" data-c="side" value="${l.side}" maxlength="2"></td>`}
      <td><input data-r="${i}" data-c="ledger" value="${esc(l.ledger ?? '')}" autocomplete="off"></td>
      <td><input data-r="${i}" data-c="amount" class="num" value="${l.amount || ''}"></td>
      <td class="n muted">${l.ledger_id && balances.has(l.ledger_id) ? money(Math.abs(balances.get(l.ledger_id)!)) + (balances.get(l.ledger_id)! >= 0 ? ' Dr' : ' Cr') : ''}</td></tr>`).join('');
    renderTotals();
  }
  function renderTotals() {
    const dr = lines.filter((l) => l.side === 'Dr').reduce((s, l) => s + l.amount, 0);
    const cr = lines.filter((l) => l.side === 'Cr').reduce((s, l) => s + l.amount, 0);
    const el = w.body.querySelector('.bill-totals')!;
    el.innerHTML = isSimple(type)
      ? `<span>Total Amount: <b class="net">${money(isSimple(type) ? lines.reduce((s, l) => s + l.amount, 0) : dr)}</b></span>`
      : `<span>Total Dr: <b>${money(dr)}</b></span><span>Total Cr: <b>${money(cr)}</b></span><span>Difference: <b class="net">${money(dr - cr)}</b></span>`;
  }
  const focusCell = (r: number, c: string) => { const el = w.body.querySelector(`input[data-r="${r}"][data-c="${c}"]`) as HTMLInputElement | null; el?.focus(); el?.select(); };

  async function reset(keepType = true) {
    if (!keepType) type = initialType;
    layout();
    setTitle();
    lines = [blank()];
    dirty = false;
    account = null;
    $('[data-h=date]').value = today();
    if (!canBackdate()) { $('[data-h=date]').readOnly = true; $('[data-h=date]').title = NO_DATE; }
    $('[data-h=no]').value = (await api(`/vouchers/next-no?type=${type}`)).no;
    if (isSimple(type)) {
      const cash = (await api<Ledger[]>('/ledgers?group=Cash-in-hand'))[0];
      if (cash) setAccount(cash);
    }
    renderGrid();
    $('[data-h=date]').focus();
  }
  function setAccount(l: Ledger) {
    account = l;
    $('[data-h=acc]').value = l.name;
    (w.body.querySelector('.acc-info') as HTMLElement).innerHTML = `Current Balance: <b>${money(Math.abs(l.balance))} ${l.balance >= 0 ? 'Dr' : 'Cr'}</b>`;
  }

  let picking = false;
  async function chooseLedger(r: number, initial: string) {
    if (picking) return;
    picking = true;
    const group = type === 'CONTRA' ? CASH_BANK : undefined;
    const l = await pickLedger('Select Ledger', group, initial).finally(() => (picking = false));
    if (!l) { focusCell(r, 'ledger'); return; }
    lines[r].ledger_id = l.id;
    lines[r].ledger = l.name;
    balances.set(l.id, l.balance);
    dirty = true;
    renderGrid();
    focusCell(r, 'amount');
  }

  function buildLines() {
    const real = lines.filter((l) => l.ledger_id && l.amount);
    if (!isSimple(type)) return real.map((l) => ({ ledger_id: l.ledger_id!, debit: l.side === 'Dr' ? l.amount : 0, credit: l.side === 'Cr' ? l.amount : 0 }));
    if (!account) throw new Error('Select Cash/Bank account');
    const total = real.reduce((s, l) => s + l.amount, 0);
    // Receipt: cash Dr / party Cr. Payment & Contra: party(or deposit a/c) Dr / cash Cr.
    const accDr = type === 'RECEIPT';
    return [
      { ledger_id: account.id, debit: accDr ? total : 0, credit: accDr ? 0 : total },
      ...real.map((l) => ({ ledger_id: l.ledger_id!, debit: accDr ? 0 : l.amount, credit: accDr ? l.amount : 0 })),
    ];
  }

  async function save() {
    try {
      const body = { type, date: $('[data-h=date]').value, no: $('[data-h=no]').value, narration: $('[data-h=narration]').value, lines: buildLines() };
      const res = voucherId ? await api(`/vouchers/${voucherId}`, { method: 'PUT', body }) : await api('/vouchers', { method: 'POST', body });
      toast(`${V_TITLE[type]} ${res.no} saved`);
      localStorage.setItem('lastNarration', body.narration);
      dirty = false;
      if (voucherId) w.close();
      else await reset();
    } catch (e) { toast((e as Error).message, true); }
  }

  w.onKey = (e, k) => {
    const t = e.target as HTMLInputElement;
    if (k === 'Ctrl+W') { save(); return true; }
    // Modify mode: delete this voucher.
    if (k === 'Ctrl+D' && voucherId) {
      if (!canDelete()) { toast(NO_DELETE, true); return true; }
      confirmBox(`Delete ${V_TITLE[type]} Voucher ${$('[data-h=no]').value} ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/vouchers/${voucherId}`, { method: 'DELETE' }); toast('Voucher deleted'); dirty = false; w.close(); }
        catch (err) { toast((err as Error).message, true); }
      });
      return true;
    }
    if (SWITCH[k] && !voucherId) {
      if (!canAction(`voucher.new:${SWITCH[k]}`)) { toast(`Access denied — role ${session()?.role ?? ''} cannot enter ${V_TITLE[SWITCH[k]]}`, true); return true; }
      type = SWITCH[k]; reset(); return true;
    }
    if (k === 'F11') { const n = $('[data-h=narration]'); n.value = localStorage.getItem('lastNarration') ?? ''; n.focus(); return true; }
    const h = t.dataset?.h;
    if (k === 'Enter' && h) {
      if (h === 'date') $('[data-h=no]').focus();
      else if (h === 'no') (isSimple(type) ? $('[data-h=acc]') : null)?.focus() ?? focusCell(0, 'side');
      else if (h === 'acc') {
        pickLedger('Select Cash / Bank', CASH_BANK).then((l) => { if (l) { setAccount(l); dirty = true; focusCell(0, 'ledger'); } else $('[data-h=acc]').focus(); });
      } else if (h === 'narration') confirmBox('Save Voucher ?').then((y) => { if (y) save(); });
      return true;
    }
    if (h === 'acc' && k.length === 1) {
      pickLedger('Select Cash / Bank', CASH_BANK, k).then((l) => { if (l) { setAccount(l); focusCell(0, 'ledger'); } });
      return true;
    }
    if (t.dataset?.c) {
      const r = Number(t.dataset.r), c = t.dataset.c;
      if (c === 'side' && (k === 'D' || k === 'C')) { lines[r].side = k === 'D' ? 'Dr' : 'Cr'; t.value = lines[r].side; renderTotals(); return true; }
      if (c === 'side' && k === 'Space') { lines[r].side = lines[r].side === 'Dr' ? 'Cr' : 'Dr'; t.value = lines[r].side; renderTotals(); return true; }
      if (c === 'ledger' && k.length === 1 && !lines[r].ledger_id) { chooseLedger(r, k); return true; }
      if (k === 'Enter' || k === 'Tab') {
        if (c === 'side') focusCell(r, 'ledger');
        else if (c === 'ledger') {
          if (!lines[r].ledger_id || t.value !== lines[r].ledger) {
            if (!t.value.trim() && r === lines.length - 1 && r > 0) { $('[data-h=narration]').focus(); return true; }
            chooseLedger(r, t.value.trim());
          } else focusCell(r, 'amount');
        } else if (c === 'amount') {
          lines[r].amount = Number(t.value || 0);
          if (r === lines.length - 1) {
            const nl = blank();
            if (!isSimple(type)) {
              // Journal: next line takes the opposite side and the pending difference.
              const dr = lines.filter((l) => l.side === 'Dr').reduce((s, l) => s + l.amount, 0);
              const cr = lines.filter((l) => l.side === 'Cr').reduce((s, l) => s + l.amount, 0);
              if (dr === cr) { $('[data-h=narration]').focus(); return true; }
              nl.side = dr > cr ? 'Cr' : 'Dr';
              nl.amount = Math.abs(dr - cr);
            }
            lines.push(nl);
            renderGrid();
          }
          focusCell(r + 1, isSimple(type) ? 'ledger' : 'side');
        }
        return true;
      }
      if (k === 'ArrowDown') { if (r < lines.length - 1) focusCell(r + 1, c); return true; }
      if (k === 'ArrowUp') { if (r > 0) focusCell(r - 1, c); return true; }
      if (k === 'Ctrl+Delete' || k === 'Shift+Delete') { lines.splice(r, 1); if (!lines.length) lines.push(blank()); renderGrid(); focusCell(Math.min(r, lines.length - 1), 'ledger'); return true; }
    }
    return false;
  };
  w.body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.c === 'amount') { lines[Number(t.dataset.r)].amount = Number(t.value || 0); renderTotals(); }
  });
  w.beforeEsc = async () => {
    if (!dirty) return true;
    const y = await confirmBox('Save Voucher ?');
    if (y) { await save(); return false; }
    return true;
  };

  if (voucherId) {
    const v = await api(`/vouchers/${voucherId}`);
    type = v.type;
    layout();
    setTitle();
    $('[data-h=date]').value = v.date;
    $('[data-h=no]').value = v.no;
    $('[data-h=narration]').value = v.narration ?? '';
    const all = await api<Ledger[]>('/ledgers');
    all.forEach((l) => balances.set(l.id, l.balance));
    if (isSimple(type)) {
      const accSideDr = type === 'RECEIPT';
      const accLine = v.lines.find((l: any) => (accSideDr ? l.debit : l.credit) > 0 && ['Cash-in-hand', 'Bank Accounts'].includes(all.find((x) => x.id === l.ledger_id)?.group_name ?? ''))
        ?? v.lines.find((l: any) => (accSideDr ? l.debit : l.credit) > 0);
      setAccount(all.find((x) => x.id === accLine.ledger_id)!);
      lines = v.lines.filter((l: any) => l !== accLine).map((l: any) => ({ ledger_id: l.ledger_id, ledger: l.ledger, side: l.debit ? 'Dr' : 'Cr', amount: l.debit || l.credit }));
    } else {
      lines = v.lines.map((l: any) => ({ ledger_id: l.ledger_id, ledger: l.ledger, side: l.debit ? 'Dr' : 'Cr', amount: l.debit || l.credit }));
    }
    lines.push(blank());
    renderGrid();
    focusCell(0, 'ledger');
  } else await reset();
}

export async function voucherList(type: string) {
  const w = openWin(`${V_TITLE[type]} Book / Modify`, 'wide', '<span><b>Enter / F3</b> Modify</span><span><b>F2</b> New</span><span><b>Del</b> Delete</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<any>(w.body, [
    { title: 'Date', get: (r) => fmtDate(r.date) }, { title: 'No.', get: (r) => r.no },
    { title: 'Ledgers', get: (r) => r.ledgers }, { title: 'Narration', get: (r) => r.narration },
    { title: 'Amount', get: (r) => r.amount, money: true },
  ], (r) => `${r.no} ${r.ledgers} ${r.narration}`);
  g.footerRow = (rows) => `<tr class="total"><td colspan="4">Total (${rows.length})</td><td class="n">${money(rows.reduce((s, r) => s + r.amount, 0))}</td></tr>`;
  const load = async () => g.setRows(await api(`/vouchers?type=${type}`), true);
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if ((k === 'Enter' || k === 'F3') && cur) { voucherEntry(cur.type, cur.id); reloadOnClose(load); return true; }
    if (k === 'F2') { import('./receipt.ts').then((m) => m.receiptEntry(type as any)); reloadOnClose(load); return true; }
    if (k === 'Delete' && cur) {
      if (!canDelete()) { toast(NO_DELETE, true); return true; }
      confirmBox(`Delete ${V_TITLE[cur.type] ?? V_TITLE[type]} ${cur.no} ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/vouchers/${cur.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (err) { toast((err as Error).message, true); }
      });
      return true;
    }
    return false;
  };
}
