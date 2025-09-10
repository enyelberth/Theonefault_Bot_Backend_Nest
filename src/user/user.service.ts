import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaClient) { }

  async create(createUserDto: CreateUserDto) {
    try {
      return await this.prisma.user.create({ data: createUserDto });
    } catch (error) {
      this.logger.error('Error creating user', error);
      throw new BadRequestException('Error creating user');
    }
  }

  async findAll() {
    return await this.prisma.user.findMany();
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }
  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
  }


  async findByUsername(username: string) {
    return await this.prisma.user.findFirst({ where: { username } });
  }


  async update(id: number, updateUserDto: UpdateUserDto) {
    try {
      await this.findOne(id); // Verifica que exista antes de actualizar
      return await this.prisma.user.update({ where: { id }, data: updateUserDto });
    } catch (error) {
      this.logger.error(`Error updating user with id ${id}`, error);
      throw new BadRequestException('Error updating user');
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id); // Verifica que exista antes de eliminar
      return await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Error deleting user with id ${id}`, error);
      throw new BadRequestException('Error deleting user');
    }
  }

  // Método para verificar si un usuario o email ya existe (por ejemplo antes de registrar)
  async existsByEmail(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return Boolean(user);
  }

  async existsByUsername(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return Boolean(user);
  }

  // Método básico para login (verifica email y password)
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    // Aquí debes comparar password hasheado, ejemplo con bcrypt.compare, esto es solo para ilustrar
    if (user.password !== password) {
      throw new BadRequestException('Invalid credentials');
    }
    return user;
  }
}
