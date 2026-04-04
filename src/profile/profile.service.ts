import { Injectable, NotFoundException } from '@nestjs/common';
import { Profile } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
	constructor(private readonly prisma: PrismaService) {}

	async create(createProfileDto: CreateProfileDto): Promise<Profile> {
		return this.prisma.profile.create({ data: createProfileDto });
	}

	async findAll(): Promise<Profile[]> {
		return this.prisma.profile.findMany({ orderBy: { id: 'desc' } });
	}

	async findOne(id: number): Promise<Profile> {
		const profile = await this.prisma.profile.findUnique({ where: { id } });
		if (!profile) {
			throw new NotFoundException(`Profile with id ${id} not found`);
		}
		return profile;
	}

	async update(id: number, updateProfileDto: UpdateProfileDto): Promise<Profile> {
		await this.findOne(id);
		return this.prisma.profile.update({ where: { id }, data: updateProfileDto });
	}

	async remove(id: number): Promise<Profile> {
		await this.findOne(id);
		return this.prisma.profile.delete({ where: { id } });
	}
}
