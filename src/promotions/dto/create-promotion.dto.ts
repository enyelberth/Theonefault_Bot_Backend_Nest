import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreatePromotionDto {
	@ApiProperty({example: 'Promocion Inicial'})
	@IsString()
	name: string;
	@IsString()
	@ApiProperty({example:'Esta es una promocion inicial'})
	description: string;
	@IsNumber()
	@ApiProperty({ example: '2.2'})
	discount: number;
	@ApiProperty({ example: '2023-10-01T11:00:00Z' })
	@IsString()
	startDate: Date;
	@ApiProperty({ example: '2023-10-01T11:00:00Z' })
	@IsString()
	endDate: Date;
}
