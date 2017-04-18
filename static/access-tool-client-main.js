

access_tool = {};

var interactionMode = 0; // 0 = draw, 1 = upload CSV
var all_overlays = [];
var map;

access_tool.boot = function(eeMapId, eeToken){
  google.load('maps', '3', \
    'other_params': 'key=AIzaSyAKG7sWP6OzVg2l5De0pkVNgCwz-DwNxl8&libraries=drawing');
  google.load('jquery', '1');

  google.setOnLoadCallback(function(){
    var mapType = access_tool.App.getEeMapType(eeMapId, eeToken);
    var app = new access_tool.App(mapType);
  });

};

access_tool.App = function(mapType){
  this.map = this.createMap(mapType);
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
access_tool.App.prototype.createMap = function(mapType){
  var mapOptions = {
    backgroundColor: '#000000',
    center: access_tool.App.DEFAULT_CENTER,
    disableDefaultUI: true,
    zoom: access_tool.App.DEFAULT_ZOOM
  };
  var mapElement = $('.map').get(0);
  var map = new google.maps.Map(mapElement, mapOptions);
  map.setOptions({styles: access_tool.App.BLACK_BASE_MAP_STYLES});
  map.overlayMapTypes.push(mapType);
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
