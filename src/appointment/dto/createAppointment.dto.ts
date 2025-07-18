import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";

export class createAppointmentDto {
  @ApiProperty({ example: '123' })
  @IsNumber()
  scheduleId: number;

  @ApiProperty({ example: '2023-10-01T10:00:00Z' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '2023-10-01T11:00:00Z' })
  @IsString()
  endTime: string;

  @ApiProperty({ example: 'Patient Name' })
  @IsString()
  patientName: string;

  @ApiProperty({ example: 'Doctor Name' })
  @IsString()
  doctorName: string;
}