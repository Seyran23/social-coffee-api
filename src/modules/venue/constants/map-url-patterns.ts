export const MAP_URL_PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // !3dlat!4dlon — precise geocoded pin
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // q=lat,lon
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, // ll=lat,lon
  /@(-?\d+\.\d+),(-?\d+\.\d+)/, // @lat,lon — viewport/camera center, least precise
];
