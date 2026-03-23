import { PrismaClient, Role } from "@prisma/client";
import { addDays, nextSunday, startOfDay } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "mathias.arya@gmail.com" },
    update: { role: Role.ADMIN, isActive: true },
    create: {
      email: "mathias.arya@gmail.com",
      name: "Mathias Arya",
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

  // Seed churches and services
  const cityChurch = await prisma.church.upsert({
    where: { name: "Sydney City" },
    update: { sortOrder: 0 },
    create: { name: "Sydney City", sortOrder: 0 },
  });
  const mascotChurch = await prisma.church.upsert({
    where: { name: "Sydney Mascot" },
    update: { sortOrder: 1 },
    create: { name: "Sydney Mascot", sortOrder: 1 },
  });
  const hillsChurch = await prisma.church.upsert({
    where: { name: "Sydney Hills" },
    update: { sortOrder: 2 },
    create: { name: "Sydney Hills", sortOrder: 2 },
  });

  // Sydney City services
  await Promise.all([
    prisma.service.upsert({
      where: { id: "city-10-allstars" },
      update: {},
      create: { id: "city-10-allstars", churchId: cityChurch.id, time: "10:00", name: "All Stars", sortOrder: 0 },
    }),
    prisma.service.upsert({
      where: { id: "city-10-supertrooper" },
      update: {},
      create: { id: "city-10-supertrooper", churchId: cityChurch.id, time: "10:00", name: "Super Trooper", sortOrder: 1 },
    }),
    prisma.service.upsert({
      where: { id: "city-12-both" },
      update: {},
      create: { id: "city-12-both", churchId: cityChurch.id, time: "12:00", name: "All Stars and Super Trooper", sortOrder: 2 },
    }),
    // Sydney Mascot services
    prisma.service.upsert({
      where: { id: "mascot-10-both" },
      update: {},
      create: { id: "mascot-10-both", churchId: mascotChurch.id, time: "10:00", name: "All Stars and Super Trooper", sortOrder: 0 },
    }),
    // Sydney Hills services
    prisma.service.upsert({
      where: { id: "hills-13-voltage" },
      update: {},
      create: { id: "hills-13-voltage", churchId: hillsChurch.id, time: "13:00", name: "Voltage", sortOrder: 0 },
    }),
    prisma.service.upsert({
      where: { id: "hills-13-both" },
      update: {},
      create: { id: "hills-13-both", churchId: hillsChurch.id, time: "13:00", name: "All Stars and Super Trooper", sortOrder: 1 },
    }),
  ]);

  console.log("✅ Created 3 churches and 6 services");

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
