# معماری سامانه

## ۱. اهداف و قیود

معماری باید محتوای بالینی را از کد اجرایی جدا کند تا به‌روزرسانی سالانهٔ ADA و EASD، اصلاح فوری یک قانون، و تغییر اطلاعات بازار ایران بدون انتشار مجدد کل نرم‌افزار ممکن باشد. تصمیم‌ها باید قطعی، توضیح‌پذیر، قابل ممیزی و قابل بازسازی باشند. زبان رابط (`fa-IR` راست‌به‌چپ و `en` چپ‌به‌راست) نباید منطق بالینی را تغییر دهد.

## ۲. نمای زمینه

بازیگران اصلی عبارت‌اند از پزشک، مدیر محتوای دارویی، نویسنده و بازبین بالینی، مدیر سازمان و ممیز. سامانه با تأمین‌کنندهٔ هویت، پایگاه دادهٔ عملیاتی، مخزن اسناد راهنما، سرویس اعلان و در آینده منابع اطلاعات دارویی معتبر تعامل می‌کند.

## ۳. اجزای منطقی

```text
[Clinician/Admin Web]
          |
      [API/BFF] ---- [Identity Provider]
       /   |   \
      /    |    +--- [Audit/Event Store]
     /     +-------- [Medication Catalog Service]
    +--------------- [Clinical Decision Service]
                             |
                       [Rules Engine]
                             |
              [Published, immutable rule bundles]
                             |
                  [PostgreSQL + Object Storage]
```

### رابط وب

- یک پوستهٔ دوزبانه با ترجمه‌های کلیدمحور، پشتیبانی کامل RTL/LTR و قالب‌بندی محلی عدد و تاریخ؛
- فضای پزشک برای ورود حداقل داده، مشاهدهٔ پیشنهاد، دلیل، هشدار و منبع؛
- فضای مدیریت برای ویرایش ساخت‌یافته، مقایسهٔ نسخه‌ها و گردش‌کار تأیید؛
- رعایت دسترس‌پذیری WCAG 2.2 AA به‌عنوان هدف طراحی.

### API/BFF

API قراردادهای نسخه‌بندی‌شده را ارائه می‌دهد، اعتبارسنجی ساختاری و مجوز را اعمال می‌کند و شناسهٔ همبستگی می‌سازد. برای ایجاد/ویرایش handoff بیمار نیز API مرجع تمامیت است: درخواست create روی شناسهٔ موجود باید با conflict fail-closed شود و هر update باید به رکورد و revision بارگذاری‌شده مقید باشد؛ بررسی زودهنگام در UI فقط کمک UX است و جای guard اتمی سرور را نمی‌گیرد. BFF متن محلی‌شده و اولویت نمایش دارو را ترکیب می‌کند، اما محاسبهٔ بالینی فقط در Clinical Decision Service انجام می‌شود.


### پروندهٔ طولی بیمار و Patient Workspace

در Patient Record v2، API/BFF باید identifier ورودی را ابتدا به یک `patient_id` پایدار resolve کند و سپس عملیات مراجعه را با `encounter_id` مستقل انجام دهد. «باز کردن بیمار» و «شروع ویزیت جدید» دو command جدا هستند؛ هیچ مسیر compatibility نباید create encounter را به overwrite رکورد/ویزیت قبلی تبدیل کند.

برای شماره پروندهٔ مطب، یک allocator practice-scoped با high-water mark نگهداری می‌شود. practiceهای legacy تا زمانی که آخرین شمارهٔ تخصیص‌یافته توسط کاربر مجاز تأیید نشده باشد در حالت `uninitialized` می‌مانند؛ سیستم نباید از hashهای identifier ادعای max بسازد. تخصیص شمارهٔ پیشنهادی و درج identifier بیمار باید concurrency-safe و اتمی باشد. کد ملی از این allocator مستقل است و در UI می‌تواند lookup پیش‌فرض باشد بدون اینکه کلید اصلی ذخیره‌سازی شود.

Patient Workspace یک read model ترکیبی است:

- Patient header از patient master/demographics/identifiers؛
- visit timeline از encounterها؛
- pre-visit medications از medication reconciliation؛
- post-visit clinical actions از signed Final Plan و orders؛
- trends از observationهای canonical و تاریخ‌دار؛
- physician notes از note thread/revisionهای encrypted.

یادداشت پزشک با revision append-only ذخیره می‌شود؛ visibility پیش‌فرض physician-only است. Focus/Standard/Comprehensive فقط projection و progressive disclosure رابط را تغییر می‌دهند و نباید روی clinical rule input/output یا دادهٔ ذخیره‌شده اثر بگذارند.


### سرویس تصمیم بالینی و موتور قوانین

ورودی موتور یک snapshot حداقلی از داده‌های بیمار، زمینهٔ درمان و `rule_bundle_id` است. موتور قطعی و بدون وابستگی به متن نمایشی عمل می‌کند و خروجی زیر را می‌سازد:

- پیشنهادها و هشدارهای کدگذاری‌شده؛
- قوانین اجراشده، شروط برقرار/نامشخص و دلیل قابل نمایش؛
- ارجاع به نسخه و بخش دقیق راهنما؛
- نسخهٔ کاتالوگ دارو و bundle فعال؛
- داده‌های مفقود و زمان ارزیابی.

قوانین به‌صورت DSL محدود یا ساختار JSON معتبرسنجی‌شده نگهداری می‌شوند؛ اجرای کد دلخواه در محتوای مدیریتی ممنوع است. bundle منتشرشده immutable است و فعال‌سازی آن با اشاره‌گر اتمی انجام می‌شود.

### کاتالوگ دارو

شناسهٔ بالینی دارو بر پایهٔ مادهٔ مؤثره/ترکیب، شکل و قدرت است و از نام نمایشی جداست. برندها رکوردهای بازار ایران با بازهٔ اعتبار، تولیدکننده، وضعیت عرضه و نام فارسی/انگلیسی هستند. انتخاب `generic-first` یا `brand-first` فقط لایهٔ ارائه را عوض می‌کند و هر دو نام در جزئیات قابل مشاهده‌اند.

### ذخیره‌سازی و پردازش پس‌زمینه

- PostgreSQL: دادهٔ ساخت‌یافته، محتوا، گردش‌کار، تنظیمات و ممیزی؛
- Object Storage: نسخهٔ مجاز اسناد منبع، ضمیمه‌ها و artifact بسته‌های قوانین؛
- صف کار: واردسازی، اعتبارسنجی، اعلان بازبینی و ساخت bundle؛
- cache: فقط برای دادهٔ مشتق‌شده؛ کلید cache شامل locale، نسخهٔ bundle و نسخهٔ کاتالوگ است.

### تحلیل میزان استفاده

API رویدادهای حداقلی و فاقد دادهٔ بالینی را برای کنش‌های محصول، مانند ورود موفق، شروع نشست و ارزیابی تکمیل‌شده، در صف رویداد ثبت می‌کند. worker تحلیلی این رویدادها را به تجمیع‌های روزانهٔ سازمانی تبدیل می‌کند و داشبورد مدیریت فقط از همین تجمیع‌ها می‌خواند. این مسیر از audit امنیتی جداست: audit برای پاسخ‌گویی و بازسازی تغییرات است، در حالی که usage analytics صرفاً پذیرش و بهره‌برداری محصول را اندازه می‌گیرد.

تعریف هر شاخص باید نسخه‌دار باشد و منطقهٔ زمانی، بازهٔ زمانی و قواعد حذف تکرار را مشخص کند. شمارش «کاربر فعال» با شناسهٔ pseudonymous یکتا انجام می‌شود؛ payload رویداد نباید شناسهٔ بیمار، مقدار آزمایش، تشخیص، متن آزاد یا نتیجهٔ بالینی داشته باشد. دادهٔ خام عمر کوتاه و دسترسی محدود دارد و تجمیع‌ها مطابق سیاست نگهداری سازمان حفظ می‌شوند.

## ۴. جریان ارزیابی

1. API هویت، نقش، سازمان و رضایت/مجوز دسترسی را بررسی می‌کند.
2. ورودی با schema نسخه‌بندی‌شده اعتبارسنجی و به کدهای استاندارد داخلی تبدیل می‌شود.
3. نسخهٔ فعال قوانین و کاتالوگ به شکل اتمی resolve می‌شود.
4. موتور نتیجه و trace توضیح را تولید می‌کند.
5. API یک DecisionRecord تغییرناپذیر با شناسه‌های نسخه ذخیره می‌کند.
6. ارائه‌گر متن را با locale و ترجیح نام دارو قالب‌بندی می‌کند.
7. پزشک می‌تواند نتیجه را بپذیرد، رد کند یا دلیل انحراف را ثبت کند؛ این بازخورد خودکار قانون را تغییر نمی‌دهد.

## ۵. انتشار محتوا

چرخهٔ محتوا `draft → in_review → approved → scheduled/published → retired` است. سازندهٔ bundle تنها نسخه‌های تأییدشده را می‌پذیرد، schema و ارجاع‌ها را کنترل و آزمون‌های نمونه را اجرا می‌کند. انتشار canary ابتدا برای محیط آزمایشی/سازمان منتخب انجام و سپس سراسری می‌شود. بازگشت، اشاره‌گر فعال را به آخرین bundle سالم برمی‌گرداند؛ سوابق قبلی حذف نمی‌شوند.

## ۶. امنیت، حریم خصوصی و ممیزی

- RBAC با حداقل دسترسی، MFA برای نقش‌های ناشر و جداسازی وظیفهٔ نویسنده/تأییدکننده؛
- رمزنگاری TLS در انتقال و رمزنگاری مدیریت‌شده در حالت سکون؛
- عدم ثبت دادهٔ سلامت در logهای کاربردی و ماسک‌کردن خطاها؛
- audit append-only برای ورود، مشاهدهٔ پرونده، تغییر محتوا، تأیید، انتشار و rollback؛
- نگهداری و حذف داده بر اساس سیاست مصوب و الزامات حوزهٔ استقرار؛
- پشتیبان‌گیری رمزنگاری‌شده، آزمون بازیابی و مدیریت secret خارج از مخزن.

پیش از استفادهٔ واقعی باید ارزیابی حقوقی، تهدیدمدل، الزامات میزبانی داده و اعتبارسنجی بالینی در حوزهٔ هدف تکمیل شود.

## ۷. قابلیت اطمینان و مشاهده‌پذیری

شاخص‌های عملیاتی شامل latency و نرخ خطای ارزیابی، تعداد نتایج نامشخص، توزیع نسخهٔ bundle، شکست اعتبارسنجی محتوا و lag صف هستند. شاخص‌های محصول شامل کاربران ثبت‌شده، کاربران فعال روزانه/هفتگی/ماهانه، تعداد نشست‌ها، ارزیابی‌های تکمیل‌شده و روند استفاده‌اند. هشدار در اختلاف نسخه، افزایش خطا یا استفاده از نسخهٔ بازنشسته فعال می‌شود. health check وابستگی‌ها را گزارش می‌کند ولی اطلاعات حساس را افشا نمی‌کند؛ telemetry محصول نیز نباید دادهٔ سلامت را وارد سامانهٔ مانیتورینگ کند.

## ۸. استقرار پیشنهادی

در شروع، یک modular monolith با مرزهای ماژولی بالا و worker جدا هزینهٔ عملیاتی را کم می‌کند. قراردادها و مالکیت داده طوری تعریف می‌شوند که موتور قوانین یا کاتالوگ در صورت نیاز مستقل شوند. محیط‌های توسعه، آزمون، staging و production پایگاه داده و کلیدهای جدا دارند؛ migrationها رو به جلو و سازگار با نسخهٔ قبلی‌اند.


### درگاه هم‌مبدأ Runtime برای مرورگر

آدرس Runtime بالینی مرورگر از آدرس Admin/OAuth مستقل است. در محیط‌هایی مانند RC که دسترسی مستقیم کاربر نهایی به hostname زیرساختی Worker ممکن است محدود باشد، وب‌اپ می‌تواند از مسیر هم‌مبدأ مانند `/runtime-api/v1/*` استفاده کند. Cloudflare Pages این مسیر را فقط به یک upstream ثابت و از پیش تعیین‌شده هدایت می‌کند؛ مقصد از ورودی کاربر ساخته نمی‌شود و این مسیر open proxy نیست. مسیرهای static باید با `_routes.json` از اجرای Function خارج بمانند و پاسخ‌های Runtime `no-store` باشند. Admin/OAuth تا زمانی که callback و redirect آن جداگانه اعتبارسنجی نشده، base URL مستقل خود را حفظ می‌کند.

## ۹. تصمیم‌های باز

- استانداردهای تبادل داده (مانند FHIR) و کدگذاری آزمایش/تشخیص؛
- فناوری DSL و sandbox موتور قوانین؛
- منبع معتبر و مجوز داده‌های برند/عرضه در ایران؛
- سیاست نهایی نگهداری داده و محل میزبانی؛
- فرایند رسمی اعتبارسنجی به‌عنوان نرم‌افزار پزشکی در بازار هدف.
## Physician Final Plan / Orders boundary (2026-08-15 roadmap extension)

The Clinical Decision Service may produce evidence-bound considerations, including `REQUEST_INVESTIGATION` for missing required data, but it does not sign orders.

The physician creates/signs an encounter-scoped `PhysicianFinalPlan`. The signed plan contains medication and/or investigation orders and is immutable; modifications create a superseding plan.

Care Team users with the required patient-access permission can read the latest signed plan. They may append operational fulfillment events but cannot alter the signed order. Medication payer codes and investigation service codes shown to Care Team are snapshots from the signed order, not ad-hoc UI guesses.

Laboratory results arriving later through OCR/PDF/manual/import use the Lab Master Registry observation model and may be linked to the originating investigation order. This creates the order -> execution -> result chain needed for longitudinal follow-up.

The Patient Record v2 runtime adapter owns this flow. Do not persist signed plans as a temporary field inside legacy `patient_handoffs`.
