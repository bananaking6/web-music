/**
 * API configuration and utility functions.
 */

export const PROXY =
  location.hostname === "localhost"
    ? ""
    : "https://api.codetabs.com/v1/proxy/?quest=";

export const API = PROXY + "https://api.monochrome.tf";
export const IMG = PROXY + "https://resources.tidal.com/images/";

/**
 * Fetch the streaming URL for a given track.
 * @param {Object} track
 * @returns {Promise<string>} The resolved audio URL
 */
export async function getTrackUrl(track) {
  const res = await fetch(
    `${API}/track/?id=${track.id}${PROXY ? "%26" : "&"}quality=LOW`,
  );
  const data = await res.json();
  return PROXY + JSON.parse(atob(data.data.manifest)).urls[0];
}
