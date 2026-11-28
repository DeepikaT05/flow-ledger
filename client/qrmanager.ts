import { api, esc, h, toast } from './ui.ts';
import { margWin, margBar } from './margui.ts';
import { printJewelTagWeb, printMultipleJewelTags, tagOfItem, jewelTagSvg, barcode128Svg, JewelTag } from './jeweltag.ts';
import { printAgroStickerWeb, printMultipleAgroStickersWeb, agroStickerSingleSvg, agroTagOfItem, AgroSticker } from './agrotag.ts';
import { itemForm, type Item } from './masters.ts';
import { isJewellery } from './jewellery.ts';

export async function qrManagerScreen(jewelOnly = false) {
  const co = await api<any>('/company').catch(() => ({}));
  const isJewel = isJewellery(co?.business_type);

  if (jewelOnly && !isJewel) {
    toast('Jewellery Tag Master is only available for Jewellery companies', true);
    return;
  }

  const title = isJewel ? 'SAVED QR MASTER (ALL JEWELLERY TAGS)' : 'SAVED BARCODE & QR MASTER (PRODUCT STICKERS)';
  const w = margWin(title);
  w.setFoot('<span><b>Enter/Space</b>-Preview</span><span><b>Alt+P</b>-Print Tag/Sticker</span><span><b>F2</b>-New Item</span><span><b>F3</b>-Edit Item</span><span><b>Esc</b>-Exit</span>');

  const container = h('div', { class: 'qr-mgr-wrap', style: 'display:flex; flex-direction:column; height:100%; background:#f1f5f9;' });
  const topBar = h('div', { style: 'padding:8px 16px; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:12px; flex-wrap:wrap;' });

  const filterButtonsHtml = isJewel ? `
    <div style="display:flex; gap:6px;">
      <button type="button" class="btn-filter-all" style="padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; background:#0284c7; color:#fff; border:none;">All Items</button>
      <button type="button" class="btn-filter-jewel" style="padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; background:#e2e8f0; color:#334155; border:1px solid #cbd5e1;">Jewellery Only</button>
    </div>
  ` : '';

  topBar.innerHTML = `
    <div style="font-weight:800; font-size:16px; color:#1e293b; display:flex; align-items:center; gap:6px;">
      <span style="font-size:20px;">${isJewel ? '🏷️' : '📦'}</span> ${isJewel ? 'SAVED JEWELLERY TAGS' : 'SAVED PRODUCT STICKERS & QR'}
    </div>
    <div style="flex:1; max-width:340px; position:relative;">
      <input class="qr-search" type="text" placeholder="Search by name, code, batch, rate..." style="width:100%; padding:6px 10px; font-size:13px; font-weight:600; border:1px solid #94a3b8; border-radius:4px; outline:none;">
    </div>
    ${filterButtonsHtml}
    <div style="margin-left:auto; display:flex; gap:8px;">
      <button type="button" class="btn-bulk-print" style="background:#15803d; color:#fff; font-weight:700; font-size:12px; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
        🖨️ Bulk Print All ${isJewel ? 'Tags' : 'Stickers'}
      </button>
      <button type="button" class="btn-new-item" style="background:#0284c7; color:#fff; font-weight:700; font-size:12px; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
        ＋ New Item (F2)
      </button>
    </div>
  `;

  const mainArea = h('div', { style: 'flex:1; display:flex; overflow:hidden;' });
  const tableBox = h('div', { style: 'flex:1; overflow-y:auto; background:#fff; border-right:1px solid #cbd5e1;' });
  const previewBox = h('div', { style: `${isJewel ? 'width:320px;' : 'width:340px;'} background:#f8fafc; padding:16px; display:flex; flex-direction:column; align-items:center; overflow-y:auto; flex-shrink:0;` });

  mainArea.append(tableBox, previewBox);
  container.append(topBar, mainArea);
  w.body.append(container);

  let items: Item[] = [];
  let filterJewel = isJewel && jewelOnly;
  let searchQ = '';
  let selIdx = 0;

  async function loadData() {
    items = await api<Item[]>('/items').catch(() => []);
    renderList();
  }

  function getVisible(): { item: Item; tag: JewelTag; agro: AgroSticker }[] {
    return items.map((it) => ({
      item: it,
      tag: tagOfItem(it),
      agro: agroTagOfItem(it, co),
    })).filter(({ item: it, tag: t, agro: a }) => {
      if (isJewel && filterJewel) {
        const hasJewelInfo = t.gw > 0 || t.less > 0 || t.nw > 0 || t.metal === 'GOLD' || t.metal === 'SILVER' || (it.pack && /GM/i.test(it.pack));
        if (!hasJewelInfo && !t.code.startsWith('PA') && !t.code.startsWith('JW')) return false;
      }
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const m = t.name.toLowerCase().includes(q) ||
                  t.code.toLowerCase().includes(q) ||
                  a.batch.toLowerCase().includes(q) ||
                  String(a.rate).toLowerCase().includes(q) ||
                  (t.metal || '').toLowerCase().includes(q) ||
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
      tableBox.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-size:14px; font-weight:bold;">No items found matching filter.</div>';
      renderPreview(null);
      return;
    }

    let rowsHtml = '';
    if (isJewel) {
      rowsHtml = `
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
    } else {
      // Agrotech & non-jewellery columns
      rowsHtml = `
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
          <thead>
            <tr style="background:#1e293b; color:#fff; position:sticky; top:0; z-index:2;">
              <th style="padding:8px 10px; width:70px;">Print</th>
              <th style="padding:8px 10px; width:110px;">Barcode / Code</th>
              <th style="padding:8px 10px;">Product Name</th>
              <th style="padding:8px 10px; width:90px;">Batch</th>
              <th style="padding:8px 10px; width:80px;">Expiry</th>
              <th style="padding:8px 10px; width:85px; text-align:right;">Rate (₹)</th>
              <th style="padding:8px 10px; width:75px; text-align:right;">Stock</th>
            </tr>
          </thead>
          <tbody>
      `;
      list.forEach(({ item: it, agro: a }, i) => {
        const isSel = i === selIdx;
        const bg = isSel ? '#bae6fd' : (i % 2 === 0 ? '#fff' : '#f8fafc');
        const bColor = isSel ? '#0284c7' : '#e2e8f0';
        rowsHtml += `
          <tr class="qr-row" data-i="${i}" style="background:${bg}; border-bottom:1px solid ${bColor}; cursor:pointer;">
            <td style="padding:6px 10px;">
              <button type="button" class="row-print-btn" data-i="${i}" style="background:#15803d; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border:none; border-radius:3px; cursor:pointer;">
                🖨️ Print
              </button>
            </td>
            <td style="padding:6px 10px; font-family:monospace; font-weight:800; color:#0f172a;">${esc(a.code)}</td>
            <td style="padding:6px 10px; font-weight:700; color:#1e293b;">${esc(a.name.toUpperCase())}</td>
            <td style="padding:6px 10px; font-family:monospace;">${esc(a.batch)}</td>
            <td style="padding:6px 10px; font-family:monospace;">${esc(a.exp)}</td>
            <td style="padding:6px 10px; font-family:monospace; font-weight:800; color:#0f766e; text-align:right;">₹${esc(String(a.rate))}</td>
            <td style="padding:6px 10px; font-family:monospace; text-align:right;">${it.stock ?? 0} ${esc(it.unit ?? '')}</td>
          </tr>
        `;
      });
      rowsHtml += '</tbody></table>';
    }

    tableBox.innerHTML = rowsHtml;

    tableBox.querySelectorAll('.qr-row').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const i = Number((tr as HTMLElement).dataset.i);
        selIdx = i;
        if (target.classList.contains('row-print-btn')) {
          if (isJewel) {
            printJewelTagWeb(list[i].tag);
          } else {
            printAgroStickerWeb(list[i].agro, '2up');
          }
        } else {
          renderList();
        }
      });
    });

    renderPreview(list[selIdx]);
  }

  function renderPreview(entry: { item: Item; tag: JewelTag; agro: AgroSticker } | null) {
    if (!entry) {
      previewBox.innerHTML = '<div style="color:#94a3b8; font-size:13px; font-weight:600; margin-top:40px;">Select an item to view preview</div>';
      return;
    }
    const { item: it, tag: t, agro: a } = entry;

    if (isJewel) {
      const svg = jewelTagSvg(t);
      const bSvg = barcode128Svg(t.code, 26, 1.15);

      previewBox.innerHTML = `
        <div style="width:100%; background:#fff; border:1.5px solid #0f172a; border-radius:6px; padding:8px 10px; box-sizing:border-box; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-bottom:10px;">
          <div style="font-size:9px; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:2px;">📦 PHYSICAL STICKER (1D)</div>
          <div style="font-family:monospace; font-size:15px; font-weight:900; color:#000; letter-spacing:1px;">${esc(t.code)}</div>
          <div style="width:100%; height:26px; margin:4px 0;">${bSvg}</div>
          <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:#000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(t.name)}</div>
        </div>

        <div style="width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:8px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center;">
          <div style="font-size:9px; font-weight:800; color:#0284c7; text-transform:uppercase; margin-bottom:4px;">▣ 2D QR CODE</div>
          <div style="width:84px; height:84px;">${svg}</div>
        </div>

        <div style="width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-top:10px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Gross Wt (GW):</span><b style="font-family:monospace;">${t.gw.toFixed(3)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Less Wt (LESS):</span><b style="font-family:monospace;">${t.less.toFixed(3)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0; border-top:1px dashed #cbd5e1; color:#15803d; font-weight:bold;">
            <span>Net Wt (NW):</span><b style="font-family:monospace;">${t.nw.toFixed(3)}</b>
          </div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Making (MKG):</span><b style="font-family:monospace;">${esc(t.mkg)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Metal:</span><b>${esc(t.metal)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Current Stock:</span><b>${it.stock ?? 0} ${esc(it.unit ?? '')}</b></div>
        </div>

        <div style="width:100%; display:flex; flex-direction:column; gap:6px; margin-top:12px;">
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-prev-print-dual" style="flex:1; background:#0284c7; color:#fff; font-weight:700; font-size:12px; padding:8px 4px; border:none; border-radius:4px; cursor:pointer;">
              🏷️ Dual Tag
            </button>
            <button type="button" class="btn-prev-print-sticker" style="flex:1; background:#0f766e; color:#fff; font-weight:700; font-size:12px; padding:8px 4px; border:none; border-radius:4px; cursor:pointer;">
              📦 Barcode Sticker
            </button>
          </div>
          <button type="button" class="btn-prev-edit" style="width:100%; background:#f1f5f9; color:#0f172a; font-weight:700; font-size:12px; padding:6px; border:1px solid #94a3b8; border-radius:4px; cursor:pointer;">
            ✏️ Edit Item (F3)
          </button>
        </div>
      `;

      (previewBox.querySelector('.btn-prev-print-dual') as HTMLButtonElement | null)?.addEventListener('click', () => {
        printJewelTagWeb(t, 'dual');
      });
      (previewBox.querySelector('.btn-prev-print-sticker') as HTMLButtonElement | null)?.addEventListener('click', () => {
        printJewelTagWeb(t, 'sticker');
      });
    } else {
      // Agrotech preview
      const svgAgro = agroStickerSingleSvg(a, 0, 0);

      previewBox.innerHTML = `
        <div style="width:100%; background:#fff; border:1px solid #0f172a; border-radius:6px; padding:6px; box-sizing:border-box; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-bottom:10px;">
          <div style="font-size:9px; font-weight:800; color:#0f766e; text-transform:uppercase; margin-bottom:4px;">📦 AGROTECH STICKER PREVIEW (50 × 25 mm)</div>
          <div style="width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 25" width="100%" height="130px" shape-rendering="crispEdges">
              ${svgAgro}
            </svg>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:4px;">Scannable QR includes company, product, batch, exp, rate & code</div>
        </div>

        <div style="width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Company:</span><b style="font-size:11px;">${esc(a.company)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Product:</span><b>${esc(a.name)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Batch:</span><b style="font-family:monospace;">${esc(a.batch)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Expiry:</span><b style="font-family:monospace;">${esc(a.exp)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0; border-top:1px dashed #cbd5e1; color:#0f766e; font-weight:bold;">
            <span>Rate:</span><b style="font-family:monospace; font-size:14px;">₹${esc(String(a.rate))}</b>
          </div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Barcode / Code:</span><b style="font-family:monospace;">${esc(a.code)}</b></div>
          <div style="display:flex; justify-content:space-between; padding:2px 0;"><span>Stock:</span><b>${it.stock ?? 0} ${esc(it.unit ?? '')}</b></div>
        </div>

        <div style="width:100%; display:flex; flex-direction:column; gap:6px; margin-top:12px;">
          <button type="button" class="btn-prev-print-2up" style="width:100%; background:#15803d; color:#fff; font-weight:700; font-size:12px; padding:8px 4px; border:none; border-radius:4px; cursor:pointer;">
            🏷️ Print 2-Up Stickers (104 × 25 mm)
          </button>
          <button type="button" class="btn-prev-print-1up" style="width:100%; background:#0284c7; color:#fff; font-weight:700; font-size:12px; padding:8px 4px; border:none; border-radius:4px; cursor:pointer;">
            📦 Print Single Sticker (50 × 25 mm)
          </button>
          <button type="button" class="btn-prev-edit" style="width:100%; background:#f1f5f9; color:#0f172a; font-weight:700; font-size:12px; padding:6px; border:1px solid #94a3b8; border-radius:4px; cursor:pointer;">
            ✏️ Edit Item (F3)
          </button>
        </div>
      `;

      (previewBox.querySelector('.btn-prev-print-2up') as HTMLButtonElement | null)?.addEventListener('click', () => {
        printAgroStickerWeb(a, '2up');
      });
      (previewBox.querySelector('.btn-prev-print-1up') as HTMLButtonElement | null)?.addEventListener('click', () => {
        printAgroStickerWeb(a, '1up');
      });
    }

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

  // Filter buttons if jewellery
  if (isJewel) {
    const btnAll = topBar.querySelector('.btn-filter-all') as HTMLButtonElement;
    const btnJewel = topBar.querySelector('.btn-filter-jewel') as HTMLButtonElement;

    btnAll?.addEventListener('click', () => {
      filterJewel = false;
      btnAll.style.background = '#0284c7'; btnAll.style.color = '#fff';
      btnJewel.style.background = '#e2e8f0'; btnJewel.style.color = '#334155';
      renderList();
    });

    btnJewel?.addEventListener('click', () => {
      filterJewel = true;
      btnJewel.style.background = '#0284c7'; btnJewel.style.color = '#fff';
      btnAll.style.background = '#e2e8f0'; btnAll.style.color = '#334155';
      renderList();
    });

    if (filterJewel) {
      btnJewel.style.background = '#0284c7'; btnJewel.style.color = '#fff';
      btnAll.style.background = '#e2e8f0'; btnAll.style.color = '#334155';
    }
  }

  // Bulk print button
  topBar.querySelector('.btn-bulk-print')?.addEventListener('click', () => {
    const visible = getVisible();
    if (!visible.length) { toast('No items to print', true); return; }
    if (isJewel) {
      printMultipleJewelTags(visible.map((x) => x.tag));
    } else {
      printMultipleAgroStickersWeb(visible.map((x) => x.agro), '2up');
    }
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
      if (list[selIdx]) {
        if (isJewel) {
          printJewelTagWeb(list[selIdx].tag);
        } else {
          printAgroStickerWeb(list[selIdx].agro, '2up');
        }
      }
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
