import axios from 'axios';

const TRACCAR_OSMAND_URL = 'http://localhost:5055';
const DEVICE_ID = '123456';

// Circular path around India Gate (approx)
const path = [
    { lat: 28.612864, lon: 77.229302 },
    { lat: 28.613109, lon: 77.230568 },
    { lat: 28.611734, lon: 77.232542 },
    { lat: 28.610509, lon: 77.232971 },
    { lat: 28.609529, lon: 77.231984 },
    { lat: 28.609340, lon: 77.230353 },
    { lat: 28.610131, lon: 77.228551 },
    { lat: 28.611639, lon: 77.227499 }
];

function interpolate(start: any, end: any, steps: number) {
    const points = [];
    const latStep = (end.lat - start.lat) / steps;
    const lonStep = (end.lon - start.lon) / steps;
    for (let i = 0; i <= steps; i++) {
        points.push({
            lat: start.lat + latStep * i,
            lon: start.lon + lonStep * i
        });
    }
    return points;
}

// Generate smooth route
let fullRoute: any[] = [];
for (let i = 0; i < path.length; i++) {
    const next = (i + 1) % path.length;
    fullRoute = fullRoute.concat(interpolate(path[i], path[next], 10)); // 10 steps between waypoints
}

async function runSimulation() {
    console.log(`🚀 Starting Bus Simulation for Device ${DEVICE_ID}`);
    let idx = 0;

    setInterval(async () => {
        const point = fullRoute[idx];
        try {
            // Using HTTP protocol (OsmAnd)
            await axios.get(TRACCAR_OSMAND_URL, {
                params: {
                    id: DEVICE_ID,
                    lat: point.lat,
                    lon: point.lon,
                    timestamp: new Date().getTime(),
                    speed: 25.0 + Math.random() * 5, // Random speed
                    bearing: 0,
                    altitude: 200
                }
            });
            console.log(`📍 Sent Position [${idx}]: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
        } catch (error: any) {
            console.error('❌ Failed to send:', error.message);
        }

        idx = (idx + 1) % fullRoute.length;
    }, 2000); // Every 2 seconds
}

runSimulation();
