// src/users/entities/user.entity.ts

import { ApiProperty } from '@nestjs/swagger';

export class User {
  @ApiProperty()
  id: number;

  @ApiProperty({ example: 'usuario@correo.com' })
  email: string;

  // No se expone la contraseña en la documentación pública
  password: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Relaciones opcionales, puedes definirlas como tipos o interfaces
  profileId: number;
}
