import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

describe('AccountService', () => {
  let service: AccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountService],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create() should return expected string', () => {
    const dto: CreateAccountDto = { /* aquí completa con campos si los tienes */ };
    expect(service.create(dto)).toBe('This action adds a new account');
  });

  it('findAll() should return expected string', () => {
    expect(service.findAll()).toBe('This action returns all account');
  });

  it('findOne() should return expected string for given id', () => {
    const id = 1;
    expect(service.findOne(id)).toBe(`This action returns a #${id} account`);
  });

  it('update() should return expected string for given id and dto', () => {
    const id = 1;
    const dto: UpdateAccountDto = { /* completa con campos que tengas */ };
    expect(service.update(id, dto)).toBe(`This action updates a #${id} account`);
  });

  it('remove() should return expected string for given id', () => {
    const id = 1;
    expect(service.remove(id)).toBe(`This action removes a #${id} account`);
  });
});
