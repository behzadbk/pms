import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import { ClientGrpc } from '@nestjs/microservices'
import { firstValueFrom, Observable } from 'rxjs'

interface UnitReply {
  found: boolean
  id: string
  buildingId: string
  unitNumber: string
  areaSqm: number
  ownerUserId: string
}

interface UnitServiceClient {
  getUnitById(data: { id: string; tenantId: string }): Observable<UnitReply>
}

/**
 * Client-side wrapper روی gRPC UnitService که در property-service پیاده‌سازی شده
 * (بخش ۲ سند ARCHITECTURE-SAAS.md — «facility-svc قبل از رزرو، اعتبار واحد را
 * از property-svc از طریق gRPC می‌گیرد»، نه با کپی جدول units در دیتابیس خودش).
 */
@Injectable()
export class PropertyClientService implements OnModuleInit {
  private unitService: UnitServiceClient

  constructor(@Inject('PROPERTY_GRPC_CLIENT') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.unitService = this.client.getService<UnitServiceClient>('UnitService')
  }

  async getUnitById(id: string, tenantId: string): Promise<UnitReply> {
    return firstValueFrom(this.unitService.getUnitById({ id, tenantId }))
  }
}
