/*
  Warnings:

  - You are about to drop the column `customerId` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `userId` to the `Account` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_customerId_fkey";

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "customerId",
ADD COLUMN     "userId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Customer";

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
