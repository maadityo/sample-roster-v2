-- CreateTable
CREATE TABLE "Church" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "Absence_userId_scheduleId_key";

-- AlterTable
ALTER TABLE "Absence" ADD COLUMN "serviceId" TEXT NOT NULL DEFAULT '';

-- Remove the temporary default
ALTER TABLE "Absence" ALTER COLUMN "serviceId" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Church_name_key" ON "Church"("name");

-- CreateIndex
CREATE INDEX "Service_churchId_idx" ON "Service"("churchId");

-- CreateIndex
CREATE INDEX "Absence_serviceId_idx" ON "Absence"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Absence_userId_scheduleId_serviceId_key" ON "Absence"("userId", "scheduleId", "serviceId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
