/**
 * ETA Calculation Service
 * Estimates time of arrival using OSRM road routing with Haversine fallback
 */

import { osrmService, Coordinate } from './osrm.service';

// Constants
const EARTH_RADIUS = 6371000; // meters

// Types
export interface ETAResult {
    minutes: number;
    distance: number;              // Road distance in meters
    estimatedArrival: string;      // ISO timestamp
    confidenceRange: {
        minMinutes: number;
        maxMinutes: number;
    };
    routeGeometry?: string;        // Encoded polyline for map display
    source: 'osrm' | 'fallback';   // Data source indicator
}

export interface StopETA {
    stopId: number;
    stopName: string;
    etaMinutes: number;
    distance: number;
    status: 'completed' | 'next' | 'upcoming';
}

export interface MultiStopETA {
    totalMinutes: number;
    totalDistance: number;
    stopsAway: number;
    targetStopEta: StopETA | null;
    stops: StopETA[];
    routeGeometry?: string;
    source: 'osrm' | 'fallback';
}

export interface Stop {
    id: number;
    name: string;
    lat: number;
    lng: number;
}

// ============================================================================
// HAVERSINE FUNCTIONS (Fallback)
// ============================================================================

/**
 * Calculate straight-line distance between two coordinates using Haversine formula
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS * c; // Distance in meters
}

/**
 * Convert knots to km/h
 */
export function knotsToKmh(knots: number): number {
    return knots * 1.852;
}

/**
 * Calculate ETA using Haversine (fallback when OSRM unavailable)
 */
export function calculateEtaFallback(
    currentLat: number,
    currentLon: number,
    destLat: number,
    destLon: number
): ETAResult {
    const distanceMeters = calculateDistance(currentLat, currentLon, destLat, destLon);

    // Assume average city speed since we don't have real road data
    const AVG_CITY_SPEED_KMH = 25;
    const distanceKm = distanceMeters / 1000;
    const timeHours = distanceKm / AVG_CITY_SPEED_KMH;
    const timeMinutes = Math.round(timeHours * 60);

    // Apply traffic adjustment
    const { adjusted, range } = applyTrafficAdjustment(timeMinutes);

    const arrivalTime = new Date(Date.now() + adjusted * 60 * 1000);

    // Increase uncertainty for straight-line estimates (roads are winding)
    const uncertaintyMultiplier = 1.3; // 30% extra uncertainty

    return {
        minutes: adjusted,
        distance: Math.round(distanceMeters * 1.4), // Rough road distance estimate
        estimatedArrival: arrivalTime.toISOString(),
        confidenceRange: {
            minMinutes: Math.round(range.min * uncertaintyMultiplier),
            maxMinutes: Math.round(range.max * uncertaintyMultiplier),
        },
        source: 'fallback',
    };
}

// ============================================================================
// TRAFFIC ADJUSTMENT
// ============================================================================

/**
 * Get current traffic multiplier based on time of day
 */
function getTrafficMultiplier(): { multiplier: number; minFactor: number; maxFactor: number } {
    const hour = new Date().getHours();

    // Morning rush hour (7-10 AM)
    if (hour >= 7 && hour <= 10) {
        return { multiplier: 1.3, minFactor: 0.9, maxFactor: 1.6 };
    }
    // Evening rush hour (4-8 PM)  
    if (hour >= 16 && hour <= 20) {
        return { multiplier: 1.4, minFactor: 0.95, maxFactor: 1.8 };
    }
    // Late night (10 PM - 6 AM) - less traffic
    if (hour >= 22 || hour <= 6) {
        return { multiplier: 0.9, minFactor: 0.8, maxFactor: 1.0 };
    }
    // Normal hours
    return { multiplier: 1.0, minFactor: 0.85, maxFactor: 1.2 };
}

/**
 * Apply traffic-based adjustment to base ETA
 */
function applyTrafficAdjustment(baseMinutes: number): {
    adjusted: number;
    range: { min: number; max: number }
} {
    const traffic = getTrafficMultiplier();

    const adjusted = Math.round(baseMinutes * traffic.multiplier);

    return {
        adjusted,
        range: {
            min: Math.max(1, Math.round(baseMinutes * traffic.minFactor)),
            max: Math.round(baseMinutes * traffic.maxFactor),
        },
    };
}

// ============================================================================
// OSRM-BASED ETA (Primary)
// ============================================================================

/**
 * Calculate ETA using OSRM road routing
 * Falls back to Haversine if OSRM is unavailable
 */
export async function calculateEtaOSRM(
    currentLat: number,
    currentLon: number,
    destLat: number,
    destLon: number,
    includeGeometry: boolean = true
): Promise<ETAResult> {
    const origin: Coordinate = { lat: currentLat, lng: currentLon };
    const destination: Coordinate = { lat: destLat, lng: destLon };

    // Try OSRM first
    const route = await osrmService.getRoute(origin, destination);

    if (!route) {
        // Fallback to Haversine
        console.warn('OSRM unavailable, using Haversine fallback');
        return calculateEtaFallback(currentLat, currentLon, destLat, destLon);
    }

    // Convert OSRM duration (seconds) to minutes
    const baseMinutes = Math.round(route.duration / 60);

    // Apply traffic adjustment
    const { adjusted, range } = applyTrafficAdjustment(baseMinutes);

    const arrivalTime = new Date(Date.now() + adjusted * 60 * 1000);

    return {
        minutes: adjusted,
        distance: Math.round(route.distance),
        estimatedArrival: arrivalTime.toISOString(),
        confidenceRange: {
            minMinutes: range.min,
            maxMinutes: range.max,
        },
        routeGeometry: includeGeometry ? route.geometry : undefined,
        source: 'osrm',
    };
}

/**
 * Calculate ETA to multiple stops along a route
 * Returns ETA for each stop and identifies how many stops away target is
 */
export async function calculateMultiStopEta(
    busLat: number,
    busLon: number,
    stops: Stop[],
    targetStopId?: number
): Promise<MultiStopETA> {
    if (stops.length === 0) {
        return {
            totalMinutes: 0,
            totalDistance: 0,
            stopsAway: 0,
            targetStopEta: null,
            stops: [],
            source: 'fallback',
        };
    }

    const origin: Coordinate = { lat: busLat, lng: busLon };
    const waypoints: Coordinate[] = stops.map(s => ({ lat: s.lat, lng: s.lng }));

    // Try OSRM multi-stop route
    const routeResult = await osrmService.getMultiStopRoute(origin, waypoints);

    if (routeResult && routeResult.legs.length === stops.length) {
        // OSRM success - use actual road routing
        let cumulativeMinutes = 0;
        let cumulativeDistance = 0;
        let stopsAway = 0;
        let targetStopEta: StopETA | null = null;

        const stopETAs: StopETA[] = stops.map((stop, index) => {
            const leg = routeResult.legs[index];
            const legMinutes = Math.round(leg.duration / 60);

            cumulativeMinutes += legMinutes;
            cumulativeDistance += leg.distance;

            const { adjusted, range } = applyTrafficAdjustment(cumulativeMinutes);

            const stopEta: StopETA = {
                stopId: stop.id,
                stopName: stop.name,
                etaMinutes: adjusted,
                distance: Math.round(cumulativeDistance),
                status: 'upcoming',
            };

            // Mark first stop as 'next'
            if (index === 0) {
                stopEta.status = 'next';
            }

            // Track target stop
            if (stop.id === targetStopId) {
                stopsAway = index + 1;
                targetStopEta = stopEta;
            }

            return stopEta;
        });

        const { adjusted: totalAdjusted } = applyTrafficAdjustment(
            Math.round(routeResult.totalDuration / 60)
        );

        return {
            totalMinutes: totalAdjusted,
            totalDistance: Math.round(routeResult.totalDistance),
            stopsAway,
            targetStopEta,
            stops: stopETAs,
            routeGeometry: routeResult.geometry,
            source: 'osrm',
        };
    }

    // Fallback: Use Haversine for each stop sequentially
    console.warn('OSRM multi-stop failed, using Haversine fallback');

    let prevLat = busLat;
    let prevLon = busLon;
    let cumulativeMinutes = 0;
    let cumulativeDistance = 0;
    let stopsAway = 0;
    let targetStopEta: StopETA | null = null;

    const stopETAs: StopETA[] = stops.map((stop, index) => {
        const distance = calculateDistance(prevLat, prevLon, stop.lat, stop.lng);
        const distanceKm = distance / 1000;
        const legMinutes = Math.round((distanceKm / 25) * 60); // Assume 25 km/h

        cumulativeMinutes += legMinutes;
        cumulativeDistance += distance * 1.4; // Rough road estimate

        const { adjusted } = applyTrafficAdjustment(cumulativeMinutes);

        const stopEta: StopETA = {
            stopId: stop.id,
            stopName: stop.name,
            etaMinutes: adjusted,
            distance: Math.round(cumulativeDistance),
            status: index === 0 ? 'next' : 'upcoming',
        };

        if (stop.id === targetStopId) {
            stopsAway = index + 1;
            targetStopEta = stopEta;
        }

        prevLat = stop.lat;
        prevLon = stop.lng;

        return stopEta;
    });

    return {
        totalMinutes: cumulativeMinutes,
        totalDistance: Math.round(cumulativeDistance),
        stopsAway,
        targetStopEta,
        stops: stopETAs,
        source: 'fallback',
    };
}

/**
 * Quick ETA check using distance matrix (for batch operations)
 */
export async function getBatchETA(
    busLat: number,
    busLon: number,
    destinations: Coordinate[]
): Promise<number[] | null> {
    const origin: Coordinate = { lat: busLat, lng: busLon };

    const matrix = await osrmService.getDistanceMatrix(origin, destinations);

    if (!matrix) {
        return null;
    }

    // Convert durations (seconds) to minutes with traffic adjustment
    return matrix.durations.map(duration => {
        const baseMinutes = Math.round(duration / 60);
        const { adjusted } = applyTrafficAdjustment(baseMinutes);
        return adjusted;
    });
}

// Legacy export for backward compatibility
export const calculateEta = calculateEtaFallback;
