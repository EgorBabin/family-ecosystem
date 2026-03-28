const DEFAULT_SERVICE = 'gallery';

function serviceMap() {
    return {
        gallery: {
            publicUrl: process.env.GALLERY_PUBLIC_URL,
            callbackPath: '/auth',
        },
    };
}

export function normalizeService(rawService) {
    const service = String(rawService || DEFAULT_SERVICE)
        .trim()
        .toLowerCase();
    return Object.prototype.hasOwnProperty.call(serviceMap(), service)
        ? service
        : null;
}

export function getDefaultService() {
    return DEFAULT_SERVICE;
}

export function requireService(rawService) {
    return normalizeService(rawService) || DEFAULT_SERVICE;
}

export function getServiceConfig(serviceName) {
    const service = requireService(serviceName);
    const config = serviceMap()[service];
    if (!config?.publicUrl) {
        throw new Error(`PUBLIC URL for service "${service}" is not configured`);
    }
    return { ...config, name: service };
}

export function buildServiceAuthUrl(serviceName) {
    const service = getServiceConfig(serviceName);
    return new URL(service.callbackPath, service.publicUrl);
}

export function buildIdLoginUrl(serviceName, errorCode) {
    const baseUrl = process.env.ID_PUBLIC_URL || process.env.APP_PUBLIC_URL;
    if (!baseUrl) {
        throw new Error('ID_PUBLIC_URL is not configured');
    }

    const url = new URL('/', baseUrl);
    url.searchParams.set('service', requireService(serviceName));
    if (errorCode) {
        url.searchParams.set('error', errorCode);
    }
    return url;
}
