import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// NOTE: key/secretKey (exchange API credentials) must never be exposed via
// this "safe" select — they are intentionally omitted. See CLAUDE.md:
// "No registrar API keys, secretos, contraseñas, JWT ni URLs firmadas."
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  username: true,
  profileId: true,
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaClient) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      return await this.prisma.user.create({
        data: { ...createUserDto, password: hashedPassword },
        select: USER_SAFE_SELECT,
      });
    } catch (error) {
      this.logger.error('Error creating user', error);
      throw new BadRequestException('Error creating user');
    }
  }

  async findAll() {
    return await this.prisma.user.findMany({ select: USER_SAFE_SELECT });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }
  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email },
      select: USER_SAFE_SELECT,
    });
  }

  private async findByEmailWithCredentials(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string) {
    return await this.prisma.user.findFirst({
      where: { username },
      select: USER_SAFE_SELECT,
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    try {
      await this.findOne(id); // Verifica que exista antes de actualizar
      const data = { ...updateUserDto };
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
      }
      return await this.prisma.user.update({
        where: { id },
        data,
        select: USER_SAFE_SELECT,
      });
    } catch (error) {
      this.logger.error(`Error updating user with id ${id}`, error);
      throw new BadRequestException('Error updating user');
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id); // Verifica que exista antes de eliminar
      return await this.prisma.user.delete({
        where: { id },
        select: USER_SAFE_SELECT,
      });
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
    const user = await this.findByEmailWithCredentials(email);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new BadRequestException('Invalid credentials');
    }
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }
}
