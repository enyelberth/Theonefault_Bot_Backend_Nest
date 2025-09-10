import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard, Public } from 'src/authA/auth.guard';
@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of users' })
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'User found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'User deleted' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id);
  }

  @Get('exists/email/:email')
  @ApiOperation({ summary: 'Check if email exists' })
  @ApiParam({ name: 'email', type: String })
  async existsByEmail(@Param('email') email: string) {
    const exists = await this.userService.existsByEmail(email);
    return { exists };
  }

  @Get('exists/username/:username')
  @ApiOperation({ summary: 'Check if username exists' })
  @ApiParam({ name: 'username', type: String })
  async existsByUsername(@Param('username') username: string) {
    const exists = await this.userService.existsByUsername(username);
    return { exists };
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'mypassword' }}})
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }
    return this.userService.validateUser(email, password);
  }
}
