# wof-pip-service

Simple standalone service for point-in-polygon lookup with WOF data.

__Notes:__

 - Using `terraformer-geostore` with `leveldb` storage is proving to be really really slow
 - Can't have multiple leveldb stores running side by side, which is a serious limitation
