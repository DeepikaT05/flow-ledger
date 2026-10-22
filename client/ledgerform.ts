// CREATE LEDGER / MODIFY LEDGER — Authentic MARG ERP Ledger Master screen & UNDER GROUP popup
import { api, esc, h, toast, confirmBox, today, fmtDate, openWin, type Win } from './ui.ts';
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

/** Full-screen authentic MARG CREATE LEDGER / MODIFY LEDGER screen */
export function ledgerScreen(existing?: Partial<Ledger> & { details?: string }, defaultGroup?: string): Promise<Ledger | null> {
  return new Promise(async (resolve) => {
    const isNew = !existing?.id;
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

    const title = isNew ? 'CREATE LEDGER' : 'MODIFY LEDGER';
    const w = openWin(title, 'full', '');
    w.el.classList.add('marg', 'marg-ledger-screen');
    w.setFoot('<span class="help-badge">HELP</span><span><b>F7</b>-All Groups</span><span><b>?</b>-Search</span><span><b>Tab</b>-Multiple Select</span><span><b>Ctrl+W</b>-Save</span><span><b>Esc</b>-Close</span>');

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
          <span class="lf-v">${sel('station_on', ['Yes', 'No'], '65px')} ${txt('city', '470px', true, 'placeholder=""')}</span>
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

    const inputs = [...w.body.querySelectorAll('input:not([readonly]), select, .lf-grp-btn')] as (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[];
    const byKey = (k: string) => w.body.querySelector(`[data-k="${k}"]`) as HTMLInputElement | HTMLSelectElement | HTMLButtonElement;

    // Live update status panel as user types name/phone/mobile
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
      if (!(await confirmBox('Save ?'))) { inputs[inputs.length - 1].focus(); return; }

      const out: Record<string, string> = {};
      for (const el of w.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]:not(.lf-grp-btn)')) {
        out[el.dataset.k!] = el.value.trim();
      }
      out.group_id = v.group_id;

      // Map core fields to ledgers columns
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
        const r = isNew
          ? await api<{ id: number }>('/ledgers', { method: 'POST', body })
          : await api(`/ledgers/${existing!.id}`, { method: 'PUT', body });
        const id = isNew ? (r as { id: number }).id : existing!.id;
        toast(isNew ? 'Ledger saved' : 'Ledger updated');
        finish(await api<Ledger>(`/ledgers/${id}`));
      } catch (e) {
        toast((e as Error).message, true);
      }
    };

    w.onKey = (_e, k) => {
      const t = document.activeElement as HTMLElement;
      if (k === 'Ctrl+W') { save(); return true; }
      if (k === 'Escape') {
        if (!dirty) { finish(null); return true; }
        confirmBox('Exit W/o Save ?', false).then((y) => { if (y) finish(null); else t?.focus(); });
        return true;
      }

      if (t === grpBtn && (k === 'Enter' || k === 'Space')) {
        pickGroupAction();
        return true;
      }

      const i = inputs.indexOf(t as any);
      if (i < 0) return false;
      const isSel = t.tagName === 'SELECT';

      if (k === 'Enter' || k === 'Tab' || (k === 'ArrowDown' && !isSel)) {
        if (i === inputs.length - 1) {
          save();
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

      return false;
    };

    // If new ledger, auto pop the UNDER GROUP window over the CREATE LEDGER screen
    if (isNew) {
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
    } else {
      const nameInp = byKey('name') as HTMLInputElement | null;
      setTimeout(() => { nameInp?.focus(); nameInp?.select(); }, 0);
    }
  });
}
