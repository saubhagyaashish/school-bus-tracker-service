/**
 * ETA Calculation Service
 * Estimates time of arrival based on current position, speed, and distance
 */

// Earth's radius in meters
const EARTH_RADIUS = 6371000;

/**
 * Calculate distance between two coordinates using Haversine formula
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
 * Calculate ETA to destination
 */
export function calculateEta(
    currentLat: number,
    currentLon: number,
    destLat: number,
    destLon: number,
    speedKnots: number
): { minutes: number; distance: number; estimatedArrival: string } {
    // Calculate distance
    const distanceMeters = calculateDistance(currentLat, currentLon, destLat, destLon);
    const distanceKm = distanceMeters / 1000;

    // Convert speed from knots to km/h
    let speedKmh = knotsToKmh(speedKnots);

    // If bus is stationary or moving very slowly, use average speed
    const MIN_SPEED = 10; // Minimum assumed speed in km/h
    const AVG_CITY_SPEED = 25; // Average city speed in km/h

    if (speedKmh < MIN_SPEED) {
        speedKmh = AVG_CITY_SPEED;
    }

    // Calculate time in hours
    const timeHours = distanceKm / speedKmh;
    const timeMinutes = Math.round(timeHours * 60);

    // Calculate estimated arrival time
    const now = new Date();
    const arrivalTime = new Date(now.getTime() + timeMinutes * 60 * 1000);

    return {
        minutes: timeMinutes,
        distance: Math.round(distanceMeters),
        estimatedArrival: arrivalTime.toISOString(),
    };
}

/**
 * Calculate ETA with traffic adjustment
 * TODO: Integrate with traffic API for more accurate estimates
 */
export function calculateEtaWithTraffic(
    currentLat: number,
    currentLon: number,
    destLat: number,
    destLon: number,
    speedKnots: number,
    hour: number
): { minutes: number; distance: number; estimatedArrival: string } {
    const baseEta = calculateEta(currentLat, currentLon, destLat, destLon, speedKnots);

    // Apply traffic multipliers based on time
    let trafficMultiplier = 1.0;

    // Morning rush hour (7-10 AM)
    if (hour >= 7 && hour <= 10) {
        trafficMultiplier = 1.3;
    }
    // Evening rush hour (4-8 PM)
    else if (hour >= 16 && hour <= 20) {
        trafficMultiplier = 1.4;
    }

    const adjustedMinutes = Math.round(baseEta.minutes * trafficMultiplier);
    const arrivalTime = new Date(Date.now() + adjustedMinutes * 60 * 1000);

    return {
        minutes: adjustedMinutes,
        distance: baseEta.distance,
        estimatedArrival: arrivalTime.toISOString(),
    };
}
