import { ApiProperty } from '@nestjs/swagger';
import { WeekDay } from '@prisma/client';
import { IsNumber, IsString } from 'class-validator';

export class CreateAvailableDayDto {
  @ApiProperty({ example: 'Available Day 1' })
  @IsNumber()
  scheduleId: number;

  @ApiProperty({ example: 'Monday' })
  @IsString()
  dayOfWeek: WeekDay;

  @ApiProperty({ example: '2023-10-01T10:00:00Z' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '2023-10-01T11:00:00Z' })
  @IsString()
  endTime: string;
}
