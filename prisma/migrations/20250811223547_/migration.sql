/*
  Warnings:

  - You are about to drop the column `profileId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Appointment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AppointmentServices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AvailableDay` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Clients` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PromotionServices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Promotions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Schedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Services` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId]` on the table `Profile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_scheduleId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_userId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentServices" DROP CONSTRAINT "AppointmentServices_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentServices" DROP CONSTRAINT "AppointmentServices_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "AvailableDay" DROP CONSTRAINT "AvailableDay_scheduleId_fkey";

-- DropForeignKey
ALTER TABLE "PromotionServices" DROP CONSTRAINT "PromotionServices_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "PromotionServices" DROP CONSTRAINT "PromotionServices_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_profileId_fkey";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "User_profileId_key";

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "profileId";

-- DropTable
DROP TABLE "Appointment";

-- DropTable
DROP TABLE "AppointmentServices";

-- DropTable
DROP TABLE "AvailableDay";

-- DropTable
DROP TABLE "Clients";

-- DropTable
DROP TABLE "PromotionServices";

-- DropTable
DROP TABLE "Promotions";

-- DropTable
DROP TABLE "Schedule";

-- DropTable
DROP TABLE "Services";

-- DropEnum
DROP TYPE "AppointmentStatus";

-- DropEnum
DROP TYPE "WeekDay";

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPair" (
    "id" SERIAL NOT NULL,
    "symbolPair" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPrice" (
    "id" SERIAL NOT NULL,
    "pairId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_apiKey_key" ON "Account"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_apiSecret_key" ON "Account"("apiSecret");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPair_symbolPair_key" ON "CryptoPair"("symbolPair");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPrice" ADD CONSTRAINT "CryptoPrice_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "CryptoPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
