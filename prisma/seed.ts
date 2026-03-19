import { PrismaClient, Role } from "@prisma/client";
import { addDays, nextSunday, startOfDay } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user (update email to your admin Gmail)
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin Kakak",
      role: Role.ADMIN,
    },
  });

  // Create sample kakaks
  const kakaks = await Promise.all([
    prisma.user.upsert({
      where: { email: "kakak1@gmail.com" },
      update: {},
      create: { email: "kakak1@gmail.com", name: "Budi Santoso", role: Role.KAKAK },
    }),
    prisma.user.upsert({
      where: { email: "kakak2@gmail.com" },
      update: {},
      create: { email: "kakak2@gmail.com", name: "Sari Dewi", role: Role.KAKAK },
    }),
    prisma.user.upsert({
      where: { email: "kakak3@gmail.com" },
      update: {},
      create: { email: "kakak3@gmail.com", name: "Andi Pratama", role: Role.KAKAK },
    }),
  ]);

  // Generate next 8 upcoming Sundays
  let sunday = nextSunday(new Date());
  const schedules = [];

  for (let i = 0; i < 8; i++) {
    const date = startOfDay(sunday);
    const schedule = await prisma.schedule.upsert({
      where: { date },
      update: {},
      create: { date, title: i === 0 ? "Regular Service" : undefined },
    });
    schedules.push(schedule);
    sunday = addDays(sunday, 7);
  }

  console.log(`✅ Created ${schedules.length} Sunday schedules`);
  console.log(`✅ Created ${kakaks.length} kakaks + 1 admin`);
  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
