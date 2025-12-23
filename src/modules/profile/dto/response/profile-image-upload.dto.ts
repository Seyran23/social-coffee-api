import { ApiProperty } from '@nestjs/swagger';

export class ProfileImageUploadDto {
  @ApiProperty({
    description: 'URL of the uploaded profile image',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1234567890/profiles/user123.jpg',
  })
  profileImageUrl: string;
}
