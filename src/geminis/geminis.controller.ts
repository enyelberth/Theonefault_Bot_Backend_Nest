import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CreateGeminiDto } from './dto/create-gemini.dto';
import { UpdateGeminiDto } from './dto/update-gemini.dto';
import { GeminiService } from './geminis.service';
import { Public } from '../authA/auth.guard';

@Controller('geminis')
export class GeminisController {
  constructor(private readonly geminisService: GeminiService) {}

  @Public()
  @Get('chat')
  async chat(@Query('prompt') prompt: string) {
    /*const response = await this.geminisService.chat(prompt);
    return { response };*/
  }
  @Post()
  create(@Body() createGeminiDto: CreateGeminiDto) {
    // return this.geminisService.create(createGeminiDto);
  }

  @Get()
  findAll() {
    //  return this.geminisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    //  return this.geminisService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGeminiDto: UpdateGeminiDto) {
    // return this.geminisService.update(+id, updateGeminiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    // return this.geminisService.remove(+id);
  }
}
