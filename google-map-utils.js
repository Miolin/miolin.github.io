import { Loader, LoaderOptions } from 'google-maps';

let map;

export async function loadGoogleMaps(apiKey, mapElement) {
    console.log("success");

    const position = { lat: -25.344, lng: 131.031 };

    const loader = new Loader(apiKey, {
        libraries: ["core", "maps", "marker"]
    });

    const google = await loader.load();

    map = new google.maps.Map(mapElement, {
        zoom: 4,
        center: position,
    });
}

export async function jsSetCenter(lat0, lng0) {
    const position = { lat: lat0, lng: lng0 };

    if (map != null) {
        map.setCenter(position);

//        const marker = new google.maps.MarkerLibrary.AdvancedMarkerElement({
//          map: map,
//          position: position,
//          title: "Uluru",
//        });
    }
}