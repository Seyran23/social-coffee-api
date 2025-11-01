import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { LoggerService } from '@/common/logger/logger.service';

const prisma = new PrismaClient();
const logger = new LoggerService('DatabaseSeed');
const configService = new ConfigService();

async function main() {
  const adminEmail = configService.getOrThrow<string>('ADMIN_EMAIL');
  const adminPassword = configService.getOrThrow<string>('ADMIN_PASSWORD');

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ADMIN,
    },
    create: {
      email: adminEmail,
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      gender: 'OTHER',
      bio: 'System Administrator',
      birthDate: new Date('1990-01-01'),
    },
  });

  logger.log(
    `Admin user created/updated - Email: ${admin.email}, Role: ${admin.role}, ID: ${admin.id}`,
  );
  logger.log('Database seeding completed successfully');
}

main()
  .catch(e => {
    logger.error('Error seeding database', e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
