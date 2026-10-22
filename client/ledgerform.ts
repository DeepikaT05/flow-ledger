// CREATE LEDGER / MODIFY LEDGER — Authentic MARG ERP Ledger Master screen, UNDER GROUP & Post-Save Menu
import { api, esc, h, toast, confirmBox, today, fmtDate, openWin } from './ui.ts';
import { margBar } from './margui.ts';
import type { Ledger } from './masters.ts';

interface Group { id: number; name: string; nature: string }

/** UNDER GROUP popup: floating window to pick account group, identical to screenshot */
export function pickUnderGroup(groups: Group[], currentId?: number): Promise<Group | null> {
  return new Promise((resolve) => {
    const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    let filter = '';
    const filtered = () => filter.trim()
      ? sorted.filter((g) => g.name.toLowerCase().includes(filter.toLowerCase().trim()))
      : sorted;

    let selIdx = 0;
    if (currentId) {
      const idx = sorted.findIndex((g) => g.id === currentId);
      if (idx >= 0) selIdx = idx;
    } else {
      const idx = sorted.findIndex((g) => g.name.toLowerCase() === 'sundry debtors');
      if (idx >= 0) selIdx = idx;
    }

    const p = openWin('UNDER GROUP', 'mid', '');
    p.el.classList.add('marg', 'marg-undergroup');
    p.setFoot('<span class="help-badge">HELP</span><span><b>F7</b>-All Groups</span><span><b>?</b>-Search</span><span><b>Tab</b>-Multiple Select</span>');

    const container = h('div', { class: 'ug-container' });
    p.body.innerHTML = '';
    p.body.append(margBar('UNDER GROUP'));
    p.body.append(container);

    const draw = () => {
      const list = filtered();
      if (selIdx >= list.length) selIdx = Math.max(0, list.length - 1);
      container.innerHTML = `
        <div class="ug-list">
          ${list.map((g, i) => `
            <div class="ug-item${i === selIdx ? ' sel' : ''}" data-idx="${i}" data-id="${g.id}">
              ${esc(g.name.toUpperCase())}
            </div>
          `).join('')}
        </div>
        <div class="ug-find-row">
          <span class="ug-find-lbl">Find ?</span>
          <span class="ug-bracket">[</span>
          <input class="ug-find-input" value="${esc(filter)}" autocomplete="off" spellcheck="false">
          <span class="ug-bracket">]</span>
        </div>
      `;

      const selEl = container.querySelector('.ug-item.sel') as HTMLElement | null;
      selEl?.scrollIntoView({ block: 'nearest' });

      const inp = container.querySelector('.ug-find-input') as HTMLInputElement | null;
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        inp.addEventListener('input', () => {
          filter = inp.value;
          selIdx = 0;
          draw();
        });
      }

      container.querySelectorAll<HTMLElement>('.ug-item').forEach((el) => {
        el.addEventListener('click', () => {
          selIdx = Number(el.dataset.idx);
          draw();
        });
        el.addEventListener('dblclick', () => {
          selIdx = Number(el.dataset.idx);
          choose();
        });
      });
    };

    let done = false;
    const choose = () => {
      if (done) return;
      done = true;
      const list = filtered();
      const chosen = list[selIdx] || null;
      p.close();
      resolve(chosen);
    };

    const cancel = () => {
      if (done) return;
      done = true;
      p.close();
      resolve(null);
    };

    p.onKey = (_e, k) => {
      const list = filtered();
      if (k === 'Escape') { cancel(); return true; }
      if (k === 'Enter') { choose(); return true; }
      if (k === 'ArrowDown') {
        if (selIdx < list.length - 1) { selIdx++; draw(); }
        return true;
      }
      if (k === 'ArrowUp') {
        if (selIdx > 0) { selIdx--; draw(); }
        return true;
      }
      if (k === 'PageDown') {
        selIdx = Math.min(list.length - 1, selIdx + 8);
        draw();
        return true;
      }
      if (k === 'PageUp') {
        selIdx = Math.max(0, selIdx - 8);
        draw();
        return true;
      }
      if (k === 'Home') { selIdx = 0; draw(); return true; }
      if (k === 'End') { selIdx = Math.max(0, list.length - 1); draw(); return true; }
      return false;
    };

    draw();
  });
}

/** Options shown right after saving a ledger (Screenshot 1) */
const POST_SAVE_OPTIONS = [
  { key: 'A', label: 'A  LEDGER DETAIL' },
  { key: 'B', label: 'B  OTHER  DETAIL' },
  { key: 'C', label: 'C  SMS,EMAIL & GEO' },
  { key: 'D', label: 'D  BANK DETAIL' },
  { key: 'E', label: 'E  UPI ID' },
  { key: 'F', label: 'F  COMPANY DISCOUNT' },
  { key: 'G', label: 'G  SPECIAL RATES' },
  { key: 'H', label: 'H  COPY DEALINGS' },
  { key: 'I', label: 'I  EXCISE DETAIL' },
  { key: 'J', label: 'J  BIODATA' },
  { key: 'K', label: 'K  ACTIVE ONLINE PURCHASE' },
  { key: 'L', label: 'L  AUTO CREDIT LIMIT' },
  { key: 'M', label: 'M  JOIN FOR LAST DEALS' },
  { key: 'N', label: 'N  NOTES' },
  { key: 'O', label: 'O  ATTACH DOCUMENTS' },
];

/** Post-Save Menu (Screenshot 1) */
export function postSaveMenu(l: Ledger, isUnregistered = false): Promise<Ledger> {
  return new Promise((resolve) => {
    let cur = l;
    let selIdx = 0;

    const w = openWin(cur.name.toUpperCase(), 'mid', '');
    w.el.classList.add('marg', 'marg-ledger-opts');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Select</span><span><b>Esc</b> Close</span>');

    const badge = isUnregistered
      ? `<div class="lf-unreg-badge">Ledger Shifted to Un-Registered !</div>`
      : '';

    const draw = () => {
      w.body.innerHTML = `
        ${margBar(cur.name.toUpperCase()).outerHTML}
        ${badge}
        <div class="lo-list">
          ${POST_SAVE_OPTIONS.map((o, i) => `
            <div class="lo-item${i === selIdx ? ' sel' : ''}" data-idx="${i}" data-k="${o.key}">
              ${esc(o.label)}
            </div>
          `).join('')}
        </div>
      `;

      w.body.querySelectorAll<HTMLElement>('.lo-item').forEach((el) => {
        el.addEventListener('click', () => {
          selIdx = Number(el.dataset.idx);
          draw();
        });
        el.addEventListener('dblclick', () => {
          selIdx = Number(el.dataset.idx);
          execute();
        });
      });
    };

    const execute = async () => {
      const opt = POST_SAVE_OPTIONS[selIdx];
      if (!opt) return;

      if (opt.key === 'A') {
        // Screenshot 2: MODIFY LEDGER Review Screen
        w.close();
        const updated = await modifyLedgerScreen(cur);
        if (updated) cur = updated;
        resolve(cur);
        return;
      }

      if (opt.key === 'D') {
        const updated = await bankDetailDialog(cur);
        if (updated) cur = updated;
        draw();
        return;
      }

      if (opt.key === 'E') {
        const updated = await upiDetailDialog(cur);
        if (updated) cur = updated;
        draw();
        return;
      }

      if (opt.key === 'B') {
        const updated = await otherDetailDialog(cur);
        if (updated) cur = updated;
        draw();
        return;
      }

      if (opt.key === 'N') {
        const updated = await notesDialog(cur);
        if (updated) cur = updated;
        draw();
        return;
      }

      if (opt.key === 'O') {
        await attachDocsDialog(cur);
        draw();
        return;
      }

      // Other informational / sub-options
      toast(`${opt.label} opened`);
    };

    w.onKey = (_e, k) => {
      if (k === 'Escape') {
        w.close();
        resolve(cur);
        return true;
      }
      if (k === 'Enter') {
        execute();
        return true;
      }
      if (k === 'ArrowDown') {
        selIdx = (selIdx + 1) % POST_SAVE_OPTIONS.length;
        draw();
        return true;
      }
      if (k === 'ArrowUp') {
        selIdx = (selIdx - 1 + POST_SAVE_OPTIONS.length) % POST_SAVE_OPTIONS.length;
        draw();
        return true;
      }
      const hit = POST_SAVE_OPTIONS.findIndex((o) => o.key.toUpperCase() === k.toUpperCase());
      if (hit >= 0) {
        selIdx = hit;
        draw();
        execute();
        return true;
      }
      return false;
    };

    draw();
  });
}

/** MODIFY LEDGER screen with [Exit] [Modify] [GSTN Verification] [ATTACH DOCUMENTS] (Screenshot 2) */
export function modifyLedgerScreen(existing: Ledger): Promise<Ledger | null> {
  return new Promise(async (resolve) => {
    let cur = existing;
    let groups: Group[] = [];
    try { groups = await api<Group[]>('/groups'); } catch { /* ignore */ }

    let det: Record<string, string> = {};
    try { det = JSON.parse(cur.details || '{}'); } catch { /* ignore */ }

    const defDate = fmtDate(today()).replace(/-/g, '/');

    const v: Record<string, string> = {
      name: cur.name ?? '',
      station_on: det.station_on ?? 'Yes',
      city: cur.city ?? '',
      group_id: String(cur.group_id ?? 1),
      group_prompt: det.group_prompt ?? 'Yes',
      balancing_method: det.balancing_method ?? 'Bill by Bill',
      opening: cur.opening != null ? Number(cur.opening).toFixed(2) : '0.00',
      opening_type: cur.opening_type ?? 'Dr',
      mail_to: det.mail_to ?? cur.name ?? '',
      address1: det.address1 ?? cur.address?.split('\n')[0] ?? '',
      address2: det.address2 ?? cur.address?.split('\n')[1] ?? '',
      address3: det.address3 ?? cur.address?.split('\n')[2] ?? '',
      pin_code: det.pin_code ?? '',
      email: det.email ?? '',
      website: det.website ?? '',
      contact_person: det.contact_person ?? '',
      designation: det.designation ?? '',
      phone_off1: det.phone_off1 ?? cur.phone ?? '',
      phone_off2: det.phone_off2 ?? '',
      mobile: det.mobile ?? (cur.phone && !det.phone_off1 ? cur.phone : ''),
      phone_res: det.phone_res ?? '',
      fax: det.fax ?? '',
      freez_upto: det.freez_upto ?? '',
      narco_billing: det.narco_billing ?? 'Alow All',
      dl_no: det.dl_no ?? '',
      dl_exp: det.dl_exp ?? '',
      gst_heading: det.gst_heading ?? 'Local',
      gstin: cur.gstin ?? det.gstin ?? '',
      gst_dt: det.gst_dt ?? '',
      vat_heading: det.vat_heading ?? '',
      vat_no: det.vat_no ?? '',
      vat_exp: det.vat_exp ?? '',
      st_heading: det.st_heading ?? '',
      st_no: det.st_no ?? '',
      st_exp: det.st_exp ?? '',
      food_heading: det.food_heading ?? '',
      food_lic_no: det.food_lic_no ?? '',
      food_exp: det.food_exp ?? '',
      extra_heading: det.extra_heading ?? '',
      extra_no: det.extra_no ?? '',
      extra_exp: det.extra_exp ?? '',
      pan_no: det.pan_no ?? '',
      ledger_date: det.ledger_date ?? defDate,
      bill_export: det.bill_export ?? 'GSTN',
      bill_export_pas: det.bill_export_pas ?? '',
      retailio_id: det.retailio_id ?? '',
      mr_on: det.mr_on ?? 'Yes',
      del_man_on: det.del_man_on ?? 'Yes',
      area_on: det.area_on ?? 'Yes',
      route_on: det.route_on ?? 'Yes',
      ledger_category: det.ledger_category ?? 'OTHERS',
      color: det.color ?? 'NORMAL',
      state_on: det.state_on ?? 'Yes',
      state: cur.state || det.state || '22-CHHATTISGARH',
      country_on: det.country_on ?? 'Yes',
      country: det.country ?? 'INDIA',
      ledger_type: cur.gstin ? (det.ledger_type ?? 'REGISTERED') : 'UNREGISTERED',
      hide: det.hide ?? 'No',
    };

    const w = openWin('MODIFY LEDGER', 'full', '');
    w.el.classList.add('marg', 'marg-ledger-screen');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Select</span><span><b>M</b> Modify</span><span><b>Esc</b> Exit</span>');

    const getGroupName = (idStr: string) => {
      const g = groups.find((gr) => String(gr.id) === String(idStr));
      return g ? g.name.toUpperCase() : 'SUNDRY DEBTORS';
    };

    let editMode = false;
    let focusedBtn = 0; // 0: Exit, 1: Modify, 2: GSTN Verification, 3: ATTACH DOCUMENTS

    const render = () => {
      const ro = !editMode ? ' readonly' : '';
      const dis = !editMode ? ' disabled' : '';

      const sel = (k: string, opts: string[], width = 'auto') =>
        `<select data-k="${k}" style="width:${width}"${dis}>${opts.map((o) => `<option${o === v[k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

      const txt = (k: string, width = '200px', up = false, extra = '') =>
        `<input data-k="${k}" class="lf-txt${up ? ' up' : ''}" value="${esc(v[k] ?? '')}" autocomplete="off" spellcheck="false" style="width:${width}" ${extra}${ro}>`;

      w.body.innerHTML = `
        <div class="marg-bar">
          <span class="bar-title">MODIFY LEDGER</span>
          <span class="clock"></span>
        </div>
        <div class="lf-screen">
          <div class="lf-main">
            <div class="lf-row">
              <span class="lf-l">Ledger Name</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('name', '560px', true)}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Station</span><span class="lf-c">:</span>
              <span class="lf-v">${sel('station_on', ['Yes', 'No'], '65px')} ${txt('city', '470px', true)}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Account Group</span><span class="lf-c">:</span>
              <span class="lf-v">
                ${sel('group_prompt', ['Yes', 'No'], '65px')}
                <button type="button" class="lf-grp-btn" data-k="group_id" tabindex="${editMode ? '0' : '-1'}">${esc(getGroupName(v.group_id))}</button>
              </span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Balancing method</span><span class="lf-c">:</span>
              <span class="lf-v">
                ${sel('balancing_method', ['Bill by Bill', 'On Account', 'FIFO'], '125px')}
                <span class="lf-sub">Opening:</span>
                <input data-k="opening" class="lf-num" value="${esc(v.opening)}" autocomplete="off" style="width:110px;text-align:right"${ro}>
                ${sel('opening_type', ['Dr', 'Cr'], '56px')}
              </span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Mail to</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('mail_to', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Address</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address1', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l"></span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address2', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l"></span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address3', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Pin Code</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('pin_code', '160px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">E-Mail</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('email', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Web Site</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('website', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Contact Person</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('contact_person', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Designation</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('designation', '460px')}</span>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Phone No. (Off.)</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('phone_off1', '140px')} ,</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Mobile :</span>
                ${txt('mobile', '160px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l" style="padding-left:72px">(Res.)</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('phone_res', '140px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Fax No.:</span>
                ${txt('fax', '160px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Freez Upto</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('freez_upto', '140px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Narco/Sch-H Item Billing</span>
                ${sel('narco_billing', ['Alow All', 'Prohibited', 'Prompt'], '100px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">D.L.No.</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('dl_no', '260px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('dl_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">GST  Heading ${sel('gst_heading', ['Local', 'Central', 'Import'], '75px')}</span><span class="lf-c">:</span>
                <span class="lf-blue">GSTIN &nbsp;&nbsp;&nbsp;&nbsp; No.:</span>
                <span class="lf-v">${txt('gstin', '170px', true)}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Dt.:</span>
                ${txt('gst_dt', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">VAT  Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('vat_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('vat_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">S.T. Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('st_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('st_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Food Heading</span><span class="lf-c">:</span>
                <span class="lf-blue">Food Licence No.:</span>
                <span class="lf-v">${txt('food_lic_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('food_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Extra Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('extra_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('extra_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">I.T.PAN No.</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('pan_no', '180px', true)}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Ledger Date:</span>
                ${txt('ledger_date', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Bill Export ${sel('bill_export', ['GSTN', 'Excel', 'CSV'], '68px')}</span><span class="lf-c">:</span>
                <span class="lf-v"><span class="lf-sub-r" style="min-width:auto;margin-right:6px">Pas:</span> ${txt('bill_export_pas', '100px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-reddot">•</span> <span class="lf-sub" style="margin-left:0">Retailio ID:</span>
                ${txt('retailio_id', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">M.R.</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('mr_on', ['Yes', 'No'], '60px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Del.Man &nbsp;:</span>
                ${sel('del_man_on', ['Yes', 'No'], '60px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Area</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('area_on', ['Yes', 'No'], '60px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Route &nbsp;&nbsp;&nbsp;:</span>
                ${sel('route_on', ['Yes', 'No'], '60px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Ledger Category</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('ledger_category', ['OTHERS', 'RETAILER', 'DISTRIBUTOR', 'STOCKIST', 'HOSPITAL'], '135px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Color &nbsp;&nbsp;&nbsp;:</span>
                ${sel('color', ['NORMAL', 'RED', 'BLUE', 'GREEN', 'PURPLE'], '100px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">State</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('state_on', ['Yes', 'No'], '60px')} ${txt('state', '190px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Country &nbsp;:</span>
                ${sel('country_on', ['Yes', 'No'], '60px')} ${txt('country', '120px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Ledger Type</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('ledger_type', ['REGISTERED', 'UNREGISTERED', 'COMPOSITION'], '135px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Hide &nbsp;&nbsp;&nbsp;&nbsp;:</span>
                ${sel('hide', ['No', 'Yes'], '60px')}
              </div>
            </div>
            <div class="ml-bottom-actions">
              <button type="button" class="ml-btn act-exit${!editMode && focusedBtn === 0 ? ' sel' : ''}" data-act="exit" tabindex="${editMode ? '-1' : '0'}">Exit</button>
              <button type="button" class="ml-btn act-modify${!editMode && focusedBtn === 1 ? ' sel' : ''}" data-act="modify" tabindex="${editMode ? '-1' : '0'}">Modify</button>
              <button type="button" class="ml-btn act-gstn${!editMode && focusedBtn === 2 ? ' sel' : ''}" data-act="gstn" tabindex="${editMode ? '-1' : '0'}">GSTN Verification</button>
              <button type="button" class="ml-btn act-attach${!editMode && focusedBtn === 3 ? ' sel' : ''}" data-act="attach" tabindex="${editMode ? '-1' : '0'}">ATTACH DOCUMENTS</button>
            </div>
          </div>
          <div class="lf-status">
            <div class="cs-head">
              <div class="cs-bar">&#10004; CUSTOMER STATUS</div>
              <div class="cs-name">${esc(v.name.toUpperCase() || 'SUSPENSE A/C')}</div>
              <div class="cs-row"><span>Phone &nbsp;:</span> <span class="cs-phone">${esc(v.phone_off1 || '')}</span></div>
              <div class="cs-row"><span>Mobile :</span> <span class="cs-mobile">${esc(v.mobile || '')}</span></div>
              <div class="cs-row"><span>Type &nbsp;&nbsp;:</span> <span>Manual-Only Indicate</span></div>
            </div>
            <div class="cs-table">
              <div class="cs-tr cs-th">
                <span>DESC.</span><span class="n">LIMIT</span><span class="n">PRIMARY</span><span class="n">BALANCE</span>
              </div>
              <div class="cs-tr">
                <span>Amount :</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
              <div class="cs-tr">
                <span>Bills &nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
              <div class="cs-tr">
                <span>Days &nbsp;&nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
            </div>
            <div class="cs-ratio">
              <div>Turnover Ratio :</div>
              <div>Avg.Sale PM : &nbsp;&nbsp; PW: &nbsp;&nbsp; PD:</div>
              <div>Avg.Coll.Day:</div>
              <div>Last Sale &nbsp;: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
              <div>Last Receipt: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
            </div>
          </div>
        </div>
      `;

      // Wire bottom actions
      const btns = [...w.body.querySelectorAll<HTMLButtonElement>('.ml-btn')];
      const btnExit = w.body.querySelector('.act-exit') as HTMLButtonElement | null;
      const btnMod = w.body.querySelector('.act-modify') as HTMLButtonElement | null;
      const btnGstn = w.body.querySelector('.act-gstn') as HTMLButtonElement | null;
      const btnAttach = w.body.querySelector('.act-attach') as HTMLButtonElement | null;

      btnExit?.addEventListener('click', () => { w.close(); resolve(cur); });
      btnMod?.addEventListener('click', () => { editMode = true; render(); });
      btnGstn?.addEventListener('click', () => { gstnVerifyDialog(cur); });
      btnAttach?.addEventListener('click', () => { attachDocsDialog(cur); });

      btns.forEach((b, i) => {
        b.addEventListener('focus', () => {
          focusedBtn = i;
          btns.forEach((btn, idx) => btn.classList.toggle('sel', idx === focusedBtn));
        });
      });

      if (!editMode) {
        if (btns[focusedBtn]) {
          btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
          btns[focusedBtn].focus({ preventScroll: true });
        }
        const main = w.body.querySelector('.lf-main') as HTMLElement | null;
        if (main) main.scrollTop = 0;
      } else {
        const inpName = w.body.querySelector('[data-k="name"]') as HTMLInputElement | null;
        inpName?.focus();
        inpName?.select();
      }
    };

    const saveChanges = async () => {
      const nameInp = w.body.querySelector('[data-k="name"]') as HTMLInputElement;
      const name = nameInp.value.trim();
      if (!name) { toast('Enter the Ledger name', true); nameInp.focus(); return; }
      if (!(await confirmBox('Save Changes ?'))) return;

      const out: Record<string, string> = {};
      for (const el of w.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]:not(.lf-grp-btn)')) {
        out[el.dataset.k!] = el.value.trim();
      }
      out.group_id = v.group_id;

      const fullAddress = [out.address1, out.address2, out.address3].filter(Boolean).join('\n');
      const phone = out.mobile || out.phone_off1 || out.phone_off2 || out.phone_res || '';

      const body: Record<string, unknown> = {
        name,
        group_id: Number(v.group_id) || 1,
        address: fullAddress,
        city: out.city,
        phone,
        gstin: out.gstin,
        state: out.state,
        opening: Number(out.opening) || 0,
        opening_type: out.opening_type === 'Cr' ? 'Cr' : 'Dr',
        credit_limit: cur.credit_limit ?? 0,
      };

      const details: Record<string, string> = { ...det, ...out };
      body.details = details;

      try {
        await api(`/ledgers/${cur.id}`, { method: 'PUT', body });
        toast('Ledger updated');
        cur = await api<Ledger>(`/ledgers/${cur.id}`);
        editMode = false;
        focusedBtn = 0;
        render();
      } catch (e) {
        toast((e as Error).message, true);
      }
    };

    w.onKey = (_e, k) => {
      const t = document.activeElement as HTMLElement;
      if (!editMode) {
        if (k === 'Escape' || k === 'X' || k === 'x') { w.close(); resolve(cur); return true; }
        if (k === 'M' || k === 'm') { editMode = true; render(); return true; }
        if (k === 'G' || k === 'g') { gstnVerifyDialog(cur); return true; }
        if (k === 'A' || k === 'a') { attachDocsDialog(cur); return true; }
        const btns = [...w.body.querySelectorAll<HTMLButtonElement>('.ml-btn')];
        if (k === 'ArrowRight' || k === 'Tab') {
          focusedBtn = (focusedBtn + 1) % btns.length;
          btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
          btns[focusedBtn]?.focus();
          return true;
        }
        if (k === 'ArrowLeft' || k === 'Shift+Tab') {
          focusedBtn = (focusedBtn - 1 + btns.length) % btns.length;
          btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
          btns[focusedBtn]?.focus();
          return true;
        }
        if (k === 'Enter') {
          btns[focusedBtn]?.click();
          return true;
        }
        return false;
      }

      if (k === 'Ctrl+W') { saveChanges(); return true; }
      if (k === 'Escape') {
        confirmBox('Exit Modify ?', false).then((y) => {
          if (y) { editMode = false; render(); }
          else t?.focus();
        });
        return true;
      }

      const inputs = [...w.body.querySelectorAll('input:not([readonly]), select, .lf-grp-btn')] as HTMLElement[];
      const i = inputs.indexOf(t);
      if (i >= 0) {
        const isSel = t.tagName === 'SELECT';
        if (k === 'Enter' || k === 'Tab' || (k === 'ArrowDown' && !isSel)) {
          if (i === inputs.length - 1) {
            saveChanges();
          } else {
            const n = inputs[i + 1];
            n.focus();
            if (n instanceof HTMLInputElement) n.select();
          }
          return true;
        }
        if (k === 'ArrowUp' && !isSel && i > 0) {
          const n = inputs[i - 1];
          n.focus();
          if (n instanceof HTMLInputElement) n.select();
          return true;
        }
      }
      return false;
    };

    render();
  });
}

/** DELETE LEDGER screen with top [Exit] [Delete] buttons (Screenshot 2) */
export function deleteLedgerScreen(existing: Ledger): Promise<boolean> {
  return new Promise(async (resolve) => {
    const cur = existing;
    let groups: Group[] = [];
    try { groups = await api<Group[]>('/groups'); } catch { /* ignore */ }

    let det: Record<string, string> = {};
    try { det = JSON.parse(cur.details || '{}'); } catch { /* ignore */ }

    const defDate = fmtDate(today()).replace(/-/g, '/');

    const v: Record<string, string> = {
      name: cur.name ?? '',
      station_on: det.station_on ?? 'Yes',
      city: cur.city ?? '',
      group_id: String(cur.group_id ?? 1),
      group_prompt: det.group_prompt ?? 'Yes',
      balancing_method: det.balancing_method ?? 'Bill by Bill',
      opening: cur.opening != null ? Number(cur.opening).toFixed(2) : '0.00',
      opening_type: cur.opening_type ?? 'Dr',
      mail_to: det.mail_to ?? cur.name ?? '',
      address1: det.address1 ?? cur.address?.split('\n')[0] ?? '',
      address2: det.address2 ?? cur.address?.split('\n')[1] ?? '',
      address3: det.address3 ?? cur.address?.split('\n')[2] ?? '',
      pin_code: det.pin_code ?? '',
      email: det.email ?? '',
      website: det.website ?? '',
      contact_person: det.contact_person ?? '',
      designation: det.designation ?? '',
      phone_off1: det.phone_off1 ?? cur.phone ?? '',
      phone_off2: det.phone_off2 ?? '',
      mobile: det.mobile ?? (cur.phone && !det.phone_off1 ? cur.phone : ''),
      phone_res: det.phone_res ?? '',
      fax: det.fax ?? '',
      freez_upto: det.freez_upto ?? '',
      narco_billing: det.narco_billing ?? 'Alow All',
      dl_no: det.dl_no ?? '',
      dl_exp: det.dl_exp ?? '',
      gst_heading: det.gst_heading ?? 'Local',
      gstin: cur.gstin ?? det.gstin ?? '',
      gst_dt: det.gst_dt ?? '',
      vat_heading: det.vat_heading ?? '',
      vat_no: det.vat_no ?? '',
      vat_exp: det.vat_exp ?? '',
      st_heading: det.st_heading ?? '',
      st_no: det.st_no ?? '',
      st_exp: det.st_exp ?? '',
      food_heading: det.food_heading ?? '',
      food_lic_no: det.food_lic_no ?? '',
      food_exp: det.food_exp ?? '',
      extra_heading: det.extra_heading ?? '',
      extra_no: det.extra_no ?? '',
      extra_exp: det.extra_exp ?? '',
      pan_no: det.pan_no ?? '',
      ledger_date: det.ledger_date ?? defDate,
      bill_export: det.bill_export ?? 'GSTN',
      bill_export_pas: det.bill_export_pas ?? '',
      retailio_id: det.retailio_id ?? '',
      mr_on: det.mr_on ?? 'Yes',
      del_man_on: det.del_man_on ?? 'Yes',
      area_on: det.area_on ?? 'Yes',
      route_on: det.route_on ?? 'Yes',
      ledger_category: det.ledger_category ?? 'OTHERS',
      color: det.color ?? 'NORMAL',
      state_on: det.state_on ?? 'Yes',
      state: cur.state || det.state || '22-CHHATTISGARH',
      country_on: det.country_on ?? 'Yes',
      country: det.country ?? 'INDIA',
      ledger_type: cur.gstin ? (det.ledger_type ?? 'REGISTERED') : 'UNREGISTERED',
      hide: det.hide ?? 'No',
    };

    const w = openWin('DELETE LEDGER', 'full', '');
    w.el.classList.add('marg', 'marg-ledger-screen');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Select</span><span><b>D</b> Delete</span><span><b>Esc</b> Exit</span>');

    const getGroupName = (idStr: string) => {
      const g = groups.find((gr) => String(gr.id) === String(idStr));
      return g ? g.name.toUpperCase() : 'SUNDRY DEBTORS';
    };

    let focusedBtn = 0; // 0: Exit, 1: Delete

    const render = () => {
      const sel = (k: string, opts: string[], width = 'auto') =>
        `<select data-k="${k}" style="width:${width}" disabled>${opts.map((o) => `<option${o === v[k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

      const txt = (k: string, width = '200px', up = false, extra = '') =>
        `<input data-k="${k}" class="lf-txt${up ? ' up' : ''}" value="${esc(v[k] ?? '')}" autocomplete="off" spellcheck="false" style="width:${width}" ${extra} readonly tabindex="-1">`;

      w.body.innerHTML = `
        <div class="marg-bar dl-bar">
          <span class="dl-title">DELETE LEDGER</span>
          <div class="dl-actions">
            <button type="button" class="dl-btn act-exit${focusedBtn === 0 ? ' sel' : ''}" data-act="exit" tabindex="0">Exit</button>
            <button type="button" class="dl-btn act-delete${focusedBtn === 1 ? ' sel' : ''}" data-act="delete" tabindex="0">Delete</button>
          </div>
          <span class="clock" style="margin-left:auto"></span>
        </div>
        <div class="lf-screen">
          <div class="lf-main">
            <div class="lf-row">
              <span class="lf-l">Ledger Name</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('name', '560px', true)}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Station</span><span class="lf-c">:</span>
              <span class="lf-v">${sel('station_on', ['Yes', 'No'], '65px')} ${txt('city', '470px', true)}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Account Group</span><span class="lf-c">:</span>
              <span class="lf-v">
                ${sel('group_prompt', ['Yes', 'No'], '65px')}
                <button type="button" class="lf-grp-btn" data-k="group_id" tabindex="-1">${esc(getGroupName(v.group_id))}</button>
              </span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Balancing method</span><span class="lf-c">:</span>
              <span class="lf-v">
                ${sel('balancing_method', ['Bill by Bill', 'On Account', 'FIFO'], '125px')}
                <span class="lf-sub">Opening:</span>
                <input data-k="opening" class="lf-num" value="${esc(v.opening)}" autocomplete="off" style="width:110px;text-align:right" readonly tabindex="-1">
                ${sel('opening_type', ['Dr', 'Cr'], '56px')}
              </span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Mail to</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('mail_to', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Address</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address1', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l"></span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address2', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l"></span><span class="lf-c">:</span>
              <span class="lf-v">${txt('address3', '560px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Pin Code</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('pin_code', '160px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">E-Mail</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('email', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Web Site</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('website', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Contact Person</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('contact_person', '460px')}</span>
            </div>
            <div class="lf-row">
              <span class="lf-l">Designation</span><span class="lf-c">:</span>
              <span class="lf-v">${txt('designation', '460px')}</span>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Phone No. (Off.)</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('phone_off1', '140px')} ,</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Mobile :</span>
                ${txt('mobile', '160px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l" style="padding-left:72px">(Res.)</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('phone_res', '140px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Fax No.:</span>
                ${txt('fax', '160px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Freez Upto</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('freez_upto', '140px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Narco/Sch-H Item Billing</span>
                ${sel('narco_billing', ['Alow All', 'Prohibited', 'Prompt'], '100px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">D.L.No.</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('dl_no', '260px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('dl_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">GST  Heading ${sel('gst_heading', ['Local', 'Central', 'Import'], '75px')}</span><span class="lf-c">:</span>
                <span class="lf-blue">GSTIN &nbsp;&nbsp;&nbsp;&nbsp; No.:</span>
                <span class="lf-v">${txt('gstin', '170px', true)}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Dt.:</span>
                ${txt('gst_dt', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">VAT  Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('vat_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('vat_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">S.T. Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('st_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('st_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Food Heading</span><span class="lf-c">:</span>
                <span class="lf-blue">Food Licence No.:</span>
                <span class="lf-v">${txt('food_lic_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('food_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Extra Heading</span><span class="lf-c">:</span>
                <span class="lf-sub-r">No.:</span>
                <span class="lf-v">${txt('extra_no', '170px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Exp:</span>
                ${txt('extra_exp', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">I.T.PAN No.</span><span class="lf-c">:</span>
                <span class="lf-v">${txt('pan_no', '180px', true)}</span>
              </div>
              <div class="lf-right">
                <span class="lf-sub">Ledger Date:</span>
                ${txt('ledger_date', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Bill Export ${sel('bill_export', ['GSTN', 'Excel', 'CSV'], '68px')}</span><span class="lf-c">:</span>
                <span class="lf-v"><span class="lf-sub-r" style="min-width:auto;margin-right:6px">Pas:</span> ${txt('bill_export_pas', '100px')}</span>
              </div>
              <div class="lf-right">
                <span class="lf-reddot">•</span> <span class="lf-sub" style="margin-left:0">Retailio ID:</span>
                ${txt('retailio_id', '140px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">M.R.</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('mr_on', ['Yes', 'No'], '60px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Del.Man &nbsp;:</span>
                ${sel('del_man_on', ['Yes', 'No'], '60px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Area</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('area_on', ['Yes', 'No'], '60px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Route &nbsp;&nbsp;&nbsp;:</span>
                ${sel('route_on', ['Yes', 'No'], '60px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Ledger Category</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('ledger_category', ['OTHERS', 'RETAILER', 'DISTRIBUTOR', 'STOCKIST', 'HOSPITAL'], '135px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Color &nbsp;&nbsp;&nbsp;:</span>
                ${sel('color', ['NORMAL', 'RED', 'BLUE', 'GREEN', 'PURPLE'], '100px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">State</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('state_on', ['Yes', 'No'], '60px')} ${txt('state', '190px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Country &nbsp;:</span>
                ${sel('country_on', ['Yes', 'No'], '60px')} ${txt('country', '120px')}
              </div>
            </div>
            <div class="lf-row split">
              <div class="lf-left">
                <span class="lf-l">Ledger Type</span><span class="lf-c">:</span>
                <span class="lf-v">${sel('ledger_type', ['REGISTERED', 'UNREGISTERED', 'COMPOSITION'], '135px')}</span>
              </div>
              <div class="lf-right" style="min-width:280px">
                <span class="lf-sub">Hide &nbsp;&nbsp;&nbsp;&nbsp;:</span>
                ${sel('hide', ['No', 'Yes'], '60px')}
              </div>
            </div>
          </div>
          <div class="lf-status">
            <div class="cs-head">
              <div class="cs-bar">&#10004; CUSTOMER STATUS</div>
              <div class="cs-name">${esc(v.name.toUpperCase() || 'SUSPENSE A/C')}</div>
              <div class="cs-row"><span>Phone &nbsp;:</span> <span class="cs-phone">${esc(v.phone_off1 || '')}</span></div>
              <div class="cs-row"><span>Mobile :</span> <span class="cs-mobile">${esc(v.mobile || '')}</span></div>
              <div class="cs-row"><span>Type &nbsp;&nbsp;:</span> <span>Manual-Only Indicate</span></div>
            </div>
            <div class="cs-table">
              <div class="cs-tr cs-th">
                <span>DESC.</span><span class="n">LIMIT</span><span class="n">PRIMARY</span><span class="n">BALANCE</span>
              </div>
              <div class="cs-tr">
                <span>Amount :</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
              <div class="cs-tr">
                <span>Bills &nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
              <div class="cs-tr">
                <span>Days &nbsp;&nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
              </div>
            </div>
            <div class="cs-ratio">
              <div>Turnover Ratio :</div>
              <div>Avg.Sale PM : &nbsp;&nbsp; PW: &nbsp;&nbsp; PD:</div>
              <div>Avg.Coll.Day:</div>
              <div>Last Sale &nbsp;: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
              <div>Last Receipt: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
            </div>
          </div>
        </div>
      `;

      const btns = [...w.body.querySelectorAll<HTMLButtonElement>('.dl-btn')];
      const btnExit = w.body.querySelector('.act-exit') as HTMLButtonElement | null;
      const btnDel = w.body.querySelector('.act-delete') as HTMLButtonElement | null;

      btnExit?.addEventListener('click', () => { w.close(); resolve(false); });
      btnDel?.addEventListener('click', () => doDelete());

      btns.forEach((b, i) => {
        b.addEventListener('focus', () => {
          focusedBtn = i;
          btns.forEach((btn, idx) => btn.classList.toggle('sel', idx === focusedBtn));
        });
      });

      if (btns[focusedBtn]) {
        btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
        btns[focusedBtn].focus({ preventScroll: true });
      }
      const main = w.body.querySelector('.lf-main') as HTMLElement | null;
      if (main) main.scrollTop = 0;
    };

    const doDelete = async () => {
      const { canDelete, NO_DELETE } = await import('./session.ts');
      if (!canDelete()) { toast(NO_DELETE, true); return; }
      const ok = await confirmBox(`Delete Ledger "${cur.name}" ?`, false);
      if (!ok) return;
      try {
        await api(`/ledgers/${cur.id}`, { method: 'DELETE' });
        toast('Ledger deleted successfully');
        w.close();
        resolve(true);
      } catch (e) {
        toast((e as Error).message, true);
      }
    };

    w.onKey = (_e, k) => {
      if (k === 'Escape' || k === 'X' || k === 'x') { w.close(); resolve(false); return true; }
      if (k === 'D' || k === 'd') { doDelete(); return true; }
      const btns = [...w.body.querySelectorAll<HTMLButtonElement>('.dl-btn')];
      if (k === 'ArrowRight' || k === 'Tab') {
        focusedBtn = (focusedBtn + 1) % btns.length;
        btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
        btns[focusedBtn]?.focus();
        return true;
      }
      if (k === 'ArrowLeft' || k === 'Shift+Tab') {
        focusedBtn = (focusedBtn - 1 + btns.length) % btns.length;
        btns.forEach((b, i) => b.classList.toggle('sel', i === focusedBtn));
        btns[focusedBtn]?.focus();
        return true;
      }
      if (k === 'Enter') {
        btns[focusedBtn]?.click();
        return true;
      }
      return false;
    };

    render();
  });
}

/** Full-screen authentic MARG CREATE LEDGER / MODIFY LEDGER screen */
export function ledgerScreen(existing?: Partial<Ledger> & { details?: string }, defaultGroup?: string): Promise<Ledger | null> {
  return new Promise(async (resolve) => {
    const isNew = !existing?.id;

    // If modifying existing ledger, open the review/modify screen (Screenshot 2) directly
    if (!isNew && existing?.id) {
      const l = await api<Ledger>(`/ledgers/${existing.id}`);
      resolve(await modifyLedgerScreen(l));
      return;
    }

    let groups: Group[] = [];
    try { groups = await api<Group[]>('/groups'); } catch { /* ignore */ }

    let det: Record<string, string> = {};
    try { det = JSON.parse(existing?.details || '{}'); } catch { /* start empty */ }

    const defDate = fmtDate(today()).replace(/-/g, '/');

    const initGroupId = String(existing?.group_id ?? groups.find((g) => g.name.toLowerCase() === (defaultGroup ?? 'sundry debtors').toLowerCase())?.id ?? (groups[0]?.id || '1'));

    const v: Record<string, string> = {
      name: existing?.name ?? '',
      station_on: det.station_on ?? 'Yes',
      city: existing?.city ?? '',
      group_id: initGroupId,
      group_prompt: det.group_prompt ?? 'Yes',
      balancing_method: det.balancing_method ?? 'Bill by Bill',
      opening: existing?.opening != null ? Number(existing.opening).toFixed(2) : '0.00',
      opening_type: existing?.opening_type ?? 'Dr',
      mail_to: det.mail_to ?? existing?.name ?? '',
      address1: det.address1 ?? existing?.address?.split('\n')[0] ?? '',
      address2: det.address2 ?? existing?.address?.split('\n')[1] ?? '',
      address3: det.address3 ?? existing?.address?.split('\n')[2] ?? '',
      pin_code: det.pin_code ?? '',
      email: det.email ?? '',
      website: det.website ?? '',
      contact_person: det.contact_person ?? '',
      designation: det.designation ?? '',
      phone_off1: det.phone_off1 ?? existing?.phone ?? '',
      phone_off2: det.phone_off2 ?? '',
      mobile: det.mobile ?? (existing?.phone && !det.phone_off1 ? existing.phone : ''),
      phone_res: det.phone_res ?? '',
      fax: det.fax ?? '',
      freez_upto: det.freez_upto ?? '',
      narco_billing: det.narco_billing ?? 'Alow All',
      dl_no: det.dl_no ?? '',
      dl_exp: det.dl_exp ?? '',
      gst_heading: det.gst_heading ?? 'Local',
      gstin: existing?.gstin ?? det.gstin ?? '',
      gst_dt: det.gst_dt ?? '',
      vat_heading: det.vat_heading ?? '',
      vat_no: det.vat_no ?? '',
      vat_exp: det.vat_exp ?? '',
      st_heading: det.st_heading ?? '',
      st_no: det.st_no ?? '',
      st_exp: det.st_exp ?? '',
      food_heading: det.food_heading ?? '',
      food_lic_no: det.food_lic_no ?? '',
      food_exp: det.food_exp ?? '',
      extra_heading: det.extra_heading ?? '',
      extra_no: det.extra_no ?? '',
      extra_exp: det.extra_exp ?? '',
      pan_no: det.pan_no ?? '',
      ledger_date: det.ledger_date ?? defDate,
      bill_export: det.bill_export ?? 'GSTN',
      bill_export_pas: det.bill_export_pas ?? '',
      retailio_id: det.retailio_id ?? '',
      mr_on: det.mr_on ?? 'Yes',
      del_man_on: det.del_man_on ?? 'Yes',
      area_on: det.area_on ?? 'Yes',
      route_on: det.route_on ?? 'Yes',
      ledger_category: det.ledger_category ?? 'OTHERS',
      color: det.color ?? 'NORMAL',
      state_on: det.state_on ?? 'Yes',
      state: existing?.state || det.state || '22-CHHATTISGARH',
      country_on: det.country_on ?? 'Yes',
      country: det.country ?? 'INDIA',
      ledger_type: det.ledger_type ?? 'REGISTERED',
      hide: det.hide ?? 'No',
    };

    const title = 'CREATE LEDGER';
    const w = openWin(title, 'full', '');
    w.el.classList.add('marg', 'marg-ledger-screen');
    w.setFoot('<span class="help-badge">HELP</span><span><b>F7</b>-All Groups</span><span><b>?</b>-Search</span><span><b>Tab</b>-Next</span><span><b>Ctrl+W/S</b>-Save</span><span><b>Esc</b>-Cancel</span>');

    const getGroupName = (idStr: string) => {
      const g = groups.find((gr) => String(gr.id) === String(idStr));
      return g ? g.name.toUpperCase() : 'SUNDRY DEBTORS';
    };

    const sel = (k: string, opts: string[], width = 'auto') =>
      `<select data-k="${k}" style="width:${width}">${opts.map((o) => `<option${o === v[k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

    const txt = (k: string, width = '200px', up = false, extra = '') =>
      `<input data-k="${k}" class="lf-txt${up ? ' up' : ''}" value="${esc(v[k] ?? '')}" autocomplete="off" spellcheck="false" style="width:${width}" ${extra}>`;

    const screen = h('div', { class: 'lf-screen' });
    screen.innerHTML = `
      <div class="lf-main">
        <div class="lf-row">
          <span class="lf-l">Ledger Name</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('name', '560px', true)}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Station</span><span class="lf-c">:</span>
          <span class="lf-v">${sel('station_on', ['Yes', 'No'], '65px')} ${txt('city', '470px', true)}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Account Group</span><span class="lf-c">:</span>
          <span class="lf-v">
            ${sel('group_prompt', ['Yes', 'No'], '65px')}
            <button type="button" class="lf-grp-btn" data-k="group_id" tabindex="0">${esc(getGroupName(v.group_id))}</button>
          </span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Balancing method</span><span class="lf-c">:</span>
          <span class="lf-v">
            ${sel('balancing_method', ['Bill by Bill', 'On Account', 'FIFO'], '125px')}
            <span class="lf-sub">Opening:</span>
            <input data-k="opening" class="lf-num" value="${esc(v.opening)}" autocomplete="off" style="width:110px;text-align:right">
            ${sel('opening_type', ['Dr', 'Cr'], '56px')}
          </span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Mail to</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('mail_to', '560px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Address</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('address1', '560px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l"></span><span class="lf-c">:</span>
          <span class="lf-v">${txt('address2', '560px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l"></span><span class="lf-c">:</span>
          <span class="lf-v">${txt('address3', '560px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Pin Code</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('pin_code', '160px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">E-Mail</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('email', '460px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Web Site</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('website', '460px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Contact Person</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('contact_person', '460px')}</span>
        </div>
        <div class="lf-row">
          <span class="lf-l">Designation</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('designation', '460px')}</span>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Phone No. (Off.)</span><span class="lf-c">:</span>
            <span class="lf-v">${txt('phone_off1', '140px')} ,</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Mobile :</span>
            ${txt('mobile', '160px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l" style="padding-left:72px">(Res.)</span><span class="lf-c">:</span>
            <span class="lf-v">${txt('phone_res', '140px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Fax No.:</span>
            ${txt('fax', '160px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Freez Upto</span><span class="lf-c">:</span>
            <span class="lf-v">${txt('freez_upto', '140px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Narco/Sch-H Item Billing</span>
            ${sel('narco_billing', ['Alow All', 'Prohibited', 'Prompt'], '100px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">D.L.No.</span><span class="lf-c">:</span>
            <span class="lf-v">${txt('dl_no', '260px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Exp:</span>
            ${txt('dl_exp', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">GST  Heading ${sel('gst_heading', ['Local', 'Central', 'Import'], '75px')}</span><span class="lf-c">:</span>
            <span class="lf-blue">GSTIN &nbsp;&nbsp;&nbsp;&nbsp; No.:</span>
            <span class="lf-v">${txt('gstin', '170px', true)}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Dt.:</span>
            ${txt('gst_dt', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">VAT  Heading</span><span class="lf-c">:</span>
            <span class="lf-sub-r">No.:</span>
            <span class="lf-v">${txt('vat_no', '170px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Exp:</span>
            ${txt('vat_exp', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">S.T. Heading</span><span class="lf-c">:</span>
            <span class="lf-sub-r">No.:</span>
            <span class="lf-v">${txt('st_no', '170px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Exp:</span>
            ${txt('st_exp', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Food Heading</span><span class="lf-c">:</span>
            <span class="lf-blue">Food Licence No.:</span>
            <span class="lf-v">${txt('food_lic_no', '170px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Exp:</span>
            ${txt('food_exp', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Extra Heading</span><span class="lf-c">:</span>
            <span class="lf-sub-r">No.:</span>
            <span class="lf-v">${txt('extra_no', '170px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Exp:</span>
            ${txt('extra_exp', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">I.T.PAN No.</span><span class="lf-c">:</span>
            <span class="lf-v">${txt('pan_no', '180px', true)}</span>
          </div>
          <div class="lf-right">
            <span class="lf-sub">Ledger Date:</span>
            ${txt('ledger_date', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Bill Export ${sel('bill_export', ['GSTN', 'Excel', 'CSV'], '68px')}</span><span class="lf-c">:</span>
            <span class="lf-v"><span class="lf-sub-r" style="min-width:auto;margin-right:6px">Pas:</span> ${txt('bill_export_pas', '100px')}</span>
          </div>
          <div class="lf-right">
            <span class="lf-reddot">•</span> <span class="lf-sub" style="margin-left:0">Retailio ID:</span>
            ${txt('retailio_id', '140px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">M.R.</span><span class="lf-c">:</span>
            <span class="lf-v">${sel('mr_on', ['Yes', 'No'], '60px')}</span>
          </div>
          <div class="lf-right" style="min-width:280px">
            <span class="lf-sub">Del.Man &nbsp;:</span>
            ${sel('del_man_on', ['Yes', 'No'], '60px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Area</span><span class="lf-c">:</span>
            <span class="lf-v">${sel('area_on', ['Yes', 'No'], '60px')}</span>
          </div>
          <div class="lf-right" style="min-width:280px">
            <span class="lf-sub">Route &nbsp;&nbsp;&nbsp;:</span>
            ${sel('route_on', ['Yes', 'No'], '60px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Ledger Category</span><span class="lf-c">:</span>
            <span class="lf-v">${sel('ledger_category', ['OTHERS', 'RETAILER', 'DISTRIBUTOR', 'STOCKIST', 'HOSPITAL'], '135px')}</span>
          </div>
          <div class="lf-right" style="min-width:280px">
            <span class="lf-sub">Color &nbsp;&nbsp;&nbsp;:</span>
            ${sel('color', ['NORMAL', 'RED', 'BLUE', 'GREEN', 'PURPLE'], '100px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">State</span><span class="lf-c">:</span>
            <span class="lf-v">${sel('state_on', ['Yes', 'No'], '60px')} ${txt('state', '190px')}</span>
          </div>
          <div class="lf-right" style="min-width:280px">
            <span class="lf-sub">Country &nbsp;:</span>
            ${sel('country_on', ['Yes', 'No'], '60px')} ${txt('country', '120px')}
          </div>
        </div>
        <div class="lf-row split">
          <div class="lf-left">
            <span class="lf-l">Ledger Type</span><span class="lf-c">:</span>
            <span class="lf-v">${sel('ledger_type', ['REGISTERED', 'UNREGISTERED', 'COMPOSITION'], '135px')}</span>
          </div>
          <div class="lf-right" style="min-width:280px">
            <span class="lf-sub">Hide &nbsp;&nbsp;&nbsp;&nbsp;:</span>
            ${sel('hide', ['No', 'Yes'], '60px')}
          </div>
        </div>
        <div class="cl-bottom-actions">
          <button type="button" class="cl-btn act-save" data-act="save" tabindex="0">Save</button>
          <button type="button" class="cl-btn act-cancel" data-act="cancel" tabindex="0">Cancel</button>
        </div>
      </div>
      <div class="lf-status">
        <div class="cs-head">
          <div class="cs-bar">&#10004; CUSTOMER STATUS</div>
          <div class="cs-name">${esc(v.name.toUpperCase() || 'SUSPENSE A/C')}</div>
          <div class="cs-row"><span>Phone &nbsp;:</span> <span class="cs-phone">${esc(v.phone_off1 || '')}</span></div>
          <div class="cs-row"><span>Mobile :</span> <span class="cs-mobile">${esc(v.mobile || '')}</span></div>
          <div class="cs-row"><span>Type &nbsp;&nbsp;:</span> <span>Manual-Only Indicate</span></div>
        </div>
        <div class="cs-table">
          <div class="cs-tr cs-th">
            <span>DESC.</span><span class="n">LIMIT</span><span class="n">PRIMARY</span><span class="n">BALANCE</span>
          </div>
          <div class="cs-tr">
            <span>Amount :</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
          </div>
          <div class="cs-tr">
            <span>Bills &nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
          </div>
          <div class="cs-tr">
            <span>Days &nbsp;&nbsp;:</span><span class="n">0</span><span class="n">0</span><span class="n">0</span>
          </div>
        </div>
        <div class="cs-ratio">
          <div>Turnover Ratio :</div>
          <div>Avg.Sale PM : &nbsp;&nbsp; PW: &nbsp;&nbsp; PD:</div>
          <div>Avg.Coll.Day:</div>
          <div>Last Sale &nbsp;: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
          <div>Last Receipt: 0 &nbsp; Dt: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Days:0</div>
        </div>
      </div>
    `;

    w.body.innerHTML = '';
    w.body.append(margBar(title));
    w.body.append(screen);

    const inputs = [...w.body.querySelectorAll('input:not([readonly]), select, .lf-grp-btn, .cl-btn')] as (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[];
    const byKey = (k: string) => w.body.querySelector(`[data-k="${k}"]`) as HTMLInputElement | HTMLSelectElement | HTMLButtonElement;

    const btnSave = w.body.querySelector('.act-save') as HTMLButtonElement | null;
    const btnCancel = w.body.querySelector('.act-cancel') as HTMLButtonElement | null;

    const nameEl = byKey('name') as HTMLInputElement;
    const phoneEl = byKey('phone_off1') as HTMLInputElement;
    const mobileEl = byKey('mobile') as HTMLInputElement;

    const csName = w.body.querySelector('.cs-name') as HTMLElement;
    const csPhone = w.body.querySelector('.cs-phone') as HTMLElement;
    const csMobile = w.body.querySelector('.cs-mobile') as HTMLElement;

    nameEl?.addEventListener('input', () => {
      if (csName) csName.textContent = nameEl.value.trim().toUpperCase() || 'SUSPENSE A/C';
    });
    phoneEl?.addEventListener('input', () => {
      if (csPhone) csPhone.textContent = phoneEl.value.trim();
    });
    mobileEl?.addEventListener('input', () => {
      if (csMobile) csMobile.textContent = mobileEl.value.trim();
    });

    w.body.querySelectorAll<HTMLInputElement>('input.up').forEach((el) => el.addEventListener('input', () => {
      const at = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(at, at);
    }));

    let dirty = false;
    w.body.addEventListener('input', () => { dirty = true; });
    w.body.addEventListener('change', () => { dirty = true; });

    let done = false;
    const finish = (r: Ledger | null) => { if (done) return; done = true; w.close(); resolve(r); };

    const cancelAction = () => {
      if (!dirty) { finish(null); return; }
      confirmBox('Exit W/o Save ?', false).then((y) => {
        if (y) finish(null);
        else (document.activeElement as HTMLElement)?.focus();
      });
    };

    btnSave?.addEventListener('click', () => { save(); });
    btnCancel?.addEventListener('click', () => { cancelAction(); });

    btnSave?.addEventListener('focus', () => {
      btnSave.classList.add('sel');
      btnCancel?.classList.remove('sel');
    });
    btnSave?.addEventListener('blur', () => {
      btnSave.classList.remove('sel');
    });

    btnCancel?.addEventListener('focus', () => {
      btnCancel.classList.add('sel');
      btnSave?.classList.remove('sel');
    });
    btnCancel?.addEventListener('blur', () => {
      btnCancel.classList.remove('sel');
    });

    const pickGroupAction = async () => {
      const g = await pickUnderGroup(groups, Number(v.group_id));
      if (g) {
        v.group_id = String(g.id);
        const grpBtn = w.body.querySelector('.lf-grp-btn') as HTMLElement | null;
        if (grpBtn) grpBtn.textContent = g.name.toUpperCase();
        dirty = true;
      }
      const idx = inputs.indexOf(byKey('group_id'));
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    };

    const grpBtn = w.body.querySelector('.lf-grp-btn') as HTMLElement | null;
    grpBtn?.addEventListener('click', () => { pickGroupAction(); });

    const save = async () => {
      const name = (byKey('name') as HTMLInputElement).value.trim();
      if (!name) { toast('Enter the Ledger name', true); byKey('name').focus(); return; }

      const out: Record<string, string> = {};
      for (const el of w.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]:not(.lf-grp-btn)')) {
        out[el.dataset.k!] = el.value.trim();
      }
      out.group_id = v.group_id;

      // In Marg: if GSTIN is not entered, shift to UNREGISTERED
      const isUnreg = !out.gstin && out.ledger_type !== 'COMPOSITION';
      if (isUnreg) out.ledger_type = 'UNREGISTERED';

      const fullAddress = [out.address1, out.address2, out.address3].filter(Boolean).join('\n');
      const phone = out.mobile || out.phone_off1 || out.phone_off2 || out.phone_res || '';

      const body: Record<string, unknown> = {
        name,
        group_id: Number(v.group_id) || 1,
        address: fullAddress,
        city: out.city,
        phone,
        gstin: out.gstin,
        state: out.state,
        opening: Number(out.opening) || 0,
        opening_type: out.opening_type === 'Cr' ? 'Cr' : 'Dr',
        credit_limit: existing?.credit_limit ?? 0,
      };

      const details: Record<string, string> = { ...det, ...out };
      body.details = details;

      try {
        const r = await api<{ id: number }>('/ledgers', { method: 'POST', body });
        const id = (r as { id: number }).id;
        toast('Ledger saved');
        const savedLedger = await api<Ledger>(`/ledgers/${id}`);

        // Open the post-save menu (Screenshot 1) and line-by-line options
        const finalLedger = await postSaveMenu(savedLedger, isUnreg);
        finish(finalLedger);
      } catch (e) {
        toast((e as Error).message, true);
      }
    };

    w.onKey = (e, k) => {
      const t = document.activeElement as HTMLElement;
      if (k === 'Ctrl+W' || k === 'Ctrl+S' || (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'w' || e.key === 'W'))) {
        save();
        return true;
      }
      if (k === 'Escape') {
        cancelAction();
        return true;
      }

      if (t === grpBtn && (k === 'Enter' || k === 'Space')) {
        pickGroupAction();
        return true;
      }

      if (t === btnSave) {
        if (k === 'Enter' || k === 'Space') { save(); return true; }
        if (k === 'ArrowRight' || k === 'Tab') { btnCancel?.focus(); return true; }
        if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Shift+Tab') {
          const hideEl = byKey('hide');
          hideEl?.focus();
          return true;
        }
        return false;
      }

      if (t === btnCancel) {
        if (k === 'Enter' || k === 'Space') { cancelAction(); return true; }
        if (k === 'ArrowLeft' || k === 'Shift+Tab') { btnSave?.focus(); return true; }
        if (k === 'ArrowUp') {
          const hideEl = byKey('hide');
          hideEl?.focus();
          return true;
        }
        if (k === 'Tab' || k === 'ArrowRight') {
          btnSave?.focus();
          return true;
        }
        return false;
      }

      const i = inputs.indexOf(t as any);
      if (i < 0) return false;
      const isSel = t.tagName === 'SELECT';

      if (k === 'Enter' || k === 'Tab' || (k === 'ArrowDown' && !isSel)) {
        if (i < inputs.length - 1) {
          const n = inputs[i + 1];
          n.focus();
          if (n instanceof HTMLInputElement) n.select();
          if (n === btnSave || n === btnCancel) {
            n.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
        return true;
      }

      if (k === 'ArrowUp' && !isSel && i > 0) {
        const n = inputs[i - 1];
        n.focus();
        if (n instanceof HTMLInputElement) n.select();
        return true;
      }

      return false;
    };

    // Auto pop the UNDER GROUP window over the CREATE LEDGER screen
    setTimeout(async () => {
      const picked = await pickUnderGroup(groups, Number(v.group_id));
      if (picked) {
        v.group_id = String(picked.id);
        if (grpBtn) grpBtn.textContent = picked.name.toUpperCase();
        dirty = true;
      }
      const nameInp = byKey('name') as HTMLInputElement | null;
      nameInp?.focus();
      nameInp?.select();
    }, 50);
  });
}

/** Small dialogs for the post-save options */
function bankDetailDialog(l: Ledger): Promise<Ledger | null> {
  return new Promise((resolve) => {
    let det: Record<string, string> = {};
    try { det = JSON.parse(l.details || '{}'); } catch { /* ignore */ }

    const w = openWin(`BANK DETAIL - ${l.name.toUpperCase()}`, 'mid', '');
    w.el.classList.add('marg', 'marg-subbox');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Next/Save</span><span><b>Esc</b> Close</span>');

    w.body.innerHTML = `
      ${margBar(`BANK DETAIL - ${l.name.toUpperCase()}`).outerHTML}
      <div class="sb-wrap">
        <div class="sb-row"><span class="sb-l">Bank Name</span><span class="sb-c">:</span><input data-k="bank_name" value="${esc(det.bank_name || '')}" style="width:360px"></div>
        <div class="sb-row"><span class="sb-l">A/c No.</span><span class="sb-c">:</span><input data-k="bank_ac_no" value="${esc(det.bank_ac_no || '')}" style="width:240px"></div>
        <div class="sb-row"><span class="sb-l">Branch</span><span class="sb-c">:</span><input data-k="bank_branch" value="${esc(det.bank_branch || '')}" style="width:240px"></div>
        <div class="sb-row"><span class="sb-l">IFSC Code</span><span class="sb-c">:</span><input data-k="bank_ifsc" class="up" value="${esc(det.bank_ifsc || '')}" style="width:160px"></div>
      </div>
    `;

    const inps = [...w.body.querySelectorAll('input')] as HTMLInputElement[];
    inps[0]?.focus();

    const saveBank = async () => {
      for (const inp of inps) { det[inp.dataset.k!] = inp.value.trim(); }
      try {
        await api(`/ledgers/${l.id}`, { method: 'PUT', body: { details: det } });
        toast('Bank details saved');
        w.close();
        resolve(await api<Ledger>(`/ledgers/${l.id}`));
      } catch (e) { toast((e as Error).message, true); }
    };

    w.onKey = (_e, k) => {
      const t = document.activeElement as HTMLInputElement;
      const idx = inps.indexOf(t);
      if (k === 'Escape') { w.close(); resolve(null); return true; }
      if (k === 'Enter') {
        if (idx === inps.length - 1) { saveBank(); }
        else { inps[idx + 1]?.focus(); }
        return true;
      }
      return false;
    };
  });
}

function upiDetailDialog(l: Ledger): Promise<Ledger | null> {
  return new Promise((resolve) => {
    let det: Record<string, string> = {};
    try { det = JSON.parse(l.details || '{}'); } catch { /* ignore */ }

    const w = openWin(`UPI ID - ${l.name.toUpperCase()}`, 'mid', '');
    w.el.classList.add('marg', 'marg-subbox');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Save</span><span><b>Esc</b> Close</span>');

    w.body.innerHTML = `
      ${margBar(`UPI ID - ${l.name.toUpperCase()}`).outerHTML}
      <div class="sb-wrap">
        <div class="sb-row"><span class="sb-l">UPI ID / VPA</span><span class="sb-c">:</span><input data-k="upi_id" value="${esc(det.upi_id || '')}" placeholder="username@bank" style="width:340px"></div>
      </div>
    `;

    const inp = w.body.querySelector('input') as HTMLInputElement;
    inp?.focus();

    const saveUpi = async () => {
      det.upi_id = inp.value.trim();
      try {
        await api(`/ledgers/${l.id}`, { method: 'PUT', body: { details: det } });
        toast('UPI ID saved');
        w.close();
        resolve(await api<Ledger>(`/ledgers/${l.id}`));
      } catch (e) { toast((e as Error).message, true); }
    };

    w.onKey = (_e, k) => {
      if (k === 'Escape') { w.close(); resolve(null); return true; }
      if (k === 'Enter') { saveUpi(); return true; }
      return false;
    };
  });
}

function otherDetailDialog(l: Ledger): Promise<Ledger | null> {
  return new Promise((resolve) => {
    let det: Record<string, string> = {};
    try { det = JSON.parse(l.details || '{}'); } catch { /* ignore */ }

    const w = openWin(`OTHER DETAIL - ${l.name.toUpperCase()}`, 'mid', '');
    w.el.classList.add('marg', 'marg-subbox');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Next/Save</span><span><b>Esc</b> Close</span>');

    w.body.innerHTML = `
      ${margBar(`OTHER DETAIL - ${l.name.toUpperCase()}`).outerHTML}
      <div class="sb-wrap">
        <div class="sb-row"><span class="sb-l">Credit Limit (Rs.)</span><span class="sb-c">:</span><input data-k="credit_limit" value="${esc(String(l.credit_limit || 0))}" style="width:160px;text-align:right"></div>
        <div class="sb-row"><span class="sb-l">Limit (Bills)</span><span class="sb-c">:</span><input data-k="credit_limit_bills" value="${esc(det.credit_limit_bills || '0')}" style="width:100px;text-align:right"></div>
        <div class="sb-row"><span class="sb-l">Due Days</span><span class="sb-c">:</span><input data-k="due_days" value="${esc(det.due_days || '0')}" style="width:100px;text-align:right"></div>
        <div class="sb-row"><span class="sb-l">Discount %</span><span class="sb-c">:</span><input data-k="discount_pct" value="${esc(det.discount_pct || '0.00')}" style="width:100px;text-align:right"></div>
      </div>
    `;

    const inps = [...w.body.querySelectorAll('input')] as HTMLInputElement[];
    inps[0]?.focus();

    const saveOther = async () => {
      const crLimit = Number(inps[0].value) || 0;
      det.credit_limit_bills = inps[1].value.trim();
      det.due_days = inps[2].value.trim();
      det.discount_pct = inps[3].value.trim();
      try {
        await api(`/ledgers/${l.id}`, { method: 'PUT', body: { credit_limit: crLimit, details: det } });
        toast('Details saved');
        w.close();
        resolve(await api<Ledger>(`/ledgers/${l.id}`));
      } catch (e) { toast((e as Error).message, true); }
    };

    w.onKey = (_e, k) => {
      const t = document.activeElement as HTMLInputElement;
      const idx = inps.indexOf(t);
      if (k === 'Escape') { w.close(); resolve(null); return true; }
      if (k === 'Enter') {
        if (idx === inps.length - 1) { saveOther(); }
        else { inps[idx + 1]?.focus(); }
        return true;
      }
      return false;
    };
  });
}

function notesDialog(l: Ledger): Promise<Ledger | null> {
  return new Promise((resolve) => {
    let det: Record<string, string> = {};
    try { det = JSON.parse(l.details || '{}'); } catch { /* ignore */ }

    const w = openWin(`NOTES - ${l.name.toUpperCase()}`, 'mid', '');
    w.el.classList.add('marg', 'marg-subbox');
    w.setFoot('<span class="help-badge">HELP</span><span><b>Ctrl+W</b> Save</span><span><b>Esc</b> Close</span>');

    w.body.innerHTML = `
      ${margBar(`NOTES - ${l.name.toUpperCase()}`).outerHTML}
      <div class="sb-wrap" style="padding:12px">
        <textarea style="width:100%;height:160px;font-family:Courier New,monospace;font-size:15px;background:#fff;border:1px solid #777;padding:6px">${esc(det.notes || '')}</textarea>
      </div>
    `;

    const ta = w.body.querySelector('textarea') as HTMLTextAreaElement;
    ta?.focus();

    const saveNotes = async () => {
      det.notes = ta.value.trim();
      try {
        await api(`/ledgers/${l.id}`, { method: 'PUT', body: { details: det } });
        toast('Notes saved');
        w.close();
        resolve(await api<Ledger>(`/ledgers/${l.id}`));
      } catch (e) { toast((e as Error).message, true); }
    };

    w.onKey = (_e, k) => {
      if (k === 'Ctrl+W') { saveNotes(); return true; }
      if (k === 'Escape') { w.close(); resolve(null); return true; }
      return false;
    };
  });
}

function gstnVerifyDialog(l: Ledger) {
  const gstin = (l.gstin || '').trim();
  const valid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
  const w = openWin('GSTN Verification', 'small', '');
  w.el.classList.add('marg', 'marg-subbox');
  w.setFoot('<span class="help-badge">HELP</span><span><b>Enter / Esc</b> Close</span>');
  w.body.innerHTML = `
    ${margBar('GSTN VERIFICATION').outerHTML}
    <div style="padding:16px;font-family:Courier New,monospace;font-size:16px;line-height:1.6">
      <div><b>Party Name :</b> ${esc(l.name.toUpperCase())}</div>
      <div><b>GSTIN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> ${gstin ? esc(gstin) : '<span style="color:#d32f2f">NOT ENTERED</span>'}</div>
      <div style="margin-top:10px;font-weight:bold;color:${valid ? '#1e4a2c' : '#d32f2f'}">
        Status : ${valid ? 'VALID GSTIN FORMAT' : (gstin ? 'INVALID GSTIN FORMAT' : 'UNREGISTERED DEALER')}
      </div>
    </div>
  `;
  w.onKey = (_e, k) => {
    if (k === 'Enter' || k === 'Escape') { w.close(); return true; }
    return false;
  };
}

function attachDocsDialog(l: Ledger) {
  const w = openWin(`ATTACH DOCUMENTS - ${l.name.toUpperCase()}`, 'mid', '');
  w.el.classList.add('marg', 'marg-subbox');
  w.setFoot('<span class="help-badge">HELP</span><span><b>Esc</b> Close</span>');
  w.body.innerHTML = `
    ${margBar(`ATTACH DOCUMENTS - ${l.name.toUpperCase()}`).outerHTML}
    <div style="padding:16px;font-family:Courier New,monospace;font-size:16px;line-height:1.6">
      <div style="border:2px dashed #777;padding:24px;text-align:center;background:#fff;margin-bottom:12px">
        <div>Drop files here or click to attach (PAN, GST Certificate, Drug License)</div>
        <input type="file" style="margin-top:12px">
      </div>
      <div style="color:#555">No documents attached yet for ${esc(l.name.toUpperCase())}.</div>
    </div>
  `;
  w.onKey = (_e, k) => {
    if (k === 'Escape') { w.close(); return true; }
    return false;
  };
}
