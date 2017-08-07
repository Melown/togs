togs: a simple feature based geocoder
===================================

The name *togs* stands for *trivial OGR-based geocoding server*, and togs is
just that.  It takes a number of `OGR readable feature files
<http://www.gdal.org/ogr_formats.html target=_blank>`_ (ESRI shapefiles,
GeoJSONs, etc.) and turns them into `Nominatim
<http://wiki.openstreetmap.org/wiki/Nominatim target=_blank>`_ -like
searchable intefaces.

Togs has been built to provide search functionality for planetary maps built
with `VTS 3D geospatial software stack <https://melown.com/products/vts
target=_blank>`_ atop of IAU planetary nomenclature files but it may be
readily used with other libraries and tools.


Installation and configuration
------------------------------

To install locally, do::

	$ npm install togs

Now edit the togs configuration file at ``$(npm root)/togs/conf/togs.conf`` to
include definition of your geocoding interfaces. 

Togs comes with an example dataset, a GeoJSON containing a list of power plants in the
state of Washington. The corresponding interface is configured as follows::

	[interface.powerplants-wa]
	; path to the dataset
	dataset = ./datasets/GIS_Layer__PowerPlants_WA.geojson

	; property uniquely identifying each feature 
	idProperty = UTILITY_ID

	; properties matching this regexp shall not be indexed  
	searchExclude = ^Latitude|Longitude$

	; templates for some of the response entry values
	class=landuse
	type=industrial
	displayName = {PLANT_NAME}, {UTILITY_NA} ({primary_fu})
	addressRegion = {PLANT_NAME}
	addressState = {UTILITY_NA}


The most important parts of this configuration are the path to the dataset
(relative to ``$(npm root)/togs``), the property considered to be feature ID
(``idProperty``) and the template for display name (``displayName``).  In
all templates, property names enclosed in braces are expanded to their
corresponding values when geocoder response is formed.


Usage
-----

You can start the server as follows::

	$ togs -f $(npm root)/conf/togs.conf


Pointing your browser to 

::

	http://<yourserver:8100>/powerplants-wa?q=wind&format=json&limit=1

will give you the following output::

    [
    	{
            "lon": -120.75305600043436,
            "lat": 47.13916700003981,
            "boundingbox": [
                47.13916700003981,
                47.13916700003981,
                -120.75305600043436,
                -120.75305600043436
            ],
            "display_name": "Swauk Wind LLC, Gamesa Wind US LLC (WND)",
            "class": "landuse",
            "type": "industrial",
            "importance": 1,
            "icon": null,
            "address": {
                "region": "Swauk Wind LLC",
                "state": "Gamesa Wind US LLC"
            },
            "place_id": null,
            "osm_type": null,
            "licence": null,
            "osm_id": null
        }
    ]



Limitations
-----------

Nominatim geocoding interface is OSM specific. Togs input files are not
OSM, thus togs can only mimic Nominatim output format: ``place_id``,
``osm_type`` and ``osm_id`` are all set to null in togs output.

Togs relies on `elasticlunr <http://elasticlunr.com/ target=_blank>`_  for
in-memory indexing and stores every dataset in memory in its entirety.  It
won't scale to very large datasets.

Currently, JSON is the only supported output format, though adding support
for XML is probably trivial. 


Development
-----------

::

    $ git clone https://github.com/melown/togs.git
    $ npm install
    $ node bin/togs


  