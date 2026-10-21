import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { join } from 'path'
import { PropertyClientService } from './property-client.service'

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PROPERTY_GRPC_CLIENT',
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            package: 'property',
            protoPath: join(__dirname, '../proto/property.proto'),
            url: process.env.PROPERTY_SVC_GRPC_URL ?? 'property-svc.pms-prod.svc.cluster.local:50052',
          },
        }),
      },
    ]),
  ],
  providers: [PropertyClientService],
  exports: [PropertyClientService],
})
export class PropertyClientModule {}
