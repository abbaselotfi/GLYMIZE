import { describe, expect, it } from "vitest";
import type { GenericMedication, InsuranceProvider, Type2ConsiderationRequest, Type2MedicationConsideration } from "@glymize/contracts";
import { buildType2Assessment } from "../src/index.js";
import { buildType2TreatmentScenarios } from "../src/scenario-engine-safe.js";

const medicines:GenericMedication[]=[
  {id:"oral-a",canonicalName:"Oral A",persianName:"Oral A",className:"Oral class",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral"},
  {id:"oral-b",canonicalName:"Oral B",persianName:"Oral B",className:"Oral class B",therapyGroup:"oral_glucose_lowering",administrationRoute:"oral"},
];
const providers:InsuranceProvider[]=["social_security","health_insurance","armed_forces","other_organizations","supplementary"];
function rng(seed:number){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
function pick<T>(r:()=>number,items:readonly T[]):T{return items[Math.floor(r()*items.length)]!}

function makeCase(index:number){
  const r=rng(910247+index*3571),provider=pick(r,providers),origin=index%2===0?"assistant_handoff":"physician_direct" as const;
  const assistantValue=6+r()*5,assistantConfirmed=r()<.78;
  const currentHba1c=origin==="assistant_handoff"?(assistantConfirmed?assistantValue:6+r()*5):6+r()*5;
  const request:Type2ConsiderationRequest={
    currentHba1c,targetHba1c:7,factors:[],
    costPreference:r()<.5?"insured_only":"no_constraint",routePreference:"oral_and_injectable",
    hyperglycemiaSymptoms:r()<.06,catabolicFeatures:r()<.03,
  };
  const assessment=buildType2Assessment(medicines,request);
  const enriched={...assessment,medications:assessment.medications.map((item):Type2MedicationConsideration=>({...item,price:{amountToman:10000+Math.round(r()*90000),priceKind:"consumer_retail"},insuranceCoverages:r()<.5?[{provider,percent:50,referencePriceToman:50000,runtimeEligibleForRanking:true}]:[]}))};
  return{origin,assistantConfirmed,request,assessment:enriched,scenarios:buildType2TreatmentScenarios({assessment:enriched,request,insuranceProvider:provider,maxScenarios:3})};
}

describe("GLYMIZE randomized 1000-case scenario acceptance",()=>{
  it("keeps assistant review, clinical need, access filtering, urgent state and financial values separate",()=>{
    const summary={cases:1000,assistantHandoff:0,physicianDirect:0,assistantConfirmed:0,maintenance:0,accessConstrained:0,insuredOnly:0,urgent:0,costEstimates:0};
    for(let index=0;index<1000;index++){
      const {origin,assistantConfirmed,request,assessment,scenarios}=makeCase(index);
      if(origin==="assistant_handoff"){summary.assistantHandoff++;if(assistantConfirmed)summary.assistantConfirmed++}else summary.physicianDirect++;
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.length).toBeLessThanOrEqual(3);
      expect(new Set(scenarios.map(item=>item.id)).size).toBe(scenarios.length);
      scenarios.forEach((scenario,position)=>{
        expect(scenario.rank).toBe(position+1);
        expect(new Set(scenario.medicationIds).size).toBe(scenario.medicationIds.length);
        scenario.cost30Days.forEach(cost=>{
          summary.costEstimates++;
          for(const value of [cost.retailPerPackageToman,cost.patientPerPackageToman,cost.insurerPerPackageToman,cost.retail30DaysToman,cost.patient30DaysToman,cost.insurer30DaysToman])if(value!==undefined)expect(value).toBeGreaterThanOrEqual(0);
        });
      });
      const activeNeed=assessment.recommendation.hba1cGap>0||assessment.recommendation.urgentReview;
      if(scenarios[0]?.kind==="maintain_monitor"){summary.maintenance++;expect(activeNeed).toBe(false)}
      if(scenarios[0]?.kind==="access_constrained"){summary.accessConstrained++;expect(activeNeed).toBe(true);expect(scenarios[0].medicationIds).toEqual([])}
      if(assessment.recommendation.urgentReview){summary.urgent++;expect(scenarios.some(item=>item.urgentReview)).toBe(true);expect(scenarios[0]?.kind).not.toBe("maintain_monitor")}
      if(request.costPreference==="insured_only"){
        summary.insuredOnly++;
        for(const scenario of scenarios)for(const medication of scenario.medications)expect(medication.insuranceCoverages.some(item=>item.percent>0)).toBe(true);
      }
    }
    expect(summary.assistantHandoff).toBe(500);
    expect(summary.physicianDirect).toBe(500);
    console.log("GLYMIZE_STRESS_1000_ACCEPTANCE",JSON.stringify(summary));
  },30000);
});
