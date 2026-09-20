# معماری سامانه

## Windows reference shell implementation — R30-03-B (2026-09-20; native acceptance pending)

[The B implementation](R30_03_B_DESKTOP_REFERENCE_2026-09-20.md) adds an isolated deterministic desktop export/stage, strict file/hash/P0 manifest validation, installed-reference semantics and a minimal Tauri 2 scaffold. The native candidate grants no IPC commands/plugins, denies remote navigation/new windows/downloads, disables asset filesystem access and uses a restrictive CSP plus offline WebView2 NSIS candidate. Browser evidence proves the staged renderer makes no external requests and creates no SW/storage state; it does not prove the effective compiled WebView or installer. Rust/MSVC provisioning, Cargo lock, native compile/install/blackout and effective policy negatives remain R30-03-C. Normal root and `/GLYMIZE` web exports retain their tested behavior. No PHI, auth, clinical authority, migration, cloud activation or signing boundary changed.

## Windows reference shell — R30-03-A (2026-09-20; design)

[The Windows shell contract](architecture/WINDOWS_SHELL_R30_03_A.md) chooses embedded Tauri 2 static assets with a dedicated reference-only build profile, isolated staging and reused `/offline/` UI/parser/P0 projection. It does not wrap the RC website or run a Node sidecar. No clinician auth, public-cache permission bypass, privileged IPC, arbitrary local files/SQL/HTTP, remote navigation or Service Worker startup requirement belongs to the first desktop packet. Explicit native navigation policy, capabilities and CSP are separately verified in the packaged WebView2 runtime. A disconnected installer includes its WebView2 prerequisite; signed distribution remains R30-08. R30-04/05/06/07 retain encrypted local records, engine authority, sync and grants. Next B implementation uses Sol High after the owner checkpoint; C supplies actual native acceptance. Current web/RC behavior is unchanged.

## RC deployment boundary — R29-05-C (2026-09-19)

`apps/admin-worker/wrangler.rc.jsonc` pins the existing RC Worker/D1/KV/R2 independently of the production config, retains remote variables, and discovers only owner-authorized migration 0018. Migration 0019 and new read/offline flags remain gated. Pages' provider-labelled production slot belongs to `rc.glymize.ir`; direct upload there does not merge Git main or deploy the production Worker. [Release evidence and recovery points](R29_05_C_RC_DEPLOYMENT_2026-09-19.md) distinguish deployment smoke from clinical/performance acceptance.

September 16 R29-05-B follow-up: per-component insurance prefiltering removes only impossible product/master matches before the existing calculator; order, exact-match priority and fallback remain unchanged. No persistent/shared cache. Differential tests cover duplicate and other-brand rules. Integration timeouts now explicitly allow 15s for full-market cold execution; performance SLO/RC acceptance remains separate.

## Type 2 inventory build-local indexes — R29-05-B (2026-09-15)

[Regression repair and RC readiness](R29_05_B_RC_READINESS_AND_TYPE2_FIX_2026-09-15.md): approved-master and mapped-product lookups preserve first-match semantics using build-local indexes; the fixed asOf calendar conversion is shared within one build. No global patient/date cache or ranking/license policy changes. RC resource identity must come from active deployment version bindings, not generic settings alone. Prior fix-branch Git publication succeeded with Pages is_skipped=true; no deployment ran.

## Rollout evidence is not release acceptance — R29-05-A (2026-09-15)

[Local matrix](R29_05_A_LOCAL_ROLLOUT_2026-09-15.md) exercises eight independent read-flag configurations and full rollback for both history families through the facade. The runner binds results to scoped source hashes and leaves provider/CPU/rows/deployment evidence unknown. No runtime or flag default changes. Remote individual/in-flight/version rollback and RC budgets remain separate gates. Git publication also respects the no-deploy boundary: Pages currently previews all branches, so an authorized Push is withheld until safe branch settings and other triggers are verified.

## Narrow history lookup — R29-04-E (local implementation, 2026-09-14)

[E implementation](R29_04_E_HISTORY_SCOPE_2026-09-14.md) follows D: a shared measured registry query retains exact scoped binds and first-query ownership. Only exact authorized history GET selects it under independent default-OFF PATIENT_CORE_HISTORY_SCOPE_LOOKUP_ENABLED. Full summary still reads/decrypts its own fields; opt-in history does not inherit unused companion failures. No auth/authority/write redirection, global cache or migration. Local successful fixtures use three instead of six queries; RC performance and activation remain pending.

## History existence boundary — R29-04-D (review, 2026-09-14)

[D contract](architecture/HISTORY_SCOPE_LOOKUP_R29_04_D.md) permits an independent default-OFF history-only scoped registry lookup in the next implementation. Existence is not authorization: original primary session/role gates and requested-payload AAD failures remain strict. Unused identifiers/demographics/latest-encounter dependencies may be removed from history, with an explicit change to unrelated-error propagation; full summary remains unchanged. Preserve archive/cursor precedence and request-owned read-session routing. No runtime implementation in this review.

## Index tradeoffs — R29-04-C (2026-09-14)

[Local experiments](R29_04_C_INDEX_TRADEOFFS_2026-09-14.md) measure individual observation/encounter/fulfillment/link index candidates and preserve SQL outputs. Encounter and fulfillment tie-break sorts improve independently; outer order sort/count work remains. B-tree allocation and compiled INSERT structure are not production costs. Candidates remain outside migrations; authority/runtime behavior is unchanged. Next bounded High review resolves the unused-summary history gate before any implementation.

## Query/index evidence — R29-04-B (2026-09-14)

[Local assessment](R29_04_B_QUERY_PLANS_2026-09-14.md) isolates hypothetical index experiments in in-memory SQLite and extracts actual source SQL. Observation ordering has a measured index candidate, but counts and correlated revision lookup remain. No runtime/schema contract changes: preserve tenant/sourceVersion/tie-break/exclusion semantics. Planner output is not rows_read or Worker CPU; require write/storage and RC evidence before choosing a migration. Timeline assessment remains separate.

## Request-owned clinical keys — R29-04-A (2026-09-14)

[Local implementation and evidence](R29_04_A_REQUEST_KEYS_2026-09-14.md): exact authorized history GET owns a lazy decrypt-only CryptoKey closure behind independent, default-OFF PATIENT_CORE_CRYPTO_KEY_REUSE_ENABLED. Readers accept a narrow optional decrypt capability; legacy callers retain original derivation. AAD, SQL, auth/write boundaries and decryption counts stay unchanged. No global key/PHI cache or plaintext memoization. Failed derivation is bounded to its request; future requests create fresh keys. Local tests pass; Worker CPU and RC activation remain pending. Next Medium packet assesses query plans/rows before selecting index changes.

## D1 bookmark transport — R29-03-B, 2026-09-14 (conditional design)

The [B review](architecture/D1_BOOKMARK_TRANSPORT_R29_03_B.md) resolves the future session-envelope boundary: exact primary-verified sessionId and expiry, trusted runtime audience/database epoch, authenticated encryption under a distinct purpose, and per-attempt/per-view generation ownership. Refresh/admin fallback and overlapping or ambiguous writes must invalidate chains; no client assertion grants authority. **Transport implementation is deferred pending a useful reviewed consumer**; current history always starts fresh-primary, so no header/crypto/lifecycle layer is added merely to round-trip an unused bookmark. A and real replica/RC gates remain unchanged and OFF. This is not full R29-03 completion; next is R29-04-A request-owned CryptoKey work.

## D1 read consistency — R29-03-A, 2026-09-13 (local implementation)

The [R29-03 design](architecture/D1_READ_CONSISTENCY_R29_03.md) has a [local A implementation](R29_03_A_READ_SESSIONS_2026-09-13.md): exact history GET can opt into a request-owned fresh-primary session and serialized fixed-reader capability. Only explicit string `true` enables `PATIENT_CORE_D1_READ_SESSIONS_ENABLED`; all configuration stays OFF. Original auth/revocation/authorization and write/authority contexts are retained. Cursor validation precedes session creation; the registry lookup anchors it. Failed queries stop queued execution, and final bookmark bytes are not transported/logged. Metric-v2 distinguishes requested routing from observed/unknown provider metadata. Sessions are not snapshots, permissions, revisions or offline grants. B cross-request transport and workerd/RC benefit/activation gates remain pending. Code rollback returns to direct-primary independently of provider shutdown; no new database or paid cache service.

## Offline reference authority — R30-02-D1/D2, 2026-09-13 (local implementation)

The [D design](architecture/OFFLINE_REFERENCE_AUTHORITY_R30_02_D.md) is implemented locally in the [D1/D2 packet](R30_02_REFERENCE_LITE_2026-09-12.md). Source `nfi_verified` is now recognized; downstream identity-match `verified` and clinical/payer gates are unchanged. Missing evidence cannot manufacture a current observation or active license. Exact `/offline/` is a standalone reference-only surface, with an explicit sanitized projection, bounded read-only loader and in-memory search; it does not call draft-preferred catalog, auth or engine singletons. The opt-in/default-off reference-lite profile replaces the experimental raw-data/four-clinical-shell bundle. Cache activation removes this scope's legacy/experimental caches, retains only a reference-lite predecessor, and preserves unrelated caches/drafts. Explicit download readiness checks profile and cache completeness. Hashes do not authorize treatment. Offline calculation and protected records retain separate policy/grant gates; no production activation.

## Static/offline compatibility — 2026-09-12 (local infrastructure implemented)

The [R30-02 design](architecture/STATIC_OFFLINE_COMPATIBILITY_R30_02.md) is implemented locally for A–C infrastructure: static clinician patient entry with exact query ID and narrow legacy bridge, document navigation for opt-in P0 targets, and validated market transport shared by presentation and Type 2 projections. [A–C evidence](R30_02_STATIC_COMPATIBILITY_2026-09-12.md) is historical; D1/D2 above subsequently corrects its zero-output status mismatch and narrows the offline profile. Clinical session restoration and catalog draft isolation remain offline-calculation gates. Activation stays OFF.

## Public offline cache — R29-02/R30-02, 2026-09-11

An opt-in static build generates content-addressed P0 snapshots and an embedded manifest for a separate Service Worker template. Browser persistent storage holds verified current/previous bundles; a bounded public-response memory cache runs in the browser worker; Pages CDN headers apply only to immutable snapshot URLs. No new Cloudflare Worker cache or PHI/auth persistence is introduced. Default build behavior preserves the legacy PWA, now with scoped cache cleanup. Actual full-app activation remains gated on dynamic patient-route export, public RSC navigation and market-loader compatibility, documented in [the cache packet](R29_02_R30_02_PUBLIC_OFFLINE_CACHE_2026-09-11.md).

## Read-cost observability — R29-01, 2026-09-11

`runtime-read-metrics.ts` emits additive metric version 2: returned rows (legacy `rowCount` alias), known D1 scan rows with coverage, query/decryption attempt and failure counts. Collectors remain request-local and preserve operation results/errors. Missing D1 envelopes are unknown rather than zero; summed operation wall durations are not CPU. The local benchmark runs synthetic query counts with real crypto and records process CPU separately. [R29-01 evidence and remaining RC gate](R29_01_RESOURCE_BASELINE_2026-09-11.md) prevents these local timings from being treated as deployed Worker measurements. No clinical or authorization authority changes.

## Accepted local-first direction — 2026-09-11 (not yet implemented)

Canonical `ROADMAP.md` sections 29–30 schedule resource budgets, classified caches and consistent D1 reads alongside PWA Offline-Lite and enrolled Windows Tauri Offline-Full. The planned desktop runs the existing deterministic clinical engine with encrypted practice/device-scoped SQLite, protected device keys and explicit offline grants. A repository adapter and revisioned outbox/inbox synchronize with Worker/D1; conflicts cannot silently overwrite clinical authority. GitHub/Cloudflare reachability must not be required to start the installed app or execute accepted local workflows. Online-only services expose unavailable/queued states. Current Worker/D1 behavior remains authoritative until the corresponding implementation gates pass.

The [R30-01 architecture companion](architecture/LOCAL_FIRST_R30_01.md) now defines the design: committed server facts and pending local drafts are separate; canonical sign-off and slot reservation remain online initially; patient-account and clinician authorization stay separate. Device commands enforce scoped offline grants and existing route-equivalent permissions. Protected access cannot promise indefinite offline use with immediate remote revocation; R30-07 owns the explicit outage/renewal policy. P0/P1/P2/P3 data classes constrain all R29 caches; sync revisions, Patient Core traversal watermarks and D1 bookmarks remain distinct. No runtime capability is activated by this design.

## Patient module review lifecycle — 2026-09-10

`apps/web/lib/type2-handoff-review-controller.ts` owns cancellation, active actor/practice/patient binding and confirmation concurrency. `use-type2-patient-core-handoff.ts` connects it to React and runtime auth events. Auth events invalidate an active review only when the actor, practice, or active status changed; a same-actor token/profile refresh preserves the review and still requires the confirmation-time authorized read. Clinical candidate mapping stays in `type2-patient-core-handoff.ts`; authorized reads stay in the existing Patient Core HTTP client. Confirmation performs a second authorized read and source-revision comparison before form application. This adds no patient store, treatment authority or clinical rule.

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

یادداشت پزشک با revision append-only ذخیره می‌شود؛ visibility پیش‌فرض physician-only است. Patient Workspace باید همان `layoutPreset` موجود پزشک (`auto`, `focused_workflow`, `compact_cards`, `command_center`) را مصرف کند؛ یک preference موازی جدید ساخته نمی‌شود و preset فقط projection/progressive disclosure رابط را تغییر می‌دهد، نه clinical rule input/output یا دادهٔ ذخیره‌شده.

پس از اجرای migration `0003` روی D1 ایزولهٔ RC، فایل `0003` immutable/frozen است و هر تغییر schema بعدی باید migration جدید `0004+` باشد. Production تا عبور runtime/browser gate نباید Patient Record v2 را دریافت کند. در rollout تدریجی، legacy `patient_handoffs` و مسیر v2 هم‌زمان باقی می‌مانند؛ تا وقتی optimistic snapshot revision برای draft encounter کامل نشده، Care Team UI نباید repeated save را به create encounter جدید نگاشت کند.


> **وضعیت P2-C2C:** پس از cutover، `patient_handoffs` فقط یک منبع legacy read-only برای رکوردهای هنوز promote‌نشده است. Care Team، collision checking، ایجاد بیمار/ویزیت و revision همگی از Patient Record v2 استفاده می‌کنند. مسیرهای legacy `upsert` و `code-status` retired هستند؛ `lookup/list/records/:id` فقط تا پایان promotion داده‌های قدیمی باقی می‌مانند.
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
