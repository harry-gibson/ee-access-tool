###############################################################################
#                             COST PATH PARAMETERS                            #
###############################################################################

# The friction surface asset id, must be shared with this app's service account
FRICTION_SURFACE = 'users/harrygibson/friction_surface_v47'

# How far to search from each source point (actually is a square not a circle)
SEARCH_RADIUS_KM = 2000
# Server-side limit on max number of source points to allow
SEARCH_MAX_TARGETS = 1000


# Maximum extent for the search: don't attempt cost-path outside of this
# NOT IMPLEMENTED
MAX_EXTENT_WSEN = [-180, -60, 180, 70]
#
URL_FETCH_TIMEOUT = 120

# The band name created by the cumulativeCost function: do not alter
ACCESS_BAND = "cumulative_cost"

###############################################################################
#                              EXPORT PARAMETERS                              #
###############################################################################
# The resolution of the exported images (meters per pixel).
EXPORT_RESOLUTION = 927.662423820733
# The maximum number of pixels in an exported image.
EXPORT_MAX_PIXELS = 1e10 # 400000000
# The frequency to poll for export EE task completion (seconds).
TASK_POLL_FREQUENCY = 10

###############################################################################
#                          MAIN GOOGLE MAP PARAMETERS                         #
###############################################################################

# The ee asset id to use as a backdrop map that's loaded before a search runs
# for example the friction surface itself
INITIAL_BACKDROP = FRICTION_SURFACE
# Should we use a backdrop (otherwise will just have unadorned map to start)
USE_BACKDROP = True

###############################################################################
#                          VISUALISATION PARAMETERS                           #
###############################################################################

# The maximum value we expect the map to reach, i.e. the longest travel time.
# Defines the value that will be symbolised in black
MAX_SYMBOLISE_VALUE = 2880 # 48 hrs

# The colours used in the published and static website versions of the accessibility
# map are as follows. The ramp is nonlinear so we use an SLD template
ACCESSIBILITY_STYLE = {
    # colour break values
    'ramp_template': (
        '<RasterSymbolizer>'
        '<ColorMap type="ramp" extended="false" >'
            '<ColorMapEntry color="#ffffff" quantity="{0}" label="{0:.0f}" />'
            '<ColorMapEntry color="#d6ffde" quantity="{1}" label="{1:.0f}" />'
            '<ColorMapEntry color="#b8f5b3" quantity="{2}" label="{2:.0f}" />'
            '<ColorMapEntry color="#c0f09c" quantity="{3}" label="{3:.0f}" />'
            '<ColorMapEntry color="#d0eb81" quantity="{4}" label="{4:.0f}" />'
            '<ColorMapEntry color="#e3da64" quantity="{5}" label="{5:.0f}" />'
            '<ColorMapEntry color="#dba54d" quantity="{6}" label="{6:.0f}" />'
            '<ColorMapEntry color="#d16638" quantity="{7}" label="{7:.0f}" />'
            '<ColorMapEntry color="#ba2d2f" quantity="{8}" label="{8:.0f}" />'
            '<ColorMapEntry color="#a11f4a" quantity="{9}" label="{9:.0f}" />'
            '<ColorMapEntry color="#8a1762" quantity="{10}" label="{10:.0f}" />'
            '<ColorMapEntry color="#730d6f" quantity="{11}" label="{11:.0f}" />'
            '<ColorMapEntry color="#420759" quantity="{12}" label="{12:.0f}" />'
            '<ColorMapEntry color="#1d0654" quantity="{13}" label="{13:.0f}" />'
            '<ColorMapEntry color="#060329" quantity="{14}" label="{14:.0f}" />'
            '<ColorMapEntry color="#00030f" quantity="{15}" label="{15:.0f}" />'
        '</ColorMap>'
        '</RasterSymbolizer>'
    ),
    # values of the colour breaks in the original accessibility map, derived by Jen Rozier
    # We will normalise by whatever max value is appropriate in our interactively-created map
    'ramp_positions': [
        #0, 8.571, 17.143, 25.714, 34.286, 42.857, 51.429, 60,
        0, 25.7, 51.4, 77.1, 102.8, 128.6, 154.3, 180,
        405, 750, 1095, 1440,
        11472, 21504, 31536, 41568
    ],
}


