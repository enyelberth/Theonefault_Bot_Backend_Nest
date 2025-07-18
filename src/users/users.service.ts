// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { User } from '@prisma/client';
import { CreateUserDto } from './dto/createUser.dto';
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<User[]> {
    return  this.prisma.user.findMany();
  }

  async findOne(email: string) {
    return this.prisma.user.findUnique({ where: { email} });
  }
  async findOneUser(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

   async createUser(data: CreateUserDto) {
     // Aquí puedes agregar hashing de password antes de guardar
     this.searchProfileById(data.profileId).then(profile => {
       if (!profile) {  
          throw new Error('Profile not found');
        }
      });
     console.log('Creating user with data:', data);
     
     //return this.prisma.user.create({ data });
   }
   async searchProfileById(profileId: number) {
    let a = await this.prisma.user.findUnique({ where: { profileId } });
    console.log(a);
    let b = "1";
    if(await a == null) {
       b = "2"; 
    }
    console.log(b);
     return b;
   }

  // async deleteUser(id: number): Promise<User> {
  //   return this.prisma.user.delete({ where: { id } });
  // }
}
