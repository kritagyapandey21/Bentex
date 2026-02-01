/**
 * ========================================
 * UTILS.JS - Utility Functions
 * ========================================
 * Helper functions for formatting, logging, and general utilities.
 */

/**
 * Formats a number as USD currency.
 * @param {number} number - The number to format.
 * @returns {string} A string formatted as $USD.
 */
function formatCurrency(number, currency = 'USD') {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2
    });
    return formatter.format(number || 0);
}

async function fetchJson(url, options = {}) {
    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };
    const fetchOptions = { ...options, headers };
    let response;
    try {
        response = await fetch(url, fetchOptions);
    } catch (err) {
        throw new Error(err.message || `Network error while requesting ${url}`);
    }

    let data = {};
    try {
        const text = await response.text();
        if (text) {
            data = JSON.parse(text);
        }
    } catch (err) {
        data = {};
    }

    if (!response.ok || (data && data.ok === false)) {
        const message = (data && data.error) ? data.error : `Request to ${url} failed (${response.status})`;
        throw new Error(message);
    }

    return data;
}

/**
 * Logs activity to the console with a timestamp.
 * @param {string} message - The message to log.
 */
function logActivity(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [INFO] ${message}`);
}

/**
 * Logs an error to the console with a timestamp.
 * @param {string} message - The error message to log.
 */
function logError(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] [ERROR] ${message}`);
}

/**
 * Generates a random integer between two values, inclusive.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} A random integer.
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} value - The value to clamp.
 * @param {number} min - The minimum allowed value.
 * @param {number} max - The maximum allowed value.
 * @returns {number} The clamped value.
 */
function clampValue(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

/**
 * Debounce function to limit how often a function can be executed.
 * Useful for resize events or search inputs.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The delay in milliseconds.
 * @returns {Function} A new debounced function.
 */
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        const context = this;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, delay);
    };
}

/**
 * A mock API call function.
 * @param {string} endpoint - The API endpoint to "call".
 * @param {object} data - The data to "send".
 * @returns {Promise<object>} A promise that resolves with mock data.
 */
function mockApiCall(endpoint, data) {
    logActivity(`Mock API Call to ${endpoint} with data:`, data);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: true, timestamp: new Date().toISOString() });
        }, 500); // Simulate network delay
    });
}

/**
 * A function to get a query parameter from the URL.
 * @param {string} name - The name of the query parameter.
 * @returns {string|null} The value of the parameter or null.
 */
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

/**
 * A function to set a cookie.
 * @param {string} name - The name of the cookie.
 * @param {string} value - The value of the cookie.
 * @param {number} days - The number of days until expiration.
 */
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

/**
 * A function to get a cookie by name.
 * @param {string} name - The name of the cookie.
 * @returns {string|null} The value of the cookie or null.
 */
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i=0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}
