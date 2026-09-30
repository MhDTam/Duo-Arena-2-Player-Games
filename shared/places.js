// Places for "Guess the Place": [id, lat, lon, English name]. Arabic names live in the client
// language file (key "place.<id>"). Coordinates are the landmark itself (WGS84 degrees).
export const PLACES = [
  ['giza', 29.9792, 31.1342, 'Pyramids of Giza, Egypt'],
  ['ur', 30.9626, 46.1031, 'Ziggurat of Ur, Iraq'],
  ['samarra', 34.2058, 43.8795, 'Malwiya Minaret, Samarra, Iraq'],
  ['babylon', 32.5436, 44.4209, 'Ishtar Gate, Babylon, Iraq'],
  ['marshes', 31.0357, 47.0243, 'Mesopotamian Marshes, Iraq'],
  ['petra', 30.3285, 35.4444, 'Petra, Jordan'],
  ['cappadocia', 38.6431, 34.8289, 'Cappadocia, Turkey'],
  ['eiffel', 48.8584, 2.2945, 'Eiffel Tower, Paris, France'],
  ['london', 51.5007, -0.1246, 'Big Ben, London, UK'],
  ['rome', 41.8902, 12.4922, 'Colosseum, Rome, Italy'],
  ['pisa', 43.723, 10.3966, 'Leaning Tower of Pisa, Italy'],
  ['stonehenge', 51.1789, -1.8262, 'Stonehenge, England'],
  ['holland', 51.884, 4.639, 'Kinderdijk windmills, Netherlands'],
  ['santorini', 36.4618, 25.3753, 'Santorini, Greece'],
  ['moscow', 55.7525, 37.6231, "St Basil's Cathedral, Moscow, Russia"],
  ['castle', 47.5576, 10.7498, 'Neuschwanstein Castle, Germany'],
  ['taj', 27.1751, 78.0421, 'Taj Mahal, Agra, India'],
  ['wall', 40.4319, 116.5704, 'Great Wall of China'],
  ['fuji', 35.3606, 138.7274, 'Mount Fuji, Japan'],
  ['angkor', 13.4125, 103.867, 'Angkor Wat, Cambodia'],
  ['everest', 27.9881, 86.925, 'Mount Everest, Nepal'],
  ['liberty', 40.6892, -74.0445, 'Statue of Liberty, New York, USA'],
  ['canyon', 36.1069, -112.1129, 'Grand Canyon, USA'],
  ['niagara', 43.0896, -79.0849, 'Niagara Falls, Canada / USA'],
  ['chichen', 20.6843, -88.5678, 'Chichen Itza, Mexico'],
  ['machu', -13.1631, -72.545, 'Machu Picchu, Peru'],
  ['moai', -27.1258, -109.2767, 'Moai statues, Easter Island, Chile'],
  ['kilimanjaro', -3.0674, 37.3556, 'Mount Kilimanjaro, Tanzania'],
  ['uluru', -25.3444, 131.0369, 'Uluru, Australia'],
  ['antarctica', -90, 0, 'Antarctica (South Pole)'],
];

export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p[0], p]));

// great-circle distance in km
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// points for a guess: 1000 on the spot, ~575 at 1000 km, ~60 at 5000 km
export const geoPoints = (km) => Math.round(1000 * Math.exp(-km / 1800));
