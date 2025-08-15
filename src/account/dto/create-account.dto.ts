import { IsInt, IsOptional, IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({
    description: 'ID del usuario propietario de la cuenta',
    example: 1,
  })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({
    description: 'ID de la cuenta padre para cuentas jerárquicas',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  parentAccountId?: number;

  @ApiProperty({
    description: 'Tipo de cuenta bancaria (referencia a BankAccountType)',
    example: 2,
  })
  @IsInt()
  bankAccountTypeId: number;

  @ApiProperty({
    description: 'Clave pública o identificador de la cuenta',
    example: 'account_key_xyz123',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Clave secreta para acceso seguro (debe almacenarse cifrada)',
    example: 'secret_key_abc456',
  })
  @IsString()
  @IsNotEmpty()
  secretKey: string;

  @ApiProperty({
    description: 'Correo electrónico asociado a la cuenta',
    example: 'usuario@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta (mínimo 6 caracteres)',
    example: 'Secreto123!',
  })
  @IsString()
  @MinLength(6)
  password: string;
}
