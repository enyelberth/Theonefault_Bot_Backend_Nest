import { IsString, IsIn, IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLimitOrderDto {
  @ApiProperty({ description: 'Símbolo del par de trading, ej. BTCUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Tipo de orden: BUY o SELL', enum: ['BUY', 'SELL'] })
  @IsString()
  @IsIn(['BUY', 'SELL'])
  side: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Cantidad a comprar/vender', type: String })
  @IsNumberString()
  quantity: string;

  @ApiProperty({ description: 'Precio límite de la orden', type: String })
  @IsNumberString()
  price: string;

  @ApiPropertyOptional({ description: 'Tiempo en vigor de la orden', enum: ['GTC', 'IOC', 'FOK'], default: 'GTC' })
  @IsOptional()
  @IsIn(['GTC', 'IOC', 'FOK'])
  timeInForce?: 'GTC' | 'IOC' | 'FOK' = 'GTC';
}

export class CreateMarketOrderDto {
  @ApiProperty({ description: 'Símbolo del par de trading, ej. BTCUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Tipo de orden: BUY o SELL', enum: ['BUY', 'SELL'] })
  @IsString()
  @IsIn(['BUY', 'SELL'])
  side: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Cantidad a comprar/vender', type: String })
  @IsNumberString()
  quantity: string;
}

export class CreateOcoOrderDto {
  @ApiProperty({ description: 'Símbolo del par de trading, ej. BTCUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'Tipo de orden: BUY o SELL', enum: ['BUY', 'SELL'] })
  @IsString()
  @IsIn(['BUY', 'SELL'])
  side: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Cantidad a comprar/vender', type: String })
  @IsNumberString()
  quantity: string;

  @ApiProperty({ description: 'Precio límite de la orden principal', type: String })
  @IsNumberString()
  price: string;

  @ApiProperty({ description: 'Precio de activación para la orden stop limit', type: String })
  @IsNumberString()
  stopPrice: string;

  @ApiProperty({ description: 'Precio límite para la orden stop limit', type: String })
  @IsNumberString()
  stopLimitPrice: string;

  @ApiPropertyOptional({ description: 'Tiempo en vigor de la orden stop limit', enum: ['GTC', 'IOC', 'FOK'], default: 'GTC' })
  @IsOptional()
  @IsIn(['GTC', 'IOC', 'FOK'])
  stopLimitTimeInForce?: 'GTC' | 'IOC' | 'FOK' = 'GTC';
}
