import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

export type NoteKind = 'note' | 'call' | 'visit' | 'sales'

/** یادداشت/تماس/بازدید هر ساختمان (CRM سبک) — فقط تیم پلتفرم می‌بیند، در خروجی ساختمان نمی‌آید */
@Injectable()
export class PlatformNotesService {
  constructor(private readonly db: DatabaseService) {}

  async list(buildingId: string) {
    const rows = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query(
        'SELECT id, kind, body, author, created_at FROM identity.platform_tenant_notes WHERE building_id = $1 ORDER BY created_at DESC LIMIT 200',
        [buildingId],
      )
      return r.rows
    })
    return { notes: rows.map(map) }
  }

  async create(buildingId: string, author: string, kind: NoteKind, body: string) {
    return this.db.withPlatformAccess(async (c) => {
      const t = await c.query('SELECT 1 FROM identity.tenants WHERE id = $1', [buildingId])
      if (!t.rowCount) throw new NotFoundException('ساختمان یافت نشد')
      const r = await c.query(
        `INSERT INTO identity.platform_tenant_notes (building_id, kind, body, author) VALUES ($1, $2, $3, $4)
         RETURNING id, kind, body, author, created_at`,
        [buildingId, kind, body.trim(), author],
      )
      return map(r.rows[0])
    })
  }

  async remove(buildingId: string, noteId: string): Promise<boolean> {
    return this.db.withPlatformAccess(async (c) => {
      const r = await c.query('DELETE FROM identity.platform_tenant_notes WHERE id = $1 AND building_id = $2', [noteId, buildingId])
      return (r.rowCount ?? 0) > 0
    })
  }
}

function map(r: { id: string; kind: NoteKind; body: string; author: string; created_at: Date }) {
  return { id: r.id, kind: r.kind, body: r.body, author: r.author, createdAt: new Date(r.created_at).toISOString() }
}
