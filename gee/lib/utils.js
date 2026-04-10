/**
 * @fileoverview Shared utility functions for WetCH4-WS modules.
 * Import: var utils = require('path/to/lib/utils');
 */

/**
 * Add 'year' and 'month' properties to an image from system:time_start.
 * @param {ee.Image} image - Input image with system:time_start.
 * @return {ee.Image} Same image with added 'year' and 'month' properties.
 */
function addDateProperties(image) {
  var date = ee.Date(image.get('system:time_start'));
  return image
    .set('year', date.get('year'))
    .set('month', date.get('month'));
}

/**
 * Generate a list of {year, month} objects for iteration.
 * Covers all combinations of years in [startYear..endYear] and given months.
 * @param {number} startYear - First year (inclusive).
 * @param {number} endYear - Last year (inclusive).
 * @param {Array<number>} months - Month numbers to include (e.g. [5,6,7,8,9,10]).
 * @return {ee.List} List of ee.Dictionary with keys 'year' and 'month'.
 */
function generateMonthList(startYear, endYear, months) {
  var yearList = ee.List.sequence(startYear, endYear);
  var monthList = ee.List(months);
  return yearList.map(function(year) {
    return monthList.map(function(month) {
      return ee.Dictionary({year: year, month: month});
    });
  }).flatten();
}

/**
 * Count non-masked (valid) pixels within a geometry.
 * @param {ee.Image} image - Single-band image (masked where invalid).
 * @param {ee.Geometry} geometry - Area to count within.
 * @param {number} scale - Scale in meters for the reduction.
 * @return {ee.Number} Number of valid pixels.
 */
function countValidPixels(image, geometry, scale) {
  var count = image.select(0).reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geometry,
    scale: scale,
    maxPixels: 1e9
  });
  return ee.Number(count.values().get(0));
}

// ============================================================
// Exports
// ============================================================

exports.addDateProperties = addDateProperties;
exports.generateMonthList = generateMonthList;
exports.countValidPixels = countValidPixels;
