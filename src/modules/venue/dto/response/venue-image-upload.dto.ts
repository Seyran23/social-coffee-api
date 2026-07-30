import { ApiProperty } from '@nestjs/swagger';

export class VenueImageUploadDto {
  @ApiProperty({
    description: 'URL of the uploaded venue image',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1234567890/venues/venue123.jpg',
  })
  imageUrl: string;
}
