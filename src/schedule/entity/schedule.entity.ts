import { ApiProperty } from "@nestjs/swagger";

export class Schedule {
    @ApiProperty()
    id: number;
    @ApiProperty({ example: 'Cronograma 1' })
    name: string;
    @ApiProperty({ example: 'Mi primer cronograma' })
    description: string;
}