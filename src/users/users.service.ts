// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { User } from '@prisma/client';
import { CreateUserDto } from './dto/createUser.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async ensureTestUserExists(): Promise<User | null> {
    // Verifica si ya existe algún usuario
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      // Ya hay usuarios, no hace nada
      return null;
    }

    // Verifica si existe el perfil de prueba en la tabla profile, si no, lo crea con datos aleatorios
    let testProfile = await this.prisma.profile.findFirst({
      where: { firstName: 'Perfil', lastName: 'de prueba' },
    });
    if (!testProfile) {
      testProfile = await this.prisma.profile.create({
        data: {
          firstName: 'Enyelberth',
          lastName: 'Rodríguez',
          phone: '04149732442',
          birthDate: new Date('2003-12-22'),
          address: 'Dirección de prueba',
        },
      });
    }

    // Crea el usuario de prueba solo si no existe ningún usuario
    const testUser = await this.prisma.user.create({
      data: {
        email: 'enyelberthrc22.z@gmail.com',
        password: '30204334',
        profileId: testProfile.id,
        username: 'enyelberth10',
      },
    });

    return testUser;
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async findOne(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
  async findOneUser(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: CreateUserDto) {
    // Aquí puedes agregar hashing de password antes de guardar
    const profile = await this.prisma.profile.findUnique({ where: { id: data.profileId } });
    if (!profile) {
      throw new Error('Profile not found');
    }
    return this.prisma.user.create({ data });
  }
}
