from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import normalize_bundle as _raw
from consensus_pipeline import _multidomain_scope_payload


class MultidomainScopeTests(unittest.TestCase):
    def test_default_scope_merges_phase4_entries_without_duplicates(self) -> None:
        payload, extension_count = _multidomain_scope_payload(_raw.DEFAULT_SCOPE_PATH)
        self.assertIsNotNone(payload)
        self.assertEqual(extension_count, 25)

        entries = payload["entries"] if payload else []
        canonical_names = [str(entry["canonicalName"]) for entry in entries]
        self.assertEqual(len(canonical_names), len(set(canonical_names)))
        self.assertIn("Metformin", canonical_names)
        self.assertIn("Losartan", canonical_names)
        self.assertIn("Finerenone", canonical_names)
        self.assertIn("Atorvastatin", canonical_names)

    def test_custom_scope_is_not_implicitly_extended(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            scope_path = Path(temp_dir) / "custom-scope.json"
            scope_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "entries": [
                            {
                                "canonicalName": "AuditOnlyDrug",
                                "aliases": ["AuditOnlyDrug"],
                                "clinicalDomains": ["audit"],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            payload, extension_count = _multidomain_scope_payload(scope_path)
            self.assertIsNone(payload)
            self.assertEqual(extension_count, 0)


if __name__ == "__main__":
    unittest.main()
