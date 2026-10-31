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
    ├── types/
    │   └── index.ts            # Type definitions (Bill, Voucher, Ledger, Item, etc.)
    ├── api/
    │   ├── client.ts           # HTTP Client with Cookie/Token Session
    │   └── services.ts         # Sale, Purchase, Receipt, Payment, Contra, Ledger APIs
    ├── context/
    │   └── AuthContext.tsx     # Session management & Delete-Protected Permissions
    ├── components/
    │   ├── Header.tsx          # Reusable Marg-style Header with Back & Action button
    │   ├── PartyPickerModal.tsx# Fast search & selection for Debtors / Creditors
    │   └── ItemPickerModal.tsx # Product & Batch selection with Stock & Rates
    ├── navigation/
    │   └── AppNavigator.tsx    # NativeStack navigation for all 6 modules
    └── screens/
        ├── LoginScreen.tsx     # Sign In with server URL override
        ├── DashboardScreen.tsx # Overview KPIs, live balances & module launcher
        ├── SaleListScreen.tsx  # Sale bills listing & search
        ├── SaleEntryScreen.tsx # Sale invoice creation & modification
        ├── SaleDetailScreen.tsx# Sale invoice breakdown (Delete locked)
        ├── PurchaseListScreen.tsx
        ├── PurchaseEntryScreen.tsx
        ├── PurchaseDetailScreen.tsx
        ├── ReceiptListScreen.tsx
        ├── ReceiptEntryScreen.tsx
        ├── PaymentListScreen.tsx
        ├── PaymentEntryScreen.tsx
        ├── ContraListScreen.tsx
        ├── ContraEntryScreen.tsx
        ├── LedgerListScreen.tsx # Debtors, Creditors, Balances
        ├── LedgerStatementScreen.tsx # Running Dr/Cr Ledger Statement
        └── LedgerEntryScreen.tsx # New / Edit Ledger Account
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

