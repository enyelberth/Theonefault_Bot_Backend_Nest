import { ApiProperty } from "@nestjs/swagger";

export class Appointment{


    @ApiProperty({ example: 1 })
    userId:number;
    @ApiProperty({ example: 1 })
    scheduleId:number;
    @ApiProperty({ example: 'PENDING' })
    status:string;
    @ApiProperty({ example: 'No notes' })
    note:string;
    @ApiProperty({ example: '2023-01-01T00:00:00Z' })
    date:Date;
}