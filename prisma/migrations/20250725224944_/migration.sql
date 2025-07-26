-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "promotionId" INTEGER;

-- CreateTable
CREATE TABLE "AppointmentServices" (
    "appointmentId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "AppointmentServices_pkey" PRIMARY KEY ("appointmentId","serviceId")
);

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentServices" ADD CONSTRAINT "AppointmentServices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentServices" ADD CONSTRAINT "AppointmentServices_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
