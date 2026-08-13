import { Module } from "@nestjs/common";
import { PatientHandoffController } from "./patient-handoff.controller.js";
import { PatientHandoffService } from "./patient-handoff.service.js";

@Module({
  controllers: [PatientHandoffController],
  providers: [PatientHandoffService],
})
export class PatientHandoffModule {}
