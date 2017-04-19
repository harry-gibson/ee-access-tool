

access_tool = {};

var interactionMode = 0; // 0 = draw, 1 = upload CSV
var all_overlays = [];
var map;
var app;
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
    app = new access_tool.App(mapLayer);
  });

};

/**
 * Constructor for the main access tool application. This is called from the boot function.
 * It sets up the map, with a drawing manager, and sets up the event handler for drawing.
 * @param mapLayer
 * @constructor
 */
access_tool.App = function(mapLayer) {
    this.map = this.createMap(mapLayer);
    // we probably don't actually need a drawing manager if we're only using markers
    // could just wire up the map click event instead
    this.drawingManager = this.createDrawingManager();
    this.drawingManager.setMap(this.map);

    google.maps.event.addListener(this.drawingManager, 'markercomplete',
        this.handleNewMarker.bind(this));
    $('#btnRun').click(this.runTool.bind(this));
    $('#btnClear').click(this.clearMarkers.bind(this));
    this.markers = [];
}
  // make the drawingManager live to start, i.e.
  //this.toggleDrawing(true);

///////////////////////////////////////////////////////////////////////////////
//                  "Instance" level helpers and constants.                  //
///////////////////////////////////////////////////////////////////////////////

/**
 * Creates a Google Map with a silver/grey styling and, optionally, an overlay
 * map rendered, which would normally be an Earth Engine image (created as a
 * google maps overlay using the getEeMapLayer function).
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
access_tool.App.prototype.createMap = function(mapLayer){
  var mapOptions = {
      center: access_tool.App.DEFAULT_CENTER,
      zoom: access_tool.App.DEFAULT_ZOOM,
      maxZoom: access_tool.App.MAX_ZOOM,
      mapTypeId: 'roadmap',
      //disableDefaultUI: true, // not using, to allow satellite view
      // streetViewControl: false,
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
      drawingModes: ['marker']//, 'circle', 'polygon', 'polyline', 'rectangle']
    },
    markerOptions: {
      icon: 'https://developers.google.com/maps/documentation/javascript/examples/full/images/beachflag.png',
      draggable: true
    }
  });
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

access_tool.App.prototype.handleNewMarker = function(marker){
  this.markers.push(marker);
};

access_tool.App.prototype.runTool = function(){
  $.getJSON(
      '/costpath',
      {
        points: this.getPointsJson()
      },
      ((function (data) {
        this.map.overlayMapTypes.clear();
        data.forEach(
            ((function(eeLayer, i){
              var mapId = eeLayer['eeMapId'];
              var mapToken = eeLayer['eeToken'];
              var mapLayer = access_tool.App.getEeMapLayer(mapId, mapToken);
              this.map.overlayMapTypes.push(mapLayer);
            }).bind(this))
        )
      }).bind(this))

  );
};

access_tool.App.prototype.clearMarkers = function(){
  return null;
};

access_tool.App.prototype.getPointsJson = function(){
  var jsonArr = [];
  for (var i = 0; i < this.markers.length; i++){
    var marker = this.markers[i];
    var pos = marker.getPosition().toJSON();
    jsonArr.push(pos);
  }
  return JSON.stringify(jsonArr);
}
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

/** @type (number) The max zoom level for the map. */
access_tool.App.MAX_ZOOM = 10;

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
];