// CREATE LEDGER / MODIFY LEDGER — Authentic MARG ERP Ledger Master screen
// Contains full details: Ledger Name, Station, Account Group, Balancing method,
// Opening Dr/Cr, Mail to, Address (3 lines), Pin Code, E-Mail, Website, Contact Person,
// Designation, Phone Off/Res, Mobile, Fax, Freez Upto, Narco Billing, DL No & Exp,
// GST/VAT/ST/Food/Extra Headings, PAN, Ledger Date, Bill Export, Route, Category, State, Country.
import { api, esc, h, toast, confirmBox, today, fmtDate } from './ui.ts';
import { margPop } from './margui.ts';
import type { Ledger } from './masters.ts';

interface Group { id: number; name: string; nature: string }

export function ledgerScreen(existing?: Partial<Ledger> & { details?: string }, defaultGroup?: string): Promise<Ledger | null> {
  return new Promise(async (resolve) => {
    const isNew = !existing?.id;
    let groups: Group[] = [];
    try { groups = await api<Group[]>('/groups'); } catch { /* ignore */ }

    let det: Record<string, string> = {};
    try { det = JSON.parse(existing?.details || '{}'); } catch { /* start empty */ }

    const defDate = fmtDate(today()).replace(/-/g, '/');

    // Values setup with defaults
    const v: Record<string, string> = {
      name: existing?.name ?? '',
      city: existing?.city ?? '',
      group_id: String(existing?.group_id ?? groups.find((g) => g.name.toLowerCase() === (defaultGroup ?? 'sundry debtors').toLowerCase())?.id ?? (groups[0]?.id || '1')),
      group_prompt: det.group_prompt ?? 'Yes',
      balancing_method: det.balancing_method ?? 'Bill by Bill',
      opening: existing?.opening != null ? Number(existing.opening).toFixed(2) : '0.00',
      opening_type: existing?.opening_type ?? 'Dr',
      mail_to: det.mail_to ?? existing?.name ?? '',
      address1: det.address1 ?? existing?.address ?? '',
      address2: det.address2 ?? '',
      address3: det.address3 ?? '',
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
      bill_export_code: det.bill_export_code ?? '',
      bill_export_pas: det.bill_export_pas ?? '',
      erp_to_erp: det.erp_to_erp ?? '',
      patient_mobile: det.patient_mobile ?? '',
      doctor: det.doctor ?? '',
      mr_on: det.mr_on ?? 'Yes',
      del_man_on: det.del_man_on ?? 'Yes',
      area_on: det.area_on ?? 'Yes',
      route_on: det.route_on ?? 'Yes',
      route_name: det.route_name ?? 'A (BPTDSP)',
      ledger_category: det.ledger_category ?? 'OTHERS',
      color: det.color ?? 'NORMAL',
      state_on: det.state_on ?? 'Yes',
      state: existing?.state || det.state || '22-CHHATTISGARH',
      country_on: det.country_on ?? 'Yes',
      country: det.country ?? 'INDIA',
    };

    const title = isNew ? 'CREATE LEDGER' : 'MODIFY LEDGER';
    const p = margPop(title, '', '1020px');
    p.el.classList.add('marg-ledger');

    const sel = (k: string, opts: string[], w = 'auto') =>
      `<select data-k="${k}" style="width:${w}">${opts.map((o) => `<option${o === v[k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

    const groupSel = () =>
      `<select data-k="group_id" style="width:230px">${groups.map((g) => `<option value="${g.id}"${String(g.id) === String(v.group_id) ? ' selected' : ''}>${esc(g.name.toUpperCase())}</option>`).join('')}</select>`;

    const txt = (k: string, w = '200px', up = false, extra = '') =>
      `<input data-k="${k}" class="lf-txt${up ? ' up' : ''}" value="${esc(v[k] ?? '')}" autocomplete="off" spellcheck="false" style="width:${w}" ${extra}>`;

    const wrap = h('div', { class: 'lf-wrap' });
    wrap.innerHTML = `
      <div class="lf-row">
        <span class="lf-l">Ledger Name</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('name', '580px', true)}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Station</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('city', '580px', true)}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Account Group</span><span class="lf-c">:</span>
        <span class="lf-v">${sel('group_prompt', ['Yes', 'No'], '58px')} ${groupSel()}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Balancing method</span><span class="lf-c">:</span>
        <span class="lf-v">
          ${sel('balancing_method', ['Bill by Bill', 'On Account', 'FIFO'], '120px')}
          <span class="lf-sub" style="margin-left:14px">Opening:</span>
          <input data-k="opening" class="lf-num" value="${esc(v.opening)}" autocomplete="off" style="width:110px;text-align:right">
          ${sel('opening_type', ['Dr', 'Cr'], '52px')}
        </span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Mail to</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('mail_to', '580px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Address</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('address1', '580px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l"></span><span class="lf-c">:</span>
        <span class="lf-v">${txt('address2', '580px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l"></span><span class="lf-c">:</span>
        <span class="lf-v">${txt('address3', '580px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Pin Code</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('pin_code', '150px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">E-Mail</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('email', '450px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Web Site</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('website', '450px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Contact Person</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('contact_person', '450px')}</span>
      </div>
      <div class="lf-row">
        <span class="lf-l">Designation</span><span class="lf-c">:</span>
        <span class="lf-v">${txt('designation', '450px')}</span>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">Phone No. (Off.)</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('phone_off1', '140px')} , ${txt('phone_off2', '140px')}</span>
        </div>
        <div class="lf-right">
          <span class="lf-sub">Mobile  :</span>
          ${txt('mobile', '160px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l" style="padding-left:72px">(Res.)</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('phone_res', '140px')}</span>
        </div>
        <div class="lf-right">
          <span class="lf-sub">Fax No. :</span>
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
          ${sel('narco_billing', ['Alow All', 'Prohibited', 'Prompt'], '98px')}
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
          <span class="lf-l">GST  Heading ${sel('gst_heading', ['Local', 'Central', 'Import'], '72px')}</span><span class="lf-c">:</span>
          <span class="lf-sub" style="color:#0a3a7a">GSTIN &nbsp;&nbsp;&nbsp;&nbsp; No.:</span>
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
          <span class="lf-sub" style="min-width:138px;text-align:right">No.:</span>
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
          <span class="lf-sub" style="min-width:138px;text-align:right">No.:</span>
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
          <span class="lf-sub" style="color:#0a3a7a">Food Licence No.:</span>
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
          <span class="lf-sub" style="min-width:138px;text-align:right">No.:</span>
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
          <span class="lf-l">Bill Export* ${sel('bill_export', ['GSTN', 'Excel', 'CSV'], '64px')}</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('bill_export_code', '130px')} <span class="lf-sub" style="margin-left:6px">Pas:</span> ${txt('bill_export_pas', '100px')}</span>
        </div>
        <div class="lf-right">
          <span class="lf-sub">ERP to ERP*:</span>
          ${txt('erp_to_erp', '140px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">Patient Mobile[F2]</span><span class="lf-c">:</span>
          <span class="lf-v">${txt('patient_mobile', '160px')}</span>
        </div>
        <div class="lf-right">
          <span class="lf-sub">Dr. [F1] :</span>
          ${txt('doctor', '180px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">M.R.</span><span class="lf-c">:</span>
          <span class="lf-v">${sel('mr_on', ['Yes', 'No'], '58px')}</span>
        </div>
        <div class="lf-right" style="min-width:280px">
          <span class="lf-sub">Del.Man &nbsp;&nbsp;:</span>
          ${sel('del_man_on', ['Yes', 'No'], '58px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">Area</span><span class="lf-c">:</span>
          <span class="lf-v">${sel('area_on', ['Yes', 'No'], '58px')}</span>
        </div>
        <div class="lf-right" style="min-width:280px">
          <span class="lf-sub">Route &nbsp;&nbsp;&nbsp;&nbsp;:</span>
          ${sel('route_on', ['Yes', 'No'], '58px')} ${txt('route_name', '140px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">Ledger Category</span><span class="lf-c">:</span>
          <span class="lf-v">${sel('ledger_category', ['OTHERS', 'RETAILER', 'DISTRIBUTOR', 'STOCKIST', 'HOSPITAL'], '130px')}</span>
        </div>
        <div class="lf-right" style="min-width:280px">
          <span class="lf-sub">Color &nbsp;&nbsp;&nbsp;&nbsp;:</span>
          ${sel('color', ['NORMAL', 'RED', 'BLUE', 'GREEN', 'PURPLE'], '100px')}
        </div>
      </div>
      <div class="lf-row split">
        <div class="lf-left">
          <span class="lf-l">State</span><span class="lf-c">:</span>
          <span class="lf-v">${sel('state_on', ['Yes', 'No'], '58px')} ${txt('state', '190px')}</span>
        </div>
        <div class="lf-right" style="min-width:280px">
          <span class="lf-sub">Country &nbsp;&nbsp;:</span>
          ${sel('country_on', ['Yes', 'No'], '58px')} ${txt('country', '120px')}
        </div>
      </div>
    `;

    p.body.append(wrap);

    const inputs = [...p.body.querySelectorAll('input:not([readonly]), select')] as (HTMLInputElement | HTMLSelectElement)[];
    const byKey = (k: string) => p.body.querySelector(`[data-k="${k}"]`) as HTMLInputElement | HTMLSelectElement;

    p.body.querySelectorAll<HTMLInputElement>('input.up').forEach((el) => el.addEventListener('input', () => {
      const at = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(at, at);
    }));

    const start = byKey('name') as HTMLInputElement;
    setTimeout(() => { start.focus(); start.select(); }, 0);

    let dirty = false;
    p.body.addEventListener('input', () => { dirty = true; });
    p.body.addEventListener('change', () => { dirty = true; });

    let done = false;
    const finish = (r: Ledger | null) => { if (done) return; done = true; p.close(); resolve(r); };

    const save = async () => {
      const name = (byKey('name') as HTMLInputElement).value.trim();
      if (!name) { toast('Enter the Ledger name', true); byKey('name').focus(); return; }
      if (!(await confirmBox('Save ?'))) { inputs[inputs.length - 1].focus(); return; }

      const out: Record<string, string> = {};
      for (const el of p.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) {
        out[el.dataset.k!] = el.value.trim();
      }

      // Map core fields to ledgers columns
      const fullAddress = [out.address1, out.address2, out.address3].filter(Boolean).join('\n');
      const phone = out.mobile || out.phone_off1 || out.phone_off2 || '';

      const body: Record<string, unknown> = {
        name,
        group_id: Number(out.group_id) || 1,
        address: fullAddress,
        city: out.city,
        phone,
        gstin: out.gstin,
        state: out.state,
        opening: Number(out.opening) || 0,
        opening_type: out.opening_type === 'Cr' ? 'Cr' : 'Dr',
        credit_limit: existing?.credit_limit ?? 0,
      };

      // Store remaining MARG ledger detail fields in details JSON
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

    p.onKey = (e, k) => {
      const t = e.target as HTMLElement;
      const i = inputs.indexOf(t as HTMLInputElement);
      if (k === 'Escape') {
        if (!dirty) { finish(null); return true; }
        confirmBox('Exit W/o Save ?', false).then((y) => { if (y) finish(null); else t.focus(); });
        return true;
      }
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
  });
}
