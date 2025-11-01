export const MAP_URL_PATTERNS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/, // @lat,lon
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // q=lat,lon
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, // ll=lat,lon
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // !3dlat!4dlon (alternative format)
];
