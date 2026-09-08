from pathlib import Path

path = Path("apps/web/app/admin/ai-models/page.tsx")
text = path.read_text(encoding="utf-8")

old_import = 'import styles from "./ai-models.module.css";\n'
new_import = 'import { parseAiAdminPreviewStorage, serializeAiAdminPreviewStorage } from "../../../lib/ai-admin-preview-storage";\nimport styles from "./ai-models.module.css";\n'
if text.count(old_import) != 1:
    raise SystemExit("styles import marker mismatch")
text = text.replace(old_import, new_import, 1)

old_load = '''        const saved = window.localStorage.getItem(LOCAL_KEY);\n        setModels(saved ? JSON.parse(saved) as Draft[] : [fresh(1)]);'''
new_load = '''        const saved = window.localStorage.getItem(LOCAL_KEY);\n        const parsed = parseAiAdminPreviewStorage(saved);\n        if (!parsed) {\n          setModels([fresh(1)]);\n        } else {\n          setModels(parsed.models as Draft[]);\n          if (parsed.migratedFromLegacy) {\n            window.localStorage.setItem(LOCAL_KEY, serializeAiAdminPreviewStorage(parsed.models));\n          }\n        }'''
if text.count(old_load) != 1:
    raise SystemExit("local preview load marker mismatch")
text = text.replace(old_load, new_load, 1)

old_write = 'window.localStorage.setItem(LOCAL_KEY, JSON.stringify(stripSecrets(next)));'
if text.count(old_write) != 2:
    raise SystemExit(f"local preview write marker mismatch: {text.count(old_write)}")
text = text.replace(old_write, 'window.localStorage.setItem(LOCAL_KEY, serializeAiAdminPreviewStorage(stripSecrets(next)));')

path.write_text(text, encoding="utf-8")
