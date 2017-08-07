togs: OGR simple feature based geocoder
=======================================

The name *togs* stands for *trivial OGR-based geocoding server*, and togs is just that.
It takes a number of OGR readable feature files (ESRI shapefiles, GeoJSONs,
etc.) and turns them into Nominatim-like searchable intefaces.

Togs has been built to provide search functionality for planetary maps based
on VTS 3D geospatial software stack, but it may be readily used with other
GIS libraies and tools.


Installation and configuration
------------------------------


Usage
-----


Limitations
-----------

Nominatim geocoding interface is OSM specific. Togs input files are not
OSM, thus togs can only mimic Nominatim output format. `place_id`,
`osm_type` and `osm_id` are all set to null in togs output.

Togs relies on elasticlunr for in-memory indexing and stores the entire
dataset in memory. It probably won't scale to very large datasets.

Currently, JSON is the only supported output format, though adding support
for XML is probably trivial. 


Development
-----------

  