import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";

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
  @IsString()
  status: string;

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
  @ApiProperty({example: 'El cliuente quiere 30 minex'})
  @IsString()
  notes:string;

}