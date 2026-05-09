import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
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
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  async findByUserId(userId: number): Promise<Notification[]> {
    this.logger.log(`Retrieving notifications for user id ${userId}`);
    return this.prisma.notification.findMany({ where: { userId } });
  }

  async update(
    id: number,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<Notification> {
    this.logger.log(`Updating notification with id ${id}`);
    await this.findOne(id); // Verificar existencia
    return this.prisma.notification.update({
      where: { id },
      data: updateNotificationDto,
    });
  }
  async markAsRead(id: number): Promise<Notification> {
    this.logger.log(`Marking notification with id ${id} as read`);
    const notification = await this.findOne(id);
    if (notification.read) {
      return notification; // Ya está marcada como leída
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async remove(id: number): Promise<Notification> {
    this.logger.log(`Removing notification with id ${id}`);
    await this.findOne(id); // Verificar existencia
    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async createTemplatedNotification(payload: {
    userId: number;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    channel: 'OPERATIVA' | 'SEGURIDAD' | 'CONTABILIDAD' | 'SISTEMA';
    event: string;
    message: string;
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        userId: payload.userId,
        title: `[${payload.severity}][${payload.channel}] ${payload.event}`,
        message: payload.message,
        read: false,
      },
    });
  }

  async createDailyDigest(userId: number) {
    const [notifications, latestSyncs, latestKpis] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      (this.prisma as any).binanceSyncLog?.findMany?.({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }) ?? [],
      (this.prisma as any).dailyKpi?.findMany?.({
        orderBy: { kpiDate: 'desc' },
        take: 3,
      }) ?? [],
    ]);

    const digestLines = [
      `Notificaciones recientes: ${notifications.length}`,
      `Syncs Binance recientes: ${latestSyncs.length}`,
      `KPIs diarios recientes: ${latestKpis.length}`,
    ];

    return this.createTemplatedNotification({
      userId,
      severity: 'INFO',
      channel: 'SISTEMA',
      event: 'DAILY_DIGEST',
      message: digestLines.join(' | '),
    });
  }
}
