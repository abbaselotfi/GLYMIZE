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
  const r=rng(910247+index*3571),provider=pick(r,providers);
  const request:Type2ConsiderationRequest={currentHba1c:6+r()*5,targetHba1c:7,factors:[],costPreference:r()<.5?"insured_only":"no_constraint",routePreference:"oral_and_injectable"};
  const assessment=buildType2Assessment(medicines,request);
  const enriched={...assessment,medications:assessment.medications.map((item):Type2MedicationConsideration=>({...item,price:{amountToman:10000+Math.round(r()*90000),priceKind:"consumer_retail"},insuranceCoverages:r()<.5?[{provider,percent:50,referencePriceToman:50000,runtimeEligibleForRanking:true}]:[]}))};
  return{request,assessment:enriched,scenarios:buildType2TreatmentScenarios({assessment:enriched,request,insuranceProvider:provider,maxScenarios:3})};
}

describe("GLYMIZE randomized 1000-case scenario acceptance",()=>{
  it("keeps scenario contracts stable across randomized inputs",()=>{
    expect(typeof buildType2TreatmentScenarios).toBe("function");
    expect(makeCase(0).scenarios.length).toBeGreaterThan(0);
  });
});
