# GLYMIZE — Patient-Centered Clinical Intelligence Workspace

GLYMIZE یک فضای کار بالینی دوزبانه و بیمارمحور برای پزشکان است. سامانه اطلاعات طولی بیمار، نتایج آزمایش‌ها، داروها، مشکلات فعال، شواهد پزشکی و ماژول‌های تخصصی را در یک مسیر واحد گرد هم می‌آورد تا پزشک بتواند سریع‌تر وضعیت بیمار را درک کند و به یک اقدام روشن و قابل‌ردیابی برسد.

GLYMIZE is a bilingual, patient-centered clinical intelligence workspace for physicians. It brings longitudinal records, laboratory evidence, medication history, active problems, medical evidence, and specialty modules into one traceable clinical workflow.

> **وضعیت پروژه:** GLYMIZE در مرحلهٔ توسعهٔ نسخهٔ اولیه و استفادهٔ محدود مستقیم توسط پزشکان است. قابلیت‌های موجود و وضعیت هر ماژول باید از [Current State](docs/CURRENT_STATE.md) و [Roadmap](docs/ROADMAP.md) خوانده شوند. وجود یک صفحه یا ماژول در کد به معنی کامل‌بودن دامنهٔ بالینی آن نیست.

## چشم‌انداز

هدف GLYMIZE ساخت یک برنامه برای یک بیماری خاص نیست. محصول نهایی باید محیط کاری مشترکی برای طب داخلی و تخصص‌های وابسته باشد و بتواند هر حوزه‌ای را پشتیبانی کند که در آن:

- داده‌ها و آزمایش‌های قابل‌استناد در تشخیص و ارزیابی نقش دارند؛
- تغییرات بیمار در طول زمان اهمیت دارند؛
- دارو، آزمایش، پایش، ارجاع یا اقدام جدید ممکن است پیشنهاد شود؛
- تصمیم باید با دادهٔ بیمار، قانون بالینی نسخه‌دار و منبع شواهد توضیح داده شود.

دیابت نخستین ماژول بالینی بالغ و آزموده‌شدهٔ GLYMIZE است؛ معماری محصول به‌گونه‌ای توسعه می‌یابد که قلب و عروق، کلیه، ریه، گوارش و کبد، بیماری‌های عفونی، نورولوژی، روماتولوژی، هماتولوژی و حوزه‌های بعدی بدون ساخت پرونده یا زیرساخت موازی به آن اضافه شوند.

## تجربهٔ اصلی محصول

```text
Practice
  → Patient
    → Longitudinal Clinical Record
      → 10-Second Clinical Brief
        → What Changed
          → Problems / Risks / Medications / Labs
            → Smart Routing
              → Specialty Clinical Modules
                → Evidence + Decision Support
                  → Physician-confirmed Action
                    → Follow-up and longitudinal learning
```

پزشک باید بتواند بیمار را باز کند، مهم‌ترین وضعیت‌ها و تغییرات را در چند ثانیه ببیند، دادهٔ ناقص یا قدیمی را تشخیص دهد، وارد ماژول تخصصی مناسب شود و نتیجه را به اقدام تأییدشده تبدیل کند؛ بدون جست‌وجو میان پرونده‌های جدا یا ورود دوبارهٔ یک داده.

## اصول محصول

### بیمار اول، تخصص دوم

پروندهٔ طولی بیمار هستهٔ محصول است. همهٔ ماژول‌های تخصصی یک Patient Clinical Core مشترک را مصرف می‌کنند و برای هر بیماری پروندهٔ جدا نمی‌سازند.

### یک منبع برای هر واقعیت بالینی

آزمایش، حساسیت، داروی جاری، بارداری، عملکرد کلیه یا هر واقعیت مشترک باید یک بار با زمان، منبع، وضعیت بازبینی و تازگی ثبت شود و در تمام ماژول‌های مرتبط به‌کار رود.

### اقدام پزشکی قابل توضیح

هر پیشنهاد مهم باید نشان دهد چه داده‌ای از بیمار مؤثر بوده، چه چیزی نامشخص یا قدیمی است، کدام قانون و منبع از نتیجه پشتیبانی می‌کند و اقدام بعدی چیست.

### پزشک مرجع تصمیم نهایی است

موتورهای قطعی و هوش مصنوعی می‌توانند تحلیل، گزینه و پیش‌نویس اقدام ارائه کنند. ثبت دستور یا تصمیم مؤثر بر درمان با تأیید پزشک انجام می‌شود و سابقهٔ آن قابل ممیزی باقی می‌ماند.

### هوش مصنوعی قابل تعویض است

ارائه‌دهنده یا مدل AI نباید مرجع درمان باشد. دادهٔ بیمار، شواهد، قواعد بالینی، ایمنی دارویی و سطح دسترسی داخل مرزهای GLYMIZE نگهداری می‌شوند.

### رابط بصری با تایپ حداقلی

طراحی برای لمس، قلم، صفحه‌کلید و ماوس انجام می‌شود. ورودی‌های ساختاریافته، نمودار روند، کارت‌های بالینی و افشای تدریجی اطلاعات بر فرم‌های طولانی و منوهای عمیق اولویت دارند.

## لایه‌های پلتفرم

| لایه | مسئولیت |
| --- | --- |
| Patient Clinical Core | هویت در محدودهٔ مطب، ویزیت‌ها، مشکلات، داروها، حساسیت‌ها، آزمایش‌ها، اسناد، زمان و provenance |
| Patient Workspace | خلاصهٔ سریع، What Changed، روندها، خط زمانی و دسترسی کم‌عمق به اقدامات |
| Medication Intelligence | هویت دارو، eligibility، منع/احتیاط، تداخل، دوز، پایش، بازار ایران، بیمه و هزینه |
| Evidence Platform | منابع چندمرجعی، نسخه، تاریخ، وضعیت اعتبار و ارتباط شواهد با قواعد |
| Clinical Modules | قواعد و workflow تخصصی با ورودی‌های ایمن، maturity صریح و تست مستقل |
| AI Clinical Copilot | خلاصه‌سازی، پرسش از پرونده، توضیح شواهد و پیش‌نویس اقدام در محدودهٔ مجوز |
| Practice & Patient Operations | تیم درمان، ارجاع، نوبت، پیگیری، پیام و فضای ساده‌تر بیمار |

## توسعهٔ تخصص‌ها

اضافه‌شدن تخصص جدید به معنی افزودن چند صفحه نیست. هر ماژول باید روی همان پروندهٔ بیمار و لایهٔ دارویی مشترک ساخته شود و این موارد را صریح تعریف کند:

- دامنه و کاربران هدف؛
- داده‌ها و آزمایش‌های لازم و حداقل ورودی ایمن؛
- رفتار در دادهٔ مفقود، نامشخص یا قدیمی؛
- شواهد و قواعد نسخه‌دار؛
- داروها، تداخل‌ها، منع‌ها و الزامات پایش؛
- آزمایش، ارجاع و اقدام قابل پیشنهاد؛
- توضیح نتیجه و provenance؛
- تست‌های قطعی، مرزی و سناریوهای بالینی؛
- وضعیت بلوغ از foundation تا release-eligible.

این قرارداد امکان می‌دهد تخصص‌هایی که به شواهد آزمایشگاهی و پیشنهاد دارو یا بررسی جدید متکی‌اند، به‌تدریج و بدون تکثیر زیرساخت وارد GLYMIZE شوند.

## وضعیت فعلی قابل اتکا

دارایی‌های موجود شامل Patient Record v2، Patient Clinical Core و read model طولی، Patient Workspace، دریافت و پردازش آزمایش، medication reconciliation، سفارش‌های پزشک، تیم درمان و RBAC، Evidence Assistant، زیرساخت کاتالوگ دارویی و Decision Graph v2 برای دیابت نوع ۲ است.

برخی قابلیت‌ها پیاده‌سازی پایه یا feature-gated دارند و فعال‌بودن آن‌ها در یک محیط از روی وجود کد استنتاج نمی‌شود. [Current State](docs/CURRENT_STATE.md) واقعیت مخزن را از برنامهٔ آینده جدا می‌کند.

## معماری مخزن

```text
apps/
  web/                 # Next.js: physician, Care Team, patient and admin surfaces
  admin-worker/        # Cloudflare Worker + D1/R2/KV runtime authority
  api/                 # local-development compatibility service
packages/
  contracts/           # versioned contracts shared across runtime and clients
  clinical-engine/     # deterministic clinical rules and decision graph
  catalog-data/        # shared medication and reference projections
infra/
  postgres/            # future architecture foundation; not current runtime authority
docs/                  # roadmap, current state, ADRs, clinical and product contracts
```

GLYMIZE یک monorepo مبتنی بر TypeScript، pnpm و Turborepo است. Worker/D1 مرجع فعلی داده‌های عملیاتی بیمار است؛ PostgreSQL فعلاً زیرساخت آینده محسوب می‌شود و مهاجرت به آن تصمیم جداگانه می‌خواهد.

## اجرای محلی

پیش‌نیازها: Node.js و pnpm نسخه‌های سازگار با lockfile پروژه.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
```

رابط وب به‌طور پیش‌فرض روی `http://localhost:3000` اجرا می‌شود. تنظیم Worker، D1 و متغیرهای محیطی در [راهنمای admin-worker](apps/admin-worker/README.md) آمده است. هیچ secret یا دادهٔ واقعی بیمار نباید در مخزن ثبت شود.

## نقشهٔ اسناد

| سند | کاربرد |
| --- | --- |
| [Canonical Roadmap](docs/ROADMAP.md) | جهت محصول، ترتیب وابستگی‌ها و گیت‌های پذیرش |
| [Current State](docs/CURRENT_STATE.md) | وضعیت واقعی قابلیت‌های پیاده‌شده، ناقص و غیرفعال |
| [Architecture](docs/ARCHITECTURE.md) | مرزهای انسانی و فنی سامانه |
| [Runtime of Record](docs/architecture/RUNTIME_OF_RECORD.md) | مرجع هر داده و سرویس در runtime فعلی |
| [Clinical Engine Authority](docs/architecture/CLINICAL_ENGINE_AUTHORITY.md) | مرجع فعلی تصمیم‌گیری بالینی Type 2 |
| [Patient Clinical Core](docs/architecture/PATIENT_CLINICAL_CORE_README.md) | قرارداد پروندهٔ مشترک و مسیر همگرایی |
| [Codebase Memory Gate](docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md) | گیت اجباری تحلیل اثر و کنترل تغییرات |

## قواعد مشارکت و ایمنی داده

- قبل از هر تغییر، Roadmap و وضعیت واقعی همان حوزه بررسی می‌شود تا کد تکراری یا مرجع موازی ساخته نشود.
- قواعد درمانی، آستانه‌ها و دوزها باید به منبع معتبر و نسخهٔ مشخص متصل باشند؛ مقدار بالینی برای تکمیل UI حدس زده نمی‌شود.
- دادهٔ ناقص با «نبود بیماری» یا «مجازبودن دارو» برابر نیست.
- جداسازی مطب، بیمار و نقش در backend اعمال می‌شود؛ مخفی‌کردن یک کنترل در UI مجوز محسوب نمی‌شود.
- دادهٔ واقعی بیمار، شناسه‌های مستقیم، اسناد محرمانه، کلیدها و secretها وارد Git نمی‌شوند.
- migration اجراشده و برنامهٔ امضاشده درجا بازنویسی نمی‌شوند؛ تغییر بعدی نسخه یا revision جدید می‌سازد.
- هر بخش پس از تست و گیت‌های متناسب با ریسک به `main` منتقل می‌شود.

## North Star

> **GLYMIZE should become the physician's visual, patient-centered clinical workspace: one longitudinal record, one medication intelligence layer, evidence-grounded AI, modular specialty decision support, and the shortest safe path from patient context to physician-confirmed action.**
