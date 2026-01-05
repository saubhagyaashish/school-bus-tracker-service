import axios, { AxiosInstance } from 'axios';

/**
 * Traccar API Service
 * Handles all communication with the Traccar GPS backend
 */
class TraccarService {
    private client: AxiosInstance;
    private authHeader: string | null = null;

    constructor() {
        this.client = axios.create({
            baseURL: process.env.TRACCAR_API_URL || 'http://localhost:8082/api',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Authenticate with Traccar and store session
     */
    async login(email: string, password: string): Promise<any> {
        const formData = new URLSearchParams();
        formData.append('email', email);
        formData.append('password', password);

        const response = await this.client.post('/session', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        // Store auth for subsequent requests
        this.authHeader = `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
        return response.data;
    }

    /**
     * Set authentication header for API calls
     */
    setAuth(email: string, password: string): void {
        this.authHeader = `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
        this.client.defaults.headers.common['Authorization'] = this.authHeader;
    }

    /**
     * Get all devices (buses)
     */
    async getDevices(): Promise<any[]> {
        const response = await this.client.get('/devices');
        return response.data;
    }

    /**
     * Get device by ID
     */
    async getDevice(deviceId: number): Promise<any> {
        const response = await this.client.get(`/devices?id=${deviceId}`);
        return response.data[0];
    }

    /**
     * Get latest positions for all devices
     */
    async getPositions(): Promise<any[]> {
        const response = await this.client.get('/positions');
        return response.data;
    }

    /**
     * Get position for specific device
     */
    async getDevicePosition(deviceId: number): Promise<any> {
        const devices = await this.getDevices();
        const device = devices.find(d => d.id === deviceId);
        if (!device?.positionId) return null;

        const response = await this.client.get(`/positions?id=${device.positionId}`);
        return response.data[0];
    }

    /**
     * Get position history for a device
     */
    async getPositionHistory(deviceId: number, from: Date, to: Date): Promise<any[]> {
        const response = await this.client.get('/positions', {
            params: {
                deviceId,
                from: from.toISOString(),
                to: to.toISOString(),
            },
        });
        return response.data;
    }

    /**
     * Get route report (positions in time range)
     */
    async getRouteReport(deviceId: number, from: Date, to: Date): Promise<any[]> {
        const response = await this.client.get('/reports/route', {
            params: {
                deviceId,
                from: from.toISOString(),
                to: to.toISOString(),
            },
        });
        return response.data;
    }

    /**
     * Get server info
     */
    async getServer(): Promise<any> {
        const response = await this.client.get('/server');
        return response.data;
    }
}

// Export singleton instance
export const traccarService = new TraccarService();
