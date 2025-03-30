import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';

@Injectable({
 providedIn: 'root',
})
export class LocationService {
 constructor(private http: HttpClient) {
  // this.getCoordsGeocodeXYZ();
 }

 async getLocation(): Promise<Position> {
  const position = await Geolocation.getCurrentPosition();
  console.log(position);
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

 getLocName(position: Position, isOpenSMap?: boolean) {
  return new Promise((res, rej) => {
   const url = !isOpenSMap
    ? `https://geocode.xyz/${position.coords.latitude},${position.coords.longitude}?json=1&auth=469206953456508521936x26064`
    : `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`;

   this.http.get(url).subscribe((location) => {
    res(location);
   });
  });
 }

 getCoordsGeocodeXYZ = async (address: string) => {
  return new Promise<any>((res, rej) => {
   const url = `https://geocode.xyz/${address}?json=1&auth=469206953456508521936x26064`;
   try {
    this.http.get(url).subscribe((data: any) => {
     if (data) {
      if (data.latt == '0.00000') res(new Error('Lejart a napi limit'));
      const location = { lat: data.latt, lon: data.longt };
      res(location);
     } else {
      res('Hiba');
     }
    });
   } catch (error) {
    res(error);
   }
  });
 };

 delay = (millisec: number) => new Promise((res) => setTimeout(res, millisec));

 getCoordinatesOSM = async (address: string) => {
  return new Promise<any>((res, rej) => {
   const url = `https://nominatim.openstreetmap.org/search?format=json&q=${address}`;
   try {
    this.http.get(url).subscribe((data: any) => {
     if (data.length > 0) {
      const location = data[0];
      res(location);
     } else {
      res('Hiba');
     }
    });
   } catch (error) {
    res(error);
   }
  });
 };
}
