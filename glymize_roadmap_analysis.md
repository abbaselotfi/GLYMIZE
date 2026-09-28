# تحلیل گراف و رودمپ پروژه GLYMIZE

تاریخ تحلیل: ۱۴۰۵/۰۷/۰۶ (۲۰۲۶-۰۹-۲۷)

> این فایل یک نمای مشتق‌شده برای handoff است؛ `docs/ROADMAP.md`، `docs/CURRENT_STATE.md` و `docs/ACTIVE_TASK_HANDOFF.md` منابع کانونیک هستند و در تعارض، بر این تحلیل اولویت دارند.

## 🎯 چشم‌انداز محصول (North Star)

**GLYMIZE** دیگر یک برنامه خاص برای دیابت نیست. هدف تبدیل شدن به:

> **یک فضای کار هوش بالینی دوزبانه (فارسی/انگلیسی)، بیمارمحور، برای طب بالغین**

- اولین ماژول بالغ: **دیابت** (آزمایش‌شده و ایمن)
- گسترش به: قلب و عروق، کلیه، ریه، گوارش، عفونی، نورولوژی، روماتولوژی و ...

### تجربه هسته محصول

```
مطب → بیمار → پرونده طولی → خلاصه ۱۰ ثانیه‌ای
  → چه چیزی تغییر کرده؟ → مشکلات/ریسک‌ها/داروها/آزمایش‌ها
    → مسیریابی هوشمند → ماژول‌های تخصصی
      → شواهد + پشتیبانی تصمیم → اقدام تأییدشده پزشک
        → پیگیری و یادگیری طولی
```

---

## 📊 معماری گراف وابستگی‌ها

### ترتیب اجرای کانونیک

```
A. کنترل ایمنی و رودمپ [✅ تکمیل شده]
   ↓
B. Patient Clinical Core طولی [🔴 اولویت بالا - در حال اجرا]
   ↓
C. Patient Workspace بصری و لمسی محور
   ↘
    D. هوش دارویی (Medication Intelligence)
     ↘
      E. پلتفرم شواهد + AI Copilot
       ↘
        F. چارچوب ماژول + مسیریابی هوشمند
         ↓
        G. مهاجرت مرجع دیابت
         ↓
        H. انتشار هسته اولیه آماده کلینیک
         ↓
        I/J/K. گسترش دامنه‌های بالینی (تدریجی)
         ↘
          L. گسترش تداوم مطب/بیمار
           ↘
            M. سخت‌سازی و همکاری‌پذیری پلتفرم

N. اعتبارسنجی / یادگیری محصول (موازی با همه فازها)

§16.1 کلینیک آفلاین و هوش محلی (cross-cutting)
   - به B/C/E/H/L/M/N متصل است
   - فاز جداگانه نیست، یک برنامه یکپارچه است
```

---

## 🚀 وضعیت فعلی (۲۰۲۶-۰۹-۲۲)

### ✅ تکمیل شده

#### Phase A - Safety Baseline
- ✅ خط پایه regression/safety سبز
- ✅ مرزهای runtime/clinical authority حفظ شده
- ✅ این roadmap کانونیک شده

#### Patient & Practice Foundation (بخشی از B/C)
- ✅ Patient Record v2 (Worker/D1)
- ✅ Patient Clinical Core projections
- ✅ Patient Workspace با Brief ۱۰ ثانیه‌ای
- ✅ Medication reconciliation
- ✅ Lab trends و Timeline
- ✅ Care Team foundations
- ✅ RBAC و patient-access boundaries
- ✅ ۲۴ migration فایل (۱۹ Worker/D1، ۵ PostgreSQL foundation)

#### Clinical Foundation (بخشی از D/E/F)
- ✅ **Decision Graph v2** (مرجع درمانی Type 2)
- ✅ Evidence Assistant
- ✅ Versioned rule-pack
- ✅ Lab registry/parser
- ✅ Iranian medication catalogue (cardiometabolic classes)
- ✅ ۳۲۵,۰۰۰ test case بالینی (deterministic + adversarial)

#### Engineering Foundation
- ✅ TypeScript monorepo (pnpm + Turborepo)
- ✅ ۱۸۱ فایل تست خودکار
- ✅ PR gates: typecheck + lint + tests + Playwright
- ✅ PWA manifest + Service Worker
- ✅ Bilingual RTL/LTR
- 🟢 Worktree آزمایشی `chore/tooling-spike`: Storybook 10.6.0، MCP، a11y/axe و اسکنرهای امنیتی گیت نهایی را گذرانده‌اند؛ هنوز در `main` ادغام نشده‌اند

#### R30-03-C2 (تکمیل شده ۲۰۲۶-۰۹-۲۱) ⭐
- ✅ نصب reference-only Windows shell
- ✅ آزمایش روی VM تمیز Windows 11 بدون اینترنت
- ✅ Preflight → Install → Reboot → UninstallReinstall → Finalize
- ✅ Manifest SHA-256: `C2A9FB3827EBC91D908411500FC98239547DDA5823389F35C9F3F4A31CFF6A32`

### 🔴 در حال اجرا / بعدی

#### بستهٔ موازی ابزارسازی
**Engineering tooling spike** روی `chore/tooling-spike` با **Sol High** گیت‌های محلی نهایی را گذرانده و برای انتشار همان Branch آماده است.
- Storybook/Vite/Playwright به نسخهٔ دقیق pin شده‌اند و Vitest اصلی مستقل مانده است
- Storybook MCP برای Codex/OpenCode پیکربندی و endpoint زنده protocol-verified شده است
- a11y/axe، Gitleaks و Semgrep baseline اجرا شده‌اند
- Ubuntu/WSL2، Docker Engine/Compose، CLI نسخه‌دار Strix و Sandbox محلی اعتبارسنجی شده‌اند؛ مسیر OAuth ثالث ChatGPT پس از رد مدل و آشکارشدن نبود پشتیبانی رسمی revoke شد و Token آن حذف شد. Strix فعلاً با تصمیم مالک کنار گذاشته شده و مانع بستن بستهٔ ابزارسازی نیست

#### گیت محصول بعد از ابزارسازی
**R30-04-A** ثبت و تکمیل مستندی شده است. **R30-04-B1** با Sol High، synthetic data و بدون PHI مرحلهٔ محصول بعدی است؛ B2 دوباره Astra High می‌خواهد.

#### Phase B - Longitudinal Patient Core v3 [🔴 اولویت بالا]
قراردادهای Patient Clinical Core باید قبل از C/D/E تثبیت شوند:
- [ ] قرارداد کانونیک Patient Clinical Core
- [ ] یکپارچه‌سازی واقعیت‌های بالینی مشترک
- [ ] Problem Graph structure
- [ ] تاریخچه دارو / reconciliation state
- [ ] معناشناسی observation/lab/vital طولی
- [ ] Clinical Context objects
- [ ] معناشناسی freshness/staleness
- [ ] تشخیص تغییرات
- [ ] ADR معماری + migration plan
- [ ] تست‌های characterization و equivalence

#### Phase C - Visual Touch-First Workspace
- [ ] shell جدید Patient Workspace
- [ ] Patient Strip پایدار
- [ ] What Changed
- [ ] visualization trend-first
- [ ] کامپوننت‌های touch/stylus
- [ ] الگوهای structured intake
- [ ] کاهش navigation عمیق
- [ ] specialty lens framework

---

## 🔐 R31: Offline Clinic & Local Intelligence (یکپارچه‌سازی ۱۲-محوری)

این یک فاز جدید نیست، بلکه یک برنامه یکپارچه‌سازی cross-cutting است.

### محورهای اصلی

| محور | وضعیت | وابستگی‌ها |
|------|-------|------------|
| **R31-01** Local workspace + auth | 🔴 منتظر R30-04-B1/B2 و قراردادهای وابسته | R30-03-C2 ✅؛ R30-04-A ✅ طراحی |
| **R31-02** Patient identity (UUID/typed) | 🔴 | R31-01 |
| **R31-03** Clinic Host (single DB) | 🔴 | R31-01/02 |
| **R31-04** LAN discovery + QR pairing | 🔴 | R31-03 |
| **R31-05** Offline patient transfer | 🔴 | R31-02/03 |
| **R31-06** Offline Clinical Engine parity | 🔴 | R30-05/08 |
| **R31-07** Local AI integration | 🔴 | R31-03/06 |
| **R31-08** Optional Cloud Sync | 🔴 | R31-01/02/03 |
| **R31-09** Encrypted backup/recovery | 🔴 | R31-01/03/08 |
| **R31-10** Offline release acceptance | 🔴 | همه R31 |

### ترتیب اجرای منطقی R31

1. ✅ R30-03-C2 (تکمیل شده)
2. ✅ **R30-04-A** طراحی encryption (Astra High)
3. **R30-04-B1** spike بومی SQLCipher با دادهٔ synthetic (Sol High)
4. R31-01/02: workspace محلی + هویت
5. R31-03/04: single-host → LAN/PWA
6. R31-06: Clinical Engine آفلاین (قبل از AI)
7. R31-07: Local AI (پس از engine)
8. R31-05 + R31-08: transfer + sync
9. R31-09: recovery
10. R31-10: پذیرش نهایی

### Invariants محصول

1. ✅ کلینیک می‌تواند **Local Only** بماند (بدون اینترنت)
2. ✅ Cloud Sync اختیاری است
3. ✅ یک پایگاه داده عملیاتی برای هر کلینیک
4. ✅ UUIDs تصادفی داخلی (نه شناسه ملی ساختگی)
5. ✅ قوانین بالینی یکسان آفلاین/آنلاین
6. ✅ AI نمی‌تواند واقعیت‌ها را بنویسد
7. ✅ QR pairing ≠ QR transfer
8. ✅ تضاد sync نیاز به حل دستی دارد

---

## 📋 R29: Resource & Performance Work (باز)

R29-01 تا R29-05 همچنان **باز** هستند در موارد زیر:
- RC CPU/latency/rows measurements
- Cache activation
- D1 replication/bookmarks
- Query/index benefits
- Turnstile/Smart Placement
- Final rollback evidence

**R29-05-C RC**: روی migration `0018` است (production تغییر نکرده)

---

## 🎨 اصول غیرقابل مذاکره محصول (۱۲ اصل)

### P1: بیمار اول، بیماری دوم
پرونده بیمار هسته محصول است (نه بیماری)

### P2: یک داستان طولی بیمار
یک timeline منسجم از همه داده‌ها

### P3: بصری اول، لمسی اول، تایپ حداقل
- Large tap targets
- Selectable chips
- Visual selectors
- Single-tap Present/Absent/Unknown
- Trend charts

### P4: بدون پیچ و خم منوها
اقدامات مکرر در ۱-۲ تعامل قابل دسترس

### P5: افشای تدریجی
مهم‌ترین‌ها را نشان بده، جزئیات را پشت expansion قرار بده

### P6: سیگنال بالا، خستگی هشدار پایین
GLYMIZE نباید دیوار alert شود

### P7: توضیح هر توصیه مهم
چرا این? چرا نه آن دیگری؟ کدام شواهد؟

### P8: AI قابل تعویض است
شواهد و ایمنی داخل GLYMIZE نگهداری می‌شوند

### P9: بدون تکرار واقعیت‌های بالینی
eGFR، پتاسیم، حساسیت → یک بار ذخیره، همه‌جا مصرف

### P10: واقعیت محلی اهمیت دارد
برندهای ایرانی، موجودی، بیمه، قیمت

### P11: دسترسی‌پذیری بخشی از ایمنی بالینی است
رنگ تنها حامل معنی نباشد، RTL/LTR، keyboard، touch

### P12: پلتفرم را اول بساز، دامنه‌ها را ایمن فعال کن
معماری برای کل طب بالغین، اما فعال‌سازی بعد از آمادگی

---

## 🧪 گیت‌های مهندسی

### PR Gates (اجباری)
```bash
✅ pnpm install --frozen-lockfile
✅ pnpm typecheck    # کل monorepo
✅ pnpm lint         # Biome
✅ pnpm test         # Vitest (۱۸۱ فایل)
✅ Clinical stress   # ۳۲۵,۰۰۰ cases
✅ Playwright        # Critical flows
```

### Graph Gate (Codebase Memory)
- Version: `0.10.8`
- PRE/POST checks برای تغییرات مرتبط با graph
- Nodes: 8,742
- Edges: 33,303

---

## 📐 دارایی‌های قابل استفاده مجدد

### ✅ حفظ و استفاده مجدد (نه پیاده‌سازی دوباره)

**Patient/Practice Foundation:**
- Patient Record v2
- Patient identity + global identity
- Medication reconciliation
- Lab trends, Timeline
- Care Team, RBAC
- Provider, referral, scheduling

**Clinical Foundation:**
- decision-graph-v2 (authority)
- Versioned rule-pack
- Evidence registry
- Lab registry/parser
- Iranian medication catalogue
- ۳۲۵K test suite

**Medication/Catalogue:**
- Generic/brand separation
- Iranian brands/manufacturers
- Insurance/cost concepts
- Catalogue tooling

**AI Foundation:**
- Evidence Assistant
- Provider/model config
- Provider-secret separation
- AI ≠ clinical authority invariant

**Engineering:**
- TypeScript monorepo
- Worker/D1 runtime
- PWA/offline
- Bilingual RTL/LTR
- PR validation + Playwright

---

## ✅ Checklist فعال‌سازی دامنه بالینی

برای هر ماژول تخصصی جدید:

- [ ] دامنه و کاربران هدف
- [ ] مراجع شواهد نام‌گذاری شده
- [ ] بررسی evidence/legal/licensing
- [ ] پوشش کاتالوگ دارویی
- [ ] واقعیت‌های بیمار لازم/حداقل ایمن
- [ ] رفتار با missing/stale/unknown
- [ ] تعریف rule precedence
- [ ] جداسازی hard blocks/cautions/preferences
- [ ] یکپارچه‌سازی medication eligibility
- [ ] بررسی تداخلات cross-domain
- [ ] explainability/provenance
- [ ] تست‌های deterministic
- [ ] تست‌های boundary/adversarial
- [ ] golden cases تأیید شده پزشک
- [ ] بررسی UI با پزشکان هدف
- [ ] AI context بدون authority
- [ ] مسیر rollback/deactivation
- [ ] بررسی release claim

---

## 🎯 سناریوی پذیرش نهایی End-to-End

برای **R31-10** (Offline Clinic Release):

1. VM تمیز Windows 11 بدون اینترنت
2. نصب از رسانه قابل حمل
3. ایجاد Local Only clinic owner
4. Restart + re-login
5. اضافه کردن staff با RBAC
6. ایجاد بیمار (هر نوع شناسه)
7. ثبت encounter/diagnosis/medication/lab
8. اجرای Decision Graph + یک tier Local AI
9. بررسی evidence/version/provenance
10. Pair کردن Android client (HTTPS/PWA)
11. Pair کردن iOS client (مسیر جداگانه)
12. استفاده از care-team RBAC
13. Export/import بسته بیمار (بدون تکرار)
14. Backup + restore کار unsynced
15. فعال کردن اتصال → اثبات sync/conflict

❗ **هیچ مرحله‌ای از متن roadmap، mock output، یا browser smoke کامل نمی‌شود**

---

## 🚨 مرزهای مهم

### Runtime Authority
- **Worker/D1** = مرجع فعلی patient/encounter
- **Decision Graph v2** = مرجع Type 2
- **PostgreSQL** = فقط foundation (هنوز نه مرجع)

### Feature Flags
- `PATIENT_PORTAL_V1_ENABLED = false`
- Migration `0019` = unapplied/default-off

### Partial/Disabled
- Type 1 & Pregnancy: صفحات informational (نه treatment pathway)
- Evidence Assistant: نیاز به runtime providers/secrets
- Scheduling: بدون payment processor
- NestJS `api`: فقط local development

---

## 📈 Metrics محصول

### Repository Inventory
- **۲۹** Web App Router entries
- **۱۸۱** فایل تست
- **۲۴** SQL migrations
- **۸,۸۷۸** nodes در POST Graph Worktree (`+۸۲` نسبت به baseline)
- **۳۳,۴۸۷** edges در POST Graph Worktree (`+۱۰۵` نسبت به baseline)
- ۲۶ فایل partial شناخته‌شده، صفر skipped؛ assetهای تصویری Storybook عمداً خارج از index هستند

### Clinical Test Coverage
- ۳۲۵,۰۰۰ test cases
- Deterministic + randomized + metamorphic + adversarial
- Multidomain cardiac/renal/hypertension/lipid

---

## 🗓️ Model & Token Policy

### Default از ۲۰۲۶-۰۹-۲۰:
- **Sol High**: implementation packets (جایگزین Astra Medium)
- **Astra Light**: purely mechanical docs/lint
- **Astra High**: security/authority/consistency review (محدود)
- **Sol Extra High**: نیاز به checkpoint جداگانه

### Before Each Packet:
```text
MODEL CHECKPOINT
تسک: <ID و بسته محدود>
مدل پیشنهادی: <model / reasoning>
دلیل: <یک جمله>
مصرف نسبی توکن: <کم / متوسط / زیاد>
```

### Current Checkpoint
✅ **R30-03-C2** تکمیل شده (Sol High)
✅ **R30-04-A** طراحی ثبت شده (Astra High)
🟡 **Current: engineering tooling spike** روی Sol High
➡️ **Next product packet: R30-04-B1** روی Sol High؛ B2 قبل از اجرا به Astra High نیاز دارد

---

## 🎓 Documentation Map

| سند | هدف |
|-----|------|
| `ROADMAP.md` | جهت محصول، ترتیب وابستگی‌ها |
| `CURRENT_STATE.md` | وضعیت واقعی پیاده‌سازی |
| `ARCHITECTURE.md` | مرزهای انسانی و فنی |
| `RUNTIME_OF_RECORD.md` | مرجع هر داده در runtime |
| `CLINICAL_ENGINE_AUTHORITY.md` | مرجع تصمیم‌گیری Type 2 |
| `PATIENT_CLINICAL_CORE_README.md` | قرارداد پروندهٔ مشترک |
| `OFFLINE_CLINIC_LOCAL_INTELLIGENCE_ADR.md` | ADR آفلاین کلینیک |
| `ACTIVE_TASK_HANDOFF.md` | وضعیت تسک فعلی |

---

## 🔑 نکات کلیدی برای توسعه‌دهنده

1. **قبل از هر تغییر**: Roadmap و Current State را چک کن
2. **قوانین درمانی**: به منبع معتبر و نسخه مشخص متصل باشند
3. **داده ناقص ≠ نبود بیماری**: explicit handling
4. **No duplicate facts**: یک واقعیت = یک ذخیره‌سازی
5. **RBAC در backend**: نه فقط مخفی کردن UI
6. **No real PHI in Git**: هیچ‌وقت
7. **Migration امضا شده**: in-place بازنویسی نمی‌شود
8. **Green tests**: قبل از merge به main

---

## 📊 خلاصه وضعیت به زبان ساده

### ✅ آماده و کار می‌کند
- پرونده بیمار v2 با Patient Clinical Core
- Decision Graph v2 برای دیابت نوع ۲
- رابط دوزبانه PWA
- ۳۲۵K تست بالینی
- نصب Windows reference-only

### 🔴 در صف (اولویت بالا)
- **بعدی محصول**: R30-04-B1، spike بومی SQLCipher با دادهٔ synthetic (Sol High)
- Patient Clinical Core v3 contracts
- Visual Touch-First Workspace
- R31 Offline Clinic tasks (۱۰ محور)

### ⚠️ ناقص/غیرفعال
- PostgreSQL (فقط foundation)
- Patient Portal (disabled)
- Type 1/Pregnancy (informational only)
- R29 measurements (باز)

---

**تاریخ آخرین بازخوانی Roadmap**: ۲۰۲۶-۰۹-۲۸
**تاریخ Snapshot وضعیت**: ۲۰۲۶-۰۹-۲۸
**Active Task Handoff**: ۲۰۲۶-۰۹-۲۸
**این تحلیل**: ۲۰۲۶-۰۹-۲۸

---

## 🚦 Next Actions

1. Branch ابزارسازی را پس از گیت‌های PASS منتشر کنید؛ ادغام در `main` همچنان به بازبینی/مجوز مستقل نیاز دارد
2. Strix را تا فعال‌سازی صریح یک بستهٔ مستقل کنار بگذارید؛ مسیر OAuth اشتراک ChatGPT تکرار نشود و هر trial بعدی فقط با Provider رسمی، سقف هزینه، Telemetry خاموش و هدف synthetic/local انجام شود
3. **R30-04-B1** را پس از پایان بستهٔ ابزارسازی با Sol High آغاز کنید
4. Phase B و سپس Phase C را طبق وابستگی‌های کانونیک ادامه دهید
5. R31 را طبق ترتیب §16.1.5 و R29 evidence باز را مستقل از ادعای completion پیش ببرید

---

*این تحلیل بر اساس ROADMAP.md نسخه کانونیک، CURRENT_STATE.md و ACTIVE_TASK_HANDOFF.md در تاریخ ۲۰۲۶-۰۹-۲۸ تهیه شده است.*
