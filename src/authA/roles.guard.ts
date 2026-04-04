import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, AppRole } from './roles.decorator';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    let userRole = request?.user?.role as AppRole | undefined;

    // Compatibilidad con tokens antiguos que no incluyen el claim `role`.
    if (!userRole) {
      const userId = Number(request?.user?.sub);
      if (Number.isInteger(userId) && userId > 0) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        } as any);

        userRole = user?.role as AppRole | undefined;
        if (userRole) {
          request.user = {
            ...(request.user ?? {}),
            role: userRole,
          };
        }
      }
    }

    if (!userRole) {
      throw new ForbiddenException('No tienes rol asignado para acceder a este recurso.');
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException('No tienes permisos suficientes para esta operación.');
    }

    return true;
  }
}
