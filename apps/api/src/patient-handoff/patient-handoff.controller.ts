import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  Inject,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type {
  PatientHandoffLookupInput,
  PatientHandoffLookupResult,
  PatientHandoffUpsertInput,
} from "@glymize/contracts";
import { PatientHandoffService } from "./patient-handoff.service.js";

@Controller("v1/patient-handoff")
export class PatientHandoffController {
  constructor(@Inject(PatientHandoffService) private readonly handoffs: PatientHandoffService) {}

  private authorize(token?: string) {
    const expected = process.env.PATIENT_HANDOFF_TOKEN;
    if (!expected) throw new ServiceUnavailableException("PATIENT_HANDOFF_TOKEN is not configured");
    if (!token) throw new UnauthorizedException();
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException();
  }

  @Post("upsert")
  async upsert(@Headers("x-glymize-handoff-token") token: string | undefined, @Body() input: PatientHandoffUpsertInput) {
    this.authorize(token);
    try {
      return await this.handoffs.upsert(input);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_PATIENT_CODE") throw new BadRequestException("Invalid patient code");
      if (error instanceof Error && error.message === "INVALID_NATIONAL_ID") throw new BadRequestException("Invalid Iranian national ID checksum");
      throw error;
    }
  }

  @Post("lookup")
  async lookup(@Headers("x-glymize-handoff-token") token: string | undefined, @Body() input: PatientHandoffLookupInput): Promise<PatientHandoffLookupResult> {
    this.authorize(token);
    try {
      const record = await this.handoffs.lookup(input.patientCode);
      if (!record) throw new NotFoundException();
      return { found: true, record };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof Error && error.message === "AMBIGUOUS_PATIENT_CODE") throw new ConflictException("Patient code is ambiguous across code kinds");
      throw error;
    }
  }
}
