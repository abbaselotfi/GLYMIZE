"use client";

import { useEffect, useState } from "react";
import {
  createAdminAiModel,
  deleteAdminAiModel,
  getAdminSession,
  isAdminApiConfigured,
  listAdminAiModels,
  testAdminAiModel,
  updateAdminAiModel,
  type AdminAiModel,
  type AdminAiModelInput,
} from "../../../lib/admin-auth";
import styles from "./ai-models.module.css";

type Draft = AdminAiModel & { isNew?: boolean };
const LOCAL_KEY = "glymize-ai-admin-preview-v1";

function fresh(priority: number): Draft {
  const now = new Date().toISOString();
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: priority === 1 ? "Cloudflare GLM 4.7 Flash" : "AI جدید",
    provider: "workers_ai",
    enabled: true,
    role: priority === 1 ? "primary" : "fallback",
    priority,
    accountId: priority === 1 ? "b20d3bdc6e9aa99609a44f4a147f9ac7" : "",
    gatewayId: "glymize-medical-ai",
    modelId: "@cf/zai-org/glm-4.7-flash",
    reasoningEffort: "low",
    maxCompletionTokens: 1000,
    timeoutMs: 45000,
    tokenConfigured: false,
    createdAt: now,
    updatedAt: now,
    isNew: true,
  };
}

function stripSecrets(models: Draft[]) {
  return models.map(({ isNew: _new, ...model }) => ({ ...model, tokenConfigured: false }));
}

export default function AdminAiModelsPage() {
  const [models, setModels] = useState<Draft[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("در حال خواندن تنظیمات AI…");
  const [busy, setBusy] = useState("");
  const remote = isAdminApiConfigured() && Boolean(getAdminSession());

  useEffect(() => {
    const run = async () => {
      if (isAdminApiConfigured() && getAdminSession()) {
        try {
          const result = await listAdminAiModels();
          setModels(result.length ? result : [fresh(1)]);
          setMessage(result.length ? "تنظیمات امن از Cloudflare Worker خوانده شد." : "هنوز AI ثبت نشده است.");
        } catch {
          setModels([fresh(1)]);
          setMessage("خواندن تنظیمات Worker ناموفق بود.");
        }
        return;
      }
      try {
        const saved = window.localStorage.getItem(LOCAL_KEY);
        setModels(saved ? JSON.parse(saved) as Draft[] : [fresh(1)]);
      } catch {
        setModels([fresh(1)]);
      }
      setMessage("Local Preview: Token ذخیره نمی‌شود و Test Connection غیرفعال است.");
    };
    void run();
  }, []);

  function patch(id: string, value: Partial<Draft>) {
    setModels((current) => current.map((model) => model.id === id ? { ...model, ...value } : model));
  }

  function inputFor(model: Draft): AdminAiModelInput {
    return {
      name: model.name.trim(),
      provider: model.provider,
      enabled: model.enabled,
      role: model.role,
      priority: Number(model.priority),
      accountId: model.accountId?.trim() || undefined,
      gatewayId: model.gatewayId?.trim() || undefined,
      baseUrl: model.baseUrl?.trim() || undefined,
      modelId: model.modelId.trim(),
      reasoningEffort: model.reasoningEffort,
      maxCompletionTokens: Number(model.maxCompletionTokens),
      timeoutMs: Number(model.timeoutMs),
      ...(tokens[model.id]?.trim() ? { token: tokens[model.id]!.trim() } : {}),
    };
  }

  async function save(model: Draft) {
    if (!remote) {
      const next = models.map((item) => item.id === model.id ? { ...item, tokenConfigured: false } : item);
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(stripSecrets(next)));
      setModels(next);
      setTokens((current) => ({ ...current, [model.id]: "" }));
      setMessage("پیش‌نمایش محلی ذخیره شد؛ Token در مرورگر ذخیره نشد.");
      return;
    }
    setBusy(model.id);
    try {
      const saved = model.isNew ? await createAdminAiModel(inputFor(model)) : await updateAdminAiModel(model.id, inputFor(model));
      setModels((current) => current.map((item) => item.id === model.id ? saved : item));
      setTokens((current) => ({ ...current, [model.id]: "" }));
      setMessage(`«${saved.name}» ذخیره شد${saved.tokenConfigured ? " · Token امن است." : "."}`);
    } catch (error) {
      setMessage(`ذخیره ناموفق بود: ${error instanceof Error ? error.message : "unknown_error"}`);
    } finally {
      setBusy("");
    }
  }

  async function remove(model: Draft) {
    if (!window.confirm(`«${model.name}» حذف شود؟`)) return;
    if (!remote || model.isNew) {
      const next = models.filter((item) => item.id !== model.id);
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(stripSecrets(next)));
      setModels(next);
      return;
    }
    setBusy(model.id);
    try {
      await deleteAdminAiModel(model.id);
      setModels((current) => current.filter((item) => item.id !== model.id));
      setMessage("AI حذف شد.");
    } catch (error) {
      setMessage(`حذف ناموفق بود: ${error instanceof Error ? error.message : "unknown_error"}`);
    } finally {
      setBusy("");
    }
  }

  async function test(model: Draft) {
    if (!remote || model.isNew) {
      setMessage("Test Connection پس از ورود Admin و ذخیره روی Worker فعال می‌شود.");
      return;
    }
    setBusy(model.id);
    try {
      const result = await testAdminAiModel(model.id);
      setMessage(result.healthy ? `اتصال سالم · ${result.latencyMs ?? "—"} ms · ${result.configuredModel ?? model.modelId}` : "مدل پاسخ سالم نداد.");
    } catch (error) {
      setMessage(`تست ناموفق بود: ${error instanceof Error ? error.message : "unknown_error"}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>GLYMIZE AI CONTROL</span>
          <h1>AI و مدل‌ها</h1>
          <p>مدل اصلی، fallback و مدل‌های Compare/QA را مدیریت کنید. مقدار Token بعد از Save هرگز از Backend به مرورگر برنمی‌گردد.</p>
        </div>
        <button className={styles.primary} onClick={() => setModels((current) => [...current, fresh(current.length + 1)])} type="button">+ افزودن AI</button>
      </header>
      <section className={remote ? styles.remote : styles.local} role="status"><b>{remote ? "Secure Worker mode" : "Local Preview mode"}</b><span>{message}</span></section>
      <section className={styles.note}><b>حریم خصوصی:</b> برای Workers AI، Worker درخواست را با <code>cf-aig-collect-log-payload: false</code> ارسال می‌کند. تنظیمات عمومی در KV و Token به‌صورت رمز‌شده ذخیره می‌شود.</section>
      <div className={styles.grid}>
        {models.map((model) => (
          <article className={styles.card} key={model.id}>
            <div className={styles.top}>
              <label className={styles.inline}><input checked={model.enabled} onChange={(event) => patch(model.id, { enabled: event.target.checked })} type="checkbox" />{model.enabled ? "فعال" : "غیرفعال"}</label>
              <span className={model.tokenConfigured ? styles.ok : styles.warn}>{model.tokenConfigured ? "Token: Configured ✓" : "Token: not configured"}</span>
            </div>
            <label><span>نام</span><input value={model.name} onChange={(event) => patch(model.id, { name: event.target.value })} /></label>
            <div className={styles.cols}>
              <label><span>Provider</span><select value={model.provider} onChange={(event) => patch(model.id, { provider: event.target.value as Draft["provider"] })}><option value="workers_ai">Cloudflare Workers AI</option><option value="openai_compatible">OpenAI-compatible HTTPS</option></select></label>
              <label><span>نقش</span><select value={model.role} onChange={(event) => patch(model.id, { role: event.target.value as Draft["role"] })}><option value="primary">Primary</option><option value="fallback">Fallback</option><option value="compare">Compare / QA</option></select></label>
            </div>
            <div className={styles.cols}>
              <label><span>Priority</span><input min={1} max={99} type="number" value={model.priority} onChange={(event) => patch(model.id, { priority: Number(event.target.value) })} /></label>
              <label><span>Reasoning</span><select value={model.reasoningEffort} onChange={(event) => patch(model.id, { reasoningEffort: event.target.value as Draft["reasoningEffort"] })}><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            </div>
            {model.provider === "workers_ai" ? <>
              <label><span>Cloudflare Account ID</span><input value={model.accountId ?? ""} onChange={(event) => patch(model.id, { accountId: event.target.value })} /></label>
              <label><span>AI Gateway ID</span><input value={model.gatewayId ?? ""} onChange={(event) => patch(model.id, { gatewayId: event.target.value })} /></label>
            </> : <label><span>Base URL</span><input placeholder="https://provider.example/v1" value={model.baseUrl ?? ""} onChange={(event) => patch(model.id, { baseUrl: event.target.value })} /></label>}
            <label><span>Model ID</span><input value={model.modelId} onChange={(event) => patch(model.id, { modelId: event.target.value })} /></label>
            <div className={styles.cols}>
              <label><span>Max completion tokens</span><input min={64} max={8192} type="number" value={model.maxCompletionTokens} onChange={(event) => patch(model.id, { maxCompletionTokens: Number(event.target.value) })} /></label>
              <label><span>Timeout (ms)</span><input min={5000} max={120000} step={1000} type="number" value={model.timeoutMs} onChange={(event) => patch(model.id, { timeoutMs: Number(event.target.value) })} /></label>
            </div>
            <label><span>{model.tokenConfigured ? "Token جدید (برای تعویض؛ اختیاری)" : "API Token"}</span><input autoComplete="new-password" type="password" value={tokens[model.id] ?? ""} onChange={(event) => setTokens((current) => ({ ...current, [model.id]: event.target.value }))} />{!remote && <small>Local Preview هیچ Tokenی را ذخیره نمی‌کند.</small>}</label>
            <div className={styles.actions}>
              <button className={styles.primary} disabled={busy === model.id} onClick={() => void save(model)} type="button">ذخیره</button>
              <button disabled={busy === model.id || !remote || model.isNew} onClick={() => void test(model)} type="button">Test connection</button>
              <button className={styles.danger} disabled={busy === model.id} onClick={() => void remove(model)} type="button">حذف</button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
