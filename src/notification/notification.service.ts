import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification, PrismaClient } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaClient) { }

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    this.logger.log('Creating a new notification');
    return this.prisma.notification.create({
      data: createNotificationDto,
    });
  }

  async findAll(): Promise<Notification[]> {
    this.logger.log('Retrieving all notifications');
    return this.prisma.notification.findMany();
  }

  async findOne(id: number): Promise<Notification> {
    this.logger.log(`Retrieving notification with id ${id}`);
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  async findByUserId(userId: number): Promise<Notification[]> {
    this.logger.log(`Retrieving notifications for user id ${userId}`);
    return this.prisma.notification.findMany({ where: { userId } });
  }

  async update(id: number, updateNotificationDto: UpdateNotificationDto): Promise<Notification> {
    this.logger.log(`Updating notification with id ${id}`);
    await this.findOne(id); // Verificar existencia
    return this.prisma.notification.update({
      where: { id },
      data: updateNotificationDto,
    });
  }

  async remove(id: number): Promise<Notification> {
    this.logger.log(`Removing notification with id ${id}`);
    await this.findOne(id); // Verificar existencia
    return this.prisma.notification.delete({
      where: { id },
    });
  }
}
