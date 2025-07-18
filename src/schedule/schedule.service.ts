import { Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ScheduleService {
    constructor(private prisma: PrismaService) {}
    async findAll():Promise<Schedule[]> {
     
        let schedules = await this.prisma.schedule.findMany();
        console.log(schedules);
        return schedules;
    }
    // async findOne(id: number): Promise<Schedule | null> {
    //     return this.prisma.schedule.findUnique({ where: { id } });
    // }
    async create(data: Schedule): Promise<any> {
        return this.prisma.schedule.create({ data:data });
    }
}
