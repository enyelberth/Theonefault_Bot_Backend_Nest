import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateServiceDto {
    @ApiProperty({ example: 'Radiofrecuencia full' })
    @IsString()
    name: string;

    @ApiProperty({ example: 'Es una terapia' })
    @IsString()
    description: string;

    @ApiProperty({ example: 100 })
    @IsNumber()
    price: number;

    @ApiProperty({ example: 60, required: false }) // Duración en minutos, por ejemplo
    @IsOptional()
    @IsNumber()
    duration: number; // campo opcional
}
