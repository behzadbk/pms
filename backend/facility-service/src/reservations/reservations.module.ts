import { Module } from '@nestjs/common'
import { ReservationsController } from './reservations.controller'
import { AmenitiesController } from './amenities.controller'
import { BookingsController } from './bookings.controller'
import { BookingValidationService } from './booking-validation.service'
import { PropertyClientModule } from '../property-client/property-client.module'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [PropertyClientModule, EventsModule],
  controllers: [ReservationsController, AmenitiesController, BookingsController],
  providers: [BookingValidationService],
})
export class ReservationsModule {}
