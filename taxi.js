const bookingForm = document.querySelector("#bookingForm");
const bookingResult = document.querySelector("#bookingResult");
const rideOptions = document.querySelectorAll(".ride-option");
const pickupTimeInput = document.querySelector("#pickupTime");
const routeStatus = document.querySelector("#routeStatus");
const gpsButton = document.querySelector("#useMyLocation");
const USD_TO_PHP = 58;
const FARE_PER_KM_USD = 0.75;
const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const locations = {
  pickup: {
    input: document.querySelector("#pickup"),
    suggestions: document.querySelector("#pickupSuggestions"),
    selected: null,
  },
  dropoff: {
    input: document.querySelector("#dropoff"),
    suggestions: document.querySelector("#dropoffSuggestions"),
    selected: null,
  },
};

const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
pickupTimeInput.min = now.toISOString().slice(0, 16);

rideOptions.forEach((option) => {
  const rideInput = option.querySelector('input[name="ride"]');
  option.querySelector(".ride-price").textContent = `from ${pesoFormat.format(Number(rideInput.dataset.price) * USD_TO_PHP)}`;
  rideInput.addEventListener("change", () => {
    rideOptions.forEach((ride) => ride.classList.toggle("selected", ride === option));
    bookingResult.hidden = true;
  });
});

let routeMap = null;
let mapLayers = null;
let routeRequestId = 0;
let lastSearchTime = 0;
let searchQueue = Promise.resolve();
const searchTimers = {};
const searchControllers = {};

if (typeof L !== "undefined") {
  routeMap = L.map("routeMap", { attributionControl: false }).setView([14.5995, 120.9842], 12);
  L.control.attribution({ prefix: false })
    .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors')
    .addTo(routeMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(routeMap);
  mapLayers = L.layerGroup().addTo(routeMap);
} else {
  routeStatus.textContent = "The map could not load. Check your internet connection.";
}

function closeSuggestions(key) {
  const { input, suggestions } = locations[key];
  suggestions.hidden = true;
  suggestions.replaceChildren();
  input.setAttribute("aria-expanded", "false");
}

function showSuggestionMessage(key, message) {
  const { input, suggestions } = locations[key];
  const item = document.createElement("p");
  item.className = "suggestions-message";
  item.textContent = message;
  suggestions.replaceChildren(item);
  suggestions.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function placeLabel(properties) {
  const primary = properties.name ||
    [properties.housenumber, properties.street].filter(Boolean).join(" ") ||
    properties.city || properties.town || properties.village || properties.county || properties.country || "Location";
  const context = [properties.city, properties.state, properties.country]
    .filter((value) => value && value !== primary);
  return [primary, ...context.slice(0, 2)].join(", ");
}

function searchPlaces(query, signal) {
  const request = searchQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastSearchTime));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    if (signal.aborted) return [];

    lastSearchTime = Date.now();
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Location search failed");
    const data = await response.json();
    return data.features || [];
  });
  searchQueue = request.catch(() => {});
  return request;
}

function addLocationSuggestions(key, features) {
  const { input, suggestions } = locations[key];
  suggestions.replaceChildren();

  if (!features.length) {
    showSuggestionMessage(key, "No matching places found.");
    return;
  }

  features.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const location = {
      label: placeLabel(feature.properties),
      latitude: Number(latitude),
      longitude: Number(longitude),
    };
    const option = document.createElement("button");
    option.className = "place-option";
    option.type = "button";
    option.role = "option";
    option.textContent = location.label;
    option.addEventListener("click", () => selectLocation(key, location));
    suggestions.append(option);
  });

  suggestions.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function drawMarkers() {
  if (!mapLayers) return;
  mapLayers.clearLayers();

  const points = [];
  [
    ["pickup", "#27644e"],
    ["dropoff", "#e16d52"],
  ].forEach(([key, color]) => {
    const location = locations[key].selected;
    if (!location) return;
    const point = [location.latitude, location.longitude];
    points.push(point);
    L.circleMarker(point, {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
    }).addTo(mapLayers);
  });

  if (points.length === 1) routeMap.setView(points[0], 14);
  if (points.length === 2) routeMap.fitBounds(L.latLngBounds(points).pad(0.2));
}

async function updateRoute() {
  const requestId = ++routeRequestId;
  const pickup = locations.pickup.selected;
  const dropoff = locations.dropoff.selected;
  drawMarkers();

  if (!pickup || !dropoff) {
    routeStatus.textContent = "Choose a pickup and destination to see your route.";
    return null;
  }

  routeStatus.textContent = "Finding the best route…";

  try {
    const coordinates = `${pickup.longitude},${pickup.latitude};${dropoff.longitude},${dropoff.latitude}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Route lookup failed");
    const data = await response.json();
    if (requestId !== routeRequestId) return null;

    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error("No route found");

    const distanceKm = route.distance / 1000;
    if (mapLayers) {
      mapLayers.clearLayers();
      const routeLine = L.geoJSON(route.geometry, {
        style: { color: "#27644e", weight: 5, opacity: 0.85 },
      }).addTo(mapLayers);
      drawRouteMarkers();
      routeMap.fitBounds(routeLine.getBounds().pad(0.2));
    }
    routeStatus.textContent = `Route found · ${distanceKm.toFixed(1)} km`;
    return { distanceKm };
  } catch {
    if (requestId !== routeRequestId) return null;
    drawMarkers();
    routeStatus.textContent = "Could not find a route. Check your connection and try again.";
    return null;
  }
}

function drawRouteMarkers() {
  [
    [locations.pickup.selected, "#27644e"],
    [locations.dropoff.selected, "#e16d52"],
  ].forEach(([location, color]) => {
    if (!location || !mapLayers) return;
    L.circleMarker([location.latitude, location.longitude], {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
    }).addTo(mapLayers);
  });
}

function selectLocation(key, location) {
  locations[key].selected = location;
  locations[key].input.value = location.label;
  closeSuggestions(key);
  bookingResult.hidden = true;
  updateRoute();
}

Object.entries(locations).forEach(([key, { input }]) => {
  input.addEventListener("input", () => {
    locations[key].selected = null;
    bookingResult.hidden = true;
    updateRoute();
    clearTimeout(searchTimers[key]);
    searchControllers[key]?.abort();

    const query = input.value.trim();
    if (query.length < 3) {
      closeSuggestions(key);
      return;
    }

    showSuggestionMessage(key, "Searching places…");
    searchTimers[key] = setTimeout(async () => {
      const controller = new AbortController();
      searchControllers[key] = controller;
      try {
        const features = await searchPlaces(query, controller.signal);
        if (!controller.signal.aborted && input.value.trim() === query) {
          addLocationSuggestions(key, features);
        }
      } catch {
        if (!controller.signal.aborted) showSuggestionMessage(key, "Search unavailable. Check your connection and try again.");
      }
    }, 550);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSuggestions(key);
  });
});

document.addEventListener("click", (event) => {
  Object.entries(locations).forEach(([key, { input, suggestions }]) => {
    if (!input.closest(".location-field").contains(event.target)) closeSuggestions(key);
  });
});

gpsButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    routeStatus.textContent = "GPS is not available in this browser.";
    return;
  }

  gpsButton.disabled = true;
  gpsButton.textContent = "Finding…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      gpsButton.disabled = false;
      gpsButton.textContent = "Use GPS";
      selectLocation("pickup", {
        label: "My current location",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    },
    () => {
      gpsButton.disabled = false;
      gpsButton.textContent = "Use GPS";
      routeStatus.textContent = "Could not access your location. Allow location access or search for a pickup.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
});

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;

  if (!locations.pickup.selected || !locations.dropoff.selected) {
    routeStatus.textContent = "Choose a pickup and destination from the location suggestions first.";
    return;
  }

  const route = await updateRoute();
  if (!route) return;

  const formData = new FormData(bookingForm);
  const pickup = String(formData.get("pickup")).trim();
  const dropoff = String(formData.get("dropoff")).trim();
  const selectedRide = document.querySelector('input[name="ride"]:checked');
  const rideName = selectedRide.value === "XL" ? "Cab XL" : `${selectedRide.value[0].toUpperCase()}${selectedRide.value.slice(1)}`;
  const fare = pesoFormat.format(
    Math.round((Number(selectedRide.dataset.price) + route.distanceKm * FARE_PER_KM_USD) * USD_TO_PHP)
  );
  const pickupDate = new Date(formData.get("pickupTime"));
  const formattedTime = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(pickupDate);

  bookingResult.innerHTML = `<strong>Estimated fare: ${fare}</strong><p>${rideName} from ${escapeHTML(pickup)} to ${escapeHTML(dropoff)} · ${route.distanceKm.toFixed(1)} km · Pickup ${formattedTime}.</p>`;
  bookingResult.hidden = false;
  bookingResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
