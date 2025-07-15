import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { AuthGuard, Public } from './auth.guard';
import { AuthService } from './auth.service';

// DTO para login
export class SignInDto {
  @ApiProperty({ example: 'usuario123', description: 'Nombre de usuario' })
  username: string;

  @ApiProperty({ example: 'password123', description: 'Contraseña' })
  password: string;
}

@Public()

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: SignInDto })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  @ApiBearerAuth() // Indica que este endpoint requiere autenticación Bearer token
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario obtenido correctamente.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  getProfile(@Request() req) {
    return req.user;
  }
}
