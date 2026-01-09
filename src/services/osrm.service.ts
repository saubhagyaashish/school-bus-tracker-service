/**
 * OSRM (Open Source Routing Machine) Service
 * Handles road-based routing calculations for accurate ETA
 */

import axios, { AxiosInstance } from 'axios';

// Types
export interface Coordinate {
    lat: number;
    lng: number;
}

export interface RouteResult {
    duration: number;      // seconds
    distance: number;      // meters
    geometry: string;      // encoded polyline
}

export interface RouteLeg {
    duration: number;      // seconds
    distance: number;      // meters
}

export interface MultiStopRouteResult {
    totalDuration: number;
    totalDistance: number;
    geometry: string;
    legs: RouteLeg[];
}

export interface CachedRoute {
    result: RouteResult;
    timestamp: number;
}

class OSRMService {
    private client: AxiosInstance;
    private routeCache: Map<string, CachedRoute> = new Map();
    private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

    constructor() {
        let baseURL = process.env.OSRM_URL || 'http://localhost:5000';

        // Ensure URL has http:// prefix but not duplicated
        if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
            baseURL = `http://${baseURL}`;
        }

        this.client = axios.create({
            baseURL,
            timeout: 10000,
        });
    }

    /**
     * Generate cache key from coordinates
     */
    private getCacheKey(origin: Coordinate, destination: Coordinate): string {
        return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    }

    /**
     * Check if cached route is still valid
     */
    private isCacheValid(cached: CachedRoute): boolean {
        return Date.now() - cached.timestamp < this.cacheTTL;
    }

    /**
     * Get route between two points
     * Uses OSRM route API: /route/v1/driving/{lng},{lat};{lng},{lat}
     */
    async getRoute(origin: Coordinate, destination: Coordinate, useCache: boolean = true): Promise<RouteResult | null> {
        // Check cache first
        if (useCache) {
            const cacheKey = this.getCacheKey(origin, destination);
            const cached = this.routeCache.get(cacheKey);

            if (cached && this.isCacheValid(cached)) {
                return cached.result;
            }
        }

        try {
            // OSRM uses lng,lat format (opposite of typical lat,lng)
            const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;

            const response = await this.client.get(`/route/v1/driving/${coordinates}`, {
                params: {
                    overview: 'full',
                    geometries: 'polyline',
                },
            });

            if (response.data.code !== 'Ok' || !response.data.routes?.[0]) {
                console.warn('OSRM returned no routes:', response.data.code);
                return null;
            }

            const route = response.data.routes[0];
            const result: RouteResult = {
                duration: route.duration,
                distance: route.distance,
                geometry: route.geometry,
            };

            // Cache the result
            if (useCache) {
                const cacheKey = this.getCacheKey(origin, destination);
                this.routeCache.set(cacheKey, {
                    result,
                    timestamp: Date.now(),
                });
            }

            return result;
        } catch (error) {
            console.error('OSRM route request failed:', error);
            return null;
        }
    }

    /**
     * Get route through multiple waypoints
     * Returns duration/distance for each leg
     */
    async getMultiStopRoute(
        origin: Coordinate,
        waypoints: Coordinate[]
    ): Promise<MultiStopRouteResult | null> {
        if (waypoints.length === 0) {
            return null;
        }

        try {
            // Build coordinates string: origin;waypoint1;waypoint2;...
            const allCoords = [origin, ...waypoints];
            const coordinatesStr = allCoords
                .map(c => `${c.lng},${c.lat}`)
                .join(';');

            const response = await this.client.get(`/route/v1/driving/${coordinatesStr}`, {
                params: {
                    overview: 'full',
                    geometries: 'polyline',
                    steps: 'true',
                },
            });

            if (response.data.code !== 'Ok' || !response.data.routes?.[0]) {
                console.warn('OSRM multi-stop route failed:', response.data.code);
                return null;
            }

            const route = response.data.routes[0];

            return {
                totalDuration: route.duration,
                totalDistance: route.distance,
                geometry: route.geometry,
                legs: route.legs.map((leg: any) => ({
                    duration: leg.duration,
                    distance: leg.distance,
                })),
            };
        } catch (error) {
            console.error('OSRM multi-stop route request failed:', error);
            return null;
        }
    }

    /**
     * Get distance/duration matrix from one origin to multiple destinations
     * Uses OSRM table API for efficient batch calculations
     */
    async getDistanceMatrix(
        origin: Coordinate,
        destinations: Coordinate[]
    ): Promise<{ durations: number[]; distances: number[] } | null> {
        if (destinations.length === 0) {
            return { durations: [], distances: [] };
        }

        try {
            // Build coordinates: origin first, then all destinations
            const allCoords = [origin, ...destinations];
            const coordinatesStr = allCoords
                .map(c => `${c.lng},${c.lat}`)
                .join(';');

            const response = await this.client.get(`/table/v1/driving/${coordinatesStr}`, {
                params: {
                    sources: '0', // Only origin as source
                    annotations: 'duration,distance',
                },
            });

            if (response.data.code !== 'Ok') {
                console.warn('OSRM table request failed:', response.data.code);
                return null;
            }

            // Response has durations[0] as array of times from origin to each destination
            // First element is origin to itself (0), rest are to destinations
            const durations = response.data.durations[0].slice(1);
            const distances = response.data.distances?.[0]?.slice(1) || [];

            return { durations, distances };
        } catch (error) {
            console.error('OSRM table request failed:', error);
            return null;
        }
    }

    /**
     * Decode OSRM polyline to array of coordinates
     * OSRM uses standard Google polyline encoding
     */
    decodePolyline(encoded: string): Coordinate[] {
        const coordinates: Coordinate[] = [];
        let index = 0;
        let lat = 0;
        let lng = 0;

        while (index < encoded.length) {
            // Decode latitude
            let shift = 0;
            let result = 0;
            let byte: number;

            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
            lat += deltaLat;

            // Decode longitude
            shift = 0;
            result = 0;

            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
            lng += deltaLng;

            coordinates.push({
                lat: lat / 1e5,
                lng: lng / 1e5,
            });
        }

        return coordinates;
    }

    /**
     * Check if OSRM service is available
     */
    async isHealthy(): Promise<boolean> {
        try {
            // Simple route request to check connectivity
            const response = await this.client.get('/route/v1/driving/77.209,28.614;77.21,28.615', {
                timeout: 3000,
            });
            return response.data.code === 'Ok';
        } catch {
            return false;
        }
    }

    /**
     * Clear route cache
     */
    clearCache(): void {
        this.routeCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxAge: number } {
        return {
            size: this.routeCache.size,
            maxAge: this.cacheTTL,
        };
    }
}

// Export singleton instance
export const osrmService = new OSRMService();
