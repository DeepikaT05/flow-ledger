import { api, esc, h, toast } from './ui.ts';
import { margWin, margBar } from './margui.ts';
import { printJewelTagWeb, printMultipleJewelTags, tagOfItem, jewelTagSvg, JewelTag } from './jeweltag.ts';
import { itemForm, type Item } from './masters.ts';

export async function qrManagerScreen(jewelOnly = false) {
  const w = margWin('SAVED QR MASTER (ALL TAGS)');
  w.setFoot('<span><b>Enter/Space</b>-Preview</span><span><b>Alt+P</b>-Print Tag</span><span><b>F2</b>-New Item</span><span><b>F3</b>-Edit Item</span><span><b>Esc</b>-Exit</span>');

  const container = h('div', { class: 'qr-mgr-wrap', style: 'display:flex; flex-direction:column; height:100%; background:#f1f5f9;' });
  const topBar = h('div', { style: 'padding:8px 16px; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:12px; flex-wrap:wrap;' });

  topBar.innerHTML = `
    <div style="font-weight:800; font-size:16px; color:#1e293b; display:flex; align-items:center; gap:6px;">
      <span style="font-size:20px;">▣</span> SAVED QR CODES & TAGS
    </div>
    <div style="flex:1; max-width:340px; position:relative;">
      <input class="qr-search" type="text" placeholder="Search by name, tag, code, metal..." style="width:100%; padding:6px 10px; font-size:13px; font-weight:600; border:1px solid #94a3b8; border-radius:4px; outline:none;">
    </div>
    <div style="display:flex; gap:6px;">
      <button type="button" class="btn-filter-all" style="padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; background:#0284c7; color:#fff; border:none;">All Items</button>
      <button type="button" class="btn-filter-jewel" style="padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; background:#e2e8f0; color:#334155; border:1px solid #cbd5e1;">Jewellery Only</button>
    </div>
    <div style="margin-left:auto; display:flex; gap:8px;">
      <button type="button" class="btn-bulk-print" style="background:#15803d; color:#fff; font-weight:700; font-size:12px; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
        🖨️ Bulk Print All Tags
      </button>
      <button type="button" class="btn-new-item" style="background:#0284c7; color:#fff; font-weight:700; font-size:12px; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
        ＋ New Item (F2)
      </button>
    </div>
  `;

  const mainArea = h('div', { style: 'flex:1; display:flex; overflow:hidden;' });
  const tableBox = h('div', { style: 'flex:1; overflow-y:auto; background:#fff; border-right:1px solid #cbd5e1;' });
  const previewBox = h('div', { style: 'width:320px; background:#f8fafc; padding:16px; display:flex; flex-direction:column; align-items:center; overflow-y:auto; flex-shrink:0;' });

  mainArea.append(tableBox, previewBox);
  container.append(topBar, mainArea);
  w.body.append(container);

  let items: Item[] = [];
  let filterJewel = jewelOnly;
  let searchQ = '';
  let selIdx = 0;

  async function loadData() {
    items = await api<Item[]>('/items').catch(() => []);
    renderList();
  }

  function getVisible(): { item: Item; tag: JewelTag }[] {
    return items.map((it) => ({ item: it, tag: tagOfItem(it) })).filter(({ item: it, tag: t }) => {
      if (filterJewel) {
        if (!t.gw && !t.less && !t.code.startsWith('PA') && !t.code.startsWith('JW')) return false;
      }
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const m = t.name.toLowerCase().includes(q) ||
                  t.code.toLowerCase().includes(q) ||
                  t.metal.toLowerCase().includes(q) ||
                  (it.pack || '').toLowerCase().includes(q);
        if (!m) return false;
      }
      return true;
    });
  }

  function renderList() {
    const list = getVisible();
    if (selIdx >= list.length) selIdx = Math.max(0, list.length - 1);

    if (!list.length) {
      tableBox.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:14px; font-weight:bold;">No QR items found matching filter.</div>';
      renderPreview(null);
      return;
    }

    let rowsHtml = `
      <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
        <thead>
          <tr style="background:#1e293b; color:#fff; position:sticky; top:0; z-index:2;">
            <th style="padding:8px 10px; width:70px;">Print</th>
            <th style="padding:8px 10px; width:45px;">QR</th>
            <th style="padding:8px 10px; width:110px;">Tag / Code</th>
            <th style="padding:8px 10px;">Product Name</th>
            <th style="padding:8px 10px; width:75px; text-align:right;">GW</th>
            <th style="padding:8px 10px; width:75px; text-align:right;">LESS</th>
            <th style="padding:8px 10px; width:75px; text-align:right;">NW</th>
            <th style="padding:8px 10px; width:80px;">MKG</th>
            <th style="padding:8px 10px; width:75px;">Metal</th>
            <th style="padding:8px 10px; width:65px; text-align:right;">Stock</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(({ item: it, tag: t }, i) => {
      const isSel = i === selIdx;
      const bg = isSel ? '#bae6fd' : (i % 2 === 0 ? '#fff' : '#f8fafc');
      const bColor = isSel ? '#0284c7' : '#e2e8f0';
      const svgThumb = jewelTagSvg(t);

      rowsHtml += `
        <tr class="qr-row" data-i="${i}" style="background:${bg}; border-bottom:1px solid ${bColor}; cursor:pointer;">
          <td style="padding:6px 10px;">
            <button type="button" class="row-print-btn" data-i="${i}" style="background:#0284c7; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border:none; border-radius:3px; cursor:pointer;">
              🖨️ Print
            </button>
          </td>
          <td style="padding:4px 10px;">
            <div style="width:26px; height:26px;">${svgThumb}</div>
          </td>
          <td style="padding:6px 10px; font-family:monospace; font-weight:800; color:#0f172a;">${esc(t.code)}</td>
          <td style="padding:6px 10px; font-weight:700; color:#1e293b;">${esc(t.name.toUpperCase())}</td>
          <td style="padding:6px 10px; font-family:monospace; text-align:right;">${t.gw.toFixed(3)}</td>
          <td style="padding:6px 10px; font-family:monospace; text-align:right;">${t.less.toFixed(3)}</td>
          <td style="padding:6px 10px; font-family:monospace; font-weight:800; color:#15803d; text-align:right;">${t.nw.toFixed(3)}</td>
          <td style="padding:6px 10px; font-family:monospace;">${esc(t.mkg)}</td>
          <td style="padding:6px 10px; font-size:11px; font-weight:600;">${esc(t.metal)}</td>
          <td style="padding:6px 10px; font-family:monospace; text-align:right;">${it.stock ?? 0}</td>
        </tr>
      `;
    });

    rowsHtml += '</tbody></table>';
    tableBox.innerHTML = rowsHtml;

    tableBox.querySelectorAll('.qr-row').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const i = Number((tr as HTMLElement).dataset.i);
        selIdx = i;
        if (target.classList.contains('row-print-btn')) {
          printJewelTagWeb(list[i].tag);
        } else {
          renderList();
        }
      });
    });

    renderPreview(list[selIdx]);
  }

  function renderPreview(entry: { item: Item; tag: JewelTag } | null) {
    if (!entry) {
      previewBox.innerHTML = '<div style="color:#94a3b8; font-size:13px; font-weight:600; margin-top:40px;">Select an item to view QR tag</div>';
      return;
    }
    const { item: it, tag: t } = entry;
    const svg = jewelTagSvg(t);

    previewBox.innerHTML = `
      <div style="font-weight:800; font-size:13px; color:#1e3a8a; margin-bottom:8px; text-transform:uppercase;">
        ▣ LIVE SCANNABLE QR
      </div>
      <div style="background:#fff; padding:10px; border:1px solid #cbd5e1; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1); width:130px; height:130px; display:flex; align-items:center; justify-content:center;">
        <div style="width:110px; height:110px;">${svg}</div>
      </div>
      <div style="font-family:monospace; font-size:14px; font-weight:800; color:#0f172a; margin-top:8px;">${esc(t.code)}</div>
      <div style="font-size:12px; font-weight:700; color:#334155; text-align:center; margin-top:2px;">${esc(t.name.toUpperCase())}</div>

      <div style="width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-top:12px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Gross Wt (GW):</span><b style="font-family:monospace;">${t.gw.toFixed(3)}</b></div>
        <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Less Wt (LESS):</span><b style="font-family:monospace;">${t.less.toFixed(3)}</b></div>
        <div style="display:flex; justify-content:space-between; padding:2px 0; border-top:1px dashed #cbd5e1; color:#15803d; font-weight:bold;">
          <span>Net Wt (NW):</span><b style="font-family:monospace;">${t.nw.toFixed(3)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Making (MKG):</span><b style="font-family:monospace;">${esc(t.mkg)}</b></div>
        <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Metal:</span><b>${esc(t.metal)}</b></div>
        <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Current Stock:</span><b>${it.stock ?? 0} ${esc(it.unit ?? '')}</b></div>
      </div>

      <div style="width:100%; display:flex; flex-direction:column; gap:6px; margin-top:14px;">
        <button type="button" class="btn-prev-print" style="width:100%; background:#0284c7; color:#fff; font-weight:700; font-size:13px; padding:8px; border:none; border-radius:4px; cursor:pointer;">
          🖨️ Print Jewellery Tag (Alt+P)
        </button>
        <button type="button" class="btn-prev-edit" style="width:100%; background:#f1f5f9; color:#0f172a; font-weight:700; font-size:12px; padding:6px; border:1px solid #94a3b8; border-radius:4px; cursor:pointer;">
          ✏️ Edit Item (F3)
        </button>
      </div>
    `;

    (previewBox.querySelector('.btn-prev-print') as HTMLButtonElement | null)?.addEventListener('click', () => {
      printJewelTagWeb(t);
    });

    (previewBox.querySelector('.btn-prev-edit') as HTMLButtonElement | null)?.addEventListener('click', async () => {
      const res = await itemForm(it);
      if (res) loadData();
    });
  }

  // Hook search input
  const searchInput = topBar.querySelector('.qr-search') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    searchQ = searchInput.value.trim();
    renderList();
  });

  // Filter buttons
  const btnAll = topBar.querySelector('.btn-filter-all') as HTMLButtonElement;
  const btnJewel = topBar.querySelector('.btn-filter-jewel') as HTMLButtonElement;

  btnAll.addEventListener('click', () => {
    filterJewel = false;
    btnAll.style.background = '#0284c7'; btnAll.style.color = '#fff';
    btnJewel.style.background = '#e2e8f0'; btnJewel.style.color = '#334155';
    renderList();
  });

  btnJewel.addEventListener('click', () => {
    filterJewel = true;
    btnJewel.style.background = '#0284c7'; btnJewel.style.color = '#fff';
    btnAll.style.background = '#e2e8f0'; btnAll.style.color = '#334155';
    renderList();
  });

  if (filterJewel) {
    btnJewel.style.background = '#0284c7'; btnJewel.style.color = '#fff';
    btnAll.style.background = '#e2e8f0'; btnAll.style.color = '#334155';
  }

  // Bulk print button
  topBar.querySelector('.btn-bulk-print')?.addEventListener('click', () => {
    const visible = getVisible().map((x) => x.tag);
    if (!visible.length) { toast('No tags to print', true); return; }
    printMultipleJewelTags(visible);
  });

  // New item button
  topBar.querySelector('.btn-new-item')?.addEventListener('click', async () => {
    const res = await itemForm();
    if (res) loadData();
  });

  // Keyboard controls
  w.onKey = (_e, k) => {
    const list = getVisible();
    if (k === 'ArrowDown') {
      if (selIdx < list.length - 1) { selIdx++; renderList(); }
      return true;
    }
    if (k === 'ArrowUp') {
      if (selIdx > 0) { selIdx--; renderList(); }
      return true;
    }
    if (k === 'Alt+P' || k === 'Alt+p') {
      if (list[selIdx]) printJewelTagWeb(list[selIdx].tag);
      return true;
    }
    if (k === 'F2') {
      itemForm().then((res) => { if (res) loadData(); });
      return true;
    }
    if (k === 'F3' && list[selIdx]) {
      itemForm(list[selIdx].item).then((res) => { if (res) loadData(); });
      return true;
    }
    if (k === 'Escape') {
      w.close();
      return true;
    }
    return false;
  };

  await loadData();
}
