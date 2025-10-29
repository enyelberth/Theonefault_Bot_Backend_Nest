import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Alert, PrismaClient } from '@prisma/client';
@Injectable()
export class AlertService {
    constructor(readonly prisma: PrismaClient) {}
    async getAlerts(): Promise<Alert[]> {
        try {
            const alerts = await this.prisma.alert.findMany(); 
            return alerts;
        } catch (error) {
            throw new InternalServerErrorException('Error al obtener las alertas');
        }
    }
    async getOneAlert(id: number): Promise<Alert> {
        try {
            const alert = await this.prisma.alert.findUnique({ where: { id } });
            if (!alert) {
                throw new NotFoundException(`Alerta con ID ${id} no encontrada`);
            }
            return alert;
        } catch (error) {
            throw new InternalServerErrorException('Error al obtener la alerta');
        }
    }
    async createAlert(alert: any): Promise<Alert> {
        try {
            const newAlert = await this.prisma.alert.create({ data: alert });
            return newAlert;
        } catch (error) {
            throw new InternalServerErrorException('Error al crear la alerta');
        }
    }
 async createAlertPrice(symbol: string, price: number, up_down: 'up' | 'down'): Promise<Alert> {
    try {
      const timestamp = new Date();
      const newAlert = await this.prisma.alert.create({
        data: {
          symbol,
          price,
          up_down,
          timestamp,
        },
      });
      return newAlert;
    } catch (error) {
      throw new InternalServerErrorException('Error al crear la alerta');
    }
  }
    async updateAlert(id: number, alert: any): Promise<Alert> {
        try {
            const updatedAlert = await this.prisma.alert.update({ where: { id }, data: alert });
            return updatedAlert;
        } catch (error) {
            throw new InternalServerErrorException('Error al actualizar la alerta');
        }
    }
    async deleteAlert(id: number): Promise<Alert> {
        try {
            const deletedAlert = await this.prisma.alert.delete({ where: { id } });
            return deletedAlert;
        } catch (error) {
            throw new InternalServerErrorException('Error al eliminar la alerta');
        }
    }  

}