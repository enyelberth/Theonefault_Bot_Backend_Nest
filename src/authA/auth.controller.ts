import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiProperty, ApiQuery } from '@nestjs/swagger';
import { AuthGuard, Public } from './auth.guard';
import { AuthService } from './auth.service';
import { Response } from 'express';
// DTO para login
export class SignInDto {
  @ApiProperty({ example: 'enyelberth10', description: 'Nombre de usuario' })
  username: string;

  @ApiProperty({ example: '30204334', description: 'Contraseña' })
  password: string;
}

@Public()

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: SignInDto })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/cookie')
  async signInCookies(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) response: Response, // para acceder a la respuesta
  ) {
    const { access_token } = await this.authService.signIn(signInDto.username, signInDto.password);

    // Configura la cookie con el JWT, marca HttpOnly para seguridad
    response.cookie('jwt', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // usar cookie segura en producción
      maxAge: 1000 * 60 * 60 , // duración, e.g., 1 hora
      sameSite: 'lax',
      path: '/',
    });

    // Opcional: devolver algo en el body o vacío
    return { message: 'Inicio de sesión exitoso' };
  }

  @Public()
  @Get('validate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar token JWT' })
  @ApiResponse({ status: 200, description: 'Token válido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no autorizado.' })
  @ApiQuery({ name: 'token', required: true, description: 'Token JWT a validar' })
  async validateToken(@Query('token') token: string) {
    const decoded = await this.authService.validateToken(token);
    return { valid: true, decoded };
  }
}
