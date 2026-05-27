import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';

type GeocodeXyzResponse = {
  error?: boolean;
  message?: string;
  latt?: string;
  longt?: string;
};

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  constructor(private http: HttpClient) {
    // this.getCoordsGeocodeXYZ();
  }

  async getLocation(): Promise<Position> {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted")
      permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (permission.location !== "granted")
      throw new Error('Location permission was denied');
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60000,
    });
    return position;
  }

  getDistanceBetweenPoints = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371; // A Föld sugara km-ben
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Eredmény km-ben
  };

  async getLocName(position: Position, isOpenSMap?: boolean) {
    const url = !isOpenSMap
      ? `https://geocode.xyz/${position.coords.latitude},${position.coords.longitude}?json=1&auth=469206953456508521936x26064`
      : `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`;

    return firstValueFrom(
      this.http.get(url).pipe(
        timeout(8000),
        catchError((error) => {
          console.warn('Reverse geocoding failed:', error);

          return of({
            error: true,
            source: isOpenSMap ? 'osm' : 'geocode.xyz',
          });
        })
      )
    );
  }

  getCoordsGeocodeXYZ = async (address: string) => {
    const url = `https://geocode.xyz/${encodeURIComponent(address)}?json=1&auth=469206953456508521936x26064`;
    const data = await firstValueFrom(
      this.http.get<GeocodeXyzResponse>(url).pipe(
        timeout(8000),
        catchError((error) => {
          console.warn('Geocode.xyz lookup failed:', error);
          return of({
            error: true,
            message: 'Geocode lookup failed',
          } satisfies GeocodeXyzResponse);
        })
      )
    );

    if (!data || data['error'] || data['latt'] === '0.00000') {
      return new Error(String(data?.['message'] ?? 'Lejart a napi limit'));
    }

    return {
      lat: data['latt'],
      lon: data['longt'],
    };
  };

  delay = (millisec: number) => new Promise((res) => setTimeout(res, millisec));

  getCoordinatesOSM = async (address: string) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    const data = await firstValueFrom(
      this.http.get<unknown[]>(url).pipe(
        timeout(8000),
        catchError((error) => {
          console.warn('OpenStreetMap lookup failed:', error);
          return of([]);
        })
      )
    );

    return data.length > 0 ? data[0] : 'Hiba';
  };
}
