import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsInt, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'usuario@correo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'contraseña123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ description: 'ID del perfil asociado', example: 1 })
  @IsOptional()
  @IsInt()
  profileId: number;
}
