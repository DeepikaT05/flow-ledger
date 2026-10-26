# Flow Ledger - Prisma ORM Setup & Migration Guide

Flow Ledger is now equipped with **Prisma ORM** configured for **PostgreSQL / Supabase / Neon / RDS** with a clean multi-tenant architecture (`company_id`).

---

## 📁 What Has Been Configured

1. **Prisma Schema (`prisma/schema.prisma`)**:
   - Complete data model mapping all Marg ERP domain entities:
     - `Role`, `User`, `Session`, `Migration`
     - `Company`, `CompanyYear`
     - `AccountGroup`, `Ledger`, `Item`, `Batch`, `Salesman`
     - `Bill`, `BillItem`, `BillPayment`
     - `Voucher`, `VoucherLine`, `VoucherAdjustment`
     - `LedgerEntry` (Consolidated financial book)

2. **Database Configuration (`.env` & `.env.example`)**:
   - `DATABASE_URL`: Connection string template for PostgreSQL.

3. **Prisma Client Singleton (`server/prisma.ts`)**:
   - Global typed `PrismaClient` ready for queries, services, and API routes.

4. **Automated SQLite to PostgreSQL Data Migrator (`scripts/migrate-sqlite-to-prisma.ts`)**:
   - One-click script to transfer all companies, users, products, batches, ledgers, and transactions from local SQLite `.db` files into PostgreSQL without data loss.

---

## 🚀 Quick Start Instructions

### Step 1: Add Your PostgreSQL Connection String
Open [`.env`](file:///c:/Users/DEEPIKA%20TANDULKAR/Downloads/Marg/.env) and set your database URL:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/flowledger?schema=public"
```
*(Supports Supabase, Neon.tech, AWS RDS, DigitalOcean, or local PostgreSQL)*

---

### Step 2: Push Schema to Create Tables in PostgreSQL
Run the following command in terminal:

```bash
npm run prisma:push
```
This automatically creates all tables, primary keys, foreign keys, and indexes in your PostgreSQL database.

---

### Step 3: Transfer Existing SQLite Data (Optional)
If you want to migrate existing data (companies, users, items, batches, bills) from SQLite into your new PostgreSQL database:

```bash
npm run db:migrate-sqlite
```

---

### Step 4: Visual Database Browser (Prisma Studio)
To view, search, and edit database records directly in your browser:

```bash
npm run prisma:studio
```
Prisma Studio will launch at `http://localhost:5555`.

---

## 🛠 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run prisma:generate` | Re-generates Prisma Client TypeScript types after schema changes |
| `npm run prisma:push` | Synchronizes `schema.prisma` with your live PostgreSQL database |
| `npm run prisma:studio` | Launches visual browser GUI to inspect and edit database records |
| `npm run db:migrate-sqlite` | Migrates all SQLite `.db` data into Prisma PostgreSQL |
