# Flow Ledger Mobile (React Native)

A production-ready React Native application for **Flow Ledger / Marg ERP 9+**, designed specifically with:
- **6 Core Modules**:
  1. 🛒 **Sale**: Sale Invoices, Bill Alteration, Item & Batch Selection, GST & Tax Calculation.
  2. 📥 **Purchase**: Inward Invoices, Supplier Selection, Purchase Alteration.
  3. 💵 **Receipt**: Customer Collections, Cash / Bank Deposit, Cash Discounting.
  4. 💸 **Payment**: Supplier Payments, Expense Payments from Cash / Bank.
  5. 🔄 **Contra**: Cash ↔ Bank Internal Fund Transfers.
  6. 📑 **Ledger**: Sundry Debtors, Sundry Creditors, Cash/Bank, Running Account Statements.
- **Strict Role Permissions**:
  - **View**: ✅ Full access to all transactions, accounts, and reports.
  - **Create**: ✅ Enter new Sales, Purchases, Receipts, Payments, Contras, and Ledgers.
  - **Modify (Edit)**: ✅ Alter existing bills, vouchers, and accounts.
  - **Delete**: ❌ **STRICTLY LOCKED / DISABLED** across the mobile application. No delete buttons, no delete API endpoints.
- **Live Real Data**: Connects directly to the live Flow Ledger backend instance (`https://flowledger.stafftrack.cloud/api` by default, or configurable on the Login screen).

---

## Project Structure

```
mobile/
├── App.tsx                     # App entry point (SafeArea & AuthProvider)
├── app.json                    # Expo configuration
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript config
└── src/
    ├── config.ts               # Backend API URL configuration
    ├── theme.ts                # Colours, module accents (Sale teal, Purchase blue, …)
    ├── menus.ts                # The 6 modules' menus & submenus (mirrors the web menu) + permission filter
    ├── labels.ts               # How each bill / voucher type behaves (party group, inward, reason…)
    ├── utils/format.ts         # ₹ money, DD-MM-YYYY dates, period presets
    ├── types/index.ts          # Shapes exactly as server/index.ts returns them
    ├── api/
    │   ├── client.ts           # HTTP client with token session
    │   └── services.ts         # Bills, vouchers, ledgers, items, reports endpoints
    ├── context/
    │   └── AuthContext.tsx     # Session, company selection, can(perm) / canModule()
    ├── components/
    │   ├── ui.tsx              # Screen, TopBar, Card, fields, period chips, searchable picker
    │   └── LineEditor.tsx      # Bill line: qty / free / rate / disc / GST (+ batch, expiry, MRP inward)
    ├── navigation/
    │   └── AppNavigator.tsx    # Login → Company → Home → module menus & screens
    └── screens/
        ├── LoginScreen.tsx
        ├── CompanySelectScreen.tsx  # LIST OF COMPANIES
        ├── HomeScreen.tsx           # Live MIS (sale, purchase, receipt, payment, cash, bank, O/s) + 6 modules
        ├── MenuScreen.tsx           # One menu level; submenus open nested MenuScreens
        ├── BillListScreen.tsx       # Any bill type(s): modify lists, registers, party transaction
        ├── BillDetailScreen.tsx
        ├── BillEntryScreen.tsx      # Sale, Challan, Counter Sale, Sale Return, Purchase, P.Challan, P.Return
        ├── VoucherListScreen.tsx    # Receipt / Payment / Contra / Journal / Note books
        ├── VoucherDetailScreen.tsx
        ├── VoucherEntryScreen.tsx   # Receipt & Payment with bill adjustment, Contra, Journal, Dr/Cr Notes
        ├── LedgerListScreen.tsx
        ├── LedgerStatementScreen.tsx
        ├── LedgerEntryScreen.tsx
        ├── GroupEntryScreen.tsx
        ├── PartyStatusScreen.tsx    # Customer / Supplier status
        └── ReportScreen.tsx         # O/s, ageing, trial balance, day book, sale book, G.P., all ledgers…
```

---

## How to Run the App

### 1. Install Dependencies
Open terminal in the `mobile` directory:
```bash
cd mobile
npm install
```

### 2. Start the App (Expo)
```bash
npx expo start
```
- Press `a` to open in Android Emulator / Phone (Expo Go)
- Press `i` to open in iOS Simulator (macOS)
- Press `w` to open in Web Browser

### 3. Connect to Backend
On the **Login Screen**:
- Default credentials: User `NK`, Password `marg` (or any operator user created in Flow Ledger).
- Tap **Configure Backend Server URL** if you want to connect to a local development machine (e.g. `http://192.168.1.5:3200/api`) or use the default cloud server (`https://flowledger.stafftrack.cloud/api`).

