import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
  ) { }

  private isEmail(value: string): boolean {
    // Regex simple para validar email
    return /^\S+@\S+\.\S+$/.test(value);
  }
  async validateToken(token: string): Promise<any> {
    try {
      // Verifica el token y retorna el payload decodificado
      const decoded = await this.jwtService.verifyAsync(token);
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      // Verificar y decodificar el refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Buscar usuario con el id en el payload
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Generar nuevo access token
      const newPayload = { sub: user.id, email: user.email };
      return {
        access_token: await this.jwtService.signAsync(newPayload),
      };
    } catch (err) {
      throw new UnauthorizedException('Refresh token iunválido');
    }
  }
  async logout(userId: string): Promise<void> {
    // Aquí eliminarías o invalidarías el refresh token almacenado en DB
    /*await this.prisma.refreshToken.deleteMany({ where: { userId } });*/

    // No se devuelve nada, simplemente indica que se cerró sesión
  }



  async signIn(
    userOrEmail: string,
    pass: string,
  ): Promise<{ access_token: string }> {
    const whereCondition = this.isEmail(userOrEmail)
      ? { email: userOrEmail }
      : { username: userOrEmail };

    const user = await this.prisma.user.findFirst({ where: whereCondition });
    //console.log(user)
    if (!user || user.password !== pass) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
