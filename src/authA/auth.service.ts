import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'prisma/prisma.service';
import { randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { SessionService } from 'src/session/session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
  ) {}

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, key] = stored.split(':');
    if (!salt || !key) {
      return false;
    }

    const candidate = scryptSync(password, salt, 64);
    const storedKey = Buffer.from(key, 'hex');
    if (candidate.length !== storedKey.length) {
      return false;
    }

    return timingSafeEqual(candidate, storedKey);
  }

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
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Generar nuevo access token
      const newPayload = { sub: user.id, email: user.email, role: user.role };
      return {
        access_token: await this.jwtService.signAsync(newPayload),
      };
    } catch (err) {
      throw new UnauthorizedException('Refresh token iunválido');
    }
  }

  async signIn(
    userOrEmail: string,
    pass: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ access_token: string; sessionId: number }> {
    const whereCondition = this.isEmail(userOrEmail)
      ? { email: userOrEmail }
      : { username: userOrEmail };

    const user = await this.prisma.user.findFirst({ where: whereCondition });
    if (!user || !this.verifyPassword(pass, user.password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);

    const expiresAt = new Date(Date.now() + 260 * 60 * 1000);
    const session = await this.sessionService.create({
      userId: user.id,
      token: randomUUID(),
      expiresAt: expiresAt.toISOString(),
      userAgent,
      ipAddress,
    });

    return {
      access_token,
      sessionId: session.id,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId: Number(userId) } });
  }
}
