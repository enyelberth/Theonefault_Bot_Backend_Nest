import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Availableday } from './entity/availableday.entity';
import { CreateAvailableDayDto } from './dto/createAvailableday.dto';

@Injectable()
export class AvailabledayService {
    constructor(private prisma: PrismaService) {}

    findAll():Promise<Availableday[]> {
       return this.prisma.availableDay.findMany();

    }
    create(data: CreateAvailableDayDto): Promise<Availableday> {
       return this.prisma.availableDay.create({ data });
    }

    getAll(): Promise<Availableday[]> {
       return this.prisma.availableDay.findMany();
    }
    getOne(id: number): Promise<Availableday | null> {
       return this.prisma.availableDay.findUnique({ where: { id } });
    }
}
