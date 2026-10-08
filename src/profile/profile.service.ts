import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  findAll() {
    // NOTA: lista perfiles de TODOS los usuarios. Sin sistema de roles no hay forma
    // segura de restringirlo a admin — queda pendiente de decisión de producto.
    return this.prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile)
      throw new NotFoundException(`Perfil con id ${id} no encontrado`);
    return profile;
  }

  /** El perfil pertenece a requestUserId si User.profileId === id (no hay FK inversa en Profile). */
  private async assertOwnedProfile(id: number, requestUserId: number) {
    const profile = await this.findOne(id);
    const owner = await this.prisma.user.findFirst({
      where: { id: requestUserId, profileId: id },
    });
    if (!owner) {
      throw new ForbiddenException('No tienes acceso a este perfil');
    }
    return profile;
  }

  async findOneOwned(id: number, requestUserId: number) {
    return this.assertOwnedProfile(id, requestUserId);
  }

  create(dto: CreateProfileDto) {
    return this.prisma.profile.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      },
    });
  }

  async update(id: number, dto: UpdateProfileDto, requestUserId: number) {
    await this.assertOwnedProfile(id, requestUserId);
    return this.prisma.profile.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }
          : {}),
      },
    });
  }

  async remove(id: number, requestUserId: number) {
    await this.assertOwnedProfile(id, requestUserId);
    try {
      return await this.prisma.profile.delete({ where: { id } });
    } catch {
      throw new BadRequestException('No se pudo eliminar el perfil');
    }
  }
}
