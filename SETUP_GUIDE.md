# 🏢 Hedge Portal — Click-by-Click Setup Guide

This guide walks you through deploying your investor portal from scratch. Total time: ~20 minutes.

---

## 📋 What You'll Build

- **Login page** — investors and admin sign in with email + password
- **Investor dashboard** — each investor sees only THEIR own data (evaluations, withdrawals, money movements, profit splits)
- **Admin dashboard** — you see EVERYTHING (all investors, evaluations, money flows, accounts, B2F, expenses)
- **Hosted free** on Netlify, Auth via Firebase, data from your Notion databases

---

# PART 1 — Set Up Firebase (5 minutes)

## Step 1.1 — Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it: `hedge-portal` (or whatever you want)
4. Click **Continue**
5. **Disable** Google Analytics (you don't need it). Click **Continue**.
6. Wait for project to be created. Click **Continue** when ready.

## Step 1.2 — Enable Email/Password Auth

1. In left sidebar, click **Build → Authentication**
2. Click **Get Started**
3. Click **Email/Password** in the list
4. Toggle **Enable** ON
5. Click **Save**

## Step 1.3 — Add a Web App

1. In Firebase Console home, click the **⚙️ gear icon → Project Settings**
2. Scroll down to **Your apps**
3. Click the **`</>` (Web)** icon
4. App nickname: `hedge-portal-web`
5. Click **Register app** (DO NOT check "Firebase Hosting")
6. **IMPORTANT:** You'll see a code block with `firebaseConfig`. Copy all 6 values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
7. Save these somewhere — you'll paste them into Netlify later
8. Click **Continue to console**

## Step 1.4 — Create Your Admin Account

1. Go back to **Authentication → Users**
2. Click **Add user**
3. Email: **your personal email** (this is your admin login)
4. Password: pick a strong one, save it
5. Click **Add user**

## Step 1.5 — Create Investor Accounts

For each investor:
1. Click **Add user** in Authentication
2. Email: **must match exactly** the email in their Notion `👥 Investors` profile
3. Temporary password: e.g. `Welcome2026!` (they'll change it after login)
4. Click **Add user**
5. Tell the investor: their email + the temp password

> **You can also do this later** as you onboard new investors.

---

# PART 2 — Get Your Notion Token (2 minutes)

## Step 2.1 — Create Notion Integration

1. Go to **https://www.notion.so/my-integrations**
2. Click **+ New integration**
3. Name: `Hedge Portal`
4. Associated workspace: pick your workspace
5. Type: **Internal**
6. Click **Save**
7. On the next page, click **Show** next to "Internal Integration Secret"
8. Copy the token (starts with `ntn_...` or `secret_...`) — save it

## Step 2.2 — Connect Integration to Your Hub

You need to give the integration access to your databases:

1. Open your **🏢 Hedging Operations Hub** page in Notion
2. Click the **⋯ (three dots)** at top-right
3. Scroll to **Connections**
4. Click **+ Add connections**
5. Search for **Hedge Portal** and click it
6. Click **Confirm**

> This grants access to ALL databases inside the hub automatically.

---

# PART 3 — Deploy to Netlify (10 minutes)

## Step 3.1 — Get the Code on GitHub

Easiest path: I'll give you a downloadable zip. You upload to GitHub.

1. Go to **https://github.com/new**
2. Repository name: `hedge-portal`
3. Set to **Private**
4. Click **Create repository**
5. On the next page, click **uploading an existing file**
6. Drag the contents of the `hedge-portal` folder I provided
7. Scroll down → Click **Commit changes**

## Step 3.2 — Connect to Netlify

1. Go to **https://app.netlify.com**
2. Sign up / log in (use GitHub for easiest setup)
3. Click **Add new site → Import an existing project**
4. Click **GitHub** and authorize
5. Find and select your `hedge-portal` repo
6. **Build settings** (Netlify usually auto-fills these):
   - Build command: `npm run build`
   - Publish directory: `.next`
7. **Don't deploy yet** — click **Add environment variables** first

## Step 3.3 — Add Environment Variables

Click **New variable** for EACH of these (paste the value you saved earlier):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from Firebase config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from Firebase config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from Firebase config |
| `NOTION_TOKEN` | from notion.so/my-integrations |
| `NOTION_INVESTORS_DB` | `1ae3f5cec6064b5da74f506c5d8f767e` |
| `NOTION_EVALUATIONS_DB` | `5f8439d412264956ba2c3574e560134d` |
| `NOTION_WITHDRAWALS_DB` | `beb570cded3349c99921ae5b991942f3` |
| `NOTION_MOVEMENTS_DB` | `638f740498b14a399a255e9ea9c1ae07` |
| `NOTION_EXPENSES_DB` | `a337401e41be47f385235dbd03d80305` |
| `NOTION_B2F_DB` | `3197239b91fb48cf8f129c784dc3adf8` |
| `NOTION_ACCOUNTS_DB` | `e3a19e4634a5434991f20407ee38e97a` |
| `NOTION_TRADES_DB` | `1670f48f83124bff8636fc89ce3c183b` |
| `NOTION_FINANCIAL_ACCOUNTS_DB` | `a08ec7fdf1d542ea8e180f97024a6cfe` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | **your admin email from Step 1.4** |
| `PERPLEXITY_API_KEY` | *(optional)* from console.perplexity.ai — enables web-grounded answers at `/api/ask` |

Click **Deploy site**.

## Step 3.4 — Wait for Build

- Netlify will build and deploy (3–5 minutes)
- When it's done you'll see a URL like `https://random-name-12345.netlify.app`
- Click it to open your live site

## Step 3.5 — (Optional) Custom Domain

In Netlify: **Domain management → Add custom domain** if you want `portal.yourcompany.com`.

---

# PART 4 — Test It

1. Visit your Netlify URL
2. You'll be redirected to **/login**
3. Sign in with **your admin email + password**
4. You should land on **/admin** with the full overview
5. Sign out, sign in as a test investor account → you should land on **/dashboard** with only their data

---

# 🆘 Troubleshooting

**"Investor not found" error**
→ The email in Firebase auth doesn't match the email in Notion's Investors database. Check both match exactly (lowercase, no typos).

**Empty dashboard / no data showing**
→ Notion integration not connected. Re-do Part 2.2 — make sure you added the Hedge Portal connection to your Hub page.

**Build fails on Netlify**
→ Check that ALL environment variables are spelled exactly right (case-sensitive). Re-deploy after fixing.

**"Forbidden" error on admin page**
→ `NEXT_PUBLIC_ADMIN_EMAIL` doesn't match the email you logged in with. Update env var in Netlify and redeploy.

---

# ✅ You're Done

Every change you make in Notion (new evaluation, new withdrawal, updated stage) appears in the portal automatically — no app updates needed. The portal is just a window into your Notion data.
