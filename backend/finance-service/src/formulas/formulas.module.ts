import { Module } from '@nestjs/common'
import { FormulasController } from './formulas.controller'

@Module({ controllers: [FormulasController] })
export class FormulasModule {}
