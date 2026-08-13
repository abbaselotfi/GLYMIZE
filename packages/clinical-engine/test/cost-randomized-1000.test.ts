import { describe, expect, it } from "vitest";
import { estimateType2Medication30DayCost } from "../src/scenario-engine-safe.js";

function rng(seed:number){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}

describe("randomized 1000-case insurance arithmetic",()=>{
  it("keeps package and monthly reimbursement arithmetic bounded",()=>{
    const r=rng(812771);
    for(let index=0;index<1000;index++){
      const retail=10_000+Math.round(r()*1_990_000);
      const reference=Math.round(retail*(.5+r()));
      const percent=Math.round(r()*100);
      const dailyUnits=1+Math.floor(r()*4);
      const unitsPerPackage=10+Math.floor(r()*111);
      const result=estimateType2Medication30DayCost({
        price:{amountToman:retail,priceKind:"consumer_retail"},
        coverages:[{provider:"social_security",percent,referencePriceToman:reference,runtimeEligibleForRanking:true}],
        insuranceProvider:"social_security",
        plan:{dailyUnits,unitsPerPackage,unitLabel:"unit"},
      });
      const packages=Math.ceil((dailyUnits*30)/unitsPerPackage);
      expect(result.packagesFor30Days).toBe(packages);
      expect(result.retail30DaysToman).toBe(packages*retail);
      expect(result.patientPerPackageToman).toBeGreaterThanOrEqual(0);
      expect(result.insurerPerPackageToman).toBeGreaterThanOrEqual(0);
      expect(result.patientPerPackageToman!).toBeLessThanOrEqual(retail);
      expect(result.insurerPerPackageToman!).toBeLessThanOrEqual(retail);
      expect(result.patientPerPackageToman!+result.insurerPerPackageToman!).toBe(retail);
    }
  });
});
