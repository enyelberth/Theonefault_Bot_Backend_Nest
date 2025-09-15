import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email único del usuario' })
  email: string;

  @ApiProperty({ example: 'strongPassword123', description: 'Contraseña del usuario' })
  password: string;

  @ApiProperty({ example: 'username123', description: 'Nombre de usuario' })
  username: string;

  @ApiPropertyOptional({ example: 'someKey', description: 'Clave opcional del usuario' })
  key?: string;

  @ApiPropertyOptional({ example: 'secretValue', description: 'Clave secreta opcional' })
  secretKey?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del perfil asociado (opcional)' })
  profileId?: number;
}
