/**
 * Migration Script: Transfers all data from SQLite (marg.db and data/companies/*.db)
 * to PostgreSQL via Prisma Client.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-prisma.ts
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../server/prisma.ts';

const dataDir = join(process.cwd(), 'data');
const margDbPath = join(dataDir, 'marg.db');

interface SqliteRow {
  [key: string]: unknown;
}

function openSqlite(filePath: string): DatabaseSync | null {
  if (!existsSync(filePath)) return null;
  const d = new DatabaseSync(filePath);
  d.exec('PRAGMA foreign_keys = OFF;');
  return d;
}

async function main() {
  console.log('🚀 Starting SQLite to Prisma PostgreSQL migration...\n');

  if (!existsSync(margDbPath)) {
    console.error(`❌ System database not found at: ${margDbPath}`);
    process.exit(1);
  }

  const sysDb = openSqlite(margDbPath);
  if (!sysDb) {
    console.error('❌ Could not open marg.db');
    process.exit(1);
  }

  // 1. Roles
  console.log('📦 Migrating Roles...');
  try {
    const roles = sysDb.prepare('SELECT * FROM roles').all() as SqliteRow[];
    for (const r of roles) {
      await prisma.role.upsert({
        where: { id: Number(r.id) },
        update: {
          name: String(r.name),
          is_super: Boolean(r.is_super),
          perms: String(r.perms || '[]'),
          menu_perms: Number(r.menu_perms ?? 1),
        },
        create: {
          id: Number(r.id),
          name: String(r.name),
          is_super: Boolean(r.is_super),
          perms: String(r.perms || '[]'),
          menu_perms: Number(r.menu_perms ?? 1),
        },
      });
    }
    console.log(`   ✔ Migrated ${roles.length} roles.`);
  } catch (e: any) {
    console.warn('   ⚠️ Error migrating roles:', e.message);
  }

  // 2. Users
  console.log('👤 Migrating Users...');
  try {
    const users = sysDb.prepare('SELECT * FROM users').all() as SqliteRow[];
    for (const u of users) {
      await prisma.user.upsert({
        where: { id: Number(u.id) },
        update: {
          name: String(u.name),
          salt: String(u.salt),
          hash: String(u.hash),
          isAdmin: Boolean(u.is_admin),
          roleId: u.role_id ? Number(u.role_id) : null,
        },
        create: {
          id: Number(u.id),
          name: String(u.name),
          salt: String(u.salt),
          hash: String(u.hash),
          isAdmin: Boolean(u.is_admin),
          roleId: u.role_id ? Number(u.role_id) : null,
        },
      });
    }
    console.log(`   ✔ Migrated ${users.length} users.`);
  } catch (e: any) {
    console.warn('   ⚠️ Error migrating users:', e.message);
  }

  // 3. Migrations records
  try {
    const migs = sysDb.prepare('SELECT * FROM migrations').all() as SqliteRow[];
    for (const m of migs) {
      await prisma.migration.upsert({
        where: { name: String(m.name) },
        update: {},
        create: { name: String(m.name) },
      });
    }
  } catch {}

  // 4. Companies list
  console.log('🏢 Migrating Companies...');
  let companies: SqliteRow[] = [];
  try {
    companies = sysDb.prepare('SELECT * FROM companies').all() as SqliteRow[];
  } catch {
    companies = [];
  }

  // If no companies in sysDb table, check if company table exists in marg.db itself
  if (companies.length === 0) {
    try {
      const single = sysDb.prepare('SELECT * FROM company WHERE id=1').get() as SqliteRow | undefined;
      if (single) {
        companies.push({
          id: 1,
          name: single.name,
          station: '',
          address1: single.address1,
          address2: single.address2,
          gstin: single.gstin,
          state: single.state,
          file: 'marg.db',
          details: '{}',
        });
      }
    } catch {}
  }

  for (const c of companies) {
    const cid = Number(c.id);
    const cName = String(c.name || 'Company');
    const cFile = String(c.file || 'marg.db');
    console.log(`\n🏢 Processing Company: [${cid}] ${cName} (file: ${cFile})...`);

    await prisma.company.upsert({
      where: { id: cid },
      update: {
        name: cName,
        station: String(c.station || ''),
        address1: c.address1 ? String(c.address1) : null,
        address2: c.address2 ? String(c.address2) : null,
        gstin: c.gstin ? String(c.gstin) : null,
        state: c.state ? String(c.state) : null,
        details: String(c.details || '{}'),
      },
      create: {
        id: cid,
        name: cName,
        station: String(c.station || ''),
        address1: c.address1 ? String(c.address1) : null,
        address2: c.address2 ? String(c.address2) : null,
        gstin: c.gstin ? String(c.gstin) : null,
        state: c.state ? String(c.state) : null,
        details: String(c.details || '{}'),
      },
    });

    const compDbPath = join(dataDir, cFile);
    const compDb = cFile === 'marg.db' ? sysDb : openSqlite(compDbPath);
    if (!compDb) {
      console.warn(`   ⚠️ Could not open company database file: ${compDbPath}`);
      continue;
    }

    // Company Years
    try {
      const years = compDb.prepare('SELECT * FROM company_years').all() as SqliteRow[];
      for (const y of years) {
        await prisma.companyYear.upsert({
          where: { companyId_code: { companyId: cid, code: String(y.code) } },
          update: {
            fyStart: String(y.fy_start),
            fyEnd: String(y.fy_end),
            backupUpto: y.backup_upto ? String(y.backup_upto) : null,
            freezUpto: y.freez_upto ? String(y.freez_upto) : null,
          },
          create: {
            id: Number(y.id),
            companyId: cid,
            code: String(y.code),
            fyStart: String(y.fy_start),
            fyEnd: String(y.fy_end),
            backupUpto: y.backup_upto ? String(y.backup_upto) : null,
            freezUpto: y.freez_upto ? String(y.freez_upto) : null,
          },
        });
      }
      console.log(`   ✔ Company Years: ${years.length}`);
    } catch {}

    // Account Groups
    const groupMap = new Map<number, number>();
    try {
      const groups = compDb.prepare('SELECT * FROM account_groups').all() as SqliteRow[];
      for (const g of groups) {
        const ag = await prisma.accountGroup.upsert({
          where: { companyId_name: { companyId: cid, name: String(g.name) } },
          update: {
            nature: String(g.nature),
            isSystem: Boolean(g.is_system),
          },
          create: {
            companyId: cid,
            name: String(g.name),
            nature: String(g.nature),
            isSystem: Boolean(g.is_system),
          },
        });
        groupMap.set(Number(g.id), ag.id);
      }
      console.log(`   ✔ Account Groups: ${groups.length}`);
    } catch (e: any) {
      console.warn('   ⚠️ Error in account groups:', e.message);
    }

    // Ledgers
    const ledgerMap = new Map<number, number>();
    try {
      const ledgers = compDb.prepare('SELECT * FROM ledgers').all() as SqliteRow[];
      for (const l of ledgers) {
        const newGroupId = groupMap.get(Number(l.group_id)) || Number(l.group_id);
        const led = await prisma.ledger.upsert({
          where: { companyId_name: { companyId: cid, name: String(l.name) } },
          update: {
            groupId: newGroupId,
            address: l.address ? String(l.address) : null,
            city: l.city ? String(l.city) : null,
            phone: l.phone ? String(l.phone) : null,
            gstin: l.gstin ? String(l.gstin) : null,
            state: l.state ? String(l.state) : null,
            opening: Number(l.opening || 0),
            openingType: String(l.opening_type || 'Dr'),
            creditLimit: Number(l.credit_limit || 0),
            isSystem: Boolean(l.is_system),
            details: String(l.details || '{}'),
          },
          create: {
            companyId: cid,
            name: String(l.name),
            groupId: newGroupId,
            address: l.address ? String(l.address) : null,
            city: l.city ? String(l.city) : null,
            phone: l.phone ? String(l.phone) : null,
            gstin: l.gstin ? String(l.gstin) : null,
            state: l.state ? String(l.state) : null,
            opening: Number(l.opening || 0),
            openingType: String(l.opening_type || 'Dr'),
            creditLimit: Number(l.credit_limit || 0),
            isSystem: Boolean(l.is_system),
            details: String(l.details || '{}'),
          },
        });
        ledgerMap.set(Number(l.id), led.id);
      }
      console.log(`   ✔ Ledgers: ${ledgers.length}`);
    } catch (e: any) {
      console.warn('   ⚠️ Error in ledgers:', e.message);
    }

    // Items
    const itemMap = new Map<number, number>();
    try {
      const items = compDb.prepare('SELECT * FROM items').all() as SqliteRow[];
      for (const it of items) {
        const packVal = it.pack !== undefined && it.pack !== null ? String(it.pack) : '';
        const itemRec = await prisma.item.upsert({
          where: {
            companyId_name_pack: {
              companyId: cid,
              name: String(it.name),
              pack: packVal,
            },
          },
          update: {
            companyName: it.company ? String(it.company) : null,
            unit: String(it.unit || 'PCS'),
            hsn: it.hsn ? String(it.hsn) : null,
            gstRate: Number(it.gst_rate || 0),
            mrp: Number(it.mrp || 0),
            saleRate: Number(it.sale_rate || 0),
            purchaseRate: Number(it.purchase_rate || 0),
            openingStock: Number(it.opening_stock || 0),
            minStock: Number(it.min_stock || 0),
            reorderQty: Number(it.reorder_qty || 0),
            expiry: it.expiry ? String(it.expiry) : '',
            batch: it.batch ? String(it.batch) : '',
            details: String(it.details || '{}'),
          },
          create: {
            companyId: cid,
            name: String(it.name),
            companyName: it.company ? String(it.company) : null,
            unit: String(it.unit || 'PCS'),
            pack: packVal,
            hsn: it.hsn ? String(it.hsn) : null,
            gstRate: Number(it.gst_rate || 0),
            mrp: Number(it.mrp || 0),
            saleRate: Number(it.sale_rate || 0),
            purchaseRate: Number(it.purchase_rate || 0),
            openingStock: Number(it.opening_stock || 0),
            minStock: Number(it.min_stock || 0),
            reorderQty: Number(it.reorder_qty || 0),
            expiry: it.expiry ? String(it.expiry) : '',
            batch: it.batch ? String(it.batch) : '',
            details: String(it.details || '{}'),
          },
        });
        itemMap.set(Number(it.id), itemRec.id);
      }
      console.log(`   ✔ Items: ${items.length}`);
    } catch (e: any) {
      console.warn('   ⚠️ Error in items:', e.message);
    }

    // Batches
    const batchMap = new Map<number, number>();
    try {
      const batches = compDb.prepare('SELECT * FROM batches').all() as SqliteRow[];
      for (const b of batches) {
        const newItemId = itemMap.get(Number(b.item_id));
        if (!newItemId) continue;
        const bRec = await prisma.batch.create({
          data: {
            companyId: cid,
            itemId: newItemId,
            batch: String(b.batch || ''),
            expiry: b.expiry ? String(b.expiry) : null,
            mrp: Number(b.mrp || 0),
            rate: Number(b.rate || 0),
            fRate: Number(b.f_rate || 0),
            purchaseRate: Number(b.purchase_rate || 0),
            openingQty: Number(b.opening_qty || 0),
            supplier: b.supplier ? String(b.supplier) : null,
            invoiceNo: b.invoice_no ? String(b.invoice_no) : null,
            invoiceDate: b.invoice_date ? String(b.invoice_date) : null,
          },
        });
        batchMap.set(Number(b.id), bRec.id);
      }
      console.log(`   ✔ Batches: ${batches.length}`);
    } catch (e: any) {
      console.warn('   ⚠️ Error in batches:', e.message);
    }

    // Salesmen
    try {
      const salesmen = compDb.prepare('SELECT * FROM salesmen').all() as SqliteRow[];
      for (const s of salesmen) {
        await prisma.salesman.upsert({
          where: { companyId_name: { companyId: cid, name: String(s.name) } },
          update: { area: s.area ? String(s.area) : null },
          create: {
            companyId: cid,
            name: String(s.name),
            area: s.area ? String(s.area) : null,
          },
        });
      }
      console.log(`   ✔ Salesmen: ${salesmen.length}`);
    } catch {}

    // Bills & Bill Items
    try {
      const bills = compDb.prepare('SELECT * FROM bills').all() as SqliteRow[];
      for (const bl of bills) {
        const newPartyId = ledgerMap.get(Number(bl.party_id));
        if (!newPartyId) continue;

        const billRec = await prisma.bill.upsert({
          where: {
            companyId_type_no: {
              companyId: cid,
              type: String(bl.type),
              no: String(bl.no),
            },
          },
          update: {
            date: String(bl.date),
            partyId: newPartyId,
            mode: String(bl.mode || 'CREDIT'),
            gross: Number(bl.gross || 0),
            discount: Number(bl.discount || 0),
            taxable: Number(bl.taxable || 0),
            tax: Number(bl.tax || 0),
            cdPct: Number(bl.cd_pct || 0),
            cdAmt: Number(bl.cd_amt || 0),
            freight: Number(bl.freight || 0),
            otherCharges: Number(bl.other_charges || 0),
            roundOff: Number(bl.round_off || 0),
            net: Number(bl.net || 0),
            narration: bl.narration ? String(bl.narration) : null,
            refNo: bl.ref_no ? String(bl.ref_no) : null,
            refDate: bl.ref_date ? String(bl.ref_date) : null,
            reason: bl.reason ? String(bl.reason) : null,
            againstBillId: bl.against_bill_id ? Number(bl.against_bill_id) : null,
            calcType: bl.calc_type ? String(bl.calc_type) : null,
            mrId: bl.mr_id ? Number(bl.mr_id) : null,
            saleType: String(bl.sale_type || 'LOCAL'),
            walkinName: bl.walkin_name ? String(bl.walkin_name) : null,
            walkinGstin: bl.walkin_gstin ? String(bl.walkin_gstin) : null,
            walkinMobile: bl.walkin_mobile ? String(bl.walkin_mobile) : null,
            walkinAddress: bl.walkin_address ? String(bl.walkin_address) : null,
          },
          create: {
            companyId: cid,
            type: String(bl.type),
            no: String(bl.no),
            date: String(bl.date),
            partyId: newPartyId,
            mode: String(bl.mode || 'CREDIT'),
            gross: Number(bl.gross || 0),
            discount: Number(bl.discount || 0),
            taxable: Number(bl.taxable || 0),
            tax: Number(bl.tax || 0),
            cdPct: Number(bl.cd_pct || 0),
            cdAmt: Number(bl.cd_amt || 0),
            freight: Number(bl.freight || 0),
            otherCharges: Number(bl.other_charges || 0),
            roundOff: Number(bl.round_off || 0),
            net: Number(bl.net || 0),
            narration: bl.narration ? String(bl.narration) : null,
            refNo: bl.ref_no ? String(bl.ref_no) : null,
            refDate: bl.ref_date ? String(bl.ref_date) : null,
            reason: bl.reason ? String(bl.reason) : null,
            againstBillId: bl.against_bill_id ? Number(bl.against_bill_id) : null,
            calcType: bl.calc_type ? String(bl.calc_type) : null,
            mrId: bl.mr_id ? Number(bl.mr_id) : null,
            saleType: String(bl.sale_type || 'LOCAL'),
            walkinName: bl.walkin_name ? String(bl.walkin_name) : null,
            walkinGstin: bl.walkin_gstin ? String(bl.walkin_gstin) : null,
            walkinMobile: bl.walkin_mobile ? String(bl.walkin_mobile) : null,
            walkinAddress: bl.walkin_address ? String(bl.walkin_address) : null,
          },
        });

        // Bill items
        const bItems = compDb.prepare('SELECT * FROM bill_items WHERE bill_id=?').all(Number(bl.id)) as SqliteRow[];
        for (const bi of bItems) {
          const newItemId = itemMap.get(Number(bi.item_id));
          if (!newItemId) continue;
          await prisma.billItem.create({
            data: {
              billId: billRec.id,
              itemId: newItemId,
              batchId: bi.batch_id ? batchMap.get(Number(bi.batch_id)) || null : null,
              batch: bi.batch ? String(bi.batch) : null,
              expiry: bi.expiry ? String(bi.expiry) : null,
              qty: Number(bi.qty || 0),
              free: Number(bi.free || 0),
              rate: Number(bi.rate || 0),
              discPct: Number(bi.disc_pct || 0),
              gstRate: Number(bi.gst_rate || 0),
              taxable: Number(bi.taxable || 0),
              tax: Number(bi.tax || 0),
              amount: Number(bi.amount || 0),
              mrp: Number(bi.mrp || 0),
            },
          });
        }
      }
      console.log(`   ✔ Bills: ${bills.length}`);
    } catch (e: any) {
      console.warn('   ⚠️ Error in bills:', e.message);
    }
  }

  console.log('\n🎉 SQLite to Prisma migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Fatal migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
