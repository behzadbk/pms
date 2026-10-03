import { IsString, MaxLength, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @IsString()
  @MinLength(3)
  currentPassword: string

  @IsString()
  @MinLength(6, { message: 'رمز جدید باید حداقل ۶ کاراکتر باشد' })
  @MaxLength(72)
  newPassword: string
}
