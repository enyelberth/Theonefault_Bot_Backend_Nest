import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './createAppointment.dto';
import { CreateClientDto } from 'src/clients/dto/create-client.dto';

export class CreateAppointmentWithClientDto {
  @ApiProperty({ type: CreateAppointmentDto })
  appointment: CreateAppointmentDto;

  @ApiProperty({ type: CreateClientDto, required: false, description: 'Datos del cliente si no está registrado' })
  client?: CreateClientDto;
}