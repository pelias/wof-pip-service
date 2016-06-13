> This repository is part of the [Pelias](https://github.com/pelias/pelias) project. Pelias is an open-source, open-data geocoder built by [Mapzen](https://www.mapzen.com/) that also powers [Mapzen Search](https://mapzen.com/projects/search). Our official user documentation is [here](https://mapzen.com/documentation/search/).

# Who's on First Point-in-Polygon service

![TravisCI Status](https://travis-ci.org/pelias/wof-pip-service.svg)

## Overview
This is a point-in-polygon service that uses [Who's on First](http://whosonfirst.mapzen.com/)
data. It's used by the [pelias/wof-admin-lookup](https://github.com/pelias/wof-admin-lookup)
package to perform admin lookup.

There are two modes of operation: a Node.js library to perform point-in-polygon
lookup with [pelias/polygon-lookup](https://github.com/pelias/polygon-lookup),
and an HTTP server that uses this library.

__Notes:__
- [simplify-js](https://github.com/mourner/simplify-js) is used due to the size of the Who's on First data. Without it, Node.js will run out of memory.
