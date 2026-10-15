# Flow Ledger — Web Edition

<img src="public/logo.png" alt="Flow Ledger logo" width="110" align="right">

**Flow Ledger** is a keyboard-first billing, accounting and inventory web app for shops and distributors. Its screens and shortcuts follow the classic MARG ERP 9+ layout, so people used to that software can work in it straight away.

It runs on one PC (or the shop's LAN) with Node.js and a local SQLite database. There is nothing to install besides Node: no database server, no native modules.

## Features
- **Billing:** sale, purchase, counter sale, challans, sale / purchase returns, MODE OF PAYMENT, multi-copy printing
- **Accounts:** receipt, payment, contra, journal, debit / credit notes, bill-by-bill adjustment of receipts
- **Books & reports:** Day Book, Sale Book, All Ledgers (ledger / monthly / daily / summary), trial balance, outstanding, MIS, gross profit, GST reports
- **Inventory:** items with batches, current stock by store, stock register, re-order list
- **Multi-company and multi-year:** each company has its own database file; back up and add financial years
- **Users, roles & permissions:** about 1,150 menu-level permissions, enforced on the server
- **Admin Panel** on its own port for companies, users and roles
- **Personal workspace:** right-click to add / remove buttons on the shortcut panel; Most viewed and Recently viewed lists follow what you actually open

## Requirements
- **Node.js 22.5 or newer** (it uses the built-in `node:sqlite`). Check with `node -v`.

## Getting started
```bash
git clone https://github.com/DeepikaT05/flow-ledger.git
cd flow-ledger
npm install
npm start
```

`npm start` builds the frontend and starts the server:

| Page | URL |
|---|---|
| Flow Ledger (main app) | http://localhost:3000 |
| Admin Panel | http://localhost:3100 |

Set `PORT` / `ADMIN_PORT` to change the ports. Other scripts: `npm run build` (frontend only), `npm run typecheck`.

On the first run the server creates the `data/` folder with a demo company, **TAMRAKAR AGROTECH**, including sample ledgers and about 30 agro products. `data/` is git-ignored: it holds password hashes and business data, so it never goes into the repository.

**Default users:** `NK` / `marg` (SUPERADMIN), `ADMIN` / `admin` (ADMIN) and `USER` / `user` (USER). **Change these passwords straight away.**

## Project structure
```
client/        Main app frontend (TypeScript), bundled to public/app.js
public/        index.html, style.css, logo files, and the built app.js
admin/         Admin Panel frontend (TypeScript), bundled to admin-public/admin.js
admin-public/  Admin Panel page, styles and logo
server/        Express API, SQLite schema / seed data, sessions and permissions
shared/        Permission lists used by both the server and the frontends
data/          Created at runtime: databases and backups (not in git)
```
A file-by-file guide is in [Layout](#layout) below.

---

Start-up order: **User Id / User Password** → **LIST OF COMPANIES** → the company's menu (**A FLOW LEDGER GATEWAY**, B FILES MAINTENANCE, C BACKUP OF FINANCIAL YEAR, D RESTORE BACKUP, E NEW FINANCIAL YEAR, F DELETE FINANCIAL YEAR, G ERROR CHECKINGS & REWRITING) → **SELECT TO EXECUTE** (financial year) → main screen. A wrong User Id is reported straight away, before the password is asked. Quit (Ctrl+Q) logs out and returns to the login box.

On LIST OF COMPANIES, **F2** opens **COMPANY CREATION** and **F3** opens **COMPANY ALTERATION** (SuperAdmin only), laid out as in MARG with the State Code's list on the right. Type a state code (e.g. `22`) in State; Enter / ↓ moves to the next field and Enter on the last field asks **Save ?**. The extra fields (phone, licences and expiry dates, working style, date type, valuation …) are kept in the `details` column of `companies`; the company password is stored only as a hash.

**USER role:** anyone whose role is named `USER` gets MARG's short menu bar instead of the full one — **My Menu** (Bill, Receipt, Contra, Day Book, Sale Book, All Ledgers, Current Stock, SALE RTN, Challan), **Links** and **Exit**. An item shows only while the role may open it, so unticking it in Roles & Permissions hides it. The bar is `USER_MENU` in `client/menu.ts`.

## Users, roles & permissions
- **SUPERADMIN** has every page and feature with no restriction, and is the only role that can manage users and roles. It can't be limited or deleted, and the last SuperAdmin can't be removed or demoted.
- **ADMIN, MANAGER, CASHIER** are seeded as starting points. SuperAdmin can create **any other role name** (e.g. ACCOUNTANT, STORE KEEPER) and tick exactly which pages/features it gets. **Every menu item is a permission** (about 1,150, grouped by top menu → submenu), plus 3 special powers. Items that aren't built yet can be ticked now too. Unticked items disappear from that role's menus. The server works out which screens and API calls a role may use from the items ticked, so hotkeys and quick buttons follow the same ticks. Exit, change user, change company and change password are always available. The list is built from `client/menu.ts` in `shared/menuPerms.ts`. Roles saved with the old 33 permissions are converted automatically on start-up, keeping the access they had.
- Special powers: *see purchase rate, cost, margin & profit* (otherwise shown as `****`), *delete records*, *back-dated entry* (otherwise the date is locked to today).
- Screens: Masters → Passwords & Powers → **Users** (F2 new, F3 change role, F4 reset password, Del delete) and **Roles & Permissions** (↑↓ role, Enter to edit, Space tick, `*` whole group, Ctrl+W save, F2 new role, F3 rename, F5 copy, Del delete). Anyone can use *Change My Password*.
- A restricted user only sees the menus, submenus and quick buttons their role allows; blocked shortcuts say "Access denied".
- **Enforced on the server:** login issues a session token and every API call is checked against the user's current role, so hiding a menu is not the only protection. Role changes apply immediately.
- Limits: sessions live in server memory (restarting the server logs everyone out) and traffic is plain HTTP — keep it on the shop's own machine / LAN, don't expose port 3000 to the internet.

Requires Node 22.5+ (it uses the built-in `node:sqlite`, so nothing native has to be compiled). Delete the `data` folder to start again with the demo data. The demo company also gets 24 mock agro products (pesticides, fertilisers, seeds, tools) from `MOCK_ITEMS` in `server/db.ts`.

## Admin Panel (separate page)
`npm start` also opens a separate admin panel at **http://localhost:3100** (set `ADMIN_PORT` to change it). Only a **SUPERADMIN** can sign in there. It has three sections:
- **Companies**: create, edit, back up, and add the next financial year
- **Users**: create users with any role (including SUPERADMIN / ADMIN), change a role, reset a password, delete
- **Roles & Permissions**: create, rename, copy and delete roles, and tick the 33 permissions per role

It runs in the same server process. Data, sessions and every server-side permission check are shared with the ERP, and the admin port serves only `admin-public/` plus `/api`. The code is in `admin/main.ts` and is bundled to `admin-public/admin.js` by `npm run build`.

**Mobile app later:** the panel is plain HTML/CSS/JS and works on a phone. To turn it into an APK, wrap `admin-public/` with Capacitor (or a WebView app). For that build, set `SERVER` at the top of `admin/main.ts` to the PC's LAN address, e.g. `http://192.168.1.10:3100`. CORS is already enabled on the admin port.

## Companies
- `data/marg.db` holds the users, roles and the list of companies, and is also TAMRAKAR AGROTECH's data. Every other company has its own file in `data/companies/` (created the first time it is opened), so their ledgers, items and bills never mix.
- **LIST OF COMPANIES:** type to jump to a name, ↑↓ to move, Enter / F8 opens the company menu. F2 new company and F3 edit are SuperAdmin only. F5, F6, F7, F9 and Alt+P show "404 — NOT EXIST".
- **Company menu:** press the letter or Enter. A opens SELECT TO EXECUTE. C copies the whole company file to `data/backup/` and fills BACKUP UPTO. E adds the next financial year. C and E are SuperAdmin only. B, D, F and G aren't built yet (404). Esc goes back to the list.
- **SELECT TO EXECUTE:** Enter runs the highlighted year (its dates become the company's period); Esc goes back to the company menu.
- **F1** or **Alt+X** (Hot Keys → Change Company) reopens the list from the main screen without logging out; Esc there keeps the company you had. Each logged-in user has their own open company, and Ctrl+U keeps it.

## Shortcut panel (right side)
The buttons are numbered 1, 2, 3 … n. Right-click a button → **Remove from Shortcut**, **Move to No. …**, **Remove Shortcut by No. …** or **Reset Shortcuts to Default**. Right-click any item in the menus → **Add to Shortcut**, **Add at Shortcut No. …** (or Remove / Move to No., if it is already there). Each user has their own list, saved in that browser (`localStorage`, key `quick:<USER>`); the default list is `QUICK` in `client/menu.ts`.

## Most viewed / Recently viewed (left side)
**Recently viewed** puts the screen opened last at the top; **Most viewed** lists the screens opened most often (ties go to the one opened last). Menus, the shortcut panel, hotkeys (Alt+N, Alt+P …) and the lists themselves all count, and one screen is one entry however it was opened. Exit, change user / company / password are not counted. Each user has their own lists in that browser (`localStorage`, key `seen:<USER>`).

## Layout
| Path | What |
|---|---|
| `server/db.ts` | Schema and seed data, the companies list, and switching to a company's file (`useCompany`) |
| `server/index.ts` | REST API: masters, bills, vouchers, reports. Each posting is written to `ledger_entries` |
| `client/menu.ts` | Full menu tree (MARG layout), the quick buttons on the right, and global hotkeys |
| `client/main.ts` | Menu bar keyboard engine, main screen, calculator and calendar |
| `client/ui.ts` | Window stack, keyboard grid lists, pickers and Enter-to-next forms |
| `client/sale.ts` | The classic SALE ENTRY screen, item / batch windows and MODE OF PAYMENT |
| `client/margui.ts` | The green header bar, MARG popup lists and the red message box |
| `client/startup.ts` | Login box, LIST OF COMPANIES, company menu and the "SELECT TO EXECUTE" year picker |
| `shared/perms.ts` | The permission catalogue, default roles, and which permission each menu action needs (used by both sides) |
| `server/auth.ts` | Sessions, the per-route permission rules, cost masking, users & roles API |
| `client/session.ts`, `client/admin.ts` | Logged-in user / `can()` checks, and the Users + Roles & Permissions screens |
| `client/masters.ts`, `billing.ts`, `vouchers.ts`, `reports.ts` | The other screens |
| `admin/main.ts`, `admin-public/` | The separate Admin Panel (companies, users, roles) on port 3100 |

## Keyboard (same as MARG)
**Global:** Alt+N Sale Bill · Alt+C Challan · Alt+A Counter Sale · Alt+M Modify Bill · Alt+P Purchase · Alt+V Voucher Entry · Alt+I Single Entry · Alt+U Cheques/Cash · Alt+Q PDC · Alt+L All Ledgers · Ctrl+L Ledger list · Ctrl+I Item list · Ctrl+U Change user · F1 Company · F12 Calculator · Shift+F12 Calendar · Alt+F1 Shortcut list · Ctrl+Q Quit

**Login / year screen:** type the user id, Enter, the password, Enter. F2 lists the user names. On the year screen the arrow keys move and Enter runs that year. Ctrl+U later re-opens the login box to change user.

**Menu accelerators:** Alt+E Masters · Alt+T Transactions · Alt+B Books · Alt+S Stocks · Alt+D Daily Reports · Alt+R Reports · Alt+G GST · Alt+F Final Reports · Alt+X Change Company · Ctrl+S Flush Memory. Alt+A stays Counter Sale (as in Marg's own shortcut list), so open Accounts with Alt, then A. These work even while another menu is open.

The menu tree follows Marg's Level 1 → 2 → 3 → 4 layout (e.g. Masters → Ledger Master → Other Masters → Salesman Master). Items that don't have a screen yet — and any letter, number or Alt+key that leads nowhere — show a red **"404 — NOT EXIST"** box (Enter / Esc / Space closes it).

**Menus:** Tap Alt or press F10 to open the menu bar. On the main screen you can also type a menu's underlined letter. Move with the arrow keys, use the underlined letter to jump to an item, press Enter to open it and Esc to go back. Up/Down and Enter work the quick buttons on the right.

**Lists:** Type to search. F2 adds, F3 modifies, Enter opens, Del deletes, F10 prints. In the item list, F10 shows only items in stock.

**Sale / purchase entry (the classic screen):** the cursor starts on Date. Enter opens the LEDGERS window, then PARTY DETAIL for a cash party, then the M.R. list, then the PRODUCT grid. Typing in PRODUCT opens the item window, and choosing an item opens its BATCH window. Enter walks QTY → RATE → DIS1% → next row. Enter on a blank product row (or End / Ctrl+W / F10 from anywhere on the bill) opens MODE OF PAYMENT, where Enter edits the amount for the highlighted mode and End or F10 saves. After saving, **No. of Copies** asks how many to print (default 1): type the number and press Enter to print that many copies, one per page, or Esc to skip printing. To send bills straight to the default printer with no print dialog, start Chrome / Edge with `--kiosk-printing`. The left arrow in the first product cell jumps back to the bill number, Ctrl+Del deletes a row, F2 starts another bill, F11 works out return cash, Alt+F10 shows profit, and Esc shows "Exit W/o Save".

**Inside the windows:** LEDGERS — F2 new, F3 edit, F4/F8 ledger and outstanding, F10 balance-only, F7 all. Item window — F2 new item, F3 edit, F4 register. BATCH — Enter picks the batch. M.R. — F2 adds a salesman, Esc skips.

**Receipt (My Menu → Receipt, Alt+I):** the MARG RECEIPT VOUCHER screen. Enter on the date opens LEDGERS. Choose the party (Cr) and type the amount. For a party with unpaid credit sale bills, Enter then opens **BILL ADJUSTMENT**: ↓ opens the TYPE list (Adj Ref / New Ref / Done / Clear / Save), and you can also press its first letter. **Adj Ref** opens **PENDING INVOICE**, where Space / + selects a bill (filling what is still pending), - unselects, * edits the amount and Enter takes the selection. Bills from an earlier financial year show with `*`. **New Ref** keeps the rest on account. **Done** returns to the voucher, which fills in **Dr CASH**: type a letter there to choose another cash or bank ledger. The narration is filled with "Ag. <bill nos>". Enter on the narration (or End / Ctrl+W) opens **Save / Save & Print / No / Exit**. Save & Print opens **PRINT VOUCHER** (Ledger Heads, Bill Details, Copies; View / Print / Exit). The CUSTOMER STATUS panel on the right shows the party's balance, recent receipts and O/S bills. Settled amounts are kept in `voucher_adjustments`, so a bill's pending balance goes down with each receipt. Modifying an old receipt still uses the plain voucher screen, which leaves its bill adjustments unchanged.

**Contra (My Menu → Contra):** the same screen as Receipt, but both lines list only cash and bank ledgers (Cr = money out of, Dr = money into), and there is no bill adjustment. It prints as CONTRA.

**Day Book / Sale Book (My Menu):** the FROM / TO box comes first (Day Book also asks *Selected Ledger : No/Yes*; Space or Y/N changes it, and Yes shows only entries involving one ledger). Each bill or voucher is one line: DATE, PARTY NAME, REMARK, DEBIT, CREDIT and TYPE (Sale, Cntr, Purc, S.Rt, Rcpt, Pymt, Ctra, Jrnl …). The REMARK and VOUCHER TOTAL footer and the Voucher Detail panel (GST split for bills, ledger lines and adjusted bills for vouchers) follow the highlighted line. F2 changes the dates, F4 switches between narration and number in REMARK, and Enter opens the entry (only if the role may modify it). F10 or Ctrl+P opens **0994 PRINTING**, where you choose Detail, Simple or T-Format, Entry Total, Date Range, Page No., Voucher No. and Narration, then View, Print, Excel (CSV) or Cancel.
- **Enter on a bill line** (in either book) opens **SALE ALTERATION**: the saved bill on the SALE ENTRY screen, read only. The **BILL LEVIES** box shows the bill total, the money received so far (adjustment) and the balance, and CUSTOMER STATUS and Last Bills are shown too. Use ←/→ and Enter, or the underlined letter, for the buttons: **N**ext / P**r**evious (or PgDn / PgUp) walk the bills of that book, **M**odify opens the bill for editing, **P**rint asks for the number of copies, **V**iew shows the print preview, **D**elete removes the bill, De**t**ail shows the GST split and payments, and E**x**it closes it. Modify needs the role's modify permission, and Delete also needs *delete records*. Cancel, Amend, Email and Courier show "404 — NOT EXIST". Enter on a voucher line opens it in the voucher screen.
- **Day Book** shows everything in the period: cash and credit sales, purchases, returns, challans, receipts, payments, contra and journals.
- **Sale Book** shows only sales whose money has been received: cash and counter sales, bills paid on the bill, and credit bills once receipts have settled them in full. Unpaid credit sales appear in the Day Book only. (Sale Register and GSTR-1 still list every sale.)

**All Ledgers (My Menu → All Ledgers, Books → All Ledgers, Alt+L):** the MARG **LEDGER ACCOUNTS** screen. Every ledger is listed with its DEBIT or CREDIT balance "Upto" a date. Cash and bank accounts come first, and parties with unpaid credit bills show in red. Below the list are the **Address** and **Current Status** (Opening, Debit, Credit, Balance, P.D.C., Net, Type) panels, and **CUSTOMER STATUS** is on the right. Type to search (Name ? >>). F2 changes the Upto date, F3 edits the ledger, F10 shows balances only and Alt+P prints the list. Alt+F1, F4, F6, F8, Ctrl+F1 and + show "404 — NOT EXIST".
- **Enter** opens **LEDGER DISPLAY** (FROM / TO), then **Ledger · Monthly · Daily · Summary · Cancel** (Enter or the underlined letter).
- **Ledger** lists DATE, PARTICULARS, TYPE, VCH NO., DEBIT, CREDIT and a running BALANCE, starting with the opening balance and ending with the total and closing. Enter on an entry opens it (bills open in SALE ALTERATION).
- **Monthly** and **Daily** give one line per month or per day with a running balance; Enter on a line opens the Ledger view for that month or day.
- **Summary** totals the entries by type (Sale, Rcpt …) between the opening and the closing.
- F2 goes back to the date box, Alt+P / F10 prints, and Esc goes back.

**Current Stock (My Menu → Current Stock, Stocks → Current Stock):** first **SELECT STORE** with its **CONTROL BOX**: + / - select or unselect one, * / / select or unselect all, Space toggles, Enter selects and executes, Esc exits. This edition keeps all stock in one store, MAIN STORE. Then comes **<STORE> : CLOSING STOCK**: DESCRIPTION, PACKING, STOCK (shown as `-` when nil) and UNIT, with the PurRate / Cost / Margin / M.R.P. / Rate / Company / HSN panel below (cost and margin show `****` for roles without the cost power) and **Batch Detail** on the right. Type a name to jump to it. F3 edits the item, F6 calculates totals, F9 changes the store, F10 shows items in stock only, `*` shows shortage (stock at or below minimum) and Alt+P prints.
- **Enter** opens the item's register for the financial year: BILL NO., DATE, PARTICULARS, RECEIVE, ISSUE and a running BALANCE. Below it are the Batch / Chall. / Rate / NetRate / M.R.P. / Cost details and the **Opening, Sales-S/R, Purchase-P/R, Other, Balance** box. F2 changes the dates, and Enter on a bill opens SALE ALTERATION.

**SALE RTN (My Menu → SALE RTN):** the MARG SALE RETURN ENTRY. Entry numbers run CN000001… (credit note). After LEDGERS (and PARTY DETAIL / M.R.) the cursor goes to **Party No.** (the customer's slip) and **Dt**, then **BILL DETAILS** opens:
- **BATCH SELECTION:** *Manual* (type the returned batch, then "MRP for Search") or *Select From Sold* (only items and batches sold to this party).
- **RETURN OF BILLS:** Multiple, Separate or Bill by Bill.
- **RETURN OF BILL ↓:** ↓ takes the party's last bill (the BILL'S list on the right; ↓/↑ walk it), or type a bill number. DATE and AMOUNT fill in.
- **REASON** is required. LAST BILL NO. / DATE / AMOUNT are shown. **CALCULATION TYPE:** *1 Exclusive* or *9 All Inclusive* (the rate includes GST).
- With a bill chosen, its items are listed: Space / + picks, * all, Enter loads them (qty can then be changed).
- Ctrl+W / End opens **Save In** (Bill/CR/DR Note, Separate, Challan) and then **Save Changes ?**, then No. of Copies. The return credits the party, brings the stock back, and reduces what is pending on the bill it was made against (Receipt PENDING INVOICE, SALE ALTERATION levies, Sale Book).

**Challan (My Menu → Challan):** PURCHASE CHALLAN ENTRY, with the same Entry No. / Party No. / Dt header as SALE RTN. Entry numbers run CP000001…. The rate column is P.RATE. Goods come into stock with no accounting entry, and End / Ctrl+W asks **Save Changes ?**, then No. of Copies. A batch that isn't in the list can be typed (Batch, then MRP for Search).

**Voucher entry:** F2 Payment · F3 Receipt · F4 Journal · F5 Debit Note · F6 Credit Note · F7 Contra · F11 last narration · Ctrl+W save. In journal entries, type D or C (or press Space) to switch between Dr and Cr.

**Reports:** F2 changes the period, Enter drills down to the bill or voucher, and F10 prints.

**Batches in bills.** COMPANY CREATION's Working Style decides batches: *Normal W/o Secondary* keeps none; *Secondary* keeps them, and Selection picks them at sale time — **Self** opens the BATCH window, **Fifo** takes the earliest-expiring batch in stock, **Manual** asks for the batch number. On Purchase / Purchase Challan / Sale Return, **F2** in the BATCH window (or straight away, for an item with no batches yet) asks Batch → Expiry (MM/YY) → M.R.P.; saving the bill creates that batch.

**Deleting entries.** Day Book: **Del** deletes the highlighted bill or voucher (after Yes). Receipt / Payment Book: **Del**. A voucher opened for modify: **Ctrl+D**.
