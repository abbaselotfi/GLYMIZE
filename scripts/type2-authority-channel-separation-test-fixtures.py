from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact marker, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "packages/clinical-engine/test/mash-wegovy-titration-cost-v2.test.ts",
    '''    expect(enriched.monthlyPatientCostToman).toBeUndefined();\n    expect(enriched.insuranceFit).toBe("unknown");\n    expect(enriched.gate.status).toBe("exclude");\n    expect(enriched.cautions.join(" ").toLocaleLowerCase()).toContain("claim timing");''',
    '''    expect(enriched.monthlyPatientCostToman).toBeUndefined();\n    expect(enriched.insuranceFit).toBe("unknown");\n    expect(enriched.gate.status).toBe("pass");\n    expect(enriched.selectionConstraint?.status).toBe("blocked");\n    expect(enriched.selectionConstraint?.kinds).toContain("access");\n    expect(enriched.selectionConstraint?.reasons.join(" ")).toContain("insured-only");\n    expect(enriched.cautions.join(" ").toLocaleLowerCase()).toContain("claim timing");''',
)

replace_once(
    "packages/clinical-engine/test/wegovy-continuation-window-cost-v2.test.ts",
    '''    expect(enriched.insuranceFit).toBe("unknown");\n    expect(enriched.monthlyPatientCostToman).toBeUndefined();\n    expect(enriched.gate.status).toBe("exclude");\n    expect(enriched.cautions.join(" ")).toContain("display-only");''',
    '''    expect(enriched.insuranceFit).toBe("unknown");\n    expect(enriched.monthlyPatientCostToman).toBeUndefined();\n    expect(enriched.gate.status).toBe("pass");\n    expect(enriched.selectionConstraint?.status).toBe("blocked");\n    expect(enriched.selectionConstraint?.kinds).toContain("access");\n    expect(enriched.selectionConstraint?.reasons.join(" ")).toContain("insured-only");\n    expect(enriched.cautions.join(" ")).toContain("display-only");''',
)

print("TYPE2 AUTHORITY TEST EXPECTATIONS MIGRATED")
