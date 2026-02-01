/**
 * Chart Debug Helper
 * Add this to check chart initialization
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== CHART DEBUG START ===');
    
    // Check if Lightweight Charts is loaded
    console.log('LightweightCharts available:', typeof LightweightCharts !== 'undefined');
    console.log('LWChart available:', typeof LWChart !== 'undefined');
    
    // Check containers
    const containers = ['price-chart', 'chart-area', 'tv-chart-container'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            console.log(`Container #${id}:`, {
                exists: true,
                width: el.clientWidth,
                height: el.clientHeight,
                visible: el.offsetParent !== null
            });
        } else {
            console.log(`Container #${id}: NOT FOUND`);
        }
    });
    
    console.log('=== CHART DEBUG END ===');
});

// Check after a delay (after page load)
setTimeout(() => {
    console.log('=== CHART DEBUG (2s delay) ===');
    if (window.lwChart) {
        console.log('Chart instance exists:', window.lwChart);
    } else {
        console.log('No chart instance found');
    }
    
    if (window.LWChart) {
        console.log('LWChart module:', LWChart);
        console.log('Current config:', LWChart.getConfig());
    }
    console.log('=== END ===');
}, 2000);

// Simple test to create chart directly
function testChartDirect() {
    console.log('[DIRECT TEST] Disabled - using real chart instead');
    // This test is disabled to allow the real chart to work
}

// Don't run the test - let the real chart initialize
// setTimeout(testChartDirect, 3000);

