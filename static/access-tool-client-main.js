

access_tool = {};

var interactionMode = 0; // 0 = draw, 1 = upload CSV
var all_overlays = [];
var map;

/**
 * Static function to create the access tool "app" when the page has loaded. This will
 * be called from a script in the html file using parameters passed from the python
 * server-side code via the templating engine.
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
*/
access_tool.boot = function(eeMapId, eeToken){
  google.load('maps', '3',
      {
        'other_params': 'key=AIzaSyAKG7sWP6OzVg2l5De0pkVNgCwz-DwNxl8&libraries=drawing'
      });
  google.load('jquery', '1');

  google.setOnLoadCallback(function(){
    var mapLayer = access_tool.App.getEeMapLayer(eeMapId, eeToken);
    var app = new access_tool.App(mapLayer);
  });

};

/**
 * Constructor for the main access tool application. This is called from the boot function.
 * It sets up the map, with a drawing manager, and sets up the event handler for drawing.
 * @param mapLayer
 * @constructor
 */
access_tool.App = function(mapLayer){
  this.map = this.createMap(mapLayer);
  this.drawingManager = this.createDrawingManager();
  google.maps.event.addListener(this.drawingManager, 'markercomplete', this.gotMarkers);

  // make the drawingManager live to start, i.e.
  this.toggleDrawing(true);

  // TODO other constructor items here i.e. set up event handling etc
}

/**
 * Creates a Google Map with a black background and the given map type rendered.
 * Reused from the TrendyLights demo as a black background is also appropriate
 * for our access map.
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
access_tool.App.prototype.createMap = function(mapLayer){
  var mapOptions = {
    //backgroundColor: '#000000',
    center: access_tool.App.DEFAULT_CENTER,
    //disableDefaultUI: true,
    streetViewControl: false,
    zoom: access_tool.App.DEFAULT_ZOOM,
      mapTypeId: 'satellite'

  };
  var mapElement = $('.map').get(0);
  var map = new google.maps.Map(mapElement, mapOptions);
  map.setOptions({styles: access_tool.App.SILVER_STYLES});
  if (mapLayer) {
      map.overlayMapTypes.push(mapLayer);
  }
  return map;
};

access_tool.App.prototype.createDrawingManager = function(){
  var drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.MARKER,
    drawingControl: true,
    drawingControlOptions: {
      position: google.maps.ControlPosition.TOP_CENTER,
      drawingModes: ['marker']//;, 'circle', 'polygon', 'polyline', 'rectangle']
    },
    markerOptions: {
      icon: 'https://developers.google.com/maps/documentation/javascript/examples/full/images/beachflag.png',
      draggable: true
    }
  });
  drawingManager.setMap(map);
  return drawingManager;
};

access_tool.App.prototype.toggleDrawing = function(onOrOff){
  if (onOrOff){
    this.drawingManager.setMap(map);
  }
  else{
    this.drawingManager.setMap(null);
  }
};

// https://developers.google.com/maps/documentation/javascript/datalayer
// https://developers.google.com/kml/articles/csvtokml



///////////////////////////////////////////////////////////////////////////////
//                        Static helpers and constants.                      //
///////////////////////////////////////////////////////////////////////////////

// As these are not on the prototype they are "static"

/**
 * Generates a Google Maps map type (or layer) for the passed-in EE map id. See:
 * https://developers.google.com/maps/documentation/javascript/maptypes#ImageMapTypes
 * The mapid and the token will be provided from the python script via the templating
 * engine; if either is set to the string "None" then this function will return null
 * resulting in no overlay to be added. Otherwise, the returned maptype object can be
 * added to the google map as an overlaytype, which happens in prototype.createMap
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @return {google.maps.ImageMapType} A Google Maps ImageMapType object for the
 *     EE map with the given ID and token.
 */
access_tool.App.getEeMapLayer = function(eeMapId, eeToken) {
  // return null if no ee overlay map is required (will then just make a plain googlemap)
  if (eeMapId === "None" || eeToken === "None"){
    return null;
  }
  var eeMapOptions = {
    getTileUrl: function(tile, zoom) {
      var url = access_tool.App.EE_URL + '/map/';
      url += [eeMapId, zoom, tile.x, tile.y].join('/');
      url += '?token=' + eeToken;
      return url;
    },
    tileSize: new google.maps.Size(256, 256)
  };
  return new google.maps.ImageMapType(eeMapOptions);
};


/** @type {string} The Earth Engine API URL. */
access_tool.App.EE_URL = 'https://earthengine.googleapis.com';


/** @type {number} The default zoom level for the map. */
access_tool.App.DEFAULT_ZOOM = 4;


/** @type {Object} The default center of the map. */
access_tool.App.DEFAULT_CENTER = {lng: 5, lat: 50};


/**
 * @type {Array} An array of Google Map styles. See:
 *     https://developers.google.com/maps/documentation/javascript/styling
 */
// see also http://mapstyle.withgoogle.com
access_tool.App.SILVER_STYLES = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f5f5f5"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#f5f5f5"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#bdbdbd"
      }
    ]
  },
  {
    "featureType": "administrative.neighborhood",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#eeeeee"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "poi.business",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e5e5e5"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#ffffff"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dadada"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "road.local",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "transit",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e5e5e5"
      }
    ]
  },
  {
    "featureType": "transit.station",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#eeeeee"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#c9c9c9"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  }
]
;