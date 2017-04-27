

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
    // we probably don't actually need a drawing manager if we're only using sourceMarkers
    // could just wire up the map click event instead
    this.drawingManager = this.createDrawingManager();
    google.maps.event.addListener(this.drawingManager, 'markercomplete',
        this.handleNewMarker.bind(this));
    this.sourceMarkers = [];
    this.queryMarkers = [];
    this.setState('blank');

    $('#btnRun').click(this.runTool.bind(this));
    $('#btnClear').click(
        (function(){this.setState('blank');})
            .bind(this));
    $('#btnDownload').click(this.downloadMap.bind(this));
    $('#btnCsv').change(this.createCsvMarkers.bind(this));

    this.mapDownloadUrl = "";

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
      //icon: 'https://developers.google.com/maps/documentation/javascript/examples/full/images/beachflag.png',
        icon: '/static/icons/star-3-clicked-source.png',
        draggable: true
    }
  });
  return drawingManager;
};

access_tool.App.prototype.setState = function(statename){
    if (statename === 'blank'){
        // clear result image
        this.map.overlayMapTypes.clear();
        // clear all markers
        for (var i = 0; i< this.sourceMarkers.length; i++){
            this.sourceMarkers[i].setMap(null);
        }
        this.sourceMarkers = [];

        for (var i = 0; i< this.queryMarkers.length; i++){
            this.queryMarkers[i].setMap(null);
        }
        this.queryMarkers = [];


        // enable drawing manager and file chooser
        this.drawingManager.setMap(this.map);
        $('#btnCsv').prop("disabled", false);

        // disable download, runner, and reset buttons
        $('#btnDownload').prop("disabled", true);
        $('#btnRun').prop("disabled", true);
        $('#btnClear').prop("disabled", true);

        // and result query
        if (this.identifyListener){
            google.maps.event.removeListener(this.identifyListener);
        }
        this.identifyListener = null;
    }

    else if (statename === 'toolReady'){
        if (this.sourceMarkers.length == 0){
            // check in case we were called from csv loader but it was unsuccessful
            return;
        }
        // enable tool runner
        $('#btnRun').prop("disabled", false);
        // enable reset
        $('#btnClear').prop("disabled", false);
    }

    else if (statename === 'toolRunning'){
        // disable all buttons
        $('#btnRun').prop("disabled", true);
        $('#btnClear').prop("disabled", true);
        $('#btnDownload').prop("disabled", true);
        $('#btnCsv').prop("disabled", true);

        // disable drawing
        this.drawingManager.setMap(null);

        // prevent dragging / alteration of all markers
        for (var i = 0; i < this.sourceMarkers.length; i++){
            this.sourceMarkers[i].draggable = false;
        }
    }

    else if (statename === 'resultReady'){
        // enable result download and reset buttons
        $('#btnDownload').prop("disabled", false);
        $('#btnClear').prop("disabled", false);
        // enable result query
        this.identifyListener = google.maps.event.addListener(
            this.map,
            "click",
            (function(e){
                this.queryResult(e);
            }).bind(this)
        );
    }
    this.currentState = statename;
}

access_tool.App.prototype.refreshControls = function(){
  if(this.sourceMarkers.length > 0){
    $('#btnRun').prop("disabled", false);
    $('#btnClear').prop("disabled", false);
  }
  else {
    $('#btnRun').prop("disabled", true);
    $('#btnClear').prop("disabled", true);
  }
}


/**
 * Event handler for when a marker is added by the drawingmanager, maintains
 * markers in a separate array which we will use to run tool
 * @param marker
 */
access_tool.App.prototype.handleNewMarker = function(marker){
  this.sourceMarkers.push(marker);
  this.setState('toolReady');
};

/** Reads a CSV file and loads the lat/long or x/y columns to sourceMarkers on the map
*/
access_tool.App.prototype.createCsvMarkers = function(e){
  var csvFilePath = e.target.files[0];
  var reader = new FileReader();
  reader.onload = function(e){
    var textContent = reader.result;
    var parsedContent = access_tool.App.csvToArray(textContent);
    var headers = parsedContent[0];
    var latFieldIdx = -1;
    var lonFieldIdx = -1;
    var fileBounds = new google.maps.LatLngBounds();

    // guesstimate which is the lat and lon fields
    for (var i = 0; i < headers.length; i++){
      var maybeFieldName = headers[i];
      if (maybeFieldName.toLowerCase().substr(0,3) == "lat" ||
          maybeFieldName.toLowerCase() == "y"){
            latFieldIdx = i;
          }
      else if (maybeFieldName.toLowerCase().substr(0,3) == "lon" ||
          maybeFieldName.toLowerCase().substr(0,3) == "lng" ||
          maybeFieldName.toLowerCase() == "x") {
            lonFieldIdx = i;
      }
    }
    if (latFieldIdx < 0 || lonFieldIdx < 0){
      return;
    }
    var any = false;

    for (var i = 1; i < parsedContent.length; i++){
      any = true;
      var dataRow = parsedContent[i];
      var latitude = parseFloat(dataRow[latFieldIdx]);
      var longitude = parseFloat(dataRow[lonFieldIdx]);
      var pt = new google.maps.LatLng(latitude, longitude);
      var newMarker = new google.maps.Marker({
          position: pt,
          icon: '/static/icons/star-3-imported-source.png',
          map: this.map
      });
      this.sourceMarkers.push(newMarker);
      fileBounds.extend(pt);
    }
    if(any){
      this.map.fitBounds(fileBounds);
    }
  }.bind(this);
  reader.readAsText(csvFilePath);
}

/**
 * Runs the accessibility map search, based on the current points on the map.
 * The process of running the tool is just making a request to the costpath
 * endpoint of the server script, passing in the points as a json-encoded string
 */
access_tool.App.prototype.runTool = function(){
    this.setState('toolRunning');
  // TODO we will need to use a POST to run more than a few points
  $.getJSON(
      '/costpath',
      {
          sourcepoints: this.getPointsJson(),
          mapBounds: JSON.stringify(this.map.getBounds())
      },
      ((function (data) {
        this.map.overlayMapTypes.clear();
        data.forEach(
            ((function(eeLayer, i){
              var mapId = eeLayer['eeMapId'];
              var mapToken = eeLayer['eeToken'];
              var mapLayer = access_tool.App.getEeMapLayer(mapId, mapToken);
              this.map.overlayMapTypes.push(mapLayer);
              if (eeLayer.hasOwnProperty('downloadUrl')){
                this.mapDownloadUrl = eeLayer['downloadUrl'];
              }
            }).bind(this))
        );
        this.setState('resultReady');
        // don't yet have anywhere to put the download link so disable for now
        //$('#btnDownload').prop("disabled", false);
      }).bind(this))
  );
};

access_tool.App.prototype.queryResult = function(e){
  var sourcepointsJSON = this.getPointsJson();
  var querypointsJSON = JSON.stringify([{
    lat: e.latLng.lat(),
    lng: e.latLng.lng()
  }]);
  var newMarker = new google.maps.Marker({
      position: e.latLng,
      icon: '/static/icons/information-query-result.png',
      map: this.map
  });
  var infoWindow = new google.maps.InfoWindow({
      content: "Retrieving value, please wait..."
  });
  newMarker.addListener('click', function(){
      infoWindow.open(newMarker.get('map'), newMarker);
  });
  infoWindow.open(newMarker.get('map'), newMarker);
  this.queryMarkers.push(newMarker);
  $.getJSON(
      '/costvalue',
      {
          sourcepoints: sourcepointsJSON,
          querypoints: querypointsJSON
      },
      ((function(data){
          var totalMins = data / 10.0;
          var hrs = Math.floor(totalMins / 60.0);
          var mins = Math.round(totalMins - 60.0*hrs , 1);
          infoWindow.setContent("Estimated time to nearest source marker is "+
            hrs + "hrs " + mins + "mins");
      }).bind(this))
  )
};

access_tool.App.showTooltop = function(e){

};

/** Gets a JSON representation of all the current sourceMarkers
*/
access_tool.App.prototype.getPointsJson = function(){
  var jsonArr = [];
  for (var i = 0; i < this.sourceMarkers.length; i++){
    var marker = this.sourceMarkers[i];
    var markerPos = marker.getPosition();
    if (markerPos.lat() && markerPos.lng()){
      var pos = markerPos.toJSON();
      jsonArr.push(pos);
    }
    else{
      console.log("Invalid marker found (no lat/lng)");
    }
  }
  return JSON.stringify(jsonArr);
}

access_tool.App.prototype.downloadMap = function(){
    // temporary solution before the page is further developed to have somewhere
    // to place the link for the user to click
    // http://stackoverflow.com/a/41716488
    // Also eventually we will need to use batch.Export in the server and save it to Drive
  $('<form></form>')
     .attr('action', this.mapDownloadUrl)
     .appendTo('body').submit().remove();
  $('#btnDownload').prop("disabled", true);
}


// https://developers.google.com/maps/documentation/javascript/datalayer
// https://developers.google.com/kml/articles/csvtokml
// http://sideapps.com/code-tips-and-tricks/add-markers-to-google-map-from-csv/



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

/**
 * Parses a delimited string (contents of a CSV file) into array of arrays
 * Taken from http://sideapps.com//code-tips-and-tricks/add-markers-to-google-map-from-csv/
 * for the handling of quoted field values
*/
access_tool.App.csvToArray = function(csvStringData, delim){
  // It may be preferable to handle CSV parsing server-side ?
  delim = (delim || ",");
  // Create a regular expression to parse the CSV values.
	var objPattern = new RegExp(
		(
			// Delimiters.
			"(\\" + delim + "|\\r?\\n|\\r|^)" +

			// Quoted fields.
			"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

			// Standard fields.
			"([^\"\\" + delim + "\\r\\n]*))"
		), "gi");

	// Create an array to hold our data. Give the array
	// a default empty first row.
	var arrData = [[]];

	// Create an array to hold our individual pattern
	// matching groups.
	var arrMatches = null;

  var nRowsRead = 0;
  var nCols = -1;
  var thisRowContent = [];
	// Keep looping over the regular expression matches
	// until we can no longer find a match.
	while ((arrMatches = objPattern.exec( csvStringData ) ) && arrData.length <
    access_tool.App.MAX_SOURCES)
	{
		// Get the delimiter that was found.
		var strMatchedDelimiter = arrMatches[ 1 ];

		// Check to see if the given delimiter has a length
		// (is not the start of string) and if it matches
		// field delimiter. If id does not, then we know
		// that this delimiter is a row delimiter.
		if (strMatchedDelimiter.length && (strMatchedDelimiter != delim))
		{
			// We have reached a new row of data
      if(nRowsRead == 0){
        // set the expected number of cols to whatever we get on the first row
        nCols = arrData[0].length;
      }
      if (arrData[arrData.length - 1].length != nCols){
        // the row didn't have the right number of fields, relative to the first one
        // discard it
        var dodgyRow = arrData.pop();
        console.log("Skipped row with wrong # cols, row number "+nRowsRead+", row content "
          + dodgyRow);
      }
      arrData.push([]);
      nRowsRead ++;
 	  }

		// Now that we have our delimiter out of the way,
		// let's check to see which kind of value we
		// captured (quoted or unquoted).
		if (arrMatches[ 2 ]){
			// We found a quoted value. When we capture
			// this value, unescape any double quotes.
			var strMatchedValue = arrMatches[ 2 ].replace(
				new RegExp( "\"\"", "g" ),
				"\""
				);
    } else
		{
			// We found a non-quoted value.
			var strMatchedValue = arrMatches[ 3 ];
		}

		// Now that we have our value string, let's add
		// it to the data array.
		arrData[ arrData.length - 1 ].push( strMatchedValue );
	}
  if (arrData[arrData.length - 1].length != nCols){
    // the row didn't have the right number of fields, relative to the first one
    // discard it
    var dodgyRow = arrData.pop();
    console.log("Skipped last row with wrong # cols, row number "+nRowsRead+", row content "
      + dodgyRow);
  }
	// Return the parsed data.
	return( arrData );
};

/** @type {string} The Earth Engine API URL. */
access_tool.App.EE_URL = 'https://earthengine.googleapis.com';

/** @type {number} The default zoom level for the map. */
access_tool.App.DEFAULT_ZOOM = 4;

/** @type (number) The max zoom level for the map. */
// This is set to 9 which is 305m at the equator, still 3* finer than the
// friction surface
access_tool.App.MAX_ZOOM = 9;

/** @type {Object} The default center of the map. */
access_tool.App.DEFAULT_CENTER = {lng: 5, lat: 50};

/** @type {number} Max search locations to create.
(server also implements this to prevent abuse). */
access_tool.App.MAX_SOURCES = 1000;

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
