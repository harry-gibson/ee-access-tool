// http://dev.roadlessforest.eu/map.html
// https://www.w3schools.com/bootstrap/
access_tool = {};

var all_overlays = [];
var map;
var app;
/**
 * Static function to create the access tool "app" when the page has loaded. This will
 * be called from a script in the html file using parameters passed from the python
 * server-side code via the templating engine.
 * @param {string} eeMapId The Earth Engine map ID to show initially, can be "None".
 * @param {string} eeToken The Earth Engine map token.
*/
access_tool.boot = function(eeMapId, eeToken){
  google.load('maps', '3',
      {
        'other_params': 'key=AIzaSyBkOap6kiM4Qss3s_ImM3ALqz5KDoejAoM&libraries=drawing'
      });
  //google.load('jquery', '1');

  google.setOnLoadCallback(function(){
    var mapLayer = access_tool.App.getEeMapLayer(eeMapId, eeToken);
    app = new access_tool.App(mapLayer);
  });
};

$(window).on('load',function(){
     var no_splash = localStorage.getItem('no_display_access_splash');
     if (no_splash !== 'true') {
         $('#infoModal').modal('show');
     }
    });

/**
 * Constructor for the main access tool application. This is called from the boot function.
 * It sets up the map, with a drawing manager, and sets up the event handler for drawing.
 * @param mapLayer
 * @constructor
 */
access_tool.App = function(mapLayer) {
    this.map = this.createMap(mapLayer);

    //    this.handleNewMarker.bind(this));
    this.sourceMarkers = [];
    this.queryMarkers = [];
    this.setState('blank');

    /*
     * CONNECT UI EVENT HANDLERS
     */
    $('.ui .run').click(this.runToolPost.bind(this));
    $('.ui .clear').click(
        (function () {
            this.setState('blank');
        }).bind(this));
    $('.modal-dialog .exportFire').click(this.exportMap.bind(this));

    //http://markusslima.github.io/bootstrap-filestyle/
    //https://www.abeautifulsite.net/whipping-file-inputs-into-shape-with-bootstrap-3
    $('.ui .loadcsv').change(this.createCsvMarkers.bind(this));

    // expand / collapse the panel on mobile to get it out of the way
    $('.panel .toggler').click((function() {
        $('.panel').toggleClass('expanded');
    }).bind(this));

    $('.ui .showinfo').click(function() {
        $('#infoModal').modal('show');
    });

    var no_splash = localStorage.getItem('no_display_access_splash');
    if (no_splash === 'true') {
         $('#chkNoShowSplash')[0].checked=true;
    }

    $('#infoModal').on('hidden.bs.modal', function(e){
        if ($('#chkNoShowSplash')[0].checked){
            try {
                localStorage.setItem('no_display_access_splash', 'true');
            }
            catch(e){ }
        }
        else{
            localStorage.removeItem('no_display_access_splash');
        }
    });
    //http://www.bootply.com/106707
};


///////////////////////////////////////////////////////////////////////////////
//                  "Instance" level helpers and constants.                  //
///////////////////////////////////////////////////////////////////////////////

/**
 * Creates a Google Map with a silver/grey styling and, optionally, an overlay
 * map rendered, which would normally be an Earth Engine image (created as a
 * google maps overlay using the getEeMapLayer function).
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map, can be null
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
access_tool.App.prototype.createMap = function(mapLayer){
  var mapOptions = {
      center: access_tool.App.DEFAULT_CENTER,
      zoom: access_tool.App.DEFAULT_ZOOM,
      maxZoom: access_tool.App.MAX_ZOOM,
      mapTypeId: 'roadmap',
      //,disableDefaultUI: true, // not using, to allow satellite view
      streetViewControl: false,
      mapTypeControlOptions:{
          //style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: google.maps.ControlPosition.LEFT_BOTTOM
      }
  };
  var mapElement = $('.map').get(0);
  var map = new google.maps.Map(mapElement, mapOptions);
  map.setOptions({styles: access_tool.App.SILVER_STYLES});
  if (mapLayer) {
      // an initial overlay map such as the friction surface or a population map or something
      map.overlayMapTypes.push(mapLayer);
  }
  return map;
};


/**
 * Manages the UI to ensure that the displayed accessibility map (if any) and markers
 * remain consistent. The application states can be "blank", "toolReady", "toolRunning",
 * or "resultReady".
 * @param statename
 */
access_tool.App.prototype.setState = function(statename) {
    if (statename === 'blank') {
        /* BLANK MAP
           Initial state or after hitting the clear map button.
           Adding markers is enabled, run tool and export are disabled.
        */
        if (this._timeoutID){
            window.clearTimeout(this._timeoutID);
            this._timeoutID = null;
        }
        // clear result image
        this.map.overlayMapTypes.clear();
        // revert to transparent logo
        $('#maplogo').attr('src','static/map_logo_square_alt.png');
        // clear all markers
        for (var i = 0; i < this.sourceMarkers.length; i++) {
            this.sourceMarkers[i].setMap(null);
        }
        this.sourceMarkers = [];

        for (var i = 0; i < this.queryMarkers.length; i++) {
            this.queryMarkers[i].setMap(null);
        }
        this.queryMarkers = [];

        // enable drawing of new markers and file chooser
        this.toggleDrawing(true);
        $('.ui .loadcsv').prop("disabled", false);

        // disable download, runner, and reset buttons
        $('.ui .export').prop("disabled", true).show();
        $('.ui .run').prop("disabled", true);
        $('.ui .clear').prop("disabled", true);

        // show UI section for loading points
        $('.ui .markercontrols').removeClass('hidden');
        // hide UI sections for export and run
        $('.ui .legendsection').addClass('hidden');
        $('.ui .exportcontrols').addClass('hidden');
        $('.ui .maincontrols').addClass('hidden');

        // disable result querying
        if (this.identifyListener) {
            google.maps.event.removeListener(this.identifyListener);
        }
        this.identifyListener = null;
        if (this.zoomListener){
            google.maps.event.removeListener(this.zoomListener);
        }
        this.zoomListener = null;
        this.removeAlert("toolRunning");
    }

    else if (statename === 'toolReady') {
         /* READY TO RUN
           If at least one marker has been added, we can run the tool.
           Adding markers is still enabled, run tool and export are disabled.
        */
        if (this.sourceMarkers.length == 0) {
            // check in case we were called from csv loader but it was unsuccessful
            return;
        }
        // TODO we should check if we've got max number of markers
        // enable tool runner
        $('.ui .run').prop("disabled", false);
        // enable reset to clear them
        $('.ui .clear').prop("disabled", false);
        $('.ui .maincontrols').removeClass('hidden');
    }

    else if (statename === 'toolRunning') {
         /* REQUEST MADE
           As soon as we initiate the request, lock down the UI to prevent adding or removing markers,
           so that the map when it loads will reflect the state of the markers. All controls disabled.
           This state will only exist until the mapid response is received from the server - it doesn't persist
           while tiles are loading.
        */
        // disable all buttons
        $('.ui .run').prop("disabled", true);
        $('.ui .clear').prop("disabled", true);
        $('.ui .export').prop("disabled", true);
        $('.ui .loadcsv').prop("disabled", true);

        // disable drawing
        this.toggleDrawing(false);

        // prevent dragging / alteration of all markers when search is initiated
        for (var i = 0; i < this.sourceMarkers.length; i++) {
            this.sourceMarkers[i].draggable = false;
        }
        // hide the drawing and running control sections
        $('.ui .markercontrols').addClass('hidden');
        $('.ui .maincontrols').addClass('hidden');
    }

    else if (statename === 'resultReady') {
         /* RESPONSE RECEIVED
           A cost path map request has been made and accepted. Tiles will be loading asynchronously.
           Clicking the map now initiates an identify-type query and a listener enables or disables export
           depending on how far the map is zoomed.
        */
        // enable reset button
        $('.ui .clear').prop("disabled", false);
        // enable result query
        this.identifyListener = google.maps.event.addListener(
            this.map,
            "click",
            (function (e) {
                this.queryResultPost(e);
            }).bind(this)
        );
        this.zoomListener = google.maps.event.addListener(
            this.map,
            "bounds_changed",
            (function (e) {
                this.checkExportable();
            }).bind(this)
        );
        // show the div with the export launcher in, but check the zoom before actually
        // enabling the button
        // Only show it after a delay so we don't show a legend ages before the map tiles actually load
        // Filthy hack - prefer to show when tiles actually start loading, but haven't got that working yet

        this._timeoutID = window.setTimeout(function(){
            $('.ui .exportcontrols').removeClass('hidden');
            $('.ui .legendsection').removeClass('hidden');
        }.bind(this), 10000);

        // replace the MAP logo with a non-transparent one as it looks bad against the dark map colours
        $('#maplogo').attr('src','static/map_logo_square_alt_noxpar.png');
    }
    this.currentState = statename;
    this.checkExportable();
};

access_tool.App.prototype.checkZoomOkToExport = function(){
    // since the underlying data are in lat/lon coords, we have to talk in square degress, ugh, to
    // figure out the number of pixels we'll be asking for.
    var extent = this.map.getBounds().toSpan();
    if ((extent.lat() * extent.lng()) > access_tool.App.MAX_EXPORT_SQ_DEG){
        return false;
    }
    else {
        return true;
    }
};

access_tool.App.prototype.checkExportable = function(){
    // enable export only if the extent of the view, which clips the output, is small enough
    var exportDisabled = false;
    if (this.currentState === 'resultReady'){

        if (this.checkZoomOkToExport()){
             $('.ui .export').prop("disabled", false).prop("title",
                 "Click to open the export dialog");
             if (exportDisabled){
                 // temporary override until it's working properly!
                 $('#exportModal .exportFire').prop("disabled", true).prop("title",
                 "Export functionality is not yet available - coming soon");
             }
             else {
                 $('#exportModal .exportFire').prop("disabled", false).prop("title",
                     "Click to export the current map to a GeoTIFF file");
             }
        }
        else {
             $('.ui .export').prop("disabled", true).prop("title",
                 "Zoom in further to export");
             $('#exportModal .exportFire').prop("disabled", true);
        }
    }
};


/**
 * Sets the alert with the given name to have the class and content given.
 * The alert is created if it doesn't already exist.
 * @param {string} name The name of the alert to set
 * @param {string} cls The type of the alert for Bootstrap CSS styling
 * @param {string} line1 The first line of the alert text
 * @param {string=} opt_line2 The second line of the alert text
 * @param {number=} opt_timeout A time in milliseconds after which the alert should fade out, optional.
 */
access_tool.App.prototype.setAlert = function(name, cls, line1, opt_line2, opt_timeout){
    var alert;
    var existing = this.findAlert(name);
    if (existing) {
        // Replace the contents of the existing alert, if any.
        $('.alert[data-alert-name="' + name + '"] p').remove();
        alert = existing.removeClass()
            .addClass('alert alert-dismissable alert-' + cls);
      }
    else {
    // Create a new alert if needed.
    alert = $('.templates .alert').clone()
        .addClass('alert-' + cls)
        .attr('data-alert-name', name);
    $('.alerts').append(alert);
  }
  alert.append($('<p/>').append(line1))
       .append($('<p/>', {class: 'line2'}).append(opt_line2))
       .addClass('visible');
  if (opt_timeout){
      window.setTimeout(function(){
          this.removeAlert(name);
      }.bind(this), opt_timeout);
  }
};

/**
 * Removes the alert with the given name.
 * @param {string} name The name of the alert to remove.
 */
access_tool.App.prototype.removeAlert = function(name) {
  var cur = this.findAlert(name);
  if (cur) {
    cur.removeClass('visible');
    // Remove the alert once its animation finishes.
    cur.on('transitionend', function() {
      if (!cur.hasClass('visible')) {
        cur.remove();
      }
    });
  }
};
/**
 * Finds the alert with the given name, if any.
 * @param {string} name The name of the alert to find.
 * @return {Object} The jQuery DOM wrapper for the alert with the given name.
 */
access_tool.App.prototype.findAlert = function(name) {
  var existing = $('.alert[data-alert-name="' + name + '"]');
  return existing.length ? existing : undefined;
};


/**
 * We are not using a drawing manager as we only want to draw markers, so just do this on the
 * map's own click event
 * @param {boolean} activate Should the marker-draw listener be active or not
 */
access_tool.App.prototype.toggleDrawing = function(activate){
    if (activate){
        this.drawListener = google.maps.event.addListener(
            this.map,
            "click",
            (function (e) {
                if (this.sourceMarkers.length < access_tool.App.MAX_SOURCES) {
                    var latitude = e.latLng.lat();
                    var longitude = e.latLng.lng();
                    var pt = new google.maps.LatLng(latitude, longitude);
                    var newMarker = new google.maps.Marker({
                        position: pt,
                        icon: '/static/icons/star-3-clicked-source.png',
                        map: this.map,
                        draggable: true
                    });
                    this.sourceMarkers.push(newMarker);
                    this.setState("toolReady");
                }
            }).bind(this)
        );
        this.map.setOptions({draggableCursor:'crosshair'});
    }
    else {
        google.maps.event.removeListener(this.drawListener);
        this.drawListener = null;
        this.map.setOptions({draggableCursor:null});
    }
}
/** Reads a CSV file and loads the lat/long or x/y columns to sourceMarkers on the map.
 * We use a different icon to distinguish these from markers that are created interactively
 * and these ones are not draggable. Zooms / pans the map to encompass the new markers.
 * We could alternatively parse the input file server side which would allow a greater range
 * of input types but, whatever
*/
access_tool.App.prototype.createCsvMarkers = function(e){
    // https://developers.google.com/kml/articles/csvtokml
    // http://sideapps.com/code-tips-and-tricks/add-markers-to-google-map-from-csv/
  var csvFilePath = e.target.files[0];
  var reader = new FileReader();
  reader.onload = function(e){
    var textContent = reader.result;
    try {
        var parsedContent = access_tool.App.csvToArray(textContent);
    }
    catch (e){
        this.setAlert("csvload", "danger",
            "CSV Error - problem parsing the CSV.",
            "Ensure the file has complete columns named lat/lon or x/y ",
            8000);
        return;
    }
    var headers = parsedContent[0];
    var latFieldIdx = -1;
    var lonFieldIdx = -1;
    var fileBounds = new google.maps.LatLngBounds();

    var inconclusive = false;
    // guesstimate which is the lat and lon fields
    for (var i = 0; i < headers.length; i++){
      var maybeFieldName = headers[i];
      if (maybeFieldName.toLowerCase().substr(0,3) == "lat" ||
          maybeFieldName.toLowerCase() == "y"){
            if (latFieldIdx === -1) {
                latFieldIdx = i;
            }
            else{
                inconclusive = true;
            }
          }
      else if (maybeFieldName.toLowerCase().substr(0,3) == "lon" ||
          maybeFieldName.toLowerCase().substr(0,3) == "lng" ||
          maybeFieldName.toLowerCase() == "x") {
            if (lonFieldIdx === -1) {
                lonFieldIdx = i;
            }
            else {
                inconclusive = true;
            }
      }
    }
    if (latFieldIdx < 0 || lonFieldIdx < 0 || inconclusive){
      this.setAlert("csvload", "danger",
            "CSV Error - could not identify latitude / longitude columns.",
            "Ensure the file has columns named lat/lon or x/y.",
            8000);
      return;
    }
    var any = false;
    var newMarkers = [];
    try{
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
          newMarkers.push(newMarker);
          fileBounds.extend(pt);
        }
    }
    catch(e){
        any = false;
        this.setAlert("csvload", "danger",
            "CSV Error - problem parsing the CSV.",
            "Ensure there is a lat / lon value in every row.",
            8000);
    }
    if(any){
        for (var i = 0; i < Math.min(newMarkers.length, access_tool.App.MAX_SOURCES); i++) {
            newMarkers[i].map = this.map;
            this.sourceMarkers.push(newMarkers[i]);
        }
        this.map.fitBounds(fileBounds);
        if (newMarkers.length>access_tool.App.MAX_SOURCES){
            this.setAlert("csvload", "warning",
                "Loaded first "+access_tool.App.MAX_SOURCES +" rows from CSV only!");
        }
        else {
            this.setAlert("csvload", "info", "CSV loaded successfully!", null, 2000);
        }
        this.setState('toolReady');
    }
  }.bind(this);
  reader.readAsText(csvFilePath);
};

/**
 * Runs the accessibility map search, based on the current points on the map.
 * The process of running the tool is just making a request to the costpath
 * endpoint of the server script, passing in the points as a json-encoded string
 */
access_tool.App.prototype.runToolPost = function(){
    this.setState('toolRunning');
    var params = {
        sourcepoints: this.getPointsJson(),
        mapBounds: JSON.stringify(this.map.getBounds())
    };
    this.setAlert('toolRunning', "info", "Submitting accessibility map request");
    access_tool.App.handleRequest(
        $.post('/costpath', params),
        ((function (data) {
        this.map.overlayMapTypes.clear();
        var dataParsed = JSON.parse(data);
        dataParsed.forEach(
            ((function(eeLayer, i){
              var mapId = eeLayer['eeMapId'];
              var mapToken = eeLayer['eeToken'];
              var mapLayer = access_tool.App.getEeMapLayer(mapId, mapToken);
              this.map.overlayMapTypes.push(mapLayer);
              if (eeLayer.hasOwnProperty('downloadUrl')){
                this.mapDownloadUrl = eeLayer['downloadUrl'];
                var urlEl = $("<a></a>");
                urlEl.attr('href', this.mapDownloadUrl)
                    .text('Download');
                $('#urlDownload').html(urlEl);
              }
              else {
                  $('#urlDownload').html('Extent too large!');
              }
            }).bind(this))
        );

        this.setState('resultReady');
        this.setAlert('toolRunning', 'info', "Map request successful - loading tiles",
            "Request has been submitted to Earth Engine - the map will load as it is generated.", 15000);
        // don't yet have anywhere to put the download link so disable for now
        //$('#btnDownload').prop("disabled", false);
      }).bind(this)),
        ((function(){
            this.setAlert('toolRunning', 'danger', 'Search failed',
                "An error occurred with the search. Please try again, but this may be a server problem",
                8000);
            this.setState("toolReady");
        }).bind(this))

    );
};

/**
 * Gets the accessibility value for a given location. As the server-side is stateless,
 * this means we run the accessibility search again with the same points as before, using
 * a different endpoint that returns the value at a single location rather than an image/map
 * @param e - the event that triggered this, which should be a map click event with a latLng
 */
access_tool.App.prototype.queryResultPost = function(e){
  // TODO is there no way of persisting things server side so that a query can be less catastrophically slow?
  // The points must be unchanged from when the map as displayed was created. Hence disabling the UI.
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
  var params = {
      sourcepoints: sourcepointsJSON,
      querypoints: querypointsJSON
  };
  access_tool.App.handleRequest(
      $.post('/costvalue', params),
      ((function(data){
          var totalMins = data; // this service just returns a number, as plaintext
          var hrs = Math.floor(totalMins / 60.0);
          var mins = Math.round(totalMins - 60.0*hrs , 1);
          infoWindow.setContent("Estimated time to nearest source marker is "+
            hrs + "hrs " + mins + "mins");
      }).bind(this))
  );
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

access_tool.App.prototype.exportMap = function(){
    //var filename = this.getFilename();
    var email = this.getEmail();
    var params = {};
    //params.filename = filename;
    params.email = email;
    params.region = JSON.stringify(this.map.getBounds());
    params.sourcepoints = this.getPointsJson();
    this.setAlert('export-' + email, 'info',
        //'Export of "' + filename + '" in progress.',
        'Export of map in progress. ',
        'Please note the export can take a very long time! We will email you when it is complete.');
    access_tool.App.handleRequest(
        $.post('/export', params), null,
        this.setAlert.bind(
            this, 'export-' + email, 'danger', 'Export failed.')
    );

};

access_tool.App.prototype.getEmail = function(){
    var emailAdd = $('.emailField').val();
    if (emailAdd){ // TODO validate here?? or in bootstrap prior to this
        return emailAdd;
    }
};

access_tool.App.prototype.getFilename = function(){
    var userProvidedFilename = $('.filename').val();
    if (userProvidedFilename) {
    //if (false){
        return userProvidedFilename;
    } else {
        return 'Accessibility_Export' + (new Date()).toISOString().replace(/[^0-9]/g, '');
    }
};

// https://developers.google.com/maps/documentation/javascript/datalayer

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
access_tool.App.pendingUrls = [];
access_tool.App._getEeMapLayer_Tracked = function(eeMapId, eeToken) {
  // return null if no ee overlay map is required (will then just make a plain googlemap)
  if (eeMapId === "None" || eeToken === "None"){
    return null;
  }
  // here we attempt to implement the solution proposed here https://stackoverflow.com/a/7355063
  // to track when tiles are loaded, so we could be more informative to the user with the slow EE
  // load times....
  var overlay = new google.maps.ImageMapType({
      getTileUrl: function(tile, zoom) {
          var url = access_tool.App.EE_URL + '/map/';
          url += [eeMapId, zoom, tile.x, tile.y].join('/');
          url += '?token=' + eeToken;
          access_tool.App.pendingUrls.push(url);
          if (access_tool.App.pendingUrls.length ===1){
              $(overlay).trigger("overlay-busy");
          };
          return url;
        },
        tileSize: new google.maps.Size(256, 256)
  });
  $(overlay).bind("overlay-idle", function(){
      console.log("overlay is idle");
  });
  $(overlay).bind("overlay-busy", function(){
      console.log("overlay is busy");
  });
  overlay.baseGetTile = overlay.getTile;
  // this override doesn't seem to work, node never has any children, so pendingUrls
  // just keeps growing
  overlay.getTile = function(tileCoord, zoom, ownerDocument){
      var node = overlay.baseGetTile(tileCoord, zoom, ownerDocument);
      $("img", node).one("load", function () {
         var index = $.inArray(this.__src__, access_tool.App.pendingUrls);
         access_tool.App.pendingUrls.splice(index, 1);
         if(access_tool.App.pendingUrls.length===0){
             $(overlay).trigger("overlay-idle");
         }
      });
      return node;
  };
  return overlay;
};


/**
 * Handles the success or failure of an ajax request.
 * The JQuery getJSON and post methods do not directly provide for a failure callback
 * @param {Object} request The jqXHR sent, i.e. the return of $.getJSON or $.post etc
 * @param {function(Object)} onDone The function to call if the request
 *  succeeds, with the data object as an argument
 * @param {function(String)} onError The function to call if the request fails, with an
 *  error message as an argument
 * @returns {Object} The original request, against which further callbacks can be registered
 */
access_tool.App.handleRequest = function(request, onDone, onError){
    request.done(function(data){
        if (data && data.error){
            onError(data.error)
        } else {
            if (onDone) {onDone(data);}
        }
    }).fail(function(_, textStatus) {
        onError(textStatus);
    });
    return request;
}
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
    access_tool.App.MAX_SOURCES + 1)
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

/** @type (number) The maximum ara of map that can be exported, in square degrees (!) */
// Unfortunately as we're exporting in lat/lon then we have to think about square degrees
// to determine the pixel counts. Empirically ~12*24 degrees seems to export to google drive
// in circa 1 hour which is quite long enough.
access_tool.App.MAX_EXPORT_SQ_DEG = 288;

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
