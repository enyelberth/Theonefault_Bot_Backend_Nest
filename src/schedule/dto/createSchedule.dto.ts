import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class CreateScheduleDto {
    @ApiProperty({ example: 'Cronograma 1' })
    @IsString()
    name: string;
    @ApiProperty({ example: 'Mi primer cronograma' })
    @IsString()
    description: string;
}
