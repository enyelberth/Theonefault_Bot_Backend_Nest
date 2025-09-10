import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiProperty, ApiQuery } from '@nestjs/swagger';
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
