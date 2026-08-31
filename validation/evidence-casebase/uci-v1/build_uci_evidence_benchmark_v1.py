from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent
URL = "https://archive.ics.uci.edu/static/public/296/diabetes%2B130-us%2Bhospitals%2Bfor%2Byears%2B1999-2008.zip"
SOURCE_DOI = "10.24432/C5230J"

MED_COLS = [
    "metformin", "repaglinide", "nateglinide", "chlorpropamide",
    "glimepiride", "acetohexamide", "glipizide", "glyburide",
    "tolbutamide", "pioglitazone", "rosiglitazone", "acarbose",
    "miglitol", "troglitazone", "tolazamide", "examide",
    "citoglipton", "insulin", "glyburide-metformin",
    "glipizide-metformin", "glimepiride-pioglitazone",
    "metformin-rosiglitazone", "metformin-pioglitazone",
]

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def normalize_diag(value: str | None) -> str | None:
    if value is None:
        return None
    s = value.strip()
    if not s or s == "?":
        return None
    return s

def diabetes_250_fifth_digit(code: str | None) -> str | None:
    if not code or not code.startswith("250"):
        return None
    digits = "".join(ch for ch in code if ch.isdigit())
    # 250.xx -> five digits total after removing decimal, e.g. 250.13 -> 25013.
    return digits[-1] if len(digits) >= 5 else None

def diabetes_type_phenotype(diags: list[str | None]) -> str:
    t2_or_unspecified = False
    t1 = False
    for code in diags:
        fifth = diabetes_250_fifth_digit(code)
        if fifth in {"0", "2"}:
            t2_or_unspecified = True
        elif fifth in {"1", "3"}:
            t1 = True
    if t2_or_unspecified and t1:
        return "conflicting_type_codes"
    if t2_or_unspecified:
        return "type2_or_unspecified_compatible"
    if t1:
        return "type1_compatible"
    return "diabetes_type_not_explicit"

def acute_crisis(diags: list[str | None]) -> str:
    # ICD-9 250.1x = diabetes with ketoacidosis
    # ICD-9 250.2x = diabetes with hyperosmolarity
    has_dka = any(code and code.startswith("250.1") for code in diags)
    has_hhs = any(code and code.startswith("250.2") for code in diags)
    if has_dka and has_hhs:
        return "dka_and_hyperosmolarity"
    if has_dka:
        return "dka"
    if has_hhs:
        return "hyperosmolarity"
    return "none"

def active_meds(row: dict[str, str]) -> list[dict[str, str]]:
    result = []
    for name in MED_COLS:
        state = (row.get(name) or "").strip()
        if state and state not in {"No", "?"}:
            result.append({"generic": name, "state": state})
    return result

def a1c_information(row: dict[str, str]) -> dict:
    raw = (row.get("A1Cresult") or "").strip()
    if raw in {"", "?", "None"}:
        return {
            "raw": raw or None,
            "numeric_exact_available": False,
            "category": "not_measured_or_not_recorded",
        }
    # UCI exposes categorical result, not an exact patient-level HbA1c number.
    return {
        "raw": raw,
        "numeric_exact_available": False,
        "category": raw,
    }

def informativeness(case: dict) -> tuple:
    crisis_rank = {
        "dka_and_hyperosmolarity": 4,
        "dka": 3,
        "hyperosmolarity": 2,
        "none": 0,
    }.get(case["acute_crisis"], 0)
    a1c_rank = {
        ">8": 3,
        ">7": 2,
        "Norm": 1,
        "not_measured_or_not_recorded": 0,
    }.get(case["a1c"]["category"], 0)
    med_rank = min(10, len(case["active_diabetes_meds"]))
    encounter = int(case["source_encounter_id"]) if str(case["source_encounter_id"]).isdigit() else 0
    return (crisis_rank, a1c_rank, med_rank, encounter)

def main():
    zip_path = OUT / "uci_diabetes_130_us_hospitals.zip"
    if zip_path.exists():
        payload = zip_path.read_bytes()
    else:
        print(f"Downloading UCI dataset: {URL}")
        with urllib.request.urlopen(URL, timeout=180) as r:
            payload = r.read()
        zip_path.write_bytes(payload)

    source_zip_sha256 = sha256_bytes(payload)

    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        names = z.namelist()
        csv_name = next((n for n in names if n.endswith("diabetic_data.csv")), None)
        if not csv_name:
            raise RuntimeError("diabetic_data.csv not found in UCI archive")
        csv_bytes = z.read(csv_name)

    csv_sha256 = sha256_bytes(csv_bytes)
    text = csv_bytes.decode("utf-8", errors="strict")
    rows = list(csv.DictReader(io.StringIO(text)))

    all_cases = []
    phenotype_counts = Counter()
    crisis_counts = Counter()
    a1c_counts = Counter()
    readmission_counts = Counter()
    patients = defaultdict(list)

    for row in rows:
        diags = [normalize_diag(row.get(c)) for c in ("diag_1", "diag_2", "diag_3")]
        phenotype = diabetes_type_phenotype(diags)
        crisis = acute_crisis(diags)
        a1c = a1c_information(row)

        case = {
            "case_id": f"UCI-{row.get('encounter_id')}",
            "source_id": "UCI-DIABETES-130-US",
            "source_doi": SOURCE_DOI,
            "source_patient_id": row.get("patient_nbr"),
            "source_encounter_id": row.get("encounter_id"),
            "setting": "inpatient",
            "age_band": row.get("age"),
            "sex": row.get("gender"),
            "race_ethnicity": row.get("race"),
            "diabetes_type_phenotype": phenotype,
            "t2dm_confirmed": False,
            "acute_crisis": crisis,
            "a1c": a1c,
            "active_diabetes_meds": active_meds(row),
            "medication_change": row.get("change"),
            "diabetes_med_flag": row.get("diabetesMed"),
            "readmission": row.get("readmitted"),
            "raw_diagnosis_codes": diags,
        }

        all_cases.append(case)
        phenotype_counts[phenotype] += 1
        crisis_counts[crisis] += 1
        a1c_counts[a1c["category"]] += 1
        readmission_counts[str(row.get("readmitted"))] += 1
        patients[str(row.get("patient_nbr"))].append(case)

    # Primary benchmark: one deterministic, maximally informative encounter per patient.
    primary = []
    for patient_id, cases in patients.items():
        chosen = max(cases, key=informativeness)
        primary.append(chosen)

    primary.sort(key=lambda x: int(x["source_encounter_id"]) if str(x["source_encounter_id"]).isdigit() else 0)

    # T2DM benchmark subset is intentionally named "compatible", not confirmed.
    primary_t2_compatible = [
        c for c in primary
        if c["diabetes_type_phenotype"] == "type2_or_unspecified_compatible"
    ]

    def write_jsonl(path: Path, data):
        with path.open("w", encoding="utf-8", newline="\n") as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")

    write_jsonl(OUT / "uci_primary_patient_benchmark.jsonl", primary)
    write_jsonl(OUT / "uci_primary_t2_or_unspecified_compatible.jsonl", primary_t2_compatible)

    summary = {
        "benchmark_version": "GLYMIZE-UCI-EVIDENCE-v1",
        "generated_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "source": {
            "name": "Diabetes 130-US Hospitals for Years 1999-2008",
            "repository": "UCI Machine Learning Repository",
            "doi": SOURCE_DOI,
            "url": "https://archive.ics.uci.edu/dataset/296/diabetes+130-us+hospitals+for+years+1999-2008",
            "license": "CC BY 4.0",
            "source_zip_sha256": source_zip_sha256,
            "diabetic_data_csv_sha256": csv_sha256,
        },
        "methodology": {
            "non_fabrication": True,
            "numeric_hba1c_imputation": False,
            "age_midpoint_imputation": False,
            "t2dm_claim": "type2_or_unspecified_compatible, not confirmed",
            "primary_unit": "one deterministically selected encounter per patient",
            "selection": "prioritize acute crisis, then informative A1C category, active medication count, encounter_id",
        },
        "counts": {
            "all_encounters": len(all_cases),
            "unique_patients": len(patients),
            "primary_patient_cases": len(primary),
            "primary_type2_or_unspecified_compatible": len(primary_t2_compatible),
            "phenotype": dict(phenotype_counts),
            "acute_crisis": dict(crisis_counts),
            "a1c": dict(a1c_counts),
            "readmission": dict(readmission_counts),
        },
        "scientific_scope": {
            "valid_for": [
                "retrospective safety guardrail testing",
                "missing-data fail-safe behavior",
                "acute DKA recognition benchmark",
                "medication-state parsing robustness",
                "patient-level non-leakage benchmark construction",
            ],
            "not_valid_as_standalone_gold_standard_for": [
                "modern outpatient medication recommendation accuracy",
                "Iran insurance or price validation",
                "exact HbA1c-target decisions",
                "modern SGLT2/GLP-1 therapeutic superiority",
            ],
            "known_schema_gap_to_measure": [
                "hyperosmolar crisis/HHS is clinically urgent but GLYMIZE currently needs an explicit representable input pathway for it",
            ],
        },
    }

    (OUT / "uci_benchmark_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(summary["counts"], ensure_ascii=False, indent=2))
    print("ZIP SHA256:", source_zip_sha256)
    print("CSV SHA256:", csv_sha256)
    print("Primary benchmark:", OUT / "uci_primary_patient_benchmark.jsonl")

if __name__ == "__main__":
    main()