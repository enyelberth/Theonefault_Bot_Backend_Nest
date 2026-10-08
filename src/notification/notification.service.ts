import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification, PrismaClient } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: createNotificationDto,
    });
  }

  async findAll(): Promise<Notification[]> {
    return this.prisma.notification.findMany();
  }

  async findOne(id: number): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  async findByUserId(userId: number): Promise<Notification[]> {
    return this.prisma.notification.findMany({ where: { userId } });
  }

  async update(
    id: number,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<Notification> {
    await this.findOne(id);
    return this.prisma.notification.update({
      where: { id },
      data: updateNotificationDto,
    });
  }

  async markAsRead(id: number): Promise<Notification> {
    const notification = await this.findOne(id);
    if (notification.read) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async remove(id: number): Promise<Notification> {
    await this.findOne(id);
    return this.prisma.notification.delete({
      where: { id },
    });
  }
}
