import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { AppointmentStatus } from '../appointment-status.enum';

export class CreateAppointmentDto {
  @ApiProperty({ example: '1' })
  @IsNumber()
  scheduleId: number;
  @ApiProperty({ example: '2023-10-01T10:00:00Z' })
  @IsString()
  date: string;

  @ApiProperty({ example: '2023-10-01T10:00:00Z' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '2023-10-01T11:00:00Z' })
  @IsString()
  endTime: string;

  @ApiProperty({ example: 'Patient Name' })
  @IsString()
  patientName: string;

  @ApiProperty({ example: 'PENDING' })
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'El status no es válido' })
  status?: AppointmentStatus;

  @ApiProperty({ example: 'Doctor Name' })
  @IsString()
  doctorName: string;
  @ApiProperty({ example: '1' })
  @IsNumber()
  clientId: number;
  @ApiProperty({ example: '1' })
  @IsNumber()
  promotionId: number;

  @ApiProperty({ example: '1' })
  @IsNumber()
  userId: number;
  @ApiProperty({ example: 'El cliuente quiere 30 minex' })
  @IsString()
  notes: string;

  @ApiProperty({ description: 'Hora de la cita (0-23)', example: 14 })
  @IsInt({ message: 'La hora debe ser un número entero.' })
  @Min(0, { message: 'La hora mínima es 0.' })
  @Max(23, { message: 'La hora máxima es 23.' })
  @IsNotEmpty({ message: 'El campo hora es obligatorio.' })
  hora: number;
}