import { ApiProperty } from "@nestjs/swagger";
import { WeekDay } from "@prisma/client";

export class Availableday {
    @ApiProperty()
    id: number;
    @ApiProperty({ example: 'SUNDAY' })
    dayOfWeek: WeekDay;
    @ApiProperty({ example: '2023-10-01T10:00:00Z' })
    endTime: string;
    @ApiProperty({ example: '1' })
    scheduleId: number;
    @ApiProperty({ example: '2023-10-01T11:00:00Z' })
    startTime: string; // Assuming date is a string in 'YYYY-MM-DD' format
}