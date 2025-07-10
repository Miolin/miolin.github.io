import "mapbox-gl";

export class TextMarkerOptions {
  constructor(text, point, textColor, bgColor, borderColor, anchor) {
    this.text = text;
    this.point = point;
    this.textColor = textColor;
    this.bgColor = bgColor;
    this.borderColor = borderColor;
    this.anchor = anchor;
  }
}

export class MarkerFactory {
  constructor() { }

  createVenueMarker(id, point, zIndex) {
    const el = document.createElement('div');
    el.id = id;
    el.style.zIndex = zIndex;

    const iconStroke = '#ffffff';
    const background = '#414D59';

    el.className = 'venue-marker';
    el.innerHTML = `
    <svg class="venue-icon" viewBox="0 0 24 24" width="24" height="24">
      <g fill="none" stroke="${iconStroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="square">
        <path d="M5,10V19C5,19.552 5.448,20 6,20H18C18.552,20 19,19.552 19,19V10" />
        <path d="M8,4H4V8C4,9.105 4.895,10 6,10C7.105,10 8,9.105 8,8V4Z" />
        <path d="M15,20H9V16C9,14.343 10.343,13 12,13C13.657,13 15,14.343 15,16V20Z" />
        <path d="M12,4H8V8C8,9.105 8.895,10 10,10C11.105,10 12,9.105 12,8V4Z" />
        <path d="M16,4H12V8C12,9.105 12.895,10 14,10C15.105,10 16,9.105 16,8V4Z" />
        <path d="M20,4H16V8C16,9.105 16.895,10 18,10C19.105,10 20,9.105 20,8V4Z" />
      </g>
    </svg>
  `;
    el.style.setProperty('--marker-bg', background);

    const marker = new mapboxgl.Marker(el, {
      anchor: 'bottom',
    });
    marker.setLngLat(point);

    return new MarkerWrapper(id, marker);
  }

  createTextMarker(id, options, zIndex, onClick) {
    const el = document.createElement('div');
    el.id = id;
    el.style.zIndex = zIndex;

    setupMarkerUi(el, options);

    el.addEventListener('click', (_) => {
      onClick();
    });

    const marker = new mapboxgl.Marker(el, {
      anchor: options.anchor,
    });
    marker.setLngLat(options.point);

    return new MarkerWrapper(id, marker);
  }
}

function setupMarkerUi(el, options) {
  el.className = 'marker';
  const visibleCorners = {
    'bottom': ['bottom'],
    'bottom-left': ['bottom-left'],
    'bottom-right': ['bottom-right'],
    'top-left': ['top-left'],
    'top-right': ['top-right'],
  };

  const corners = visibleCorners[options.anchor] || [];

  el.innerHTML = `
    ${renderCorner('top-left', corners, options.borderColor)}
    ${renderCorner('top-right', corners, options.borderColor)}
    <div class="content" style="--bg:${options.bgColor}; --border:${options.borderColor}; --text:${options.textColor}">
      <span class="text">${options.text}</span>
    </div>
    ${renderCorner('bottom-left', corners, options.borderColor)}
    ${renderCorner('bottom-right', corners, options.borderColor)}
    ${renderCorner('bottom', corners, options.borderColor)}
  `;
}

function renderCorner(position, enabledCorners, fill) {
  if (!enabledCorners.includes(position)) return '';
  return `<div class="corner ${position}">${cornerSvg(position, fill)}</div>`;
}

function cornerSvg(position, fill) {
  const svgs = {
    'top-left': `<svg viewBox="0 0 9 9" width="9" height="9"><path fill="${fill}" d="M9,5L0.8151,0.1118C0.6924,0.0386 0.5536,0 0.412,0L0.102,0C0.0276,0 -0.0218,0.0801 0.0096,0.1502L2,9L9,5Z"/></svg>`,
    'top-right': `<svg viewBox="0 0 9 9" width="9" height="9"><path fill="${fill}" d="M0,5L8.1849,0.1118C8.3076,0.0386 8.4464,0 8.588,0L8.898,0C8.9724,0 9.0218,0.0801 8.9904,0.1502L7,9L0,5Z"/></svg>`,
    'bottom-left': `<svg viewBox="0 0 9 9" width="9" height="9"><path fill="${fill}" d="M9,4L0.8151,8.8882C0.6924,8.9614 0.5536,9 0.412,9L0.102,9C0.0276,9 -0.0218,8.9199 0.0096,8.8498L2,-0L9,4Z"/></svg>`,
    'bottom-right': `<svg viewBox="0 0 9 9" width="9" height="9"><path fill="${fill}" d="M0,4L8.1849,8.8882C8.3076,8.9614 8.4464,9 8.588,9L8.898,9C8.9724,9 9.0218,8.9199 8.9904,8.8498L7,-0L0,4Z"/></svg>`,
    'bottom': `<svg viewBox="0 0 16 6" width="16" height="6"><path fill="${fill}" d="M7.482,4.966C7.606,5.29 8.394,5.29 8.518,4.966C10.432,0 16,0 16,0H0C0,0 5.568,0 7.482,4.966Z"/></svg>`,
  };
  return svgs[position];
}

export class MarkerWrapper {
  constructor(id, marker) {
    this.id = id;
    this.marker = marker;
  }

  addTo(mapboxWrapper) {
    this.marker.addTo(mapboxWrapper.map);
  }

  remove() {
    this.marker.remove();
  }
}

export class BoundsPadding {
  constructor(top, left, bottom, right) {
    this.top = top;
    this.left = left;
    this.bottom = bottom;
    this.right = right;
  }
}

export class LngLatPoint {
  constructor(lng, lat) {
    this.lng = lng;
    this.lat = lat;
  }
}

export class CameraOptions {
  constructor(center, zoom) {
    this.center = center;
    this.zoom = zoom;
  }
}

export class MapboxWrapper {
  constructor(map) {
    this.map = map;
  }

  addOnMoveCallback(onMove) {
    this.map.on('moveend', () => {
      onMove();
    });
  }

  cameraForBounds(coordinates, padding) {
    return this.map.cameraForBounds(coordinates, {
      padding: padding
    });
  }

  jumpTo(cameraOptions) {
    this.map.jumpTo(cameraOptions);
  }

  easeTo(cameraOptions, duration) {
    this.map.easeTo({
      center: cameraOptions.center,
      duration: duration
    });
  }

  remove() {
    this.map.remove();
  }
}

export class MapOptions {
  constructor(container, style, projection, token) {
    this.container = container;
    this.style = style;
    this.projection = projection;
    this.token = token;
  }
}

export function initializeMap(options) {
  let map = new mapboxgl.Map({
    container: options.container,
    style: options.style,
    projection: options.projection,
    accessToken: options.token,
  });

  return new MapboxWrapper(map);
}