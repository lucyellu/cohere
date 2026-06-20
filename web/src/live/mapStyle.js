// Google Maps style arrays. GOOGLE_PAPER_MAP gives the real, zoomable map a
// clean printed-paper look — warm cream land, muted sepia roads, soft blue
// water — so it reads like an atlas page rather than a screen.
export const GOOGLE_PAPER_MAP = [
  { elementType: 'geometry', stylers: [{ color: '#f1e7d0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b5d44' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f6efdd' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#cbb78f' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#a9905f' }, { weight: 1.1 }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#c3ac7e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d9dcb4' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ece1c6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e6d7b8' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8c39a' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dcc79c' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a9c4cc' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7d96a0' }] },
];
