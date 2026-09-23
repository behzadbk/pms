import { Module } from '@nestjs/common'
import { UnitsController } from './units.controller'
import { UnitsGrpcController } from './units.grpc.controller'

@Module({
  controllers: [UnitsController, UnitsGrpcController],
})
export class UnitsModule {}
