import { describe, expect, it } from "vitest";
import type {
  GenericMedication,
  InsuranceCoverage,
  InsuranceProvider,
  MedicationPrice,
  Type2ConsiderationRequest,
  Type2DecisionFactor,
  Type2MedicationConsideration,
} from "@glymize/contracts";
import { buildType2Assessment } from "../src/index.js";
import { buildType2TreatmentScenarios } from "../src/scenario-engine.js";

const drugs: GenericMedication[] = [
  { id:"metformin",canonicalName:"Metformin",persianName:"متفورمین",className:"Biguanide",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral" },
  { id:"empagliflozin",canonicalName:"Empagliflozin",persianName:"امپاگلیفلوزین",className:"SGLT2 inhibitor",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral" },
  { id:"semaglutide",canonicalName:"Semaglutide",persianName:"سماگلوتاید",className:"GLP-1 receptor agonist",therapyGroup:"glp_1_receptor_agonist",administrationRoute:"subcutaneous" },
  { id:"sitagliptin",canonicalName:"Sitagliptin",persianName:"سیتاگلیپتین",className:"DPP-4 inhibitor",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral" },
  { id:"glimepiride",canonicalName:"Glimepiride",persianName:"گلیمپیرید",className:"Sulfonylurea",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral" },
  { id:"pioglitazone",canonicalName:"Pioglitazone",persianName:"پیوگلیتازون",className:"Thiazolidinedione",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral" },
  { id:"glargine",canonicalName:"Insulin glargine",persianName:"انسولین گلارژین",className:"Basal insulin analog",therapyGroup:"basal_insulin_analog",administrationRoute:"subcutaneous" },
  { id:"resmetirom",canonicalName:"Resmetirom",persianName:"رسمتیروم",className:"Liver-directed MASH therapy",therapyGroup:"liver_directed_therapy",administrationRoute:"oral" },
];

const providers: InsuranceProvider[] = ["social_security","health_insurance","armed_forces","other_organizations","supplementary"];
const factorPool: Type2DecisionFactor[] = ["ascvd","heart_failure","ckd","hypoglycemia_risk","weight_priority","masld_mash","diabetic_foot","frailty"];

function rng(seed:number){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
function pick<T>(r:()=>number,values:readonly T[]):T{return values[Math.floor(r()*values.length)]!}
function chance(r:()=>number,p:number){return r()<p}
function round1(n:number){return Math.round(n*10)/10}
function price(amountToman:number):MedicationPrice{return{amountToman,priceKind:"consumer_retail"}}
function coverage(provider:InsuranceProvider,percent:number,retail:number):InsuranceCoverage{
  const reference=Math.round(retail*(0.7+Math.random()*0.2));
  return{provider,percent,referencePriceToman:reference,runtimeEligibleForRanking:true};
}

function buildCase(index:number){
  const r=rng(0x51f15e+index*7919);
  const provider=pick(r,providers);
  const currentHba1c=round1(5.6+r()*6.2);
  const targetHba1c=pick(r,[6.5,7,7.5,8]);
  const factors=factorPool.filter(()=>chance(r,0.19));
  const ckd=factors.includes("ckd");
  const hf=factors.includes("heart_failure");
  const masld=factors.includes("masld_mash");
  const eGfr=ckd?Math.round(8+r()*82):undefined;
  const dialysis=ckd&&eGfr!==undefined&&eGfr<15&&chance(r,0.55);
  const hyperglycemiaSymptoms=chance(r,0.07);
  const catabolicFeatures=chance(r,0.04);
  const routePreference=chance(r,0.23)?"oral_only":"oral_and_injectable" as const;
  const costPreference=pick(r,["no_constraint","moderate","low_cost_only","insured_only"] as const);
  const currentMedications=chance(r,0.52)?[{
    genericMedicationId:"metformin",genericName:"Metformin",doseAmount:500,doseUnit:"mg",frequencyPerDay:pick(r,[1,2,3]),status:"active" as const,adherence:pick(r,["good","partial","poor","unknown"] as const),tolerance:"good" as const,
  }]:[];
  const request:Type2ConsiderationRequest={
    currentHba1c,targetHba1c,factors,costPreference,routePreference,hyperglycemiaSymptoms,catabolicFeatures,currentMedications,
    clinicalContext:{
      cardiovascular:{ascvd:factors.includes("ascvd"),heartFailure:hf,lvefPercent:hf?Math.round(25+r()*40):undefined},
      kidney:{ckd,eGfr,uacrMgG:ckd?Math.round(r()*1200):undefined,dialysis,recentAki:ckd&&chance(r,0.08)},
      liver:{masldMash:masld,fibrosisStage:masld?pick(r,["F0","F1","F2","F3","F4","unknown"] as const):undefined,cirrhosis:masld&&chance(r,0.08)},
      anthropometrics:{bmi:round1(20+r()*23),weightKg:Math.round(50+r()*90),heightCm:Math.round(150+r()*45)},
      ageYears:Math.round(25+r()*65),sexAtBirth:pick(r,["female","male"] as const),
    },
  };
  const assessment=buildType2Assessment(drugs,request);
  const enriched={...assessment,medications:assessment.medications.map((item):Type2MedicationConsideration=>{
    const retail=Math.round(20_000+r()*1_980_000);
    const covered=chance(r,0.72);
    const coverages=covered?[{provider,percent:Math.round(10+r()*90),referencePriceToman:Math.round(retail*(0.55+r()*0.4)),runtimeEligibleForRanking:true} satisfies InsuranceCoverage]:[];
    return{...item,price:price(retail),insuranceCoverages:coverages};
  })};
  const scenarios=buildType2TreatmentScenarios({assessment:enriched,request,insuranceProvider:provider,sortMode:pick(r,["balanced","clinical","patient_cost","insurance_access"] as const),maxScenarios:3});
  return{request,assessment:enriched,scenarios,provider};
}

describe("GLYMIZE deterministic 1000-case randomized stress validation",()=>{
  it("preserves structural, safety, access, and cost invariants across 1000 cases",()=>{
    const summary={cases:1000,urgent:0,maintain:0,insuredOnly:0,oralOnly:0,dialysis:0,ckd:0,hf:0,ascvd:0,priceEstimates:0,exactCostEstimates:0,accessFallbackMaintains:0};
    for(let i=0;i<1000;i++){
      const {request,assessment,scenarios}=buildCase(i);
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.length).toBeLessThanOrEqual(3);
      expect(new Set(scenarios.map(s=>s.id)).size).toBe(scenarios.length);
      scenarios.forEach((scenario,index)=>{
        expect(scenario.rank).toBe(index+1);
        expect(new Set(scenario.medicationIds).size).toBe(scenario.medicationIds.length);
        scenario.cost30Days.forEach(cost=>{
          summary.priceEstimates++;
          for(const value of [cost.retailPerPackageToman,cost.patientPerPackageToman,cost.insurerPerPackageToman,cost.retail30DaysToman,cost.patient30DaysToman,cost.insurer30DaysToman]){
            if(value!==undefined)expect(value).toBeGreaterThanOrEqual(0);
          }
          if(cost.status==="calculated")summary.exactCostEstimates++;
        });
      });
      const urgent=Boolean(request.hyperglycemiaSymptoms||request.catabolicFeatures||request.currentHba1c>10);
      if(urgent){summary.urgent++;expect(assessment.recommendation.urgentReview).toBe(true);expect(scenarios.some(s=>s.urgentReview)||scenarios[0]?.kind==="maintain_monitor").toBe(true)}
      if(scenarios[0]?.kind==="maintain_monitor")summary.maintain++;
      if(request.costPreference==="insured_only"){
        summary.insuredOnly++;
        for(const scenario of scenarios)for(const medication of scenario.medications)expect(medication.insuranceCoverages.some(c=>c.percent>0)).toBe(true);
        if(scenarios[0]?.kind==="maintain_monitor"&&assessment.recommendation.hba1cGap>0)summary.accessFallbackMaintains++;
      }
      if(request.routePreference==="oral_only"){
        summary.oralOnly++;
        for(const scenario of scenarios)for(const medication of scenario.medications)expect(["glp_1_receptor_agonist","dual_gip_glp_1_receptor_agonist","human_insulin","basal_insulin_analog","prandial_insulin_analog","premixed_insulin","fixed_ratio_combination"]).not.toContain(medication.therapyGroup);
      }
      const kidney=request.clinicalContext?.kidney;
      if(kidney?.ckd)summary.ckd++;
      if(kidney?.dialysis){summary.dialysis++;expect(scenarios[0]?.medicationIds[0]).not.toBe("empagliflozin")}
      if(request.factors.includes("heart_failure")){summary.hf++;expect(scenarios[0]?.medicationIds[0]).not.toBe("pioglitazone")}
      if(request.factors.includes("ascvd"))summary.ascvd++;
      if(request.factors.includes("hypoglycemia_risk")&&!urgent&&scenarios[0]?.medicationIds.length){expect(["glargine","glimepiride"]).not.toContain(scenarios[0]?.medicationIds[0])}
      if((kidney?.eGfr??999)<20&&!kidney?.dialysis&&scenarios[0]?.medicationIds.length){expect(scenarios[0]?.medicationIds[0]).not.toBe("empagliflozin")}
    }
    console.log("GLYMIZE_STRESS_1000_SUMMARY",JSON.stringify(summary));
  },30000);
});
