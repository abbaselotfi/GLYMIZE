import { describe, expect, it } from "vitest";
import type { PatientHandoffRecord, VerificationState } from "@glymize/contracts";

function rng(seed:number){let x=seed>>>0;return()=>{x=(x*1103515245+12345)>>>0;return x/4294967296}}
function state(r:()=>number):VerificationState{return (["unverified","confirmed","rejected"] as const)[Math.floor(r()*3)]!}

function physicianPrefill(record:PatientHandoffRecord){
  const labs=record.labs.filter(item=>item.verification==="confirmed");
  const medications=record.medications.filter(item=>item.verification==="confirmed");
  return{
    hba1c:labs.find(item=>item.canonicalKey==="hba1c")?.value,
    egfr:labs.find(item=>item.canonicalKey==="egfr")?.value,
    uacr:labs.find(item=>item.canonicalKey==="uacr")?.value,
    medications,
  };
}

function makeRecord(index:number):PatientHandoffRecord{
  const r=rng(42000+index*97);
  return{
    id:`handoff-${index}`,patientCodeKind:"file_number",patientCodeDisplay:`P-${index}`,status:"ready_for_physician",createdAt:"2026-08-13T00:00:00.000Z",updatedAt:"2026-08-13T00:00:00.000Z",revision:1,vitals:{},clinicalFlags:{},
    labs:[
      {id:`h-${index}`,canonicalKey:"hba1c",rawName:"HbA1c",value:5+r()*7,verification:state(r)},
      {id:`e-${index}`,canonicalKey:"egfr",rawName:"eGFR",value:5+r()*115,verification:state(r)},
      {id:`u-${index}`,canonicalKey:"uacr",rawName:"UACR",value:r()*1200,verification:state(r)},
    ],
    medications:[
      {genericMedicationId:"m1",genericName:"Medication 1",doseAmount:1,frequencyPerDay:1,verification:state(r)},
      {genericMedicationId:"m2",genericName:"Medication 2",doseAmount:2,frequencyPerDay:2,verification:state(r)},
    ],
  };
}

describe("assistant-to-physician handoff verification",()=>{
  it("never promotes rejected or unverified labs or medications into physician prefill",()=>{
    for(let index=0;index<200;index++){
      const record=makeRecord(index),prefill=physicianPrefill(record);
      const labByKey=(key:string)=>record.labs.find(item=>item.canonicalKey===key)!;
      expect(prefill.hba1c).toBe(labByKey("hba1c").verification==="confirmed"?labByKey("hba1c").value:undefined);
      expect(prefill.egfr).toBe(labByKey("egfr").verification==="confirmed"?labByKey("egfr").value:undefined);
      expect(prefill.uacr).toBe(labByKey("uacr").verification==="confirmed"?labByKey("uacr").value:undefined);
      expect(prefill.medications.every(item=>item.verification==="confirmed")).toBe(true);
      expect(prefill.medications.length).toBe(record.medications.filter(item=>item.verification==="confirmed").length);
    }
  });
});
