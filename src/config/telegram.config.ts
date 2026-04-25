import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  botToken: process.env.BOOT || '',
  secondaryBotToken: process.env.BOOT2 || '',
  sofiaBotToken: process.env.SOFIA_BOT || '',
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => parseInt(id.trim()))
    .filter((id) => !isNaN(id)),
  notifyTelegramChats: (process.env.NOTIFY_TELEGRAM_CHATS || '')
    .split(',')
    .map((id) => parseInt(id.trim()))
    .filter((id) => !isNaN(id)),
}));
