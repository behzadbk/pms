import { IsString, MaxLength, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string
  @IsString() @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' }) @MaxLength(72) newPassword: string
}
